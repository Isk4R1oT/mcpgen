"""Pass 5 — end-to-end ``run()`` orchestrator tests (5-phase pipeline).

LLM-bearing tests (full Pass 5 pipeline on Stripe fixture) are gated behind
``requires_openrouter`` since they would otherwise need a network call;
local-only tests use ``monkeypatch`` to stub ``rank_all_fields`` so the
deterministic fallback rules deliver a complete ``Pass5Output``.

References:
- 04-CONTEXT.md D-04 + D-05 + D-08 + D-10.
- Analog: ``apps/generation-engine/tests/passes/pass_4/test_run.py`` (full
  orchestrator test on Stripe fixture).
"""

from __future__ import annotations

from typing import Any

import pytest
from mcpgen_ir.types import Pass5Output

from mcpgen_engine.passes import pass_5

# ─────────────────────────── Local-only orchestrator tests ─────────────────


async def test_run_returns_pass5output(
    monkeypatch: pytest.MonkeyPatch,
    stripe_pass_1_output: Any,
    stripe_pass_2_output: Any,
    stripe_pass_3_output: Any,
    stripe_pass_4_output: Any,
    stripe_raw_ir: Any,
) -> None:
    """run() returns a Pass5Output instance."""
    from mcpgen_engine.passes.pass_5.field_ranking import (
        FieldRanking,
        deterministic_ranking,
    )
    from mcpgen_engine.passes.pass_5.output_schema import OutputSchemaSpec

    async def _fake_rank_all_fields(
        output_schemas: dict[str, OutputSchemaSpec],
        _p2: Any,
        _p1: Any,
    ) -> dict[str, FieldRanking]:
        return {name: deterministic_ranking(spec.fields) for name, spec in output_schemas.items()}

    monkeypatch.setattr(pass_5, "rank_all_fields", _fake_rank_all_fields)

    result = await pass_5.run(
        stripe_pass_4_output,
        stripe_pass_3_output,
        stripe_pass_2_output,
        stripe_pass_1_output,
        stripe_raw_ir,
    )
    assert isinstance(result, Pass5Output)


async def test_run_tool_count_equals_pass_1_tool_count(
    monkeypatch: pytest.MonkeyPatch,
    stripe_pass_1_output: Any,
    stripe_pass_2_output: Any,
    stripe_pass_3_output: Any,
    stripe_pass_4_output: Any,
    stripe_raw_ir: Any,
) -> None:
    """One FinalTool per Pass 1 tool."""
    from mcpgen_engine.passes.pass_5.field_ranking import (
        FieldRanking,
        deterministic_ranking,
    )
    from mcpgen_engine.passes.pass_5.output_schema import OutputSchemaSpec

    async def _fake_rank_all_fields(
        output_schemas: dict[str, OutputSchemaSpec],
        _p2: Any,
        _p1: Any,
    ) -> dict[str, FieldRanking]:
        return {name: deterministic_ranking(spec.fields) for name, spec in output_schemas.items()}

    monkeypatch.setattr(pass_5, "rank_all_fields", _fake_rank_all_fields)

    result = await pass_5.run(
        stripe_pass_4_output,
        stripe_pass_3_output,
        stripe_pass_2_output,
        stripe_pass_1_output,
        stripe_raw_ir,
    )
    assert len(result.tools) == len(stripe_pass_1_output.tools)


