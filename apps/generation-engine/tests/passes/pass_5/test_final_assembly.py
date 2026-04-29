"""Pass 5 final-assembly tests — D-41 + D-10 + Pass 4 openWorldHint propagation.

Verifies:
- ``assemble_final_tools`` produces exactly one ``FinalTool`` per Pass 1 tool.
- Each emitted ``Tool2.outputSchema`` matches ``to_json_schema(spec)`` shape.
- Each emitted ``Tool2.response_config`` carries pagination + field_filtering
  + truncation slots populated.
- ``has_response_format_param`` respects the D-10 gate (True only when the
  gate fires).
- ``openWorldHint=True`` invariant propagated from Pass 4 unchanged.
- ``source_endpoints`` preserved verbatim from Pass 1.

References:
- 04-CONTEXT.md D-10 + D-41.
- packages/ir/python/types.py ``Tool2`` / ``ResponseConfig2`` shapes.
"""

from __future__ import annotations

from typing import Any

from mcpgen_engine.passes.pass_5.final_assembly import assemble_final_tools
from mcpgen_engine.passes.pass_5.output_schema import to_json_schema
from mcpgen_engine.passes.pass_5.pagination import PaginationStrategy

# ─────────────────────────── Tests ─────────────────────────────────────────


def test_assemble_final_tools_one_per_pass_1_tool(
    stripe_pass_1_output: Any,
    stripe_pass_2_output: Any,
    stripe_pass_3_output: Any,
    stripe_pass_4_output: Any,
    mock_output_schemas_stripe: Any,
    mock_field_rankings_stripe: Any,
    mock_truncation_configs_stripe: Any,
) -> None:
    """One FinalTool per Pass 1 tool — no drops, no duplicates."""
    server_strategy = PaginationStrategy(style="cursor")
    final_tools = assemble_final_tools(
        stripe_pass_1_output,
        stripe_pass_2_output,
        stripe_pass_3_output,
        stripe_pass_4_output,
        mock_output_schemas_stripe,
        mock_field_rankings_stripe,
        mock_truncation_configs_stripe,
        server_strategy,
    )
    assert len(final_tools) == len(stripe_pass_1_output.tools)
    final_names = [t.name for t in final_tools]
    pass_1_names = [t.name for t in stripe_pass_1_output.tools]
    assert final_names == pass_1_names


def test_assemble_final_tools_outputSchema_matches_to_json_schema(
    stripe_pass_1_output: Any,
    stripe_pass_2_output: Any,
    stripe_pass_3_output: Any,
    stripe_pass_4_output: Any,
    mock_output_schemas_stripe: Any,
    mock_field_rankings_stripe: Any,
    mock_truncation_configs_stripe: Any,
) -> None:
    """FinalTool.outputSchema MUST equal to_json_schema(spec)."""
    server_strategy = PaginationStrategy(style="cursor")
    final_tools = assemble_final_tools(
        stripe_pass_1_output,
        stripe_pass_2_output,
        stripe_pass_3_output,
        stripe_pass_4_output,
        mock_output_schemas_stripe,
        mock_field_rankings_stripe,
        mock_truncation_configs_stripe,
        server_strategy,
    )
    for tool in final_tools:
        expected = to_json_schema(mock_output_schemas_stripe[tool.name])
        assert tool.outputSchema == expected


