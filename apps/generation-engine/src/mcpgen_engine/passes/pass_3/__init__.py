"""Pass 3 — Parameter Specification (4-phase orchestrator).

Public API:

    async def run(pass_2_output: Pass2Output, pass_1_output: Pass1Output,
                  raw_ir: RawIR, spec_title: str | None = None) -> Pass3Output

Four phases (D-16):

- Phase 1 (extract, det): pull params from RawIR + Pass 1 routing via
  ``extract.extract_params``. Naming normalization (D-19) is applied
  immediately after extract so the LLM sees normalized names in Phase 2.
- Phase 2 (enrich, LLM): per-parameter Qwen call ‖ Sem(20) pipeline-scoped
  via ``enrich.enrich_all_params``.
- Phase 3 (assembly + validation, det): cross-param uniqueness +
  ``additionalProperties: false`` + OpenAI compliance + smart-ID +
  filter consistency via ``validation.py``. Filter strategy is detected
  ONCE per server (D-18) before per-tool assembly.
- Phase 4 (quality_gate, LLM): inline judge per tool ‖ Sem(10) via
  ``quality_gate.quality_gate_all_tools``. Failures surface as warnings;
  pipeline continues (D-13 emit-and-continue analog).

Final assembly composes per-tool JSON Schema from:
- ``ParameterSpec`` (extract.py) — deterministic spec metadata.
- ``ParameterEnrichment`` (enrich.py) — LLM-emitted description / example.
- ``naming.normalize_*`` — applied pre-LLM so the LLM sees clean names.
- ``smart_id.build_smart_id_pattern_for_param`` — pattern for smart-ID
  properties (D-20); description from ``build_smart_id_description``.
- ``standards.get_standard_description`` — overrides LLM description for
  universal-tool standard params (D-21).
- ``filter_design.emit_filter_schema`` — emits the chosen FilterStrategy
  shape; for INDIVIDUAL_PARAMS, lifts each individual filter to top-level
  property instead of nesting under ``filter``.

Threats addressed:
- T-03-AP (D-22): every emitted schema has ``additionalProperties: false``
  enforced in ``validation.validate_input_schema``.
- Pitfall #32 (D-21): ``validate_search_fetch_compliance`` rejects any
  ``search``/``fetch`` deviation BEFORE assembly.
- T-03-smart-id-drift (D-20): ``validate_smart_id_pattern`` re-asserts
  every smart-ID property carries the Pass-1-derived pattern.
- T-03-filter-drift (D-18): ``validate_filter_consistency`` runs over the
  assembled schemas BEFORE Phase 4.

References:
- 03-CONTEXT.md D-04 + D-16 + D-18 + D-21 + D-22 + D-23 + D-39
- 03-PATTERNS.md ``passes/pass_3/__init__.py`` row
- docs/mcpgen-pass-3-design.md §5 (4-phase pipeline)
"""

from __future__ import annotations

import time
from typing import Any, Final

import structlog
from mcpgen_ir.types import (
    Pass1Output,
    Pass2Output,
    Pass3Output,
    RawIR,
    Type,
)

from mcpgen_engine.passes.pass_3.enrich import (
    ParameterEnrichment,
    enrich_all_params,
)
from mcpgen_engine.passes.pass_3.extract import ParameterSpec, extract_params
from mcpgen_engine.passes.pass_3.filter_design import (
    FilterStrategy,
    detect_filter_strategy,
    emit_filter_schema,
)
from mcpgen_engine.passes.pass_3.naming import normalize_all_param_names
from mcpgen_engine.passes.pass_3.quality_gate import quality_gate_all_tools
from mcpgen_engine.passes.pass_3.smart_id import (
    build_smart_id_description,
    build_smart_id_pattern_for_param,
    slugify_spec_title,
)
from mcpgen_engine.passes.pass_3.standards import get_standard_description
from mcpgen_engine.passes.pass_3.validation import (
    Pass3Error,
    validate_filter_consistency,
    validate_input_schema,
    validate_param_uniqueness,
    validate_search_fetch_compliance,
    validate_smart_id_pattern,
)

# Re-exports for callers that orchestrate Pass 3 together with other passes.
__all__ = [
    "PASS_3_VERSION",
    "Pass3Error",
    "run",
]

# D-35 cache-key hint — bump when extract / enrich / validation logic
# change in a way that invalidates cached Pass 3 outputs (decision must
# accompany the bump in ``docs/decisions/``).
PASS_3_VERSION: Final[str] = "1"


_log = structlog.get_logger(__name__)


# ─────────────────────────── Per-tool assembly ─────────────────────────────


