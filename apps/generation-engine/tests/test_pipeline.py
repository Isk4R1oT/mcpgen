"""Full pipeline (Stage A → Pass 0 → Pass 1 → Pass 2 → Pass 3 → Pass 4) tests.

VALIDATION rows:
- T-2-C6: Stripe E2E final tool count 6-12 (asserted indirectly via the
  Stripe fixture in `test_pass_1_e2e.py`; this module covers full pipeline
  including Stage A + Pass 0 with a synthetic OpenAPI spec).
- T-2-D1 / GEN-12 / D-41: second pipeline run on identical spec produces
  ZERO LLM calls (L1 cache hit returns the architect+author output without
  re-running Pass 0..4).

The pipeline tests use a small synthetic OpenAPI 3.0 spec (3 endpoints) so
Stage A parses in <1s. OpenRouter is mocked via ``pytest-httpx`` for Pass
0 / Pass 1; Pass 2 / 3 / 4 are monkeypatched at the orchestrator's import
surface (the per-pass test modules cover their LLM-stack paths
exhaustively).
"""

from __future__ import annotations

import json
from datetime import UTC
from pathlib import Path
from typing import Any

import pytest
from mcpgen_ir.types import (
    Annotations,
    Description,
    Descriptions,
    Pass1Output,
    Pass2Output,
    Pass3Output,
    Pass4Output,
    RawIR,
)
from pytest_httpx import HTTPXMock

from mcpgen_engine import pipeline as pipeline_module
from mcpgen_engine.cache import clear_l1, clear_l2
from mcpgen_engine.passes.pass_0.filter import UserOptions
from mcpgen_engine.pipeline import (
    GenerationSseEvent,
    reconstruct_from_l1,
    run_pipeline,
)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ─────────────────────────────── Fixtures ──────────────────────────────────


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Per-test cache isolation."""
    monkeypatch.setenv("MCPGEN_CACHE_DIR", str(tmp_path / "mcpgen-cache"))
    from mcpgen_engine.settings import get_settings

    get_settings.cache_clear()
    clear_l1()
    clear_l2()


@pytest.fixture(autouse=True)
def _stub_stage_c_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bypass Pass 2/3/4 LLM stack at the orchestrator's import surface.

    The pipeline-level integration tests assert orchestration shape (event
    sequence, L1 cache contents, error wiring). Pass 2/3/4 internals have
    their own dedicated test modules under `tests/passes/pass_*` that
    exercise the real LLM mocks with httpx_mock. Stubbing here keeps these
    tests fast and isolated from per-pass changes (Phase 2 invariant).
    """

    def _stub_description(name: str) -> Description:
        return Description(
            purpose=f"Stub purpose for tool '{name}' covering 5+ rubric components.",
            when_to_use=[f"finding {name} via canonical pipeline"],
            when_not_to_use=None,
            how_to_use=None,
            limitations=["test stub limitation entry — single bullet"],
            parameter_overview=(
                f"Stub parameter overview for {name}; "
                "fields exist for orchestrator-shape validation only."
            ),
        )

    async def _fake_pass_2(
        pass_1_output: Pass1Output,
        raw_ir: RawIR,  # noqa: ARG001 — signature parity
        *,
        generation_id: str,  # noqa: ARG001 — Phase 10 plan 10-03 threading
    ) -> Pass2Output:
        descriptions: dict[str, Descriptions] = {}
        for tool in pass_1_output.tools:
            base = _stub_description(tool.name)
            descriptions[tool.name] = Descriptions.model_validate(
                {**base.model_dump(), "description_hash": "0" * 64}
            )
        return Pass2Output(descriptions=descriptions)

    async def _fake_pass_3(
        pass_2_output: Pass2Output,  # noqa: ARG001
        pass_1_output: Pass1Output,
        raw_ir: RawIR,  # noqa: ARG001
        spec_title: str | None = None,  # noqa: ARG001
        *,
        generation_id: str,  # noqa: ARG001 — Phase 10 plan 10-03 threading
    ) -> Pass3Output:
        input_schemas: dict[str, dict[str, Any]] = {}
        for tool in pass_1_output.tools:
            properties: dict[str, dict[str, Any]] = {}
            if tool.name == "search":
                properties["query"] = {"type": "string", "description": "search query"}
                required = ["query"]
            elif tool.name == "fetch":
                properties["id"] = {"type": "string", "description": "object id"}
                required = ["id"]
            else:
                required = []
            schema: dict[str, Any] = {
                "type": "object",
                "properties": properties,
                "additionalProperties": False,
            }
            if required:
                schema["required"] = required
            input_schemas[tool.name] = schema
        return Pass3Output(input_schemas=input_schemas)

    async def _fake_pass_4(
        pass_3_output: Pass3Output,  # noqa: ARG001
        pass_2_output: Pass2Output,  # noqa: ARG001
        pass_1_output: Pass1Output,
        *,
        generation_id: str,  # noqa: ARG001 — Phase 10 plan 10-03 threading
    ) -> Pass4Output:
        annotations: dict[str, Annotations] = {}
        titles: dict[str, str] = {}
        read_universal = {"search", "fetch", "list_collections", "list_objects"}
        for tool in pass_1_output.tools:
            is_read = tool.name in read_universal or tool.type.value == "specialized"
            annotations[tool.name] = Annotations(
                readOnlyHint=is_read,
                destructiveHint=tool.name == "delete",
                idempotentHint=is_read or tool.name == "delete",
                openWorldHint=True,
            )
            titles[tool.name] = tool.name.replace("_", " ").title()
        return Pass4Output(annotations=annotations, titles=titles)

    monkeypatch.setattr(pipeline_module, "pass_2_run", _fake_pass_2)
    monkeypatch.setattr(pipeline_module, "pass_3_run", _fake_pass_3)
    monkeypatch.setattr(pipeline_module, "pass_4_run", _fake_pass_4)