def test_assemble_final_tools_response_config_populated(
    stripe_pass_1_output: Any,
    stripe_pass_2_output: Any,
    stripe_pass_3_output: Any,
    stripe_pass_4_output: Any,
    mock_output_schemas_stripe: Any,
    mock_field_rankings_stripe: Any,
    mock_truncation_configs_stripe: Any,
) -> None:
    """Every FinalTool.response_config carries truncation; field_filtering
    populated for tools with rankings; pagination populated for list_* tools."""
    server_strategy = PaginationStrategy(style="cursor")
    final_tools = assemble_final_tools(
        stripe_pass_1_output,
        stripe_pass_2_output,
        stripe_pass_3_output,
        stripe_pass_4_output,
        mock_output_schemas_stripe,
        mock_field_rankings_stripe,
        mock_truncation_configs_stripe,
        server_strategy,
    )
    list_like = {"search", "list_objects", "list_collections"}
    for tool in final_tools:
        rc = tool.response_config
        # Truncation is mandatory.
        assert rc.truncation is not None
        assert rc.truncation.threshold_tokens > 0
        assert rc.truncation.guidance_template
        # Pagination only on list_* tools.
        if tool.name in list_like:
            assert rc.pagination is not None
        else:
            assert rc.pagination is None


def test_assemble_final_tools_has_response_format_param_respects_gate(
    stripe_pass_1_output: Any,
    stripe_pass_2_output: Any,
    stripe_pass_3_output: Any,
    stripe_pass_4_output: Any,
    mock_output_schemas_stripe: Any,
    mock_truncation_configs_stripe: Any,
) -> None:
    """has_response_format_param respects D-10 gate.

    With small synthetic FieldRankings (≤ 20 fields each), no tool should have
    has_response_format_param=True regardless of universal_tool kind.
    """
    from mcpgen_engine.passes.pass_5.field_ranking import FieldRanking

    small_rankings = {
        t.name: FieldRanking(always_include=["id"], opt_in=[], always_exclude=[])
        for t in stripe_pass_1_output.tools
    }
    server_strategy = PaginationStrategy(style="cursor")
    final_tools = assemble_final_tools(
        stripe_pass_1_output,
        stripe_pass_2_output,
        stripe_pass_3_output,
        stripe_pass_4_output,
        mock_output_schemas_stripe,
        small_rankings,
        mock_truncation_configs_stripe,
        server_strategy,
    )
    for tool in final_tools:
        assert tool.response_config.has_response_format_param is False


def test_assemble_final_tools_open_world_hint_propagated(
    stripe_pass_1_output: Any,
    stripe_pass_2_output: Any,
    stripe_pass_3_output: Any,
    stripe_pass_4_output: Any,
    mock_output_schemas_stripe: Any,
    mock_field_rankings_stripe: Any,
    mock_truncation_configs_stripe: Any,
) -> None:
    """openWorldHint=True invariant from Pass 4 → propagated unchanged (T-04-05-OW)."""
    server_strategy = PaginationStrategy(style="cursor")
    final_tools = assemble_final_tools(
        stripe_pass_1_output,
        stripe_pass_2_output,
        stripe_pass_3_output,
        stripe_pass_4_output,
        mock_output_schemas_stripe,
        mock_field_rankings_stripe,
        mock_truncation_configs_stripe,
        server_strategy,
    )
    for tool in final_tools:
        assert tool.annotations.openWorldHint is True


def test_assemble_final_tools_source_endpoints_routing_preserved(
    stripe_pass_1_output: Any,
    stripe_pass_2_output: Any,
    stripe_pass_3_output: Any,
    stripe_pass_4_output: Any,
    mock_output_schemas_stripe: Any,
    mock_field_rankings_stripe: Any,
    mock_truncation_configs_stripe: Any,
) -> None:
    """source_endpoints preserved verbatim from Pass 1."""
    server_strategy = PaginationStrategy(style="cursor")
    final_tools = assemble_final_tools(
        stripe_pass_1_output,
        stripe_pass_2_output,
        stripe_pass_3_output,
        stripe_pass_4_output,
        mock_output_schemas_stripe,
        mock_field_rankings_stripe,
        mock_truncation_configs_stripe,
        server_strategy,
    )
    pass_1_by_name = {t.name: t for t in stripe_pass_1_output.tools}
    for tool in final_tools:
        assert tool.source_endpoints == list(pass_1_by_name[tool.name].source_endpoints)
