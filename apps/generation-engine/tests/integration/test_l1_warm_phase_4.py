"""GEN-12 + Phase 4 D-36 — warm L1 hit produces ZERO Qwen calls AND
bit-identical Pass5Output / StageEManifest between cold + warm runs.

Asserts second ``run_pipeline`` invocation in same process:
- Pass 0..5 + Stage E are NOT re-invoked (counter on monkeypatched stubs).
- Pass5Output / StageEManifest reconstructed from L1 are bit-identical
  to the cold-run originals (D-36).
- Terminal SSE event carries ``cache='l1_hit'`` and full Phase-4
  16-event sequence.

Uses fixture-driven Pass 0..5 + Stage E stubs at the orchestrator's
import surface so the test is fully LLM-free + filesystem-light.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Any

import pytest
from mcpgen_ir.types import (
    Annotations,
    Description,
    FieldFiltering,
    Pagination2,
    Pass0Output,
    Pass1Output,
    Pass2Output,
    Pass3Output,
    Pass4Output,
    Pass5Output,
    RawIR,
    ResponseConfig2,
    StageEManifest,
    Style,
    TargetComplexity,
    Tool2,
    Truncation,
)
from mcpgen_ir.types import File as ManifestFile

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
    monkeypatch.setenv("MCPGEN_OUTPUT_DIR", str(tmp_path / "mcpgen-output"))
    from mcpgen_engine.settings import get_settings

    get_settings.cache_clear()
    clear_l1()
    clear_l2()


@pytest.fixture(autouse=True)
def _stub_stage_f(monkeypatch: pytest.MonkeyPatch) -> None:
    """Phase 5 D-31: F1 deterministic-pass; F2 sigma=0.6 (no F3 auto-trigger)."""
    from unittest.mock import AsyncMock

    from mcpgen_engine.stages.stage_f.f1_static import F1CheckOutcome, F1RunResult
    from mcpgen_engine.stages.stage_f.f2_smell import F2RunResult

    f1_pass = F1RunResult(
        passed=True,
        outcomes=[
            F1CheckOutcome(
                check_name="bundle_size",
                passed=True,
                error=None,
                retry_target=None,
                details={"kb": 0},
            )
        ],
        first_failure=None,
        subprocess_checks_pending=False,
    )
    f2_pass = F2RunResult(
        tool_scores=[],
        overall_score=4.5,
        sigma=0.6,
        passed=True,
        low_confidence_run=False,
        warnings=[],
    )
    monkeypatch.setattr(pipeline_module, "run_f1", AsyncMock(return_value=f1_pass))
    monkeypatch.setattr(pipeline_module, "run_f2", AsyncMock(return_value=f2_pass))


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


def _build_pass_5_output(p1: Pass1Output, p2: Pass2Output, p4: Pass4Output) -> Pass5Output:
    """Synthesize a deterministic Pass5Output mirroring Pass 1's tool list."""
    tools: list[Tool2] = []
    for t in p1.tools:
        desc_src = p2.descriptions.get(t.name)
        if desc_src is None:
            description = Description(
                purpose=f"Stub purpose for {t.name} (warm-cache test).",
                when_to_use=["use case"],
                limitations=["stub"],
                parameter_overview="x" * 60,
            )
        else:
            description = Description.model_validate(desc_src.model_dump())
        ann_src = p4.annotations.get(t.name)
        if ann_src is None:
            annotations = Annotations(
                readOnlyHint=True,
                destructiveHint=False,
                idempotentHint=True,
                openWorldHint=True,
            )
        else:
            annotations = Annotations.model_validate(ann_src.model_dump())
        tools.append(
            Tool2(
                name=t.name,
                type=t.type,
                description=description,
                inputSchema={"type": "object", "additionalProperties": False},
                outputSchema={"type": "object", "additionalProperties": True},
                annotations=annotations,
                response_config=ResponseConfig2(
                    pagination=Pagination2(style=Style.none, default_limit=25, max_limit=100),
                    field_filtering=FieldFiltering(always_include=[], opt_in=[], always_exclude=[]),
                    truncation=Truncation(
                        threshold_tokens=15000,
                        guidance_template="Showing partial results.",
                    ),
                    has_response_format_param=False,
                ),
                source_endpoints=[],
            )
        )
    return Pass5Output(tools=tools)


def _build_stage_e_manifest() -> StageEManifest:
    return StageEManifest(
        files=[
            ManifestFile(
                relative_path="src/server.ts",
                sha256_content_hash=sha256(b"stub").hexdigest(),
                render_template="server.ts.j2",
                render_inputs_hash="0" * 64,
            )
        ],
        bundle_size_kb=246.49,
        ts_compile_passed=True,
        ts_compile_warning_count=0,
        template_version="1",
        # Use a fixed timestamp so cold + warm both serialize identically
        # (D-36 — `.mcpgen.yaml` `generated_at` is the only legitimate
        # diff source; here we keep even that field stable for the
        # bit-identity assertion).
        generated_at=datetime(2026, 4, 28, 0, 0, 0, tzinfo=UTC),
    )