def _assemble_input_schema_for_tool(
    tool_name: str,  # noqa: ARG001 — kept for future per-tool diagnostics
    universal_tool_name: str | None,
    params_with_enrichment: list[tuple[ParameterSpec, ParameterEnrichment]],
    smart_id_pattern: str,
    smart_id_description: str,
    filter_strategy: FilterStrategy,
) -> dict[str, Any]:
    """Compose the final JSON Schema for one tool from all the building blocks.

    For each (param, enrichment):
    - ``description``: prefer ``standards.get_standard_description`` when the
      tool is a universal one and the standard exists; else
      ``enrichment.description``. Smart-ID params override with
      ``build_smart_id_description``.
    - ``pattern``: smart-ID params get ``smart_id_pattern``; otherwise pass
      through ``param.pattern`` if present.
    - ``enum``: ``param.enum`` first; else ``enrichment.inferred_enum``.
    - ``default`` / ``format`` / ``minimum`` / ``maximum`` / ``minLength``
      / ``maxLength``: pass-through from ``ParameterSpec``.
    - ``examples``: from ``enrichment.example`` when non-None.

    Filter handling per D-18:
    - STRUCTURED_OBJECT / DSL_STRING: the tool's ``filter`` param emits a
      single nested ``filter`` property whose shape comes from
      ``filter_design.emit_filter_schema``.
    - INDIVIDUAL_PARAMS: each filter param is LIFTED to a top-level
      property (no ``filter`` key in the output schema).
    """
    properties: dict[str, dict[str, Any]] = {}
    required_names: list[str] = []
    filter_emitted = False

    for param, enrichment in params_with_enrichment:
        # Special handling for `filter` params per D-18 strategy.
        if param.is_filter:
            # Collect ALL filter params for this tool (only the first iteration
            # over filter params actually emits; subsequent are skipped).
            if filter_emitted:
                continue
            all_filter_params = [p for p, _ in params_with_enrichment if p.is_filter]
            filter_schema = emit_filter_schema(filter_strategy, all_filter_params)
            if filter_strategy == FilterStrategy.INDIVIDUAL_PARAMS:
                # Strategy C: lift each individual filter param to top-level.
                lifted_props = filter_schema.get("properties", {}) or {}
                for ind_name, ind_schema in lifted_props.items():
                    properties[ind_name] = ind_schema
                # Required-ness for lifted filter params: defer to the
                # original ParameterSpec.required flag of the matching param.
                for fp in all_filter_params:
                    if fp.required and fp.name in lifted_props:
                        required_names.append(fp.name)
            else:
                properties["filter"] = filter_schema
                if param.required:
                    required_names.append("filter")
            filter_emitted = True
            continue

        prop: dict[str, Any] = {"type": param.type}
        if param.format is not None:
            prop["format"] = param.format
        if param.enum is not None:
            prop["enum"] = param.enum
        elif enrichment.inferred_enum:
            prop["enum"] = enrichment.inferred_enum
        if param.pattern is not None:
            prop["pattern"] = param.pattern
        if param.minimum is not None:
            prop["minimum"] = param.minimum
        if param.maximum is not None:
            prop["maximum"] = param.maximum
        if param.min_length is not None:
            prop["minLength"] = param.min_length
        if param.max_length is not None:
            prop["maxLength"] = param.max_length
        if param.default is not None:
            prop["default"] = param.default

        # Smart-ID overrides — pattern + description come from Pass 1 routing.
        if param.is_smart_id:
            prop["pattern"] = smart_id_pattern
            prop["description"] = smart_id_description
        elif universal_tool_name is not None:
            # Standard description (universal tools) overrides LLM-enriched.
            std_desc = get_standard_description(universal_tool_name, param.name)
            prop["description"] = std_desc if std_desc is not None else enrichment.description
        else:
            prop["description"] = enrichment.description

        # Add example if present (LLM-emitted, non-hallucinated by D-11/D-24).
        if enrichment.example is not None:
            prop["examples"] = [enrichment.example]

        properties[param.name] = prop
        if param.required:
            required_names.append(param.name)

    schema: dict[str, Any] = {
        "type": "object",
        "properties": properties,
        "additionalProperties": False,
    }
    if required_names:
        schema["required"] = required_names
    return schema


# ─────────────────────────────── Public API ────────────────────────────────


