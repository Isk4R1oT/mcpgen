"""Plan 05-07 Task 3 -- F3 two-tier evaluator + run_f3 orchestrator.

CRITICAL invariant under test (CONTEXT D-20 + Override doc §0):

    - F3 LLM JUDGE = Qwen via make_agent (this file's tests assert that).
    - F3 TEST AGENT = Sonnet (lives in test_agent_harness, not here).

NEVER swap. The grep gate in plan acceptance criteria is one defense; the
docstring + test_judge_uses_make_agent test below are the runtime defense.
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from mcpgen_engine.stages.stage_f import f3_agent_eval
from mcpgen_engine.stages.stage_f.f3_agent_eval import (
    F3JudgeScore,
    GoldenTaskResult,
    RuleScore,
    _passes_per_task,
    llm_judge_eval,
    rule_based_eval,
    run_f3,
)
from mcpgen_engine.stages.stage_f.mock_clients import MockClientResult

# ─── Stub trajectory primitives (Plan 05-06 ships the real ones) ─────────────


@dataclass(frozen=True)
class _StubToolCall:
    tool_name: str
    args: dict[str, Any]
    tool_use_id: str = "tu_x"


@dataclass(frozen=True)
class _StubStep:
    turn: int
    stop_reason: str
    text_content: str
    tool_calls: list[_StubToolCall]


@dataclass(frozen=True)
class _StubTrajectory:
    """Duck-typed approximation of Plan 05-06's TaskTrajectory."""

    tool_calls: list[_StubToolCall]
    iteration_count: int
    terminated: str
    final_text: str | None = None
    steps: list[_StubStep] = field(default_factory=list)


def _server_tools_search_only() -> list[dict[str, Any]]:
    return [
        {
            "name": "search",
            "inputSchema": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
                "additionalProperties": False,
            },
        }
    ]


# ─── rule_based_eval ─────────────────────────────────────────────────────────


def test_rule_based_eval_all_pass() -> None:
    task = {
        "task_id": "t1",
        "prompt": "find foo",
        "expected_outcome": "ok",
        "max_iterations": 10,
    }
    traj = _StubTrajectory(
        tool_calls=[_StubToolCall("search", {"query": "foo"})],
        iteration_count=2,
        terminated="end_turn",
    )
    score = rule_based_eval(task=task, traj=traj, server_tools=_server_tools_search_only())
    assert score.tool_validity is True
    assert score.schema_compliance is True
    assert score.runtime_success is True
    assert score.dependency_order is True
    assert score.efficient is True
    assert score.all_pass() is True


def test_rule_based_eval_unknown_tool_fails_validity() -> None:
    task = {"task_id": "t1", "prompt": "x", "expected_outcome": "x"}
    traj = _StubTrajectory(
        tool_calls=[_StubToolCall("nonexistent", {})],
        iteration_count=1,
        terminated="end_turn",
    )
    score = rule_based_eval(task=task, traj=traj, server_tools=_server_tools_search_only())
    assert score.tool_validity is False


def test_rule_based_eval_bad_args_fails_schema_compliance() -> None:
    task = {"task_id": "t1", "prompt": "x", "expected_outcome": "x"}
    # `query` is required by the inputSchema -- empty args triggers failure.
    traj = _StubTrajectory(
        tool_calls=[_StubToolCall("search", {})],
        iteration_count=1,
        terminated="end_turn",
    )
    score = rule_based_eval(task=task, traj=traj, server_tools=_server_tools_search_only())
    assert score.tool_validity is True
    assert score.schema_compliance is False


def test_rule_based_eval_inefficient_when_iterations_exceed_15() -> None:
    task = {
        "task_id": "t1",
        "prompt": "x",
        "expected_outcome": "x",
        "max_iterations": 10,  # threshold = 10 * 1.5 = 15
    }
    traj = _StubTrajectory(
        tool_calls=[_StubToolCall("search", {"query": "x"})],
        iteration_count=20,
        terminated="end_turn",
    )
    score = rule_based_eval(task=task, traj=traj, server_tools=_server_tools_search_only())
    assert score.efficient is False


