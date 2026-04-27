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

References:
- 02-CONTEXT.md D-37 / D-39 / D-40
- 02-RESEARCH.md §"Pattern 6"
- 02-PATTERNS.md `cache/l2.py` row (mirror of `cache/l1.py`)
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


def _cache_root() -> Path:
    return Path(get_settings().mcpgen_cache_dir)


def _path_for(layer: str, key: str) -> Path:
    return _cache_root() / layer / key[:2] / f"{key[2:]}.json.gz"


def get_l2(key: str) -> dict[str, Any] | None:
    p = _path_for(CACHE_LAYER_NAME, key)
    if not p.exists():
        return None
    if time.time() - p.stat().st_mtime > TTL_SECONDS:
        p.unlink(missing_ok=True)
        return None
    with gzip.open(p, "rt", encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


def set_l2(key: str, value: dict[str, Any]) -> None:
    p = _path_for(CACHE_LAYER_NAME, key)
    p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    _chmod_ancestors_within_cache(p.parent)
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