@pytest.fixture(autouse=True)
def _stub_stage_d_e(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bypass Pass 5 + Stage E heavy lifting (Phase 4 D-33 + D-34).

    Pass 5: minimal Pass5Output mirroring Pass 1's tool list with
    deterministic response_config (truncation only).
    Stage E: minimal StageEManifest with one placeholder file.

    Real Pass 5 / Stage E coverage lives in
    `tests/passes/pass_5/*` and `tests/stages/stage_e/*` respectively.
    """
    from datetime import datetime
    from hashlib import sha256

    from mcpgen_ir.types import (
        FieldFiltering,
        Pagination2,
        Pass5Output,
        ResponseConfig2,
        StageEManifest,
        Style,
        Tool2,
        Truncation,
    )
    from mcpgen_ir.types import File as ManifestFile

    async def _fake_pass_5(
        pass_4_output: Pass4Output,
        pass_3_output: Pass3Output,
        pass_2_output: Pass2Output,
        pass_1_output: Pass1Output,
        raw_ir: RawIR,  # noqa: ARG001
        *,
        generation_id: str,  # noqa: ARG001 — Phase 10 plan 10-03 threading
    ) -> Pass5Output:
        tools: list[Tool2] = []
        for t in pass_1_output.tools:
            input_schema = pass_3_output.input_schemas.get(
                t.name, {"type": "object", "additionalProperties": False}
            )
            desc_src = pass_2_output.descriptions.get(t.name)
            if desc_src is None:
                description = Description(
                    purpose=f"Stub purpose for {t.name} (pipeline test).",
                    when_to_use=["use case"],
                    limitations=["stub"],
                    parameter_overview="x" * 60,
                )
            else:
                description = Description.model_validate(desc_src.model_dump())
            ann_src = pass_4_output.annotations.get(t.name)
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
                    inputSchema=input_schema,
                    outputSchema={
                        "type": "object",
                        "additionalProperties": True,
                    },
                    annotations=annotations,
                    response_config=ResponseConfig2(
                        pagination=Pagination2(style=Style.none, default_limit=25, max_limit=100),
                        field_filtering=FieldFiltering(
                            always_include=[],
                            opt_in=[],
                            always_exclude=[],
                        ),
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

    async def _fake_stage_e(**kwargs: Any) -> StageEManifest:
        out_dir = kwargs["output_dir"]
        out_dir.mkdir(parents=True, exist_ok=True)
        placeholder = "// stub server.ts emitted by test_pipeline fixture\n"
        (out_dir / "src").mkdir(parents=True, exist_ok=True)
        (out_dir / "src" / "server.ts").write_text(placeholder, encoding="utf-8")
        return StageEManifest(
            files=[
                ManifestFile(
                    relative_path="src/server.ts",
                    sha256_content_hash=sha256(placeholder.encode("utf-8")).hexdigest(),
                    render_template="server.ts.j2",
                    render_inputs_hash="0" * 64,
                )
            ],
            bundle_size_kb=0.0,
            ts_compile_passed=True,
            ts_compile_warning_count=0,
            template_version="1",
            generated_at=datetime.now(UTC),
        )

    monkeypatch.setattr(pipeline_module, "pass_5_run", _fake_pass_5)
    monkeypatch.setattr(pipeline_module, "stage_e_run", _fake_stage_e)


@pytest.fixture(autouse=True)
def _stub_stage_f(monkeypatch: pytest.MonkeyPatch) -> None:
    """Phase 5 D-31: stub F1/F2 so the pipeline-level tests stay LLM-free.

    F1 deterministic-pass; F2 returns sigma=0.6 (no F3 auto-trigger). F3
    is left untouched — these tests don't opt in (f3_enabled defaults
    False) AND they don't supply user_golden_tasks, so the F3 path is a
    no-op in the cold pipeline.
    """
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


# ────────────────────────── Mocked-LLM helpers ─────────────────────────────


def _mock_openrouter_function_call(payload: dict[str, Any]) -> dict[str, Any]:
    """Build a minimal OpenRouter chat-completions response with `final_result` tool call."""
    return {
        "id": "test-resp",
        "object": "chat.completion",
        "created": 1735689600,
        "model": "qwen/qwen3-coder",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {
                                "name": "final_result",
                                "arguments": json.dumps(payload),
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20},
    }


def _synthetic_openapi_spec() -> str:
    """Tiny OpenAPI 3.0 spec — 3 endpoints, parses in <100ms."""
    return json.dumps(
        {
            "openapi": "3.0.0",
            "info": {"title": "Test API", "version": "1.0.0"},
            "servers": [{"url": "https://api.test.example"}],
            "paths": {
                "/v1/widgets": {
                    "get": {
                        "operationId": "list_widgets",
                        "summary": "List widgets",
                        "responses": {"200": {"description": "OK"}},
                    },
                    "post": {
                        "operationId": "create_widget",
                        "summary": "Create a widget",
                        "responses": {"201": {"description": "Created"}},
                    },
                },
                "/v1/widgets/{widget_id}": {
                    "get": {
                        "operationId": "get_widget",
                        "summary": "Get a widget by id",
                        "parameters": [
                            {
                                "name": "widget_id",
                                "in": "path",
                                "required": True,
                                "schema": {"type": "string"},
                            }
                        ],
                        "responses": {"200": {"description": "OK"}},
                    },
                },
            },
            "components": {
                "securitySchemes": {
                    "bearerAuth": {"type": "http", "scheme": "bearer"},
                }
            },
        }
    )


def _pass_0_payload() -> dict[str, Any]:
    """Pass-0 LLM output covering the synthetic 3 endpoints."""
    return {
        "tool_plans": [
            {
                "name": "widgets_list",
                "category": "crud",
                "source_endpoints": ["GET /v1/widgets"],
                "rationale": "list widgets",
            },
            {
                "name": "widgets_create",
                "category": "crud",
                "source_endpoints": ["POST /v1/widgets"],
                "rationale": "create widget",
            },
            {
                "name": "widgets_get",
                "category": "crud",
                "source_endpoints": ["GET /v1/widgets/{widget_id}"],
                "rationale": "fetch widget",
            },
        ],
        "composite_candidates": [],
        "llm_dropped_endpoints": [],
    }


def _pass_1_universal_payload() -> dict[str, Any]:
    """Pass-1 universal-tools payload covering all 3 endpoints via universal slots."""
    return {
        "search": {
            "name": "search",
            "type": "universal",
            "source_endpoints": [],
        },
        "fetch": {
            "name": "fetch",
            "type": "universal",
            "source_endpoints": ["GET /v1/widgets/{widget_id}"],
        },
        "list_collections": {
            "name": "list_collections",
            "type": "universal",
            "source_endpoints": [],
        },
        "list_objects": {
            "name": "list_objects",
            "type": "universal",
            "source_endpoints": ["GET /v1/widgets"],
        },
        "upsert": {
            "name": "upsert",
            "type": "universal",
            "source_endpoints": ["POST /v1/widgets"],
        },
        "delete": {
            "name": "delete",
            "type": "universal",
            "source_endpoints": [],
        },
    }


def _build_options() -> UserOptions:
    return UserOptions(
        target_complexity="standard",
        max_tools_override=None,
        explicit_includes=[],
        explicit_excludes=[],
    )


def _job_id(suffix: str) -> str:
    """26-char ULID stub for test job IDs (Crockford alphabet)."""
    return f"gen_01HZW3J6V7XAEMP9N0DZTA8FB{suffix}"


# ───────────────────────────── Pipeline tests ──────────────────────────────


async def test_full_pipeline_emits_phase_3_sse_sequence(httpx_mock: HTTPXMock) -> None:
    """Cold pipeline emits the Phase-3 D-33 SSE sequence end-to-end.

    Sequence:
      A:started → A:completed
      B:started (pass_0) → B:completed (pass_0)
      B:started (pass_1) → B:completed (pass_1, sub_status=architect_complete)
      C:started (pass_2) → C:completed (pass_2)
      C:started (pass_3) → C:completed (pass_3)
      C:started (pass_4) → C:completed (pass_4)
      completed:completed (phase=author_complete)
    """
    # Pass 0 mock (1 LLM call), Pass 1 mock (1 universal-synth call). No
    # extras in this synthetic spec → no per-extra calls. Pass 2/3/4 are
    # stubbed by the autouse fixture.
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_0_payload()),
    )
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_1_universal_payload()),
    )

    events: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url=None,
        spec_content=_synthetic_openapi_spec(),
        options=_build_options(),
        job_id=_job_id("1"),
    ):
        events.append(event)

    # D-33 + Phase 5 D-31: full SSE sequence ends at validation_complete.
    seq = [(e.stage, e.status) for e in events]
    assert seq[0] == ("A", "started")
    assert ("A", "completed") in seq
    assert seq[-1] == ("validation_complete", "completed")

    # Stage B fires twice (pass_0 + pass_1), once started + once completed each.
    b_completed = [e for e in events if e.stage == "B" and e.status == "completed"]
    assert len(b_completed) == 2

    pass_0_done = next(
        e for e in b_completed if e.partial_result and e.partial_result.get("phase") == "pass_0"
    )
    pass_1_done = next(
        e for e in b_completed if e.partial_result and e.partial_result.get("phase") == "pass_1"
    )

    assert pass_0_done.partial_result is not None
    tool_plan_count = pass_0_done.partial_result["tool_plan_count"]
    assert isinstance(tool_plan_count, int)
    assert tool_plan_count == 3

    assert pass_1_done.partial_result is not None
    final_tool_count = pass_1_done.partial_result["final_tool_count"]
    assert isinstance(final_tool_count, int)
    assert final_tool_count == 6  # 6 universal slots
    coverage_pct = pass_1_done.partial_result["coverage_pct"]
    assert isinstance(coverage_pct, int | float)
    assert float(coverage_pct) == 100.0
    # D-33 backward-compat: Phase-2 CLI consumers still find this string.
    assert pass_1_done.partial_result.get("sub_status") == "architect_complete"

    # Stage C fires THREE times (pass_2 / pass_3 / pass_4), once started + once
    # completed each = 6 events.
    c_started = [e for e in events if e.stage == "C" and e.status == "started"]
    c_completed = [e for e in events if e.stage == "C" and e.status == "completed"]
    assert len(c_started) == 3
    assert len(c_completed) == 3
    c_phases = [e.partial_result.get("phase") for e in c_completed if e.partial_result]
    assert c_phases == ["pass_2", "pass_3", "pass_4"]

    # Pass 2 emits tool_count.
    pass_2_done = c_completed[0]
    assert pass_2_done.partial_result is not None
    tool_count = pass_2_done.partial_result["tool_count"]
    assert isinstance(tool_count, int)
    assert tool_count == 6

    # Pass 3 emits param_count (search has 1 query, fetch has 1 id, others 0).
    pass_3_done = c_completed[1]
    assert pass_3_done.partial_result is not None
    param_count = pass_3_done.partial_result["param_count"]
    assert isinstance(param_count, int)
    assert param_count == 2

    # Pass 4 emits annotation_count for every tool.
    pass_4_done = c_completed[2]
    assert pass_4_done.partial_result is not None
    annotation_count = pass_4_done.partial_result["annotation_count"]
    assert isinstance(annotation_count, int)
    assert annotation_count == 6

    # Phase 5 D-31: terminal event becomes validation_complete:completed
    # carrying the QualityReport. shape_codegen_complete persists as a
    # sub-status implicitly via E:completed (the per-stage event survives).
    final = events[-1]
    assert final.partial_result is not None
    assert final.stage == "validation_complete"
    assert final.partial_result.get("phase") == "validation_complete"
    assert "quality_report" in final.partial_result
    # Pass 4 C:completed retains sub_status=author_complete for backward compat.
    assert pass_4_done.partial_result.get("sub_status") == "author_complete"


async def test_second_run_zero_llm_calls(httpx_mock: HTTPXMock) -> None:
    """T-2-D1 / GEN-12 / D-41: second run hits L1 → zero Qwen calls.

    Run pipeline twice with identical spec. First run mocks 2 LLM calls
    (Pass 0 + Pass 1). Second run is mocked with NO responses; if any LLM
    call fires it raises HTTPXMock-not-registered and the test fails.
    """
    spec = _synthetic_openapi_spec()

    # First run — primes the L1 cache.
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_0_payload()),
    )
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_1_universal_payload()),
    )

    events_1: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url=None,
        spec_content=spec,
        options=_build_options(),
        job_id=_job_id("1"),
    ):
        events_1.append(event)

    first_run_calls = len(httpx_mock.get_requests(url=OPENROUTER_URL))
    assert (
        first_run_calls >= 2
    ), f"first run should have triggered ≥2 Qwen calls, got {first_run_calls}"

    # Second run — every additional response would have to be registered;
    # if the pipeline calls OpenRouter again, pytest-httpx raises a
    # `pytest_httpx.IncompatibleResponses` since none are registered.
    events_2: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url=None,
        spec_content=spec,
        options=_build_options(),
        job_id=_job_id("2"),
    ):
        events_2.append(event)

    total_calls = len(httpx_mock.get_requests(url=OPENROUTER_URL))
    second_run_calls = total_calls - first_run_calls
    assert second_run_calls == 0, (
        f"GEN-12 violation: second run made {second_run_calls} LLM calls "
        "(expected 0 — L1 cache hit)"
    )

    # Second-run terminal: Phase 5 D-31 makes validation_complete the new
    # terminal stage; the L1 fast-path's intermediate stages still carry
    # cache=l1_hit so consumers can show the warm path.
    final = events_2[-1]
    assert final.stage == "validation_complete"
    assert final.partial_result is not None
    # Some intermediate event in the warm sequence carries cache=l1_hit
    # (the F1/F2/F3 chain runs fresh on warm — they're not cached in L1
    # per D-32). Verify at least one earlier event is the warm marker.
    cache_markers = [
        e
        for e in events_2
        if e.partial_result is not None and e.partial_result.get("cache") == "l1_hit"
    ]
    assert cache_markers, "expected at least one cache=l1_hit event in warm run"


async def test_pipeline_persists_full_architect_output_to_l1(httpx_mock: HTTPXMock) -> None:
    """L1 stores 6 outputs per D-34 so reconstruction is lossless."""
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_0_payload()),
    )
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_1_universal_payload()),
    )

    async for _event in run_pipeline(
        spec_url=None,
        spec_content=_synthetic_openapi_spec(),
        options=_build_options(),
        job_id=_job_id("X"),
    ):
        pass

    # Walk the cache layer for the single entry just written.
    from mcpgen_engine.cache import get_l1, l1_key
    from mcpgen_engine.stages import stage_a

    raw_ir, _, _ = await stage_a.run(spec_url=None, spec_content=_synthetic_openapi_spec())
    cached = get_l1(l1_key(raw_ir.spec_hash))
    assert cached is not None
    # Phase 4 D-34: L1 value layout — 8 keys (incl. pass_5_output + stage_e_manifest).
    assert set(cached.keys()) == {
        "raw_ir",
        "pass_0_output",
        "pass_1_output",
        "pass_2_output",
        "pass_3_output",
        "pass_4_output",
        "pass_5_output",
        "stage_e_manifest",
    }

    # Round-trip through `reconstruct_from_l1` returns 8-tuple.
    (
        raw_ir_2,
        pass_0_output,
        pass_1_output,
        pass_2_output,
        pass_3_output,
        pass_4_output,
        _pass_5_output,
        _stage_e_manifest,
    ) = reconstruct_from_l1(cached)
    assert raw_ir_2.spec_hash == raw_ir.spec_hash
    assert len(pass_0_output.tool_plans) == 3
    assert len(pass_1_output.tools) == 6
    assert pass_1_output.coverage_pct == 100.0
    assert len(pass_2_output.descriptions) == 6
    assert len(pass_3_output.input_schemas) == 6
    assert len(pass_4_output.annotations) == 6
    # D-27 invariant — every annotation has openWorldHint=True.
    for ann in pass_4_output.annotations.values():
        assert ann.openWorldHint is True


async def test_pipeline_emits_failed_event_on_stage_a_error() -> None:
    """Stage A failure → ``stage='failed' status='error'`` with stable code."""
    events: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url=None,
        spec_content="{not-valid-json-or-yaml: [",  # malformed
        options=_build_options(),
        job_id=_job_id("3"),
    ):
        events.append(event)

    assert events[-1].stage == "failed"
    assert events[-1].status == "error"
    assert events[-1].error is not None
    assert events[-1].error.code == "STAGE_A_FAILED"


async def test_pipeline_invalid_input_both_url_and_content() -> None:
    """Stage A rejects both spec_url AND spec_content set → failed event."""
    events: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url="https://example.com/spec.json",
        spec_content="{}",
        options=_build_options(),
        job_id=_job_id("4"),
    ):
        events.append(event)

    assert events[-1].stage == "failed"
    assert events[-1].error is not None
    assert events[-1].error.code == "STAGE_A_FAILED"
    assert "INVALID_INPUT" in events[-1].error.message
