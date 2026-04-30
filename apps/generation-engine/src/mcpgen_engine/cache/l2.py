"""L2 cache (pass-level) — filesystem backend with atomic writes.

L2 stores per-pass output keyed by ``pass_name + pass_version + sha(input) +
model_id + sampling_profile_label`` (see ``cache/keys.py::l2_key``). A hit
means the LLM call for that single pass can be skipped while the rest of
the pipeline still runs.

Shares the sharded layout, atomic-write protocol, 0700/0600 perms, and
30-day TTL with ``cache/l1.py``. The two modules are intentionally
duplicated (no shared base class) per CLAUDE.md "KISS / wait for the third
duplication" — once Phase 6 introduces an R2 backend a shared interface
becomes worthwhile.

Phase 5 D-26 cascade invalidation
---------------------------------

The on-disk filename is the sha256 hash of the raw key string (``keys.py``
composes the raw string and hashes it). Prefix-globbing the on-disk
filename is therefore impossible; cascade invalidation needs to know the
*pre-hash* key prefix (``l2:<engine_version>:<pass_name>:``) so that a
Pass-2 retry can clear every Pass-3/4/5/Stage-E/F1/F2 entry in one sweep.

To bridge the gap we maintain a **sidecar JSON index** ``_index.json``
under the L2 layer dir. ``set_l2`` accepts an optional ``original_key``
argument; when provided the function appends ``{original_key:
on_disk_filename}`` to the index. ``invalidate_by_prefix(prefix)`` reads
the index, finds all ``original_key`` entries that start with the prefix,
unlinks the matching files, and rewrites the index without those entries.

Backward-compat: callers that don't pass ``original_key`` still work — the
file is stored normally but is not indexed (and therefore cannot be
prefix-invalidated). Phase 5 retry orchestration only needs entries
created during the same pipeline run to be invalidated; existing
non-indexed entries are TTL'd within 30 days regardless.

References:
- 02-CONTEXT.md D-37 / D-39 / D-40
- 02-RESEARCH.md §"Pattern 6"
- 02-PATTERNS.md `cache/l2.py` row (mirror of `cache/l1.py`)
- 05-CONTEXT.md D-26 (cascade invalidation rules)
- 05-RESEARCH.md §6.9 (cache invalidation prefix glob)
"""

from __future__ import annotations

import gzip
import json
import tempfile
import time
from pathlib import Path
from typing import Any, Final, cast

from mcpgen_engine.settings import get_settings

CACHE_LAYER_NAME: Final[str] = "l2"
TTL_SECONDS: Final[int] = 30 * 86_400  # D-40

# Sidecar index file name. Lives under ``<cache_root>/l2/_index.json`` —
# the underscore prefix keeps it out of the sharded ``<key[:2]>/`` layout
# (sharded dirs are 2-char hex; ``_index.json`` is at the layer root).
_INDEX_FILENAME: Final[str] = "_index.json"


def _cache_root() -> Path:
    return Path(get_settings().mcpgen_cache_dir)


def _path_for(layer: str, key: str) -> Path:
    return _cache_root() / layer / key[:2] / f"{key[2:]}.json.gz"


def _layer_root() -> Path:
    return _cache_root() / CACHE_LAYER_NAME


def _index_path() -> Path:
    return _layer_root() / _INDEX_FILENAME


def _read_index() -> dict[str, str]:
    """Load the sidecar ``original_key -> stored_key`` index (empty if absent)."""
    p = _index_path()
    if not p.exists():
        return {}
    try:
        with p.open("rt", encoding="utf-8") as f:
            return cast(dict[str, str], json.load(f))
    except (OSError, json.JSONDecodeError):
        # Corrupt sidecar -> treat as empty (won't break correctness; entries
        # are TTL'd within 30 days even without the index).
        return {}


