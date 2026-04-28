"""Pass 4 — tests for ``__init__.py::run`` (3-phase orchestrator + Pass4Output).

Threats covered:
- T-03-OW (D-27): every emitted Annotations carries openWorldHint=True.
- T-03-VP (D-29): conservative defaults route flows correctly.
- Pitfall #31 (D-32): read tools have explicit readOnlyHint=True AND
  openWorldHint=True after the full pipeline.
- LLM-not-invoked-for-deterministic-tools: high-confidence verbs + universal
  rules don't call ``judge_action_tools``.
"""

from __future__ import annotations

import pytest
from mcpgen_ir.types import (
    CoverageProofItem,
    Descriptions,
    Pass1Output,
    Pass2Output,
    Pass3Output,
    Pass4Output,
    Routing1,
    Rule1,
    SmartId,
    Tool1,
    Type,
)

from mcpgen_engine.passes import pass_4
from mcpgen_engine.passes.pass_4 import run

# ─────────────────────────── Fixture builders ──────────────────────────────


def _make_smart_id() -> SmartId:
    return SmartId(
        format="{server}:{type}:{collection}:{identifier}",
        types=["object"],
        collections=["thing"],
    )


def _make_pass_1_output(tools: list[Tool1]) -> Pass1Output:
    return Pass1Output(
        tools=tools,
        routing=Routing1(smart_id=_make_smart_id(), rules=[]),
        workflows=[],
        coverage_pct=100.0,
        coverage_proof=[],
    )


def _make_pass_1_with_one_rule(tools: list[Tool1]) -> Pass1Output:
    """Convenience: builds a Pass1Output with a single dummy rule so the
    Pass1Output validates even when callers don't care about routing."""
    return Pass1Output(
        tools=tools,
        routing=Routing1(
            smart_id=_make_smart_id(),
            rules=[
                Rule1.model_validate(
                    {
                        "universal_tool": "search",
                        "target_endpoint": "GET /v1/x",
                        "params_mapping": {},
                    }
                ),
            ],
        ),
        workflows=[],
        coverage_pct=100.0,
        coverage_proof=[
            CoverageProofItem.model_validate(
                {
                    "endpoint_id": "GET /v1/x",
                    "mapped_to_universal_tool": "search",
                    "sample_invocation": {
                        "url": "https://example.com/v1/x",
                        "method": "GET",
                        "params": {},
                    },
                }
            ),
        ],
    )


def _make_pass_2_empty() -> Pass2Output:
    return Pass2Output(descriptions={})


def _make_pass_2_with(name: str, purpose: str) -> Pass2Output:
    return Pass2Output(
        descriptions={
            name: Descriptions(
                purpose=purpose,
                when_to_use=["x"],
                limitations=[],
                parameter_overview="Y" * 60,
                description_hash="hash_test",
            ),
        }
    )


def _make_pass_3_empty() -> Pass3Output:
    return Pass3Output(input_schemas={})


# ───────────────────────── Universal/specialized tools ──────────────────────


async def test_run_universal_tools_get_correct_annotations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Universal `search` → readOnly=True, destructive=False, idempotent=True,
    openWorldHint=True. LLM judge MUST NOT be called."""

    async def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("judge_action_tools should not be called for universal tools")

    monkeypatch.setattr(pass_4, "judge_action_tools", _explode)

    tools = [Tool1(name="search", type=Type.universal, source_endpoints=["GET /v1/x"])]
    pass_1 = _make_pass_1_output(tools)
    result = await run(_make_pass_3_empty(), _make_pass_2_empty(), pass_1)

    ann = result.annotations["search"]
    assert ann.readOnlyHint is True
    assert ann.destructiveHint is False
    assert ann.idempotentHint is True
    assert ann.openWorldHint is True


async def test_run_specialized_tool_is_read_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Specialized read tools also get readOnly=True per the rule table."""

    async def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("judge_action_tools should not be called")

    monkeypatch.setattr(pass_4, "judge_action_tools", _explode)

    tools = [
        Tool1(
            name="balance_summary",
            type=Type.specialized,
            source_endpoints=["GET /v1/balance"],
        ),
    ]
    pass_1 = _make_pass_1_output(tools)
    result = await run(_make_pass_3_empty(), _make_pass_2_empty(), pass_1)
    assert result.annotations["balance_summary"].readOnlyHint is True
    assert result.annotations["balance_summary"].openWorldHint is True


