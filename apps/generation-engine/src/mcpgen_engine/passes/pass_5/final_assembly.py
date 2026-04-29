"""Pass 5 final assembly — combine Phases 1-4 outputs into ``Pass5Output.tools``.

Per CONTEXT D-41: produce one ``Tool2`` (the IR shape carried by
``Pass5Output.tools``; structurally equivalent to the Phase-4 ``FinalTool``
notion in the design doc) per Pass 1 tool, combining:

- ``description`` from Pass 2 (``Pass2Output.descriptions[name]`` → ``Description``).
- ``inputSchema`` from Pass 3 (``Pass3Output.input_schemas[name]``) optionally
  augmented with the ``response_format`` enum per D-10.
- ``outputSchema`` from Pass 5 Phase 2 (``OutputSchemaSpec`` → ``to_json_schema``).
- ``annotations`` from Pass 4 (``Pass4Output.annotations[name]``) — ``openWorldHint=True``
  invariant propagated unchanged (T-04-05-OW).
- ``response_config`` (``ResponseConfig2``):
  * ``pagination``: server-wide ``PaginationStrategy`` mapped to IR
    ``Pagination2`` (only for list-style universal tools).
  * ``field_filtering``: per-tool ``FieldRanking`` mapped to ``FieldFiltering``.
  * ``truncation``: internal ``TruncationConfig1`` mapped to IR ``Truncation``.
  * ``has_response_format_param``: D-10 gate (``should_add_response_format``).
- ``source_endpoints``: preserved verbatim from Pass 1 (``Tool1.source_endpoints``).

Pure deterministic transform — no LLM, no I/O. Returns a fresh ``list[Tool2]``;
all nested IR dicts are deep-copied to prevent leakage of upstream IR objects.

Threats addressed:
- T-04-05-OW-invariant: Pass 4 already enforces ``openWorldHint=True`` via
  ``assemble_annotations_with_open_world_hint``. Final assembly propagates
  ``pass_4_output.annotations[name]`` unchanged (no field-level mutation).

References:
- 04-CONTEXT.md D-04 + D-05 + D-10 + D-41.
- packages/ir/python/types.py (Tool2 / ResponseConfig2 / Pagination2 / Truncation).
- Analog: ``apps/generation-engine/src/mcpgen_engine/passes/pass_3/__init__.py``
  ``_assemble_input_schema_for_tool`` (deterministic per-tool assembly).
"""

from __future__ import annotations

import copy
from typing import Any

from mcpgen_ir.types import (
    Description,
    FieldFiltering,
    Pagination2,
    Pass1Output,
    Pass2Output,
    Pass3Output,
    Pass4Output,
    ResponseConfig2,
    Style,
    Tool1,
    Tool2,
    Truncation,
    Type,
)

from mcpgen_engine.passes.pass_5.field_ranking import FieldRanking
from mcpgen_engine.passes.pass_5.output_schema import OutputSchemaSpec, to_json_schema
from mcpgen_engine.passes.pass_5.pagination import PaginationStrategy
from mcpgen_engine.passes.pass_5.response_format import (
    inject_response_format_param,
    should_add_response_format,
)
from mcpgen_engine.passes.pass_5.truncation import TruncationConfig1

# Universal tools that get pagination treatment in their ResponseConfig.
_LIST_LIKE_UNIVERSAL_NAMES = frozenset({"list_objects", "list_collections", "search"})


# ─────────────────────────── IR mapping helpers ────────────────────────────


def _strategy_to_ir_style(strategy: PaginationStrategy) -> Style:
    """Map internal PaginationStrategy.style → IR Style enum.

    PaginationStrategy uses the underscore-spelling ``"page_number"`` for its
    Literal type; the IR ``Style`` enum has ``page_number = "page-number"``
    (hyphen value). Construct via ``Style(value)`` after normalizing.
    """
    if strategy.style == "page_number":
        return Style("page-number")
    return Style(strategy.style)


