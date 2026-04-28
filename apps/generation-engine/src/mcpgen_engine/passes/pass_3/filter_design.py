"""Pass 3 — Phase 3: deterministic filter-design selection (no LLM, no I/O).

One strategy chosen per server per D-18 decision tree:
- A: structured object {property, operator, value} — DEFAULT
- B: DSL string — when spec hints at native query language (JQL/GraphQL/SQL)
- C: individual params — when ≤4 simple-equality filters

ALL universal `list_objects`-style tools in one server use the SAME strategy
(D-18 invariant; consistency check in Plan 03-09 enforces). The orchestrator
in Plan 03-09 calls `detect_filter_strategy(raw_ir, extracted)` exactly ONCE
per server and applies the result uniformly to every list-style tool.

Threats addressed:
- T-03-AP (LLM injects arbitrary filter operators): `STRUCTURED_OBJECT_OPERATORS`
  is a FROZEN tuple; `emit_filter_schema(STRUCTURED_OBJECT, ...)` embeds it
  verbatim. Any extension requires a paired `docs/decisions/` entry.
- T-03-mixed-strategies (different list_objects tools use different filter
  shapes): per-server selection at the call-site (Plan 03-09) prevents drift.
- T-03-spec-content-leak (description text logged): logging emits ONLY
  structural metrics (`strategy` + `reason` + `filter_param_count`); the
  matched description text is NEVER logged.

References:
- 03-CONTEXT.md D-18 (decision tree verbatim) + D-04 (module layout) +
  D-52 (logging policy)
- 03-RESEARCH.md §"Architecture Patterns" Pattern 3
- 03-PATTERNS.md `passes/pass_3/filter_design.py` row
- docs/mcpgen-pass-3-design.md §4 (3 approaches) + §11.1 (operator enum) +
  §11.3 (consistency across tools mandatory)
- Analog: `apps/generation-engine/src/mcpgen_engine/passes/pass_1/classify.py`
  (deterministic classifier with enum result — same shape pattern)
"""

from __future__ import annotations

import re
from enum import StrEnum
from typing import Any, Final

import structlog
from mcpgen_ir.types import RawIR

from mcpgen_engine.passes.pass_3.extract import ParameterSpec

_log = structlog.get_logger(__name__)


# ──────────────────────────── Enum + constants ──────────────────────────────


class FilterStrategy(StrEnum):
    """One of the 3 filter approaches per D-18.

    Per server (NOT per tool); ALL universal `list_objects`-style tools in
    one server use the SAME strategy (consistency invariant per D-18 +
    Pass 3 design §11.3).
    """

    STRUCTURED_OBJECT = "A"
    DSL_STRING = "B"
    INDIVIDUAL_PARAMS = "C"


# D-18 / Pass 3 design §11.1 — FROZEN operator enum.
# DO NOT extend without a paired `docs/decisions/` entry.
# T-03-AP mitigation: this exact tuple is what Strategy A embeds in JSON
# Schema. Plan 03-09 cross-param validation rejects any filter operator
# not in this enum.
STRUCTURED_OBJECT_OPERATORS: Final[tuple[str, ...]] = (
    "Equal",
    "NotEqual",
    "GreaterThan",
    "LessThan",
    "GreaterThanOrEqual",
    "LessThanOrEqual",
    "Contains",
    "In",
    "NotIn",
)

# D-18: ≤4 filter params is the threshold for INDIVIDUAL_PARAMS.
_INDIVIDUAL_PARAMS_THRESHOLD: Final[int] = 4

# Description-text regex for native-query-language detection.
# Matches: JQL, GraphQL where clause, SQL filter, GraphQL filter, GraphQL query.
# Case-insensitive per D-18 ("looks for ... in description text").
_NATIVE_QUERY_HINT_REGEX: Final[re.Pattern[str]] = re.compile(
    r"\b(JQL|GraphQL where clause|SQL filter|GraphQL filter|GraphQL query)\b",
    re.IGNORECASE,
)

# Scalar JSON Schema types eligible for INDIVIDUAL_PARAMS lifting.
# Object/array types disqualify a filter param from being "simple".
_SIMPLE_TYPES: Final[frozenset[str]] = frozenset({"string", "integer", "boolean", "number"})

# Truncation bound for per-param descriptions in Strategy C output schema —
# keeps the generated JSON Schema lean (lifted as top-level inputSchema
# properties downstream by Plan 03-09).
_INDIVIDUAL_PARAM_DESC_MAX: Final[int] = 300


# ──────────────────────────── Helpers ───────────────────────────────────────


def _has_native_query_language(raw_ir: RawIR) -> bool:
    """`True` if any endpoint hints at JQL / GraphQL / SQL filter native query.

    Two signals checked:
    1. Vendor extension `x-query-language` set on any endpoint (defensive
       lookup — Plan 02-02 froze the IR with `extra='forbid'` and did NOT
       add an `extensions` field to `Endpoint`, so this signal is currently
       always False; kept for forward-compatibility per D-18 wording).
    2. Endpoint description matches `_NATIVE_QUERY_HINT_REGEX`.

    Pure: no I/O, no mutation. Description text is inspected but NEVER logged
    (T-03-spec-content-leak).
    """
    for ep in raw_ir.endpoints:
        # Signal 1: vendor extension (defensive — IR has no `extensions` attr today).
        extensions = getattr(ep, "extensions", None)
        if isinstance(extensions, dict) and "x-query-language" in extensions:
            return True
        # Signal 2: description regex.
        if ep.description and _NATIVE_QUERY_HINT_REGEX.search(ep.description):
            return True
    return False