def test_rule_based_eval_dependency_order_violation() -> None:
    task = {
        "task_id": "t1",
        "prompt": "x",
        "expected_outcome": "x",
        "expected_sequence": ["search", "fetch"],
    }
    fetch_tool = {
        "name": "fetch",
        "inputSchema": {
            "type": "object",
            "properties": {"id": {"type": "string"}},
            "required": ["id"],
            "additionalProperties": False,
        },
    }
    traj = _StubTrajectory(
        # fetch BEFORE search violates the partial order.
        tool_calls=[
            _StubToolCall("fetch", {"id": "x"}),
            _StubToolCall("search", {"query": "y"}),
        ],
        iteration_count=2,
        terminated="end_turn",
    )
    score = rule_based_eval(
        task=task,
        traj=traj,
        server_tools=[*_server_tools_search_only(), fetch_tool],
    )
    assert score.dependency_order is False


# ─── llm_judge_eval (Qwen via make_agent) ────────────────────────────────────


async def test_llm_judge_eval_returns_score() -> None:
    task = {"task_id": "t1", "prompt": "x", "expected_outcome": "x"}
    traj = _StubTrajectory(
        tool_calls=[],
        iteration_count=1,
        terminated="end_turn",
        steps=[],
    )
    expected = F3JudgeScore(
        task_completion=8.0,
        tool_usage=7.0,
        planning=6.5,
        grounding=7.0,
        reasoning="agent finished cleanly",
    )
    fake_run_result = type("FakeResult", (), {"output": expected})()
    with patch.object(
        f3_agent_eval.JUDGE_AGENT, "run", new=AsyncMock(return_value=fake_run_result)
    ):
        score = await llm_judge_eval(task=task, traj=traj)
    assert score.task_completion == 8.0
    assert score.grounding == 7.0


def test_judge_uses_make_agent() -> None:
    """CONTEXT D-20 invariant: the LLM judge is QWEN via make_agent.

    Sonnet (the test AGENT, not the LLM judge) must NEVER be imported inside
    f3_agent_eval. The grep gate in plan acceptance criteria is the static
    defense; this test is the runtime defense.

    We strip out docstrings + comments before scanning so the educational
    references in module/test docstrings don't trip the gate.
    """
    import re

    import mcpgen_engine.stages.stage_f.f3_agent_eval as mod

    src = Path(mod.__file__).read_text(encoding="utf-8")
    assert "from mcpgen_engine.llm.agent_factory import make_agent" in src

    # Strip triple-quoted strings + line comments to scan only executable code.
    code_only = re.sub(r'"""[\s\S]*?"""', "", src)
    code_only = re.sub(r"^\s*#.*$", "", code_only, flags=re.MULTILINE)

    # Sonnet client lives in llm/test_agent.py; F3 judge must NEVER import it
    # in executable code. (Docstrings + comments are allowed to mention it
    # for didactic purposes -- those are stripped above.)
    assert "from mcpgen_engine.llm.test_agent" not in code_only
    assert "import mcpgen_engine.llm.test_agent" not in code_only
    # Pydantic-AI Agent type bound to the make_agent factory.
    assert isinstance(mod.JUDGE_AGENT.output_type, type)
    assert issubclass(mod.JUDGE_AGENT.output_type, F3JudgeScore)


# ─── _passes_per_task ────────────────────────────────────────────────────────


def test_passes_per_task_high_scores() -> None:
    rule = RuleScore(True, True, True, True, True)
    judge = F3JudgeScore(task_completion=8, tool_usage=8, planning=7, grounding=7, reasoning="ok")
    assert _passes_per_task(rule, judge) is True


def test_passes_per_task_judge_below_completion_threshold() -> None:
    rule = RuleScore(True, True, True, True, True)
    judge = F3JudgeScore(task_completion=6, tool_usage=8, planning=7, grounding=7, reasoning="ok")
    assert _passes_per_task(rule, judge) is False


