"""Plan 10-03 — generation_id threading regression suite (D-06 item 1).

Three tests (TDD):

- **Test 1** asserts that for EVERY pass / Stage F sub-function that calls
  ``run_with_tracing``, the ``session_id`` kwarg captured at the wrapper boundary
  equals the threaded ``generation_id`` value (NOT the legacy ``"unknown"``
  placeholder). Drives each sub-function with the smallest-possible inputs and a
  mocked ``run_with_tracing`` so the assertion is whitebox + fast.
- **Test 2** is a sentinel-string grep over the production tree: ``rg -l
  'session_id="unknown"' apps/generation-engine/src/mcpgen_engine/passes
  apps/generation-engine/src/mcpgen_engine/stages/stage_f`` MUST return zero
  matches after Phase 10. Mitigates T-10-03-genid-regression (a future PR
  re-introducing the literal placeholder).
- **Test 3** is a regression guard: ``run_with_tracing`` must still accept the
  ``session_id`` keyword argument with the original signature. Imports the
  existing ``test_langfuse_session.py`` Test 1 verbatim shape so a refactor of
  the wrapper signature trips this test.

References:
- 10-03-PLAN.md `<tasks>` Task 1 + acceptance_criteria
- 09-PHASE-VERIFICATION.md `phase_10_carry_forward.code_followups[0]` (12 sites)
- 10-PATTERNS.md §6 (canonical TODO marker + caller chain)
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest

# ─── Repo-anchor for sentinel scan ─────────────────────────────────────────
# Walk up from this test file to the repo root so the test is robust against
# pytest CWD differences (uv pytest from app root vs from monorepo root).
_REPO_ROOT = Path(__file__).resolve().parents[4]
_PASSES_DIR = _REPO_ROOT / "apps/generation-engine/src/mcpgen_engine/passes"
_STAGE_F_DIR = _REPO_ROOT / "apps/generation-engine/src/mcpgen_engine/stages/stage_f"

# Sentinel value threaded through every public pass / Stage F call below.
# Asserted byte-for-byte at every captured run_with_tracing call.
_SENTINEL_GENERATION_ID = "gen_01TEST_PHASE10"


# ─── Helpers ───────────────────────────────────────────────────────────────


class _FakeAgentRunResult:
    """Stand-in for ``pydantic_ai.agent.AgentRunResult`` — only ``output`` matters."""

    def __init__(self, output: Any) -> None:
        self.output = output


def _make_run_with_tracing_mock(output: Any) -> AsyncMock:
    """Build an AsyncMock that returns a ``_FakeAgentRunResult`` with the given output.

    Every captured call records (args, kwargs); tests assert ``session_id``
    on those kwargs. Because ``run_with_tracing``'s signature uses a
    keyword-only marker (``*, session_id, stage, model_settings``), every
    production call passes ``session_id`` as a kwarg — assertion path is
    deterministic.
    """
    return AsyncMock(return_value=_FakeAgentRunResult(output=output))


def _assert_all_calls_threaded_generation_id(mock: AsyncMock, expected: str) -> None:
    """Verify every captured run_with_tracing call carried session_id=expected.

    Surfaces a precise failure message naming the offending call index +
    captured value when assertion fails.
    """
    assert mock.call_count > 0, "run_with_tracing was not called — test setup wrong"
    for idx, call in enumerate(mock.call_args_list):
        captured = call.kwargs.get("session_id")
        assert captured == expected, (
            f"Call #{idx + 1}: session_id kwarg mismatch. "
            f"Expected {expected!r} (threaded generation_id), got {captured!r}. "
            f"Likely a missing thread or a stale 'unknown' placeholder."
        )


# ─── Test 2: sentinel grep ─────────────────────────────────────────────────


def test_no_session_id_unknown_placeholders_remain() -> None:
    """T-10-03-genid-regression mitigation: zero ``session_id="unknown"`` matches.

    Walks ``passes/**/*.py`` and ``stages/stage_f/*.py`` and asserts no file
    contains the literal string ``'session_id="unknown"'``. Catches BOTH
    accidental re-introduction in code AND the canonical TODO comment block
    that lived at ``passes/pass_0/llm.py:171-182`` (the comment block also
    contained the literal as a quoted form — Phase 10 removes the comment
    block alongside the literal).
    """
    needle = 'session_id="unknown"'
    matched: list[str] = []
    for directory in (_PASSES_DIR, _STAGE_F_DIR):
        assert directory.is_dir(), f"Expected directory does not exist: {directory}"
        for path in directory.rglob("*.py"):
            content = path.read_text(encoding="utf-8")
            if needle in content:
                matched.append(str(path.relative_to(_REPO_ROOT)))
    assert matched == [], (
        f"Found {len(matched)} stale {needle!r} placeholder(s):\n  - "
        + "\n  - ".join(matched)
        + "\n\nPhase 10 plan 10-03 D-06 item 1 requires zero placeholders. "
        "Replace each with the threaded `generation_id` parameter from the "
        "owning pass orchestrator."
    )


# ─── Test 3: regression guard for run_with_tracing receiver signature ─────


def test_run_with_tracing_signature_unchanged() -> None:
    """Receiver signature contract pin.

    ``run_with_tracing(agent, prompt, *, session_id, stage, model_settings)``.
    Imports the wrapper and inspects its signature so any future refactor that
    drops or renames ``session_id`` trips this test. The 12 production call
    sites rely on this exact keyword-only kwarg name.
    """
    import inspect

    from mcpgen_engine.observability.run_tracing import run_with_tracing

    sig = inspect.signature(run_with_tracing)
    params = sig.parameters
    assert "session_id" in params, (
        f"Expected `session_id` keyword arg on run_with_tracing; got params={list(params)}. "
        f"Phase 10 plan 10-03 threads generation_id via this kwarg — renaming "
        f"or dropping it breaks all 11 call sites."
    )
    session_id_param = params["session_id"]
    assert session_id_param.kind is inspect.Parameter.KEYWORD_ONLY, (
        f"Expected `session_id` to be keyword-only; got kind={session_id_param.kind}. "
        f"Positional callers risk silent argument drift across the 11 call sites."
    )


# ─── Test 1: every call site threads generation_id (whitebox, per-pass) ────


@pytest.mark.asyncio
async def test_pass_0_llm_threads_generation_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pass 0 ``_run_with_transient_retry`` thread → run_with_tracing(session_id=...)."""
    import mcpgen_engine.passes.pass_0.llm as pass_0_llm
    from mcpgen_engine.passes.pass_0.validation import Pass0LlmOutput

    fake_output = Pass0LlmOutput(tool_plans=[], composite_candidates=[], llm_dropped_endpoints=[])
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(pass_0_llm, "run_with_tracing", mock)

    await pass_0_llm._run_with_transient_retry(
        "test prompt",
        generation_id=_SENTINEL_GENERATION_ID,
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


@pytest.mark.asyncio
async def test_pass_1_universal_threads_generation_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pass 1 universal LLM call threads generation_id."""
    import mcpgen_engine.passes.pass_1.schema_synth as schema_synth
    from mcpgen_engine.passes.pass_1.schema_synth import _UniversalToolsLlmOutput

    # _UniversalToolsLlmOutput is a Pydantic BaseModel — we don't validate its
    # internal shape here; the sentinel assertion only inspects kwargs.
    fake_output: Any = _UniversalToolsLlmOutput.model_construct()
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(schema_synth, "run_with_tracing", mock)

    await schema_synth._universal_run_with_transient_retry(
        "test prompt",
        generation_id=_SENTINEL_GENERATION_ID,
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


@pytest.mark.asyncio
async def test_pass_1_extra_threads_generation_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pass 1 extra-tool LLM call threads generation_id."""
    from mcpgen_ir.types import Annotations, Tool1, Type

    import mcpgen_engine.passes.pass_1.schema_synth as schema_synth

    # Tool1 requires a small set of fields; we use model_construct to bypass
    # validation since the wrapper assertion ignores the value's content.
    fake_annotations: Any = Annotations.model_construct(
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=True,
    )
    fake_output: Any = Tool1.model_construct(
        name="placeholder",
        type=Type.action,
        description=None,
        inputSchema={"type": "object"},
        outputSchema=None,
        annotations=fake_annotations,
    )
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(schema_synth, "run_with_tracing", mock)

    await schema_synth._extra_run_with_transient_retry(
        "test prompt",
        generation_id=_SENTINEL_GENERATION_ID,
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


@pytest.mark.asyncio
async def test_pass_2_authoring_threads_generation_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pass 2 authoring LLM call threads generation_id."""
    from mcpgen_ir.types import Description

    import mcpgen_engine.passes.pass_2.authoring as authoring

    fake_output: Any = Description.model_construct(purpose="x")
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(authoring, "run_with_tracing", mock)

    # The authoring helper takes an Agent + prompt + generation_id.
    fake_agent: Any = object()
    await authoring._run_with_transient_retry(
        fake_agent,
        "test prompt",
        generation_id=_SENTINEL_GENERATION_ID,
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


@pytest.mark.asyncio
async def test_pass_2_quality_gate_threads_generation_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pass 2 quality-gate inline judge threads generation_id."""
    from mcpgen_ir.types import Annotations, Description, Tool1, Type

    import mcpgen_engine.passes.pass_2.quality_gate as quality_gate

    # Stub _GateScores: lives only in the quality_gate module — instantiate
    # via model_construct so we don't need to know its exact field set.
    fake_output: Any = quality_gate._GateScores.model_construct(
        purpose=5, guidelines=5, limitations=5, parameter_overview=5
    )
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(quality_gate, "run_with_tracing", mock)

    fake_annotations: Any = Annotations.model_construct(
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=True,
    )
    fake_tool: Any = Tool1.model_construct(
        name="x",
        type=Type.universal,
        description=None,
        inputSchema={"type": "object"},
        outputSchema=None,
        annotations=fake_annotations,
    )
    # render_description_markdown reads `purpose`, `when_to_use`,
    # `limitations`, `parameter_overview`, plus optional `when_not_to_use`,
    # `how_to_use`, `examples` — provide the required fields so the inline
    # judge prompt builder doesn't trip on missing attributes.
    fake_description: Any = Description.model_construct(
        purpose="x",
        when_to_use=["call when needed"],
        limitations=["no side effects"],
        parameter_overview="single string parameter",
        when_not_to_use=None,
        how_to_use=None,
        examples=None,
    )
    await quality_gate._judge_one(
        fake_tool, fake_description, generation_id=_SENTINEL_GENERATION_ID
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


@pytest.mark.asyncio
async def test_pass_3_enrich_threads_generation_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pass 3 enrichment LLM call threads generation_id."""
    import mcpgen_engine.passes.pass_3.enrich as enrich

    fake_output: Any = enrich.ParameterEnrichment.model_construct(description="x")
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(enrich, "run_with_tracing", mock)

    await enrich._run_with_transient_retry(
        "test prompt",
        generation_id=_SENTINEL_GENERATION_ID,
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


@pytest.mark.asyncio
async def test_pass_3_quality_gate_threads_generation_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pass 3 quality-gate inline judge threads generation_id."""
    import mcpgen_engine.passes.pass_3.quality_gate as quality_gate

    fake_output: Any = quality_gate._GateScoresPass3.model_construct(
        naming=5, format=5, enums=5, defaults=5, description=5
    )
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(quality_gate, "run_with_tracing", mock)

    await quality_gate._judge_one_pass_3(
        "tool_name",
        {"type": "object"},
        generation_id=_SENTINEL_GENERATION_ID,
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


@pytest.mark.asyncio
async def test_pass_4_llm_judge_threads_generation_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pass 4 LLM judge threads generation_id."""
    import mcpgen_engine.passes.pass_4.llm_judge as llm_judge

    fake_output: Any = llm_judge._LlmJudgeOutput.model_construct(
        readOnlyHint=False, destructiveHint=False, idempotentHint=False
    )
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(llm_judge, "run_with_tracing", mock)

    await llm_judge._run_with_transient_retry(
        "test prompt",
        generation_id=_SENTINEL_GENERATION_ID,
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


@pytest.mark.asyncio
async def test_pass_5_field_ranking_threads_generation_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pass 5 field ranking LLM call threads generation_id."""
    import mcpgen_engine.passes.pass_5.field_ranking as field_ranking

    fake_output: Any = field_ranking.FieldRanking()
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(field_ranking, "run_with_tracing", mock)

    await field_ranking._run_with_transient_retry(
        "test prompt",
        generation_id=_SENTINEL_GENERATION_ID,
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


@pytest.mark.asyncio
async def test_stage_f_f2_smell_threads_generation_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Stage F (F2 smell) judge call threads generation_id."""
    import mcpgen_engine.stages.stage_f.f2_smell as f2_smell
    from mcpgen_engine.stages.stage_f.rubric import RubricScore

    fake_output: Any = RubricScore.model_construct(
        purpose=5,
        guidelines=5,
        limitations=5,
        parameter_overview=5,
        examples=5,
        length_completeness=5,
    )
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(f2_smell, "run_with_tracing", mock)

    fake_agent: Any = object()
    await f2_smell._judge_run_with_retry(
        fake_agent,
        "test prompt",
        {"temperature": 0.0},
        generation_id=_SENTINEL_GENERATION_ID,
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


@pytest.mark.asyncio
async def test_stage_f_f3_judge_threads_generation_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Stage F (F3) LLM judge threads generation_id."""
    import mcpgen_engine.stages.stage_f.f3_agent_eval as f3_agent_eval

    fake_output: Any = f3_agent_eval.F3JudgeScore.model_construct(
        task_completion=8.0, grounding=8.0
    )
    mock = _make_run_with_tracing_mock(fake_output)
    monkeypatch.setattr(f3_agent_eval, "run_with_tracing", mock)

    # _format_judge_prompt reads .iteration_count, .terminated, .steps, and
    # .final_text on the trajectory; we hand-roll a plain object carrying all
    # of those so the test exercises the real code path without spinning up
    # the full F3 trajectory pipeline.
    fake_traj: Any = type(
        "T",
        (),
        {
            "iteration_count": 1,
            "terminated": True,
            "steps": [],
            "final_text": "<test final text>",
        },
    )()
    fake_task = {"prompt": "x", "expected_outcome": "y"}
    await f3_agent_eval.llm_judge_eval(
        task=fake_task,
        traj=fake_traj,
        generation_id=_SENTINEL_GENERATION_ID,
    )
    _assert_all_calls_threaded_generation_id(mock, _SENTINEL_GENERATION_ID)


# ─── Test 1b: subprocess-style sentinel scan (extra defense in depth) ──────


def test_subprocess_grep_returns_zero_unknown_matches() -> None:
    """Mirrors the subprocess.run check enumerated in the plan acceptance criteria.

    Uses ``rg -l`` to ensure the placeholder string is absent across passes/ +
    stage_f/. Skipped when ``rg`` is missing on PATH (tooling drift); the
    pure-Python ``test_no_session_id_unknown_placeholders_remain`` test
    above is the authoritative gate.
    """
    import shutil

    if shutil.which("rg") is None:
        pytest.skip("rg (ripgrep) not available — pure-Python test is the authoritative gate")

    rg_path = shutil.which("rg")
    assert rg_path is not None  # narrows for the linter — verified just above
    result = subprocess.run(  # noqa: S603 — args are hardcoded (no untrusted input)
        [
            rg_path,
            "-l",
            'session_id="unknown"',
            str(_PASSES_DIR),
            str(_STAGE_F_DIR),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    # rg exits 1 when no matches found — that is the success state here.
    assert (
        result.stdout.strip() == ""
    ), f"`rg -l 'session_id=\"unknown\"'` returned stale matches:\n{result.stdout}"
