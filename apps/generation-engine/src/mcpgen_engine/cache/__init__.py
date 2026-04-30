"""Cache facade — single import point for L1/L2/L3 + key construction.

Re-exports the public surface so callers can write::

    from mcpgen_engine.cache import l1_key, get_l1, set_l1, _engine_version

instead of reaching into per-layer modules.

Phase 2 actively uses L1 + L2; L3 infra is shipped for Phase 3+ partial
regeneration (D-37). L4 (Anthropic prompt caching) is NOT in the codebase —
not available through OpenRouter for Qwen3-Coder per D-38.

References:
- 02-CONTEXT.md D-37 / D-38 / D-39 / D-40
- 02-PATTERNS.md `cache/__init__.py` row
"""

from __future__ import annotations

from .keys import _canonical_json_sha256, _engine_version, l1_key, l2_key, l3_key
from .l1 import clear_layer as clear_l1
from .l1 import get_l1, set_l1
from .l2 import clear_layer as clear_l2
from .l2 import get_l2, invalidate_by_prefix, set_l2
from .l3 import clear_layer as clear_l3
from .l3 import get_l3, set_l3

__all__ = [
    "_canonical_json_sha256",
    "_engine_version",
    "clear_l1",
    "clear_l2",
    "clear_l3",
    "get_l1",
    "get_l2",
    "get_l3",
    "invalidate_by_prefix",
    "l1_key",
    "l2_key",
    "l3_key",
    "set_l1",
    "set_l2",
    "set_l3",
]