def test_passes_per_task_judge_below_grounding_threshold() -> None:
    rule = RuleScore(True, True, True, True, True)
    judge = F3JudgeScore(task_completion=8, tool_usage=8, planning=7, grounding=5, reasoning="ok")
    assert _passes_per_task(rule, judge) is False


def test_passes_per_task_rule_failure_blocks_pass() -> None:
    rule = RuleScore(True, False, True, True, True)
    judge = F3JudgeScore(
        task_completion=10, tool_usage=10, planning=10, grounding=10, reasoning="ok"
    )
    assert _passes_per_task(rule, judge) is False


# ─── run_f3 orchestrator ─────────────────────────────────────────────────────


def _make_passing_judge() -> F3JudgeScore:
    return F3JudgeScore(
        task_completion=9.0,
        tool_usage=8.0,
        planning=8.0,
        grounding=8.0,
        reasoning="all good",
    )


def _make_failing_judge() -> F3JudgeScore:
    return F3JudgeScore(
        task_completion=4.0,
        tool_usage=4.0,
        planning=4.0,
        grounding=4.0,
        reasoning="agent struggled",
    )


@contextlib.asynccontextmanager
async def _fake_spawn_server(generated_dir: Path) -> AsyncIterator[str]:  # noqa: ARG001
    yield "http://127.0.0.1:18787/mcp"


async def _make_passing_traj(
    *,
    task: dict[str, Any],  # noqa: ARG001
    server_url: str,  # noqa: ARG001
    mcp_tools: list[dict[str, Any]],  # noqa: ARG001
    sandbox_credentials: dict[str, str] | None,  # noqa: ARG001
) -> _StubTrajectory:
    return _StubTrajectory(
        tool_calls=[_StubToolCall("search", {"query": "x"})],
        iteration_count=2,
        terminated="end_turn",
        final_text="done",
        steps=[
            _StubStep(
                turn=0,
                stop_reason="tool_use",
                text_content="searching",
                tool_calls=[_StubToolCall("search", {"query": "x"})],
            ),
            _StubStep(turn=1, stop_reason="end_turn", text_content="done", tool_calls=[]),
        ],
    )


def _all_clients_pass(monkeypatch: pytest.MonkeyPatch) -> None:
    """Patch the 3 mock clients to pass without HTTP calls."""

    async def _ok(self, server_url: str) -> MockClientResult:  # noqa: ARG001
        return MockClientResult(
            client_name=self.__class__.__name__.replace("MockClient", "").lower(),
            passed=True,
            reason="OK",
            details={},
        )

    monkeypatch.setattr("mcpgen_engine.stages.stage_f.f3_agent_eval.CursorMockClient.verify", _ok)
    monkeypatch.setattr(
        "mcpgen_engine.stages.stage_f.f3_agent_eval.ClaudeDesktopOlderMockClient.verify", _ok
    )
    monkeypatch.setattr(
        "mcpgen_engine.stages.stage_f.f3_agent_eval.ChatGPTDeepResearchMockClient.verify", _ok
    )