# ──────────────────────────────── Action paths ──────────────────────────────


async def test_run_high_confidence_action_no_llm_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """charges_refund matches the high-confidence verb pattern → LLM skipped."""

    async def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("judge_action_tools should not be called for high-confidence verbs")

    monkeypatch.setattr(pass_4, "judge_action_tools", _explode)

    tools = [Tool1(name="charges_refund", type=Type.action, source_endpoints=["POST /v1/refund"])]
    pass_1 = _make_pass_1_output(tools)
    result = await run(_make_pass_3_empty(), _make_pass_2_empty(), pass_1)
    ann = result.annotations["charges_refund"]
    assert ann.destructiveHint is True
    assert ann.readOnlyHint is False
    assert ann.openWorldHint is True


async def test_run_medium_confidence_action_invokes_llm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """messages_send matches the medium-confidence verb pattern → judge called."""
    captured: dict[str, list[str]] = {}

    async def fake_judge(
        names: list[str], _pass_2: Pass2Output | None
    ) -> dict[str, dict[str, bool]]:
        captured["names"] = list(names)
        return {
            n: {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False}
            for n in names
        }

    monkeypatch.setattr(pass_4, "judge_action_tools", fake_judge)

    tools = [Tool1(name="messages_send", type=Type.action, source_endpoints=["POST /v1/messages"])]
    pass_1 = _make_pass_1_output(tools)
    result = await run(_make_pass_3_empty(), _make_pass_2_empty(), pass_1)
    assert captured["names"] == ["messages_send"]
    ann = result.annotations["messages_send"]
    assert ann.openWorldHint is True
    # Returned by fake judge:
    assert ann.readOnlyHint is False
    assert ann.destructiveHint is False
    assert ann.idempotentHint is False


async def test_run_action_no_verb_match_uses_conservative_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Action tool with NO verb match → conservative defaults; LLM not called."""

    async def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("judge_action_tools should not be called when verb is 'none'")

    monkeypatch.setattr(pass_4, "judge_action_tools", _explode)

    tools = [Tool1(name="weird_unmatched", type=Type.action, source_endpoints=["POST /v1/x"])]
    pass_1 = _make_pass_1_output(tools)
    result = await run(_make_pass_3_empty(), _make_pass_2_empty(), pass_1)
    ann = result.annotations["weird_unmatched"]
    # D-29 conservative defaults: readOnly=False, destructive=True, idempotent=False.
    assert ann.readOnlyHint is False
    assert ann.destructiveHint is True
    assert ann.idempotentHint is False
    assert ann.openWorldHint is True


# ─────────────────────────────── Workflow path ──────────────────────────────


async def test_run_workflow_uses_aggregation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A workflow over (read endpoint, delete endpoint) → destructive=True
    (OR aggregation across sub-operations per D-30)."""

    async def _no_llm(*_args: object, **_kwargs: object) -> dict[str, dict[str, bool]]:
        return {}

    monkeypatch.setattr(pass_4, "judge_action_tools", _no_llm)

    tools = [
        Tool1(name="fetch", type=Type.universal, source_endpoints=["GET /v1/items/{id}"]),
        Tool1(name="delete", type=Type.universal, source_endpoints=["DELETE /v1/items/{id}"]),
        Tool1(
            name="fetch_and_delete",
            type=Type.workflow,
            source_endpoints=["GET /v1/items/{id}", "DELETE /v1/items/{id}"],
        ),
    ]
    pass_1 = _make_pass_1_output(tools)
    result = await run(_make_pass_3_empty(), _make_pass_2_empty(), pass_1)
    ann = result.annotations["fetch_and_delete"]
    assert ann.destructiveHint is True  # OR aggregation
    assert ann.openWorldHint is True


# ─────────────────────────────── Titles populated ───────────────────────────


