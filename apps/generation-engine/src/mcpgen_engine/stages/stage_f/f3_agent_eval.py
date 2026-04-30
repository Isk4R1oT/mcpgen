"""F3 agent evaluation orchestrator (CONTEXT D-19, D-20, D-21).

Chain executed end-to-end per ``run_f3()``:

  spawn_server (Plan 05-06)
    -> mock_clients verify (Pitfalls #4 / #31 / #32 fail-fast)
    -> for-each golden_task in parallel under asyncio.Semaphore(3):
         run_golden_task (Plan 05-06: real Sonnet test agent)
            -> rule_based_eval (Tier 1: deterministic checks)
            -> llm_judge_eval (Tier 2: Qwen3-Coder via make_agent)
    -> aggregate per-task results
    -> emit F3RunResult with pass_rate + mock_client_results + warnings

CRITICAL invariant (CONTEXT D-20 + Override doc §0):

    F3 LLM JUDGE = QWEN via ``mcpgen_engine.llm.agent_factory.make_agent``.
    F3 TEST AGENT = SONNET via ``mcpgen_engine.llm.test_agent.ANTHROPIC``.

These are TWO DISTINCT roles. The Sonnet agent simulates a real Cursor /
Claude Desktop / ChatGPT user driving the generated server; the Qwen judge
evaluates the agent's trajectory. NEVER swap them. The grep gate in this
plan's acceptance criteria + this docstring + comments below are the three
defenses against future drift.

Threshold sources (Pitfall #29 -- AI-fix-by-lowering-threshold):

    pass_rate threshold = LAUNCH_CRITERIA["F3_AGENT_PASS_RATE_MIN"] (0.7).
    Imported from launch_criteria.py (the Python mirror of the canonical
    packages/contracts/src/launch-criteria.ts source); the paired-decision
    pre-commit hook + main-ci grep-gate enforce that any drift requires a
    docs/decisions/<date>-<slug>.md entry.

NEVER hard-code aggregate thresholds (F3_AGENT_PASS_RATE_MIN, F2_SMELL_MIN)
inside this module -- always import from LAUNCH_CRITERIA so a single
coordinated bump (TS source + Python mirror + paired decision) propagates
everywhere.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from jsonschema.exceptions import ValidationError as JsonSchemaValidationError
from pydantic import BaseModel, Field, confloat
from pydantic_ai import Agent

from mcpgen_engine.launch_criteria import LAUNCH_CRITERIA
from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import F3_JUDGE_SETTINGS

from .mock_clients import (
    ChatGPTDeepResearchMockClient,
    ClaudeDesktopOlderMockClient,
    CursorMockClient,
    MockClientResult,
)

if TYPE_CHECKING:
    # Plan 05-06 ships server_runner + test_agent_harness. We only need their
    # types here under TYPE_CHECKING to avoid a hard import-time dependency
    # in the parallel-wave merge window. ``run_f3`` accepts ``spawn_server``
    # and ``run_golden_task`` as injected callables (default-bound to the
    # real implementations) so tests can mock them without monkey-patching
    # module globals.
    from collections.abc import Callable, Coroutine
    from contextlib import AbstractAsyncContextManager

    SpawnServerFactory = Callable[[Path], AbstractAsyncContextManager[str]]
    RunGoldenTaskCallable = Callable[..., Coroutine[Any, Any, Any]]

log = logging.getLogger(__name__)

# CONTEXT D-19: rate-control concurrency for F3 task execution.
_F3_TASK_CONCURRENCY = 3


# ─── Pydantic output model for the LLM judge ────────────────────────────────


class F3JudgeScore(BaseModel):
    """Per-task LLM-judge output (CONTEXT D-20, MCP-Bench arXiv 2508.20453)."""

    task_completion: confloat(ge=0.0, le=10.0)  # type: ignore[valid-type]
    tool_usage: confloat(ge=0.0, le=10.0)  # type: ignore[valid-type]
    planning: confloat(ge=0.0, le=10.0)  # type: ignore[valid-type]
    grounding: confloat(ge=0.0, le=10.0)  # type: ignore[valid-type]
    reasoning: str = Field(min_length=1, max_length=4000)


F3_JUDGE_PROMPT: str = """\
You are an MCP-server agent-trajectory judge (CONTEXT D-20 + MCP-Bench arXiv 2508.20453).