async def test_run_pagination_strategy_uniform_across_list_tools(
    monkeypatch: pytest.MonkeyPatch,
    stripe_pass_1_output: Any,
    stripe_pass_2_output: Any,
    stripe_pass_3_output: Any,
    stripe_pass_4_output: Any,
    stripe_raw_ir: Any,
) -> None:
    """Server-wide pagination strategy is uniform across emitted list_* tools.

    This proxies the spec interface "flags include server_pagination_strategy"
    while the IR Pass5Output additive ``flags`` field is still pending plan
    04-06.
    """
    from mcpgen_engine.passes.pass_5.field_ranking import (
        FieldRanking,
        deterministic_ranking,
    )
    from mcpgen_engine.passes.pass_5.output_schema import OutputSchemaSpec

    async def _fake_rank_all_fields(
        output_schemas: dict[str, OutputSchemaSpec],
        _p2: Any,
        _p1: Any,
    ) -> dict[str, FieldRanking]:
        return {name: deterministic_ranking(spec.fields) for name, spec in output_schemas.items()}

    monkeypatch.setattr(pass_5, "rank_all_fields", _fake_rank_all_fields)

    result = await pass_5.run(
        stripe_pass_4_output,
        stripe_pass_3_output,
        stripe_pass_2_output,
        stripe_pass_1_output,
        stripe_raw_ir,
    )
    list_tool_names = {"search", "list_objects", "list_collections"}
    pagination_styles: set[str] = set()
    for tool in result.tools:
        if tool.name in list_tool_names and tool.response_config.pagination:
            pagination_styles.add(tool.response_config.pagination.style.value)
    # Either zero (no list tools paginated) or a single style — never mixed.
    assert len(pagination_styles) <= 1


async def test_run_raises_pass5error_on_synthetic_inconsistency(
    monkeypatch: pytest.MonkeyPatch,
    stripe_pass_2_output: Any,  # noqa: ARG001
    stripe_pass_3_output: Any,  # noqa: ARG001
    stripe_pass_4_output: Any,  # noqa: ARG001
    stripe_raw_ir: Any,
    synthetic_inconsistent_pagination_pass1: Any,
) -> None:
    """Forcing a tool to disagree with server-wide pagination → Pass5Error.

    We patch ``validate_pagination_consistency`` directly to assert the
    orchestrator wires it into the pipeline correctly. The detector uses
    spec response shapes so a real-world inconsistency is hard to trigger
    deterministically; this test verifies the wiring contract.
    """
    from mcpgen_engine.passes.pass_5.field_ranking import (
        FieldRanking,
        deterministic_ranking,
    )
    from mcpgen_engine.passes.pass_5.output_schema import OutputSchemaSpec
    from mcpgen_engine.passes.pass_5.validation import Pass5Error

    async def _fake_rank_all_fields(
        output_schemas: dict[str, OutputSchemaSpec],
        _p2: Any,
        _p1: Any,
    ) -> dict[str, FieldRanking]:
        return {name: deterministic_ranking(spec.fields) for name, spec in output_schemas.items()}

    monkeypatch.setattr(pass_5, "rank_all_fields", _fake_rank_all_fields)

    def _explode(_tools: list[Any], _server: Any) -> None:
        raise Pass5Error(
            "PAGINATION_INCONSISTENT: synthetic test trip",
            violations=["forced"],
        )

    monkeypatch.setattr(pass_5, "validate_pagination_consistency", _explode)

    # Use a Pass 2/3/4 with empty dicts — orchestrator should still reach the
    # pagination validator. Construct minimal Pass2/3/4 keyed to the synthetic
    # tools.
    from mcpgen_ir.types import (
        Annotations,
        Descriptions,
        Pass2Output,
        Pass3Output,
        Pass4Output,
    )

    descriptions = {}
    input_schemas = {}
    annotations = {}
    titles = {}
    for tool in synthetic_inconsistent_pagination_pass1.tools:
        descriptions[tool.name] = Descriptions(
            purpose="Synthetic tool used by validation tests in plan 04-05.",
            when_to_use=["test"],
            limitations=[],
            parameter_overview="x" * 60,
        )
        input_schemas[tool.name] = {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        }
        annotations[tool.name] = Annotations(
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=True,
        )
        titles[tool.name] = tool.name.replace("_", " ").title()

    pass_2 = Pass2Output(descriptions=descriptions)
    pass_3 = Pass3Output(input_schemas=input_schemas)
    pass_4 = Pass4Output(annotations=annotations, titles=titles)

    with pytest.raises(Pass5Error):
        await pass_5.run(
            pass_4,
            pass_3,
            pass_2,
            synthetic_inconsistent_pagination_pass1,
            stripe_raw_ir,
        )