async def test_run_titles_populated_for_all_tools(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every input tool must have a corresponding title in the output."""

    async def _no_llm(*_args: object, **_kwargs: object) -> dict[str, dict[str, bool]]:
        return {}

    monkeypatch.setattr(pass_4, "judge_action_tools", _no_llm)

    tools = [
        Tool1(name="search", type=Type.universal, source_endpoints=["GET /v1/x"]),
        Tool1(name="charges_refund", type=Type.action, source_endpoints=["POST /v1/refund"]),
        Tool1(name="schedule_event", type=Type.workflow, source_endpoints=["POST /events"]),
    ]
    pass_1 = _make_pass_1_output(tools)
    result = await run(_make_pass_3_empty(), _make_pass_2_empty(), pass_1)
    assert set(result.titles.keys()) == {t.name for t in tools}


# ─────────────────────────── Pitfall #31 IR-shape check ─────────────────────


async def test_run_pitfall_31_read_tools_have_explicit_read_only_and_open_world(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """All four canonical universal read tools have readOnlyHint=True
    AND openWorldHint=True after the full pipeline (Pitfall #31 verification)."""

    async def _no_llm(*_args: object, **_kwargs: object) -> dict[str, dict[str, bool]]:
        return {}

    monkeypatch.setattr(pass_4, "judge_action_tools", _no_llm)

    tools = [
        Tool1(name="search", type=Type.universal, source_endpoints=["GET /v1/x"]),
        Tool1(name="fetch", type=Type.universal, source_endpoints=["GET /v1/x/{id}"]),
        Tool1(name="list_collections", type=Type.universal, source_endpoints=[]),
        Tool1(name="list_objects", type=Type.universal, source_endpoints=["GET /v1/x"]),
    ]
    pass_1 = _make_pass_1_output(tools)
    result = await run(_make_pass_3_empty(), _make_pass_2_empty(), pass_1)
    for name in ("search", "fetch", "list_collections", "list_objects"):
        ann = result.annotations[name]
        assert ann.readOnlyHint is True, f"{name} missing readOnlyHint=True (Pitfall #31)"
        assert ann.openWorldHint is True, f"{name} missing openWorldHint=True (D-27)"


# ───────────────────── Pass4Output Pydantic shape ───────────────────────────


async def test_run_pass_4_output_pydantic_validates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """run() returns a valid Pass4Output instance; .model_dump() succeeds."""

    async def _no_llm(*_args: object, **_kwargs: object) -> dict[str, dict[str, bool]]:
        return {}

    monkeypatch.setattr(pass_4, "judge_action_tools", _no_llm)

    tools = [Tool1(name="search", type=Type.universal, source_endpoints=["GET /v1/x"])]
    pass_1 = _make_pass_1_output(tools)
    result = await run(_make_pass_3_empty(), _make_pass_2_empty(), pass_1)
    assert isinstance(result, Pass4Output)
    dumped = result.model_dump()
    assert "annotations" in dumped
    assert "titles" in dumped


# ─────────────────────────── Pass 2 enrichment in LLM prompt ────────────────


async def test_run_passes_pass_2_output_to_llm_judge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The LLM judge receives the Pass2Output for richer prompt context."""
    captured: dict[str, object] = {}

    async def fake_judge(
        names: list[str], pass_2: Pass2Output | None
    ) -> dict[str, dict[str, bool]]:
        captured["pass_2"] = pass_2
        return {
            n: {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False}
            for n in names
        }

    monkeypatch.setattr(pass_4, "judge_action_tools", fake_judge)

    tools = [Tool1(name="messages_send", type=Type.action, source_endpoints=["POST /v1/x"])]
    pass_1 = _make_pass_1_output(tools)
    pass_2 = _make_pass_2_with("messages_send", "Send a message to the recipient.")
    await run(_make_pass_3_empty(), pass_2, pass_1)
    assert captured["pass_2"] is pass_2


# ─────────────────────────── Empty-tools edge case ──────────────────────────


async def test_run_empty_tools_returns_empty_pass_4_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Zero tools → empty Pass4Output (LLM not called)."""

    async def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("LLM judge should not be called when there are no tools")

    monkeypatch.setattr(pass_4, "judge_action_tools", _explode)

    pass_1 = _make_pass_1_with_one_rule([])
    result = await run(_make_pass_3_empty(), _make_pass_2_empty(), pass_1)
    assert result.annotations == {}
    assert result.titles == {}


# ─────────────────────────── Module-level shape ─────────────────────────────


def test_pass_4_module_exports_run() -> None:
    """Downstream pipeline can `from mcpgen_engine.passes import pass_4; pass_4.run(...)`."""
    assert hasattr(pass_4, "run")
    assert callable(pass_4.run)
    assert hasattr(pass_4, "Pass4Error")
    assert hasattr(pass_4, "PASS_4_VERSION")
    expected_version = "1"
    assert expected_version == pass_4.PASS_4_VERSION