async def test_run_f3_all_tasks_pass(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _all_clients_pass(monkeypatch)
    final_tools = _server_tools_search_only()
    golden_tasks = [
        {"task_id": f"t{i}", "prompt": "x", "expected_outcome": "x", "max_iterations": 10}
        for i in range(3)
    ]
    with patch.object(
        f3_agent_eval, "llm_judge_eval", new=AsyncMock(return_value=_make_passing_judge())
    ):
        result = await run_f3(
            generated_dir=tmp_path,
            final_tools=final_tools,
            golden_tasks=golden_tasks,
            sandbox_credentials=None,
            spawn_server=_fake_spawn_server,
            run_golden_task=_make_passing_traj,
        )
    assert result.pass_rate == 1.0
    assert result.passed is True
    assert all(isinstance(r, GoldenTaskResult) for r in result.results)
    assert result.warnings == []


async def test_run_f3_mock_client_failure_appends_warning(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Mock-client failure -> warning + passed=False even if every task passes."""

    async def _ok(self, server_url: str) -> MockClientResult:  # noqa: ARG001
        return MockClientResult(
            client_name=self.__class__.__name__.replace("MockClient", "").lower(),
            passed=True,
            reason="OK",
            details={},
        )

    async def _fail(self, server_url: str) -> MockClientResult:  # noqa: ARG001
        return MockClientResult(
            client_name="cursor",
            passed=False,
            reason="openWorldHint invariant violated",
            details={"tool": "search"},
        )

    monkeypatch.setattr("mcpgen_engine.stages.stage_f.f3_agent_eval.CursorMockClient.verify", _fail)
    monkeypatch.setattr(
        "mcpgen_engine.stages.stage_f.f3_agent_eval.ClaudeDesktopOlderMockClient.verify", _ok
    )
    monkeypatch.setattr(
        "mcpgen_engine.stages.stage_f.f3_agent_eval.ChatGPTDeepResearchMockClient.verify", _ok
    )

    final_tools = _server_tools_search_only()
    golden_tasks = [{"task_id": "t1", "prompt": "x", "expected_outcome": "x"}]
    with patch.object(
        f3_agent_eval, "llm_judge_eval", new=AsyncMock(return_value=_make_passing_judge())
    ):
        result = await run_f3(
            generated_dir=tmp_path,
            final_tools=final_tools,
            golden_tasks=golden_tasks,
            sandbox_credentials=None,
            spawn_server=_fake_spawn_server,
            run_golden_task=_make_passing_traj,
        )
    assert result.pass_rate == 1.0  # tasks themselves pass
    assert result.passed is False  # but mock-client failure flips the aggregate
    assert any("cursor" in w.lower() for w in result.warnings)


async def test_run_f3_pass_rate_below_threshold_fails(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """When LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN (0.7) is not met, passed=False."""
    _all_clients_pass(monkeypatch)
    final_tools = _server_tools_search_only()
    golden_tasks = [
        {"task_id": f"t{i}", "prompt": "x", "expected_outcome": "x", "max_iterations": 10}
        for i in range(3)
    ]
    with patch.object(
        f3_agent_eval, "llm_judge_eval", new=AsyncMock(return_value=_make_failing_judge())
    ):
        result = await run_f3(
            generated_dir=tmp_path,
            final_tools=final_tools,
            golden_tasks=golden_tasks,
            sandbox_credentials=None,
            spawn_server=_fake_spawn_server,
            run_golden_task=_make_passing_traj,
        )
    assert result.pass_rate == 0.0
    assert result.passed is False


async def test_run_f3_uses_launch_criteria_threshold(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Threshold reads from LAUNCH_CRITERIA, never hard-coded."""
    _all_clients_pass(monkeypatch)
    final_tools = _server_tools_search_only()
    # Single task -- pass_rate is binary 0.0 or 1.0.
    golden_tasks = [{"task_id": "t1", "prompt": "x", "expected_outcome": "x"}]

    # Capture the threshold by patching LAUNCH_CRITERIA dict.
    with (
        patch.object(
            f3_agent_eval,
            "LAUNCH_CRITERIA",
            {"F3_AGENT_PASS_RATE_MIN": 0.99, "BUNDLE_SIZE": {}, "F2_SMELL_MIN": 4.0},
        ),
        patch.object(
            f3_agent_eval, "llm_judge_eval", new=AsyncMock(return_value=_make_passing_judge())
        ),
    ):
        result = await run_f3(
            generated_dir=tmp_path,
            final_tools=final_tools,
            golden_tasks=golden_tasks,
            sandbox_credentials=None,
            spawn_server=_fake_spawn_server,
            run_golden_task=_make_passing_traj,
        )
    assert result.pass_rate == 1.0
    assert result.passed is True