def _is_simple_filter_param(param: ParameterSpec) -> bool:
    """`True` if `param` looks like a simple-equality filter.

    Criteria (D-18 "all_filters_have_simple_operators"):
    - Type is one of {string, integer, boolean, number} (no array/object).
    - No `pattern` constraint (regex implies non-trivial validation logic).
    """
    return param.type in _SIMPLE_TYPES and param.pattern is None


def _collect_filter_params(
    extracted: dict[str, list[ParameterSpec]],
) -> list[ParameterSpec]:
    """Flatten all `is_filter=True` params across all tools (server-scope analysis).

    D-18 selects ONE strategy per server, looking at ALL list-style tools'
    filter params together; this helper aggregates them.
    """
    out: list[ParameterSpec] = []
    for params in extracted.values():
        for p in params:
            if p.is_filter:
                out.append(p)
    return out


# ──────────────────────────── Public API ────────────────────────────────────


def detect_filter_strategy(
    raw_ir: RawIR,
    extracted: dict[str, list[ParameterSpec]],
) -> FilterStrategy:
    """Decide ONE filter strategy for the entire server per D-18 verbatim.

    Decision tree:
        1. `_has_native_query_language(raw_ir)` → DSL_STRING.
        2. else if `len(filter_params) <= 4` AND all are simple-equality
           AND there is at least one filter param → INDIVIDUAL_PARAMS.
        3. else → STRUCTURED_OBJECT (DEFAULT).

    Pure: deterministic; given the same `raw_ir` + `extracted`, always
    returns the same strategy. NO LLM. NO I/O.

    Logging emits ONLY structural metrics (strategy + reason + count) per
    T-03-spec-content-leak; the matched description text is never logged.
    """
    # 1. Native query language hint → DSL_STRING.
    if _has_native_query_language(raw_ir):
        chosen = FilterStrategy.DSL_STRING
        _log.info(
            "pass_3.filter_design.detect",
            strategy=chosen.value,
            reason="native_query_language_hint",
        )
        return chosen

    # 2. Few simple filter params → INDIVIDUAL_PARAMS.
    filter_params = _collect_filter_params(extracted)
    if (
        len(filter_params) > 0
        and len(filter_params) <= _INDIVIDUAL_PARAMS_THRESHOLD
        and all(_is_simple_filter_param(p) for p in filter_params)
    ):
        chosen = FilterStrategy.INDIVIDUAL_PARAMS
        _log.info(
            "pass_3.filter_design.detect",
            strategy=chosen.value,
            reason="few_simple_filter_params",
            filter_param_count=len(filter_params),
        )
        return chosen

    # 3. DEFAULT — STRUCTURED_OBJECT.
    chosen = FilterStrategy.STRUCTURED_OBJECT
    _log.info(
        "pass_3.filter_design.detect",
        strategy=chosen.value,
        reason="default",
        filter_param_count=len(filter_params),
    )
    return chosen


def emit_filter_schema(
    strategy: FilterStrategy,
    extracted_filter_params: list[ParameterSpec],
) -> dict[str, Any]:
    """Emit the JSON Schema fragment for the `filter` parameter under `strategy`.

    Returns:
      A (STRUCTURED_OBJECT) → `{type:'object', properties:{property,operator,value},
        additionalProperties:false}` with the FROZEN operator enum embedded.
        Independent of `extracted_filter_params`.
      B (DSL_STRING) → `{type:'string', description:'<DSL hint>'}`.
        Independent of `extracted_filter_params`.
      C (INDIVIDUAL_PARAMS) → `{type:'object', properties:{<one per simple
        filter param>}, additionalProperties:false, _individual_params_marker:true}`.
        Caller (Plan 03-09) is expected to LIFT these as TOP-LEVEL inputSchema
        properties, NOT nest under a `filter` key — the marker indicates this.
    """
    if strategy == FilterStrategy.STRUCTURED_OBJECT:
        return {
            "type": "object",
            "description": (
                "Structured filter object with property + operator + value. "
                f"Supported operators: {', '.join(STRUCTURED_OBJECT_OPERATORS)}."
            ),
            "properties": {
                "property": {
                    "type": "string",
                    "description": "Field name to filter on.",
                },
                "operator": {
                    "type": "string",
                    "enum": list(STRUCTURED_OBJECT_OPERATORS),
                    "description": "Comparison operator.",
                },
                "value": {
                    "description": "Comparison value (type depends on the field).",
                },
            },
            "required": ["property", "operator", "value"],
            "additionalProperties": False,
        }

    if strategy == FilterStrategy.DSL_STRING:
        return {
            "type": "string",
            "description": (
                "Native query string in the upstream API's query language "
                "(e.g., JQL / GraphQL `where` clause / SQL filter). "
                "Refer to the upstream API documentation for syntax."
            ),
        }

    # FilterStrategy.INDIVIDUAL_PARAMS
    properties: dict[str, dict[str, Any]] = {}
    for p in extracted_filter_params:
        if not _is_simple_filter_param(p):
            continue
        entry: dict[str, Any] = {"type": p.type}
        if p.enum is not None:
            entry["enum"] = p.enum
        if p.description:
            entry["description"] = p.description[:_INDIVIDUAL_PARAM_DESC_MAX]
        if p.default is not None:
            entry["default"] = p.default
        properties[p.name] = entry
    return {
        "type": "object",
        "description": (
            "Individual filter parameters — caller lifts to top-level "
            "inputSchema per D-18 strategy C."
        ),
        "properties": properties,
        "additionalProperties": False,
        "_individual_params_marker": True,
    }
