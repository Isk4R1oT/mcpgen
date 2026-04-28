"""GEN-12 continuation — warm L1 hit produces ZERO Qwen calls (D-36).

Asserts second ``run_pipeline`` invocation in same process:
- Pass 2/3/4 are NOT re-invoked (counter on monkeypatched stubs).
- Pass2Output / Pass3Output / Pass4Output are bit-identical between cold +
  warm runs (D-36).
- Terminal SSE event carries ``cache='l1_hit'`` and full Phase-3 sequence.

Uses fixture-driven Pass 0/1/2/3/4 stubs at the orchestrator's import
surface so the test is fully LLM-free.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from mcpgen_ir.types import (
    Pass0Output,
    Pass1Output,
    Pass2Output,
    Pass3Output,
    Pass4Output,
    RawIR,
    TargetComplexity,
)

from mcpgen_engine import pipeline as pipeline_module
from mcpgen_engine.cache import clear_l1, clear_l2
from mcpgen_engine.passes.pass_0.filter import UserOptions
from mcpgen_engine.pipeline import (
    GenerationSseEvent,
    reconstruct_from_l1,
    run_pipeline,
)

_REPO_ROOT = Path(__file__).resolve().parents[4]
_FIXTURES_DIR = _REPO_ROOT / "packages" / "engine-fixtures"


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MCPGEN_CACHE_DIR", str(tmp_path / "mcpgen-cache"))
    from mcpgen_engine.settings import get_settings

    get_settings.cache_clear()
    clear_l1()
    clear_l2()


def _build_options() -> UserOptions:
    return UserOptions(
        target_complexity="standard",
        max_tools_override=None,
        explicit_includes=[],
        explicit_excludes=[],
    )


def _job_id(suffix: str) -> str:
    return f"gen_01HZW3J6V7XAEMP9N0DZTA8FB{suffix}"


def _load_stripe_fixture() -> tuple[RawIR, Pass1Output, Pass2Output, Pass3Output, Pass4Output]:
    fix = _FIXTURES_DIR / "stripe"
    raw_ir = RawIR.model_validate(json.loads((fix / "ir.json").read_text()))
    p1 = Pass1Output.model_validate(json.loads((fix / "pass-1-output.json").read_text()))
    p2 = Pass2Output.model_validate(json.loads((fix / "pass-2-output.json").read_text()))
    p3 = Pass3Output.model_validate(json.loads((fix / "pass-3-output.json").read_text()))
    p4 = Pass4Output.model_validate(json.loads((fix / "pass-4-output.json").read_text()))
    return raw_ir, p1, p2, p3, p4


async def test_warm_run_zero_qwen_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    """Cold run primes L1; warm run returns same outputs without invoking
    Pass 0..4 (counter == 0)."""
    raw_ir_fix, p1, p2, p3, p4 = _load_stripe_fixture()

    counters: dict[str, int] = {f"pass_{i}": 0 for i in range(5)}

    async def _fake_stage_a(*, spec_url: str | None, spec_content: str | None) -> RawIR:  # noqa: ARG001
        return raw_ir_fix

    async def _fake_pass_0(_raw_ir: RawIR, _options: UserOptions) -> Pass0Output:
        counters["pass_0"] += 1
        return Pass0Output(
            tool_plans=[],
            dropped_endpoints=[],
            composite_candidates=[],
            auth_requirements={},
            target_complexity=TargetComplexity.standard,
            prompt_injection_warnings=[],
        )

    async def _fake_pass_1(
        _pass_0_output: Any,
        _raw_ir: RawIR,
        _spec_title: str,
        _options: UserOptions,
    ) -> Pass1Output:
        counters["pass_1"] += 1
        return p1

    async def _fake_pass_2(_pass_1: Pass1Output, _raw_ir: RawIR) -> Pass2Output:
        counters["pass_2"] += 1
        return p2

    async def _fake_pass_3(
        _p2: Pass2Output,
        _p1: Pass1Output,
        _raw_ir: RawIR,
        _spec_title: str | None = None,
    ) -> Pass3Output:
        counters["pass_3"] += 1
        return p3

    async def _fake_pass_4(_p3: Pass3Output, _p2: Pass2Output, _p1: Pass1Output) -> Pass4Output:
        counters["pass_4"] += 1
        return p4

    monkeypatch.setattr(pipeline_module.stage_a, "run", _fake_stage_a)
    monkeypatch.setattr(pipeline_module, "pass_0_run", _fake_pass_0)
    monkeypatch.setattr(pipeline_module, "pass_1_run", _fake_pass_1)
    monkeypatch.setattr(pipeline_module, "pass_2_run", _fake_pass_2)
    monkeypatch.setattr(pipeline_module, "pass_3_run", _fake_pass_3)
    monkeypatch.setattr(pipeline_module, "pass_4_run", _fake_pass_4)

    # Cold run — primes L1.
    cold_events: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url=None,
        spec_content="ignored — Stage A is stubbed",
        options=_build_options(),
        job_id=_job_id("1"),
    ):
        cold_events.append(event)
    cold_pass_counts = dict(counters)
    assert cold_pass_counts["pass_2"] == 1
    assert cold_pass_counts["pass_3"] == 1
    assert cold_pass_counts["pass_4"] == 1

    # Warm run — same spec_hash → L1 hit → ZERO additional pass invocations.
    warm_events: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url=None,
        spec_content="ignored — Stage A is stubbed",
        options=_build_options(),
        job_id=_job_id("2"),
    ):
        warm_events.append(event)

    delta = {k: counters[k] - cold_pass_counts[k] for k in counters}
    assert delta == {
        "pass_0": 0,
        "pass_1": 0,
        "pass_2": 0,
        "pass_3": 0,
        "pass_4": 0,
    }, f"GEN-12 violation: warm run invoked passes {delta}"

    # Warm-run terminal event carries cache=l1_hit AND author_complete phase.
    final = warm_events[-1]
    assert final.stage == "completed"
    assert final.partial_result is not None
    assert final.partial_result.get("cache") == "l1_hit"
    assert final.partial_result.get("phase") == "author_complete"

    # Warm run emits the FULL Phase-3 SSE sequence (D-34: every event
    # carries cache=l1_hit so CLI can show the warm path).
    warm_seq = [(e.stage, e.status) for e in warm_events]
    assert sum(1 for s in warm_seq if s == ("C", "completed")) == 3
    for ev in warm_events:
        if ev.partial_result is not None:
            # Every event during the warm fast-path carries cache=l1_hit.
            assert ev.partial_result.get("cache") == "l1_hit"


async def test_warm_run_outputs_bit_identical(monkeypatch: pytest.MonkeyPatch) -> None:
    """D-36 — Pass2/3/4 outputs reconstructed from L1 are bit-identical to
    the cold-run originals."""
    raw_ir_fix, p1, p2, p3, p4 = _load_stripe_fixture()

    async def _fake_stage_a(*, spec_url: str | None, spec_content: str | None) -> RawIR:  # noqa: ARG001
        return raw_ir_fix

    async def _fake_pass_0(_raw_ir: RawIR, _options: UserOptions) -> Pass0Output:
        return Pass0Output(
            tool_plans=[],
            dropped_endpoints=[],
            composite_candidates=[],
            auth_requirements={},
            target_complexity=TargetComplexity.standard,
            prompt_injection_warnings=[],
        )

    async def _fake_pass_1(
        _pass_0_output: Any,
        _raw_ir: RawIR,
        _spec_title: str,
        _options: UserOptions,
    ) -> Pass1Output:
        return p1

    async def _fake_pass_2(_pass_1: Pass1Output, _raw_ir: RawIR) -> Pass2Output:
        return p2

    async def _fake_pass_3(
        _p2: Pass2Output,
        _p1: Pass1Output,
        _raw_ir: RawIR,
        _spec_title: str | None = None,
    ) -> Pass3Output:
        return p3

    async def _fake_pass_4(_p3: Pass3Output, _p2: Pass2Output, _p1: Pass1Output) -> Pass4Output:
        return p4

    monkeypatch.setattr(pipeline_module.stage_a, "run", _fake_stage_a)
    monkeypatch.setattr(pipeline_module, "pass_0_run", _fake_pass_0)
    monkeypatch.setattr(pipeline_module, "pass_1_run", _fake_pass_1)
    monkeypatch.setattr(pipeline_module, "pass_2_run", _fake_pass_2)
    monkeypatch.setattr(pipeline_module, "pass_3_run", _fake_pass_3)
    monkeypatch.setattr(pipeline_module, "pass_4_run", _fake_pass_4)

    # Cold run.
    async for _e in run_pipeline(
        spec_url=None,
        spec_content="ignored",
        options=_build_options(),
        job_id=_job_id("1"),
    ):
        pass

    # Now read from L1 and reconstruct — outputs MUST equal the originals.
    from mcpgen_engine.cache import get_l1, l1_key

    cached = get_l1(l1_key(raw_ir_fix.spec_hash))
    assert cached is not None
    (
        _raw_ir_2,
        _pass_0_2,
        pass_1_2,
        pass_2_2,
        pass_3_2,
        pass_4_2,
    ) = reconstruct_from_l1(cached)

    assert pass_1_2.model_dump() == p1.model_dump()
    assert pass_2_2.model_dump() == p2.model_dump()
    assert pass_3_2.model_dump() == p3.model_dump()
    assert pass_4_2.model_dump() == p4.model_dump()
