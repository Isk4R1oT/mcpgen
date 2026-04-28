"""Pass 3 — Phase 3: deterministic cross-parameter validation (D-22 + D-23 + Pitfall #32).

All validators raise typed ``Pass3Error`` subclassing ``ValueError`` with a
stable error code as the first token of ``args[0]``. Uses
``jsonschema.Draft202012Validator.check_schema`` per Don't-Hand-Roll
(``03-RESEARCH.md`` §"Don't Hand-Roll" "JSON Schema validity check").

Mirrors the ``Pass2Error`` shape from ``passes/pass_2/validation.py`` for
consistent error surfacing in the CLI / API layer.

Pure-function module: no LLM, no I/O, no async. Composed by the Pass 3
orchestrator in ``__init__.py::run`` AFTER per-tool assembly. No validator
in this file mutates its inputs except ``validate_input_schema`` which
returns a (possibly auto-injected) NEW dict — the caller passes the
resulting dict downstream.

Threats addressed:
- T-03-AP (additionalProperties tampering): D-22 enforced — explicit
  ``additionalProperties=true`` is rejected; omitted is auto-injected to
  ``False``.
- Pitfall #32 (OpenAI Deep Research compliance): ``search`` and ``fetch``
  signatures are FROZEN to ``query: string`` and ``id: string`` respectively.
- T-03-smart-id-drift (D-20): every smart-ID-named property must carry the
  Pass-1-derived pattern.
- T-03-filter-drift (D-18): every list-style tool in one server must use
  the same FilterStrategy.

References:
- 03-CONTEXT.md D-21 (Pitfall #32 frozen) + D-22 (additionalProperties: false
  ALWAYS) + D-23 (cross-param validation rules verbatim)
- 03-RESEARCH.md §"Don't Hand-Roll" "JSON Schema validity check"
- 03-PATTERNS.md ``passes/pass_3/validation.py`` row + Shared Patterns
  "Error handling"
- docs/mcpgen-pass-3-design.md §9 (cross-param validation rules) +
  §11 (consistency)
"""

from __future__ import annotations

import re
from typing import Any, Final

import jsonschema
from jsonschema.exceptions import SchemaError

from mcpgen_engine.passes.pass_3.extract import ParameterSpec
from mcpgen_engine.passes.pass_3.filter_design import FilterStrategy

# ─────────────────────────────── Constants ─────────────────────────────────

# Smart-ID property names per D-20 — match ``id`` (case-insensitive) or
# ``*_id`` (lowercase prefix, alphanumeric + underscore). Mirrors the
# detection regex in ``extract.py::_SMART_ID_NAME_REGEX`` so the assembled
# JSON Schema can be re-scanned without consulting the original
# ``ParameterSpec`` list.
_SMART_ID_NAME_REGEX: Final[re.Pattern[str]] = re.compile(
    r"^(id|[a-z][a-z0-9_]*_id)$", re.IGNORECASE
)


# ──────────────────────────────── Errors ───────────────────────────────────