async def test_warm_run_zero_qwen_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    """Cold run primes L1; warm run returns same outputs without invoking
    Pass 0..5 OR Stage E (counter == 0)."""
    raw_ir_fix, p1, p2, p3, p4 = _load_stripe_fixture()
    pass_5_ref = _build_pass_5_output(p1, p2, p4)
    manifest_ref = _build_stage_e_manifest()

    counters: dict[str, int] = {f"pass_{i}": 0 for i in range(6)} | {"stage_e": 0}

    async def _fake_stage_a(
        *,
        spec_url: str | None,  # noqa: ARG001
        spec_content: str | None,  # noqa: ARG001
    ) -> RawIR:
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

    async def _fake_pass_5(
        _p4: Pass4Output,
        _p3: Pass3Output,
        _p2: Pass2Output,
        _p1: Pass1Output,
        _raw_ir: RawIR,
    ) -> Pass5Output:
        counters["pass_5"] += 1
        return pass_5_ref

    async def _fake_stage_e(**_kwargs: Any) -> StageEManifest:
        counters["stage_e"] += 1
        return manifest_ref

    monkeypatch.setattr(pipeline_module.stage_a, "run", _fake_stage_a)
    monkeypatch.setattr(pipeline_module, "pass_0_run", _fake_pass_0)
    monkeypatch.setattr(pipeline_module, "pass_1_run", _fake_pass_1)
    monkeypatch.setattr(pipeline_module, "pass_2_run", _fake_pass_2)
    monkeypatch.setattr(pipeline_module, "pass_3_run", _fake_pass_3)
    monkeypatch.setattr(pipeline_module, "pass_4_run", _fake_pass_4)
    monkeypatch.setattr(pipeline_module, "pass_5_run", _fake_pass_5)
    monkeypatch.setattr(pipeline_module, "stage_e_run", _fake_stage_e)

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
    assert cold_pass_counts["pass_5"] == 1
    assert cold_pass_counts["stage_e"] == 1

    # Warm run — same spec_hash → L1 hit → ZERO additional invocations.
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
        "pass_5": 0,
        "stage_e": 0,
    }, f"GEN-12 violation: warm run invoked stages {delta}"

    # Phase 5 D-31: terminal becomes ``validation_complete:completed``.
    # The L1 warm-path's intermediate Phase-4 events still carry
    # cache=l1_hit; F1/F2/validation_complete run fresh (D-32: F1/F3 not
    # cached, F2 hits L2 separately).
    final = warm_events[-1]
    assert final.stage == "validation_complete"
    assert final.partial_result is not None
    assert final.partial_result.get("phase") == "validation_complete"
    cache_markers = [
        e
        for e in warm_events
        if e.partial_result is not None and e.partial_result.get("cache") == "l1_hit"
    ]
    assert cache_markers, "expected cache=l1_hit on cached Phase-4 events"

    # Phase 4 NOTE 8 canonical sequence (16 events) + Phase 5 D-31 chain
    # (F1:started/completed + F2:started/completed + validation_complete:completed
    # = 5 additional). Total = 16 + 5 = 21 events.
    assert len(warm_events) == 21, (
        f"Phase 5 D-31: warm-cache must emit exactly 21 events "
        f"(16 Phase-4 + 5 Phase-5), got {len(warm_events)}"
    )

    # Every warm Phase-4 event carries cache=l1_hit. Phase 5 events
    # (F1/F2/validation_complete) run fresh on warm and don't carry the
    # marker (D-32: F1/F3 not cached, F2 hits L2 separately).
    cached_stages = {"A", "B", "C", "D", "E"}
    for ev in warm_events:
        if ev.partial_result is None or ev.stage not in cached_stages:
            continue
        assert ev.partial_result.get("cache") == "l1_hit"


async def test_warm_run_outputs_bit_identical(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """D-36 — Pass5Output + StageEManifest reconstructed from L1 are
    bit-identical to the cold-run originals."""
    raw_ir_fix, p1, p2, p3, p4 = _load_stripe_fixture()
    pass_5_ref = _build_pass_5_output(p1, p2, p4)
    manifest_ref = _build_stage_e_manifest()

    async def _fake_stage_a(
        *,
        spec_url: str | None,  # noqa: ARG001
        spec_content: str | None,  # noqa: ARG001
    ) -> RawIR:
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

    async def _fake_pass_5(
        _p4: Pass4Output,
        _p3: Pass3Output,
        _p2: Pass2Output,
        _p1: Pass1Output,
        _raw_ir: RawIR,
    ) -> Pass5Output:
        return pass_5_ref

    async def _fake_stage_e(**_kwargs: Any) -> StageEManifest:
        return manifest_ref

    monkeypatch.setattr(pipeline_module.stage_a, "run", _fake_stage_a)
    monkeypatch.setattr(pipeline_module, "pass_0_run", _fake_pass_0)
    monkeypatch.setattr(pipeline_module, "pass_1_run", _fake_pass_1)
    monkeypatch.setattr(pipeline_module, "pass_2_run", _fake_pass_2)
    monkeypatch.setattr(pipeline_module, "pass_3_run", _fake_pass_3)
    monkeypatch.setattr(pipeline_module, "pass_4_run", _fake_pass_4)
    monkeypatch.setattr(pipeline_module, "pass_5_run", _fake_pass_5)
    monkeypatch.setattr(pipeline_module, "stage_e_run", _fake_stage_e)

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
        pass_5_2,
        stage_e_manifest_2,
    ) = reconstruct_from_l1(cached)

    assert pass_1_2.model_dump() == p1.model_dump()
    assert pass_2_2.model_dump() == p2.model_dump()
    assert pass_3_2.model_dump() == p3.model_dump()
    assert pass_4_2.model_dump() == p4.model_dump()
    assert pass_5_2.model_dump(mode="json") == pass_5_ref.model_dump(mode="json")
    assert stage_e_manifest_2.model_dump(mode="json") == manifest_ref.model_dump(mode="json")