def _to_ir_pagination(server_strategy: PaginationStrategy, tool: Tool1) -> Pagination2 | None:
    """Convert internal PaginationStrategy → IR Pagination2 for one tool.

    Returns ``None`` for non-list-style tools (fetch / upsert / delete /
    action / workflow / specialized) since Pagination2 only applies to
    list-style outputs. Returns ``None`` when server-wide style is "none".
    """
    if server_strategy.style == "none":
        return None
    if not (tool.type == Type.universal and tool.name in _LIST_LIKE_UNIVERSAL_NAMES):
        return None
    return Pagination2(
        style=_strategy_to_ir_style(server_strategy),
        default_limit=server_strategy.default_limit,
        max_limit=server_strategy.max_limit,
    )


def _to_ir_field_filtering(ranking: FieldRanking) -> FieldFiltering | None:
    """Map FieldRanking → IR FieldFiltering (None when ranking is empty)."""
    if not (ranking.always_include or ranking.opt_in or ranking.always_exclude):
        return None
    return FieldFiltering(
        always_include=list(ranking.always_include),
        opt_in=list(ranking.opt_in),
        always_exclude=list(ranking.always_exclude),
    )


def _to_ir_truncation(internal: TruncationConfig1) -> Truncation:
    """Map internal TruncationConfig1 → IR Truncation.

    The IR ``Truncation`` shape is ``{threshold_tokens, guidance_template}``;
    the internal ``TruncationConfig1`` carries an extra ``tool_type`` key
    that is dropped (it's metadata used by the orchestrator only).
    """
    return Truncation(
        threshold_tokens=internal.threshold_tokens,
        guidance_template=internal.template,
    )


def _descriptions_to_description(src: Any) -> Description:
    """Map Pass2Output ``Descriptions`` → Tool2 ``Description``.

    The two Pydantic models are structurally identical (auto-generated from
    the same JSON Schema component) — round-trip via ``model_dump`` so any
    future field additions remain in sync with codegen.
    """
    return Description.model_validate(src.model_dump())


# ─────────────────────────── Public API ────────────────────────────────────


def assemble_final_tools(
    pass_1_output: Pass1Output,
    pass_2_output: Pass2Output,
    pass_3_output: Pass3Output,
    pass_4_output: Pass4Output,
    output_schemas: dict[str, OutputSchemaSpec],
    field_rankings: dict[str, FieldRanking],
    truncation_configs: dict[str, TruncationConfig1],
    server_pagination_strategy: PaginationStrategy,
) -> list[Tool2]:
    """D-41 — produce one Tool2 per pass_1 tool combining all pass outputs.

    Pure deterministic transform. Every input dict is consumed read-only;
    the returned ``list[Tool2]`` is safe for the caller to mutate without
    affecting upstream pass outputs.
    """
    final_tools: list[Tool2] = []
    for tool in pass_1_output.tools:
        ranking = field_rankings.get(tool.name) or FieldRanking()
        gate = should_add_response_format(tool, ranking)

        # Pass 3 input schema → optionally inject response_format param.
        raw_input_schema = pass_3_output.input_schemas[tool.name]
        if gate:
            effective_input_schema = inject_response_format_param(raw_input_schema)
        else:
            effective_input_schema = copy.deepcopy(raw_input_schema)

        # Pass 5 Phase 2 spec → JSON Schema (wrapped envelope).
        schema_spec = output_schemas[tool.name]
        output_schema_dict = to_json_schema(schema_spec)

        # Pass 4 annotations propagated unchanged (openWorldHint=True invariant).
        annotations = pass_4_output.annotations[tool.name]

        # Pass 2 description → IR Description (model-equivalent shape).
        description = _descriptions_to_description(pass_2_output.descriptions[tool.name])

        # ResponseConfig2 — pagination + field_filtering + truncation + gate flag.
        response_config = ResponseConfig2(
            pagination=_to_ir_pagination(server_pagination_strategy, tool),
            field_filtering=_to_ir_field_filtering(ranking),
            truncation=_to_ir_truncation(truncation_configs[tool.name]),
            has_response_format_param=gate,
        )

        final_tools.append(
            Tool2(
                name=tool.name,
                type=tool.type,
                description=description,
                inputSchema=effective_input_schema,
                outputSchema=output_schema_dict,
                annotations=annotations,
                response_config=response_config,
                source_endpoints=list(tool.source_endpoints),
            )
        )
    return final_tools