def _write_index(index: dict[str, str]) -> None:
    """Atomically write the sidecar index. 0600 perms (read-only by owner)."""
    p = _index_path()
    p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(
        mode="wt",
        encoding="utf-8",
        suffix=".tmp",
        dir=p.parent,
        delete=False,
    ) as tf:
        tmp_path = Path(tf.name)
        json.dump(index, tf, sort_keys=True, separators=(",", ":"))
    tmp_path.replace(p)
    p.chmod(0o600)


def get_l2(key: str) -> dict[str, Any] | None:
    p = _path_for(CACHE_LAYER_NAME, key)
    if not p.exists():
        return None
    if time.time() - p.stat().st_mtime > TTL_SECONDS:
        p.unlink(missing_ok=True)
        return None
    with gzip.open(p, "rt", encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


def set_l2(
    key: str,
    value: dict[str, Any],
    *,
    original_key: str | None = None,
) -> None:
    """Store an L2 entry. ``original_key`` is the pre-sha256 raw key string.

    When ``original_key`` is provided, the entry is registered in the sidecar
    index so ``invalidate_by_prefix`` can find it. When omitted (legacy
    callers), the entry is stored as before but is invisible to cascade
    invalidation — TTL is the only reaper.
    """
    p = _path_for(CACHE_LAYER_NAME, key)
    p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    _chmod_ancestors_within_cache(p.parent)

    # WR-10: Update the sidecar index BEFORE the data file. If the data write
    # crashes between index update and rename, ``invalidate_by_prefix`` sees an
    # index entry pointing to a missing file — which is idempotent (the unlink
    # of a non-existent path is silently swallowed by ``missing_ok=True``).
    # The reverse order (data first, index second) leaves un-invalidatable
    # cache entries on a crash, breaking cascade invalidation correctness.
    if original_key is not None:
        index = _read_index()
        index[original_key] = key
        _write_index(index)

    with tempfile.NamedTemporaryFile(
        mode="wt",
        encoding="utf-8",
        suffix=".tmp",
        dir=p.parent,
        delete=False,
    ) as tf:
        tmp_path = Path(tf.name)
    with gzip.open(tmp_path, "wt", encoding="utf-8") as gzf:
        json.dump(value, gzf, sort_keys=True, separators=(",", ":"))
    tmp_path.replace(p)
    p.chmod(0o600)


async def invalidate_by_prefix(prefix: str) -> int:
    """Phase 5 D-26 cascade invalidation entry point.

    Iterates the sidecar index, unlinks the file for any ``original_key``
    that starts with ``prefix``, and rewrites the index without those
    entries. Returns the count of entries removed. Idempotent — calling
    twice with the same prefix returns 0 the second time.

    Async signature mirrors the orchestrator's call site
    (``cache_invalidation.invalidate_cascade``); the implementation itself
    is synchronous (filesystem operations) but the async-await shape keeps
    the orchestrator code uniform with future R2/network backends.
    """
    index = _read_index()
    if not index:
        return 0
    matched: list[str] = [k for k in index if k.startswith(prefix)]
    if not matched:
        return 0

    removed = 0
    for original_key in matched:
        stored_key = index.pop(original_key)
        p = _path_for(CACHE_LAYER_NAME, stored_key)
        if p.exists():
            p.unlink(missing_ok=True)
            removed += 1
        else:
            # File already gone (TTL or out-of-band delete); still drop the
            # index entry so a re-invalidate doesn't keep finding it.
            removed += 0
    _write_index(index)
    return removed


def _chmod_ancestors_within_cache(leaf: Path) -> None:
    """Mirror of `cache.l1._chmod_ancestors_within_cache` — see that module."""
    root = _cache_root().resolve()
    current = leaf.resolve()
    while True:
        try:
            current.chmod(0o700)
        except (OSError, PermissionError):
            break
        if current == root:
            break
        parent = current.parent
        if parent == current:
            break
        try:
            current.relative_to(root)
        except ValueError:
            break
        current = parent


def clear_layer() -> int:
    root = _cache_root() / CACHE_LAYER_NAME
    if not root.exists():
        return 0
    count = 0
    for p in root.rglob("*.json.gz"):
        p.unlink()
        count += 1
    return count
