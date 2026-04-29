"""Pass 5 Phase 5a — ``response_format`` enum gate (D-10).

Per CONTEXT D-10 verbatim: a ``response_format: enum["summary"|"detailed"|"raw"]``
parameter is added to the inputSchema ONLY when ALL of:

1. ``len(always_include) + len(opt_in) > 20`` fields, AND
2. tool type ∈ ``{fetch, action, specialized}`` (NOT ``list_objects`` —
   list already exposes ``properties`` for opt-in field selection), AND
3. tool type ≠ ``search`` (search is one-shot per Pitfall #5).

The IR ``Tool1`` shape is ``{name, type, source_endpoints}``. For
``Type.universal`` tools the ``name`` IS the universal-tool variant
(``"search"`` / ``"fetch"`` / ``"list_objects"`` / ``"list_collections"``
/ ``"upsert"`` / ``"delete"``) — same convention as ``passes/pass_4/rules.py``.

Threats addressed:
- T-04-05-response-format-misapplied (D-10): explicit exclusions for
  ``search`` (Pitfall #5 one-shot) and ``list_objects`` (already handles via
  ``properties`` param).

References:
- 04-CONTEXT.md D-10 (verbatim).
- docs/mcpgen-pass-5-design.md §1.5.
"""

from __future__ import annotations

import copy as _copy
from typing import Any, Final

from mcpgen_ir.types import Tool1, Type

from mcpgen_engine.passes.pass_5.field_ranking import FieldRanking

# ─────────────────────────── D-10 verbatim description ──────────────────────

RESPONSE_FORMAT_DESCRIPTION: Final[str] = (
    "Detail level. 'summary'=core fields only (~500 tokens); "
    "'detailed'=structured full data (~2000 tokens); "
    "'raw'=complete unprocessed response. "
    "Default 'summary' for context efficiency. "
    "Use 'detailed' for full inspection, 'raw' for debugging."
)

# Tool-type values (Type enum) that are eligible for the gate when the
# field-count condition is met. Universal tools are handled separately by
# name ("fetch" → eligible; "search" / "list_objects" / "list_collections" /
# "upsert" / "delete" → excluded).
_GATED_NON_UNIVERSAL_TYPES: Final[frozenset[str]] = frozenset(
    {Type.action.value, Type.specialized.value}
)

# Universal tool name(s) eligible for the gate. Per D-10:
# - "fetch"             → eligible (single-object full-detail use case)
# - "search"            → EXCLUDED (Pitfall #5: one-shot)
# - "list_objects"      → EXCLUDED (already exposes `properties`)
# - "list_collections"  → EXCLUDED (lightweight metadata)
# - "upsert" / "delete" → not gated (write-side; small response shapes)
_GATED_UNIVERSAL_NAMES: Final[frozenset[str]] = frozenset({"fetch"})

# D-10 field-count threshold: STRICTLY greater than 20 → gate is active.
_FIELD_COUNT_THRESHOLD: Final[int] = 20


# ─────────────────────────── Public API ────────────────────────────────────


def should_add_response_format(tool: Tool1, ranking: FieldRanking) -> bool:
    """D-10 gate — True iff > 20 fields AND tool ∈ {fetch, action, specialized}.

    Pure deterministic predicate — no I/O, no LLM. Returns False whenever
    any of D-10's three conditions is unmet.
    """
    field_count = len(ranking.always_include) + len(ranking.opt_in)
    if field_count <= _FIELD_COUNT_THRESHOLD:
        return False
    if tool.type == Type.universal:
        # Universal: only "fetch" is gated; search / list_* / upsert / delete
        # are explicitly excluded per D-10 + Pitfall #5.
        return tool.name in _GATED_UNIVERSAL_NAMES
    return tool.type.value in _GATED_NON_UNIVERSAL_TYPES


def inject_response_format_param(input_schema: dict[str, Any]) -> dict[str, Any]:
    """Pure helper — return a NEW dict with ``response_format`` added.

    Deep-copies the input dict so the caller's input is NEVER mutated. The
    injected parameter:

    - ``type``: ``"string"``
    - ``enum``: ``["summary", "detailed", "raw"]``
    - ``default``: ``"summary"``
    - ``description``: ``RESPONSE_FORMAT_DESCRIPTION`` (D-10 verbatim)
    """
    new_schema = _copy.deepcopy(input_schema)
    properties = new_schema.setdefault("properties", {})
    properties["response_format"] = {
        "type": "string",
        "enum": ["summary", "detailed", "raw"],
        "default": "summary",
        "description": RESPONSE_FORMAT_DESCRIPTION,
    }
    return new_schema