Score the agent trajectory below on 4 metrics on a 0-10 float scale:
  - task_completion: did the agent complete the task as stated? (1=no, 10=perfect)
  - tool_usage: were tools used correctly? (no confusion between similar tools)
  - planning: did the agent plan steps coherently?
  - grounding: were claims grounded in tool responses? (NOT hallucinated)

Server-level pass criterion: rule_based.all() AND task_completion >= 7 AND grounding >= 6.

Output a single F3JudgeScore JSON object via the structured-output tool.
"""

# F3 LLM JUDGE: Qwen3-Coder via make_agent (CONTEXT D-20). NOT Sonnet --
# the Sonnet test AGENT lives in test_agent_harness (Plan 05-06). Two
# distinct roles (Override doc §0 + §7.3). DO NOT swap.
JUDGE_AGENT: Agent[None, F3JudgeScore] = make_agent(
    output_type=F3JudgeScore,
    system_prompt=F3_JUDGE_PROMPT,
)


# ─── Tier-1 rule-based evaluator ─────────────────────────────────────────────


@dataclass(frozen=True)
class RuleScore:
    """Tier-1 deterministic checks (CONTEXT D-20)."""

    tool_validity: bool
    schema_compliance: bool
    runtime_success: bool
    dependency_order: bool
    efficient: bool

    def all_pass(self) -> bool:
        return all(
            [
                self.tool_validity,
                self.schema_compliance,
                self.runtime_success,
                self.dependency_order,
                self.efficient,
            ]
        )


@dataclass(frozen=True)
class GoldenTaskResult:
    """Per-task aggregate (rule-based + judge + final pass/fail)."""

    task_id: str
    rule_based: RuleScore
    judge_score: F3JudgeScore
    passed: bool
    trajectory: Any  # TaskTrajectory (Plan 05-06) -- duck-typed to avoid wave-merge import order


@dataclass(frozen=True)
class F3RunResult:
    """End-to-end F3 outcome surfaced in QualityReport.f3_agent_eval."""

    results: list[GoldenTaskResult]
    pass_rate: float
    mock_client_results: list[MockClientResult]
    passed: bool
    warnings: list[str]


def rule_based_eval(
    *,
    task: dict[str, Any],
    traj: Any,
    server_tools: list[dict[str, Any]],
) -> RuleScore:
    """Tier-1 deterministic checks per CONTEXT D-20 + RESEARCH §5.7.

    Args:
        task: GoldenTask dict (or model_dump) with ``task_id`` / ``prompt`` /
            ``expected_outcome`` / optional ``expected_sequence`` /
            ``expected_errors`` / ``max_iterations``.
        traj: TaskTrajectory from Plan 05-06; expects ``.tool_calls`` (list
            of objects with ``.tool_name`` / ``.args``), ``.terminated``
            string, ``.iteration_count`` int, and ``.steps`` for the judge.
        server_tools: list of FinalTool dicts (``name`` + ``inputSchema``).

    Returns:
        RuleScore with 5 booleans -- ``.all_pass()`` is the per-task gate.
    """
    tool_names = {t["name"] for t in server_tools}
    schemas = {t["name"]: t.get("inputSchema") or {} for t in server_tools}

    # WR-04: An agent that hallucinates a final answer without ever calling a
    # tool would otherwise pass via vacuous truth (`all([]) == True`). F3 is
    # testing the SERVER; a task completed without tool calls proves nothing
    # about the generated MCP surface, so refuse to mark it tool-valid.
    if not traj.tool_calls:
        return RuleScore(
            tool_validity=False,
            schema_compliance=False,
            runtime_success=False,
            dependency_order=task.get("expected_sequence") is None,
            efficient=True,
        )

    tool_validity = all(tc.tool_name in tool_names for tc in traj.tool_calls)

    schema_compliance = True
    for tc in traj.tool_calls:
        schema = schemas.get(tc.tool_name)
        if schema is None:
            schema_compliance = False
            break
        try:
            Draft202012Validator(schema).validate(tc.args)
        except (JsonSchemaValidationError, SchemaError):
            schema_compliance = False
            break

    # Plan 05-06's TaskTrajectory.terminated is set to "end_turn" on a clean
    # finish. expected_errors loosens this check: if the task expects an
    # upstream 4xx, the agent's polite end_turn after a 4xx still counts.
    runtime_success = traj.terminated == "end_turn"
    expected_errors = task.get("expected_errors")
    if expected_errors and not runtime_success:
        # If the task explicitly expects errors, we accept any non-crash
        # termination (max_iterations / pause_turn / max_tokens) as success.
        runtime_success = traj.terminated != "crash"

    dependency_order = True
    expected_seq = task.get("expected_sequence")
    if expected_seq:
        actual_seq = [tc.tool_name for tc in traj.tool_calls]
        idx = 0
        for expected in expected_seq:
            if expected not in actual_seq[idx:]:
                dependency_order = False
                break
            idx = actual_seq.index(expected, idx) + 1

    max_iter = task.get("max_iterations") or 10
    efficient = traj.iteration_count <= int(max_iter * 1.5)

    return RuleScore(
        tool_validity=tool_validity,
        schema_compliance=schema_compliance,
        runtime_success=runtime_success,
        dependency_order=dependency_order,
        efficient=efficient,
    )


# ─── Tier-2 LLM judge (Qwen3-Coder) ──────────────────────────────────────────


def _format_judge_prompt(task: dict[str, Any], traj: Any) -> str:
    """Render the per-task user prompt for the Qwen judge.

    We cap step text at 300 chars and steps at 20 to keep the judge prompt
    bounded -- the judge needs decision context, not full transcripts (full
    trajectories ship to ``.planning/phases/05-...EVIDENCE/`` per Plan 05-06).
    """
    step_lines: list[str] = []
    for s in traj.steps[:20]:
        tool_call_names = ", ".join(tc.tool_name for tc in s.tool_calls)
        text = (s.text_content or "")[:300]
        step_lines.append(
            f"Turn {s.turn}: stop_reason={s.stop_reason}, "
            f"tool_calls=[{tool_call_names}], text={text}"
        )
    final_text = traj.final_text or "<none>"
    return (
        f"Task prompt: {task['prompt']}\n\n"
        f"Expected outcome: {task['expected_outcome']}\n\n"
        f"Agent trajectory ({traj.iteration_count} turns, terminated={traj.terminated}):\n"
        + "\n".join(step_lines)
        + f"\n\nFinal text: {final_text}"
    )


async def llm_judge_eval(*, task: dict[str, Any], traj: Any) -> F3JudgeScore:
    """Tier-2 LLM judge call (CONTEXT D-20 + Override doc §0).

    Single Qwen3-Coder call per task; structured output via PydanticAI.
    F3_JUDGE_SETTINGS pins temperature=0.0 + atlas-cloud fp8 routing for
    reproducibility. The grep gate in this plan's acceptance criteria
    enforces ``make_agent`` import; this docstring + module-level
    JUDGE_AGENT comment are the runtime defenses against drift.
    """
    prompt = _format_judge_prompt(task, traj)
    result = await JUDGE_AGENT.run(prompt, model_settings=F3_JUDGE_SETTINGS)
    return result.output


def _passes_per_task(rule: RuleScore, judge: F3JudgeScore) -> bool:
    """Per-task pass criterion (CONTEXT D-20).

    ``rule_based.all() AND task_completion >= 7 AND grounding >= 6``.
    Threshold values 7 / 6 come from MCP-Bench arXiv 2508.20453 Table 4 +
    CONTEXT D-20; they are the per-metric judge thresholds, distinct from
    the server-level ``F3_AGENT_PASS_RATE_MIN`` aggregate which lives in
    LAUNCH_CRITERIA.
    """
    return rule.all_pass() and judge.task_completion >= 7.0 and judge.grounding >= 6.0


# ─── End-to-end F3 orchestrator ──────────────────────────────────────────────


async def run_f3(
    *,
    generated_dir: Path,
    final_tools: list[dict[str, Any]],
    golden_tasks: list[dict[str, Any]],
    sandbox_credentials: dict[str, str] | None,
    spawn_server: SpawnServerFactory | None = None,
    run_golden_task: RunGoldenTaskCallable | None = None,
) -> F3RunResult:
    """End-to-end F3 (CONTEXT D-19, D-20, D-21).

    Args:
        generated_dir: directory containing the generated tenant Worker
            (Stage E output) -- passed to spawn_server.
        final_tools: list of FinalTool dicts (Pass 5 output) -- used by
            rule_based_eval (tool name + inputSchema) and as the
            Anthropic-formatted tool list for the test agent.
        golden_tasks: list of GoldenTask dicts (after model_dump). Loaded
            via load_golden_tasks() in the caller.
        sandbox_credentials: optional dict of ``tool_name -> Bearer-...``
            entries for top-10 APIs (CONTEXT D-22). NEVER persisted -- only
            forwarded to run_golden_task for X-Upstream-Auth headers.
        spawn_server: injected for test mocking; defaults to the Plan 05-06
            implementation when None (resolved lazily so this module does
            not hard-import a parallel-wave sibling at import time).
        run_golden_task: same -- injected for test mocking.

    Returns:
        F3RunResult with per-task results + aggregate pass_rate + mock-
        client structural results + warnings (Pitfall #4/#31/#32 surfaces).
    """
    if spawn_server is None or run_golden_task is None:
        # Late import: server_runner + test_agent_harness ship in Plan 05-06,
        # which lands in the same wave as this plan. Resolving lazily avoids
        # a wave-merge import-order failure. mypy import-untyped is suppressed
        # at the call sites because we cannot import the modules at the top
        # of this file -- they don't exist on this branch yet.
        from .server_runner import spawn_server as _real_spawn  # type: ignore[import-untyped,import-not-found,unused-ignore] # noqa: I001
        from .test_agent_harness import run_golden_task as _real_run  # type: ignore[import-untyped,import-not-found,unused-ignore]

        if spawn_server is None:
            spawn_server = _real_spawn
        if run_golden_task is None:
            run_golden_task = _real_run

    warnings: list[str] = []

    # spawn_server is an async context manager. RESEARCH §5.4 #2 -- shared
    # subprocess across all tasks (~3 minutes wall clock for 10 tasks @ Sem(3)).
    async with spawn_server(generated_dir) as server_url:
        # Mock clients run BEFORE agent harness (CONTEXT D-21). They are the
        # cheap socket-only fail-fast for Pitfalls #4 / #31 / #32 -- ~3s
        # total, no LLM cost.
        mock_results = list(
            await asyncio.gather(
                CursorMockClient().verify(server_url),
                ClaudeDesktopOlderMockClient().verify(server_url),
                ChatGPTDeepResearchMockClient().verify(server_url),
            )
        )
        for mr in mock_results:
            if not mr.passed:
                warnings.append(f"Mock client {mr.client_name} failed: {mr.reason}")

        # Note: a mock-client failure is a P0 surface but does NOT short-
        # circuit the agent run (we still want F3 numbers for the retry
        # orchestrator -- failure pattern + judge score together drive
        # Plan 05-08's retry decision matrix per CONTEXT D-25). The
        # ``passed`` field at the F3RunResult level requires both the
        # pass_rate threshold AND all-mock-clients-passed.

        sem = asyncio.Semaphore(_F3_TASK_CONCURRENCY)

        async def _run_one(task: dict[str, Any]) -> GoldenTaskResult:
            async with sem:
                traj = await run_golden_task(
                    task=task,
                    server_url=server_url,
                    mcp_tools=final_tools,
                    sandbox_credentials=sandbox_credentials,
                )
                rule = rule_based_eval(task=task, traj=traj, server_tools=final_tools)
                judge = await llm_judge_eval(task=task, traj=traj)
                return GoldenTaskResult(
                    task_id=task["task_id"],
                    rule_based=rule,
                    judge_score=judge,
                    passed=_passes_per_task(rule, judge),
                    trajectory=traj,
                )

        results = list(await asyncio.gather(*[_run_one(t) for t in golden_tasks]))

    passes = sum(1 for r in results if r.passed)
    pass_rate = passes / len(results) if results else 0.0

    threshold = float(LAUNCH_CRITERIA["F3_AGENT_PASS_RATE_MIN"])  # type: ignore[arg-type]
    passed = pass_rate >= threshold and all(mr.passed for mr in mock_results)

    return F3RunResult(
        results=results,
        pass_rate=pass_rate,
        mock_client_results=mock_results,
        passed=passed,
        warnings=warnings,
    )