async def run(
    pass_2_output: Pass2Output,  # noqa: ARG001 — accepted for pipeline symmetry; descriptions live here, used by Stage E
    pass_1_output: Pass1Output,
    raw_ir: RawIR,
    spec_title: str | None = None,
    *,
    generation_id: str,
) -> Pass3Output:
    """Author per-tool input schemas; emit ``Pass3Output``.

    Pure orchestrator: chains the 4 phases (extract+normalize → enrich →
    assemble+validate → quality-gate) with no I/O outside the LLM calls
    already inside ``enrich.py`` and ``quality_gate.py``. Returns the
    FROZEN ``Pass3Output`` IR shape — every entry in ``input_schemas`` has
    ``additionalProperties: false`` per D-22.

    The ``pass_2_output`` parameter is accepted for pipeline symmetry
    (descriptions authored there are read by Stage E codegen, not Pass 3).
    The ``spec_title`` parameter feeds ``slugify_spec_title`` for smart-ID
    pattern generation; defaults to ``"spec"`` (deterministic fallback).
    """
    start = time.monotonic()

    # Phase 1 (det): extract params from RawIR + Pass 1 routing.
    extracted = extract_params(raw_ir, pass_1_output)

    # Apply naming normalization (D-19) post-extract / pre-enrich so the LLM
    # sees the normalized names. Decision: apply BEFORE enrichment so LLM
    # sees consistent naming when authoring descriptions.
    normalized: dict[str, list[ParameterSpec]] = {}
    for tool_name, params in extracted.items():
        # `list_objects` is the canonical list-filter context for D-19's
        # `time → created_at` rule; other tools preserve `time` as-is.
        is_list_filter = tool_name == "list_objects"
        normalized[tool_name] = normalize_all_param_names(
            params, is_list_filter_context=is_list_filter
        )

    # Phase 2 (LLM, parallel x20 pipeline-scoped): enrich params via Qwen.
    tool_types_by_name = {t.name: t.type.value for t in pass_1_output.tools}
    enriched = await enrich_all_params(normalized, tool_types_by_name, generation_id=generation_id)

    # Detect filter strategy (D-18 — once per server). Run on the
    # NORMALIZED params so `is_filter` flags are evaluated post-naming.
    filter_strategy = detect_filter_strategy(raw_ir, normalized)

    # Build smart-ID pattern + description (D-20) ONCE per server.
    spec_slug = slugify_spec_title(spec_title or "")
    smart_id_pattern = build_smart_id_pattern_for_param(pass_1_output.routing.smart_id, spec_slug)
    smart_id_description = build_smart_id_description(pass_1_output.routing.smart_id, spec_slug)

    # Phase 3 (det): assembly + per-tool validation.
    tools_by_name = {t.name: t for t in pass_1_output.tools}
    input_schemas: dict[str, dict[str, Any]] = {}
    for tool_name, pairs in enriched.items():
        tool = tools_by_name[tool_name]
        # Universal-tool name: per Six-Tool Pattern, `tool.name` IS the
        # canonical universal name (search/fetch/list_objects/etc.) when
        # `tool.type == Type.universal`. Pass1Output.tools doesn't carry a
        # separate `universal_tool` field (only the `Routing.rules` entries
        # do, via `Rule1.universal_tool`).
        universal_tool_name = tool.name if tool.type == Type.universal else None
        params_only = [p for p, _ in pairs]

        # Pre-assembly validation (raises on hard violations).
        validate_param_uniqueness(tool_name, params_only)
        validate_search_fetch_compliance(tool_name, params_only)

        # Assemble.
        raw_schema = _assemble_input_schema_for_tool(
            tool_name=tool_name,
            universal_tool_name=universal_tool_name,
            params_with_enrichment=pairs,
            smart_id_pattern=smart_id_pattern,
            smart_id_description=smart_id_description,
            filter_strategy=filter_strategy,
        )

        # Post-assembly validation: additionalProperties + JSON Schema validity.
        validated_schema = validate_input_schema(tool_name, raw_schema)
        # Smart-ID drift check (D-20).
        validate_smart_id_pattern(tool_name, validated_schema, smart_id_pattern)
        input_schemas[tool_name] = validated_schema

    # Server-wide filter consistency (D-18).
    validate_filter_consistency(input_schemas, filter_strategy)

    # Phase 4 (LLM, parallel x10): inline quality gate. Never blocks; surfaces warnings.
    quality_warnings = await quality_gate_all_tools(
        input_schemas, pass_1_output, sem=None, generation_id=generation_id
    )

    warning_count = sum(1 for v in quality_warnings.values() if v)
    elapsed_ms = int((time.monotonic() - start) * 1000)
    _log.info(
        "pass_3.run.complete",
        tool_count=len(input_schemas),
        filter_strategy=filter_strategy.value,
        spec_slug=spec_slug,
        quality_warning_count=warning_count,
        elapsed_ms=elapsed_ms,
    )

    return Pass3Output(input_schemas=input_schemas)