class Pass3Error(ValueError):
    """Stable user-facing error class for Pass 3 validation failures.

    The first token of ``args[0]`` is treated as the stable error code by
    downstream layers (CLI / API). Additional context is preserved on the
    ``violations`` attribute. Mirrors the ``Pass2Error`` shape from
    ``passes/pass_2/validation.py``.
    """

    violations: list[str]

    def __init__(
        self: Pass3Error,
        message: str,
        *,
        violations: list[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.violations = violations or []


# ────────────────────────────── Validators ─────────────────────────────────


def validate_input_schema(tool_name: str, schema: dict[str, Any]) -> dict[str, Any]:
    """D-22: enforce ``additionalProperties: false``; validate schema validity.

    Three cases:
    - Schema has ``additionalProperties = True`` (explicit) → ``Pass3Error``
      (intentional disagreement with policy is rejected).
    - Schema has no ``additionalProperties`` → AUTO-INJECT ``False`` per D-22
      (policy-conformance candidate).
    - Schema has ``additionalProperties = False`` → pass through unchanged.

    Always runs ``jsonschema.Draft202012Validator.check_schema`` to assert
    the schema is itself a valid JSON Schema (Don't-Hand-Roll). Any
    ``SchemaError`` is re-raised as ``Pass3Error('INVALID_SCHEMA: ...')``.

    Returns the (possibly auto-injected) schema. Does NOT mutate the input
    dict — returns a shallow copy.
    """
    # D-22 hard error: explicit True is intentional disagreement with policy.
    if schema.get("additionalProperties") is True:
        raise Pass3Error(
            f"INVALID_SCHEMA: tool '{tool_name}' has additionalProperties=true; "
            f"must be false per D-22",
            violations=["additionalProperties=true"],
        )
    # D-22 auto-inject: omitted is treated as policy-conformance candidate.
    schema = dict(schema)  # shallow copy — avoid mutating the caller's dict
    schema.setdefault("additionalProperties", False)
    # Validate the schema is itself well-formed (Don't-Hand-Roll).
    try:
        jsonschema.Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        raise Pass3Error(
            f"INVALID_SCHEMA: tool '{tool_name}': {exc.message}",
            violations=[f"schema_error: {exc.message}"],
        ) from exc
    return schema


def validate_param_uniqueness(tool_name: str, params: list[ParameterSpec]) -> None:
    """D-23: assert parameter names are unique within a single tool.

    Defensive check — Plan 03-08 ``naming.normalize_all_param_names``
    should have resolved any collisions upstream by appending digit
    suffixes. This validator catches drift if a future change to the
    normalizer (or a direct caller bypass) lets a duplicate slip through.
    """
    seen: set[str] = set()
    duplicates: list[str] = []
    for p in params:
        if p.name in seen:
            duplicates.append(p.name)
        seen.add(p.name)
    if duplicates:
        # ``sorted(set(...))`` for deterministic message ordering.
        unique_dupes = sorted(set(duplicates))
        raise Pass3Error(
            f"DUPLICATE_PARAM: tool '{tool_name}' has duplicate names: {unique_dupes}",
            violations=duplicates,
        )


def validate_search_fetch_compliance(tool_name: str, params: list[ParameterSpec]) -> None:
    """D-21 + Pitfall #32: enforce OpenAI Deep Research compliance.

    - ``search`` MUST have exactly one parameter: ``query: string``.
    - ``fetch`` MUST have exactly one parameter: ``id: string``.

    Any extra parameter, wrong type, or missing required parameter raises
    ``Pass3Error('OPENAI_COMPLIANCE: ...')``. Other tool names pass
    through unchanged (validator is a no-op for non-universal tools).
    """
    if tool_name == "search":
        if len(params) != 1 or params[0].name != "query" or params[0].type != "string":
            param_repr = [(p.name, p.type) for p in params]
            raise Pass3Error(
                f"OPENAI_COMPLIANCE: tool 'search' must have exactly one param "
                f"(query: string); got {param_repr}",
                violations=[f"search_params_drift: {param_repr}"],
            )
    elif tool_name == "fetch" and (
        len(params) != 1 or params[0].name != "id" or params[0].type != "string"
    ):
        param_repr = [(p.name, p.type) for p in params]
        raise Pass3Error(
            f"OPENAI_COMPLIANCE: tool 'fetch' must have exactly one param "
            f"(id: string); got {param_repr}",
            violations=[f"fetch_params_drift: {param_repr}"],
        )


def validate_smart_id_pattern(
    tool_name: str, schema: dict[str, Any], expected_pattern: str
) -> None:
    """D-20: every smart-ID-named property MUST carry the expected pattern.

    Identifies smart-ID properties by name (matches ``^id$`` or
    ``^[a-z][a-z0-9_]*_id$`` case-insensitively) since the assembled
    JSON Schema doesn't carry the original ``is_smart_id`` flag from
    ``ParameterSpec``.

    Mismatches (wrong pattern OR missing pattern) raise
    ``Pass3Error('SMART_ID_DRIFT: ...')``.
    """
    properties = schema.get("properties", {}) or {}
    mismatches: list[str] = []
    for prop_name, prop_schema in properties.items():
        if not _SMART_ID_NAME_REGEX.match(prop_name):
            continue
        if not isinstance(prop_schema, dict):
            continue
        actual_pattern = prop_schema.get("pattern")
        if actual_pattern != expected_pattern:
            mismatches.append(
                f"{prop_name}: expected pattern {expected_pattern!r} got {actual_pattern!r}"
            )
    if mismatches:
        raise Pass3Error(
            f"SMART_ID_DRIFT: tool '{tool_name}': {'; '.join(mismatches)}",
            violations=mismatches,
        )


def validate_filter_consistency(
    input_schemas: dict[str, dict[str, Any]],
    chosen_strategy: FilterStrategy,
) -> None:
    """D-18: every tool with a ``filter`` param must emit a shape consistent
    with the chosen server-wide strategy.

    Strategy A (STRUCTURED_OBJECT) → ``filter`` is
        ``{type: 'object', properties: {operator: {...}, ...}}``
    Strategy B (DSL_STRING) → ``filter`` is ``{type: 'string'}``
    Strategy C (INDIVIDUAL_PARAMS) → no top-level ``filter`` property
        exists (filters are lifted to top-level by the orchestrator).

    Tools without a ``filter`` property pass through (not all tools have
    filters). Drift raises ``Pass3Error('FILTER_INCONSISTENT: ...')``.
    """
    drifts: list[str] = []
    for tool_name, schema in input_schemas.items():
        properties = schema.get("properties", {}) or {}
        filter_prop = properties.get("filter")
        if filter_prop is None:
            continue  # OK — tool doesn't have a filter
        if not isinstance(filter_prop, dict):
            drifts.append(f"{tool_name}: filter property is not a dict")
            continue
        if chosen_strategy == FilterStrategy.STRUCTURED_OBJECT:
            filter_props = filter_prop.get("properties") or {}
            if filter_prop.get("type") != "object" or "operator" not in filter_props:
                drifts.append(f"{tool_name}: filter not structured-object shape")
        elif chosen_strategy == FilterStrategy.DSL_STRING:
            if filter_prop.get("type") != "string":
                drifts.append(f"{tool_name}: filter not string DSL")
        elif chosen_strategy == FilterStrategy.INDIVIDUAL_PARAMS:
            # Strategy C lifts to top-level; presence of `filter` indicates drift.
            drifts.append(f"{tool_name}: filter param present under INDIVIDUAL_PARAMS strategy")
    if drifts:
        raise Pass3Error(
            f"FILTER_INCONSISTENT: chosen={chosen_strategy.value}; {'; '.join(drifts)}",
            violations=drifts,
        )
