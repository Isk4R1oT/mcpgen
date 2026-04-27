"""L1 cache (spec-level) — filesystem backend with atomic writes.

L1 stores the full architect-stage output (``RawIR + Pass0Output + Pass1Output``)
keyed by the spec sha256. A hit means the entire pipeline can be skipped
(GEN-12 — repeated generation costs $0 LLM tokens).

Layout (D-39):

    <root>/l1/<key[:2]>/<key[2:]>.json.gz

The first 2 hex chars of the sha256 key shard the directory tree so each
parent directory holds at most ~256 entries (uniform sharding by
sha256-prefix → no ext4 dir_index slowness on large caches).

Permissions:
- parent directories: ``0o700`` (owner-only) — protects multi-user dev machines
  from cross-user spec-content leakage (D-52, threat T-2-08-01).
- files: ``0o600`` set after ``Path.replace`` — atomic rename loses the
  tempfile mode bits on some filesystems; chmod-after-rename is the safe path.

Atomic writes:
- ``tempfile.NamedTemporaryFile(dir=parent) + Path.replace(target)``. POSIX
  guarantees ``rename(2)`` is atomic within a single filesystem; concurrent
  writers each see exactly one of the writes succeed (T-2-08 / Pitfall:
  cache file race in pytest-xdist).

TTL (D-40):
- 30 days from filesystem mtime. ``get_l1`` unlinks stale entries on read.

References:
- 02-CONTEXT.md D-37/D-39/D-40
- 02-RESEARCH.md §"Pattern 6"
- 02-PATTERNS.md `cache/l1.py` row
"""

from __future__ import annotations

import gzip
import json
import tempfile
import time
from pathlib import Path
from typing import Any, Final, cast

from mcpgen_engine.settings import get_settings

CACHE_LAYER_NAME: Final[str] = "l1"
TTL_SECONDS: Final[int] = 30 * 86_400  # D-40


def _cache_root() -> Path:
    return Path(get_settings().mcpgen_cache_dir)


def _path_for(layer: str, key: str) -> Path:
    """Sharded cache path: ``<root>/<layer>/<key[:2]>/<key[2:]>.json.gz``."""
    return _cache_root() / layer / key[:2] / f"{key[2:]}.json.gz"


def get_l1(key: str) -> dict[str, Any] | None:
    """Return the cached value or ``None`` on miss / expired entry.

    Stale entries (mtime older than ``TTL_SECONDS``) are unlinked on read;
    the next ``set_l1`` re-creates them with fresh mtime.
    """
    p = _path_for(CACHE_LAYER_NAME, key)
    if not p.exists():
        return None
    if time.time() - p.stat().st_mtime > TTL_SECONDS:
        p.unlink(missing_ok=True)
        return None
    with gzip.open(p, "rt", encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


def set_l1(key: str, value: dict[str, Any]) -> None:
    """Atomically write ``value`` (gzipped JSON) to the L1 cache slot for ``key``."""
    p = _path_for(CACHE_LAYER_NAME, key)
    p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    # `mkdir(parents=True)` only enforces `mode` on the leaf; intermediate
    # ancestors inherit umask. Walk the chain we just created and tighten
    # each ancestor inside the cache root to 0o700 (D-39 / T-2-08-01).
    _chmod_ancestors_within_cache(p.parent)
    with tempfile.NamedTemporaryFile(
        mode="wt",
        encoding="utf-8",
        suffix=".tmp",
        dir=p.parent,
        delete=False,
    ) as tf:
        tmp_path = Path(tf.name)
    # Write gzipped JSON to the temp path (the tempfile is empty after the
    # ``with`` block — we own the path).
    with gzip.open(tmp_path, "wt", encoding="utf-8") as gzf:
        json.dump(value, gzf, sort_keys=True, separators=(",", ":"))
    tmp_path.replace(p)  # atomic on POSIX
    p.chmod(0o600)


def _chmod_ancestors_within_cache(leaf: Path) -> None:
    """Chmod ``leaf`` and every ancestor up to the cache root to 0o700.

    `mkdir(parents=True, mode=...)` only sets the mode on the LEAF directory;
    on POSIX, intermediate ancestors inherit umask. This walk tightens every
    directory the cache layer owns so spec content stays owner-readable on
    multi-user dev machines (D-39 / T-2-08-01).
    """
    root = _cache_root().resolve()
    current = leaf.resolve()
    # Walk up while still inside the cache root (inclusive).
    while True:
        try:
            current.chmod(0o700)
        except (OSError, PermissionError):
            # Best-effort; perms on a directory we don't own are not our
            # invariant to enforce (e.g. shared-tmp on CI).
            break
        if current == root:
            break
        parent = current.parent
        if parent == current:
            break
        # Stop walking once we leave the cache root.
        try:
            current.relative_to(root)
        except ValueError:
            break
        current = parent


def clear_layer() -> int:
    """Remove every file in this layer; return count of deletions.

    Used by ``mcpgen cache clear`` (Phase 6+) and by tests that need to wipe
    the layer between scenarios. Safe to call when the layer directory does
    not yet exist.
    """
    root = _cache_root() / CACHE_LAYER_NAME
    if not root.exists():
        return 0
    count = 0
    for p in root.rglob("*.json.gz"):
        p.unlink()
        count += 1
    return count
