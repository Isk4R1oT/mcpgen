"""L3 cache (tool-level) — filesystem backend, shipped infra only in Phase 2.

Phase 2 ships the L3 module so Phase 3+ partial-regeneration code can land
without touching cache plumbing again. The pipeline orchestrator does NOT
read/write L3 in Phase 2 (only L1 and L2 are active per D-37).

Shares layout, atomic writes, perms, and 30-day TTL with L1/L2.

References:
- 02-CONTEXT.md D-37 (L3 used by Phase 3+ partial regeneration)
- 02-RESEARCH.md §"Pattern 6"
- 02-PATTERNS.md `cache/l3.py` row
"""

from __future__ import annotations

import gzip
import json
import tempfile
import time
from pathlib import Path
from typing import Any, Final, cast

from mcpgen_engine.settings import get_settings

CACHE_LAYER_NAME: Final[str] = "l3"
TTL_SECONDS: Final[int] = 30 * 86_400  # D-40


def _cache_root() -> Path:
    return Path(get_settings().mcpgen_cache_dir)


def _path_for(layer: str, key: str) -> Path:
    return _cache_root() / layer / key[:2] / f"{key[2:]}.json.gz"


def get_l3(key: str) -> dict[str, Any] | None:
    p = _path_for(CACHE_LAYER_NAME, key)
    if not p.exists():
        return None
    if time.time() - p.stat().st_mtime > TTL_SECONDS:
        p.unlink(missing_ok=True)
        return None
    with gzip.open(p, "rt", encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


def set_l3(key: str, value: dict[str, Any]) -> None:
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
