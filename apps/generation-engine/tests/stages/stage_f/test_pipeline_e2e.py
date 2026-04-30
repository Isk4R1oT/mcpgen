"""End-to-end pipeline integration test for Stage F (Plan 05-08).

Locks the SSE event sequence after Phase 4 ``shape_codegen_complete`` —
the F1 -> F2 -> F3 (conditional) -> validation_complete chain emitted by
``pipeline.run_pipeline``. All Stage F sub-orchestrators are mocked at
the pipeline call site so the test stays deterministic + fast.

Verifies (CONTEXT D-07, D-12, D-17, D-31):
1. Full pipeline run with passing F1 + F2 emits F1:started/completed,
   F2:started/completed, validation_complete:completed.
2. F1 fail-closed: F2:started never emitted on F1 failure (D-07).
3. F2 sigma < 0.4 force-triggers F3 even when f3_enabled=False (D-12).
4. F2 overall < 4.0 force-triggers F3 even when f3_enabled=False (D-17).
5. f3_enabled=True triggers F3 deterministically.
6. validation_complete partial_result includes the QualityReport JSON.
"""

from __future__ import annotations

import json
from datetime import UTC
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pytest_httpx import HTTPXMock

from mcpgen_engine.api.generate import _JOB_TABLE, _reset_job_table

VALID_JOB_ID = "gen_01HZW3J6V7XAEMP9N0DZTA8FB1"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ─── Reuse the Phase-4 SSE harness fixtures via direct re-import ────────────


@pytest.fixture(autouse=True)
def _isolated_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MCPGEN_CACHE_DIR", str(tmp_path / "mcpgen-cache"))
    monkeypatch.setenv("MCPGEN_OUTPUT_DIR", str(tmp_path / "stage-e-out"))
    from mcpgen_engine.settings import get_settings

    get_settings.cache_clear()
    _reset_job_table()


@pytest.fixture(autouse=True)
def _stub_stages(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stub Pass 2/3/4/5 + Stage E to keep pipeline deterministic."""
    from datetime import datetime
    from hashlib import sha256

    from mcpgen_ir.types import (
        Annotations,
        Description,
        Descriptions,
        FieldFiltering,
        Pagination2,
        Pass1Output,
        Pass2Output,
        Pass3Output,
        Pass4Output,
        Pass5Output,
        RawIR,
        ResponseConfig2,
        StageEManifest,
        Style,
        Tool2,
        Truncation,
    )
    from mcpgen_ir.types import File as ManifestFile

    from mcpgen_engine import pipeline as pipeline_module

    async def _fake_pass_2(
        pass_1_output: Pass1Output,
        raw_ir: RawIR,  # noqa: ARG001
    ) -> Pass2Output:
        descriptions: dict[str, Descriptions] = {}
        for tool in pass_1_output.tools:
            d = Description(
                purpose=f"Stub purpose for {tool.name}.",
                when_to_use=[f"finding {tool.name}"],
                limitations=["test stub"],
                parameter_overview=("x" * 50),
            )
            descriptions[tool.name] = Descriptions.model_validate(
                {**d.model_dump(), "description_hash": "0" * 64}
            )
        return Pass2Output(descriptions=descriptions)

    async def _fake_pass_3(
        pass_2_output: Pass2Output,  # noqa: ARG001
        pass_1_output: Pass1Output,
        raw_ir: RawIR,  # noqa: ARG001
        spec_title: str | None = None,  # noqa: ARG001
    ) -> Pass3Output:
        input_schemas: dict[str, dict[str, Any]] = {}
        for tool in pass_1_output.tools:
            schema: dict[str, Any] = {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            }
            if tool.name == "search":
                schema["properties"] = {"query": {"type": "string"}}
                schema["required"] = ["query"]
            elif tool.name == "fetch":
                schema["properties"] = {"id": {"type": "string"}}
                schema["required"] = ["id"]
            input_schemas[tool.name] = schema
        return Pass3Output(input_schemas=input_schemas)

    async def _fake_pass_4(
        pass_3_output: Pass3Output,  # noqa: ARG001
        pass_2_output: Pass2Output,  # noqa: ARG001
        pass_1_output: Pass1Output,
    ) -> Pass4Output:
        annotations: dict[str, Annotations] = {}
        titles: dict[str, str] = {}
        read_universal = {"search", "fetch", "list_collections", "list_objects"}
        for tool in pass_1_output.tools:
            is_read = tool.name in read_universal
            annotations[tool.name] = Annotations(
                readOnlyHint=is_read,
                destructiveHint=tool.name == "delete",
                idempotentHint=is_read or tool.name == "delete",
                openWorldHint=True,
            )
            titles[tool.name] = tool.name.replace("_", " ").title()
        return Pass4Output(annotations=annotations, titles=titles)

    async def _fake_pass_5(
        pass_4_output: Pass4Output,
        pass_3_output: Pass3Output,
        pass_2_output: Pass2Output,
        pass_1_output: Pass1Output,
        raw_ir: RawIR,  # noqa: ARG001
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
            ann = pass_4_output.annotations.get(t.name)
            if ann is None:
                annotations = Annotations(
                    readOnlyHint=True,
                    destructiveHint=False,
                    idempotentHint=True,
                    openWorldHint=True,
                )
            else:
                annotations = Annotations.model_validate(ann.model_dump())
            tools.append(
                Tool2(
                    name=t.name,
                    type=t.type,
                    description=description,
                    inputSchema=input_schema,
                    outputSchema={"type": "object", "additionalProperties": True},
                    annotations=annotations,
                    response_config=ResponseConfig2(
                        pagination=Pagination2(style=Style.none, default_limit=25, max_limit=100),
                        field_filtering=FieldFiltering(
                            always_include=[], opt_in=[], always_exclude=[]
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
        out_dir: Path = kwargs["output_dir"]
        out_dir.mkdir(parents=True, exist_ok=True)
        placeholder = "// stub server.ts\n"
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

    monkeypatch.setattr(pipeline_module, "pass_2_run", _fake_pass_2)
    monkeypatch.setattr(pipeline_module, "pass_3_run", _fake_pass_3)
    monkeypatch.setattr(pipeline_module, "pass_4_run", _fake_pass_4)
    monkeypatch.setattr(pipeline_module, "pass_5_run", _fake_pass_5)
    monkeypatch.setattr(pipeline_module, "stage_e_run", _fake_stage_e)


@pytest.fixture
def fake_f1_pass() -> Any:
    """A passing F1RunResult fixture (BUILD ME!)."""
    from mcpgen_engine.stages.stage_f.f1_static import F1CheckOutcome, F1RunResult

    return F1RunResult(
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


@pytest.fixture
def fake_f1_fail() -> Any:
    """A failing F1RunResult fixture (BUNDLE_SIZE_HARD terminal)."""
    from mcpgen_engine.stages.stage_f.f1_static import F1CheckOutcome, F1RunResult

    failing = F1CheckOutcome(
        check_name="bundle_size",
        passed=False,
        error="BUNDLE_SIZE_HARD",
        retry_target=None,
        details={"kb": 1500},
    )
    return F1RunResult(
        passed=False,
        outcomes=[failing],
        first_failure=failing,
        subprocess_checks_pending=False,
    )


def _make_f2_pass() -> Any:
    """Passing F2RunResult: overall=4.5, sigma=0.6 (no F3 auto-trigger)."""
    from mcpgen_engine.stages.stage_f.f2_smell import F2RunResult

    return F2RunResult(
        tool_scores=[],
        overall_score=4.5,
        sigma=0.6,
        passed=True,
        low_confidence_run=False,
        warnings=[],
    )


def _make_f2_low_sigma() -> Any:
    """F2 with sigma<0.4 -> force F3 (D-12)."""
    from mcpgen_engine.stages.stage_f.f2_smell import F2RunResult

    return F2RunResult(
        tool_scores=[],
        overall_score=4.5,
        sigma=0.2,  # low sigma -> low_confidence_run
        passed=True,
        low_confidence_run=True,
        warnings=["F2 between-tool sigma low"],
    )


def _make_f2_below_threshold() -> Any:
    """F2 overall<4.0 -> force F3 (D-17)."""
    from mcpgen_engine.stages.stage_f.f2_smell import F2RunResult

    return F2RunResult(
        tool_scores=[],
        overall_score=3.5,
        sigma=0.6,
        passed=False,  # below LAUNCH_CRITERIA F2_SMELL_MIN
        low_confidence_run=False,
        warnings=[],
    )


def _make_f3_pass() -> Any:
    """F3 result with pass_rate=0.8."""
    from mcpgen_engine.stages.stage_f.f3_agent_eval import F3RunResult

    return F3RunResult(
        results=[],
        pass_rate=0.8,
        mock_client_results=[],
        passed=True,
        warnings=[],
    )


def _minimal_golden_tasks() -> list[dict[str, Any]]:
    """One stub task — keeps F3 alive for the e2e test (we mock run_f3 anyway)."""
    return [
        {
            "task_id": "stub-1",
            "prompt": "Use search to find a widget.",
            "expected_outcome": "agent_calls_search",
            "expected_sequence": None,
            "expected_errors": None,
            "max_iterations": 5,
        }
    ]


def _synthetic_openapi_spec() -> str:
    return json.dumps(
        {
            "openapi": "3.0.0",
            "info": {"title": "Test API", "version": "1.0.0"},
            "servers": [{"url": "https://api.test.example"}],
            "paths": {
                "/v1/widgets": {
                    "get": {
                        "operationId": "list_widgets",
                        "responses": {"200": {"description": "OK"}},
                    },
                },
            },
        }
    )


def _pass_0_payload() -> dict[str, Any]:
    return {
        "tool_plans": [
            {
                "name": "widgets_list",
                "category": "crud",
                "source_endpoints": ["GET /v1/widgets"],
                "rationale": "list widgets",
            },
        ],
        "composite_candidates": [],
        "llm_dropped_endpoints": [],
    }


def _pass_1_universal_payload() -> dict[str, Any]:
    return {
        "search": {"name": "search", "type": "universal", "source_endpoints": []},
        "fetch": {"name": "fetch", "type": "universal", "source_endpoints": []},
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
        "upsert": {"name": "upsert", "type": "universal", "source_endpoints": []},
        "delete": {"name": "delete", "type": "universal", "source_endpoints": []},
    }


def _mock_openrouter_function_call(payload: dict[str, Any]) -> dict[str, Any]:
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


def _parse_sse_chunks(raw: bytes) -> list[dict[str, Any]]:
    text = raw.decode("utf-8")
    events: list[dict[str, Any]] = []
    for block in text.split("\n\n"):
        if not block.strip():
            continue
        record: dict[str, Any] = {}
        for line in block.splitlines():
            if line.startswith("id: "):
                record["id"] = line[len("id: ") :]
            elif line.startswith("event: "):
                record["event"] = line[len("event: ") :]
            elif line.startswith("data: "):
                record["data"] = json.loads(line[len("data: ") :])
        if record:
            events.append(record)
    return events


@pytest.fixture
def client() -> TestClient:
    from mcpgen_engine.main import app

    return TestClient(app)


def _post_and_consume(
    client: TestClient,
    httpx_mock: HTTPXMock,
    *,
    f3_enabled: bool = False,
    user_golden_tasks: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """POST + consume SSE; returns parsed events."""
    # Mock Pass 0 + Pass 1 LLM responses (Stage A is deterministic).
    httpx_mock.add_response(
        url=OPENROUTER_URL,
        method="POST",
        json=_mock_openrouter_function_call(_pass_0_payload()),
        is_reusable=True,
    )
    httpx_mock.add_response(
        url=OPENROUTER_URL,
        method="POST",
        json=_mock_openrouter_function_call(_pass_1_universal_payload()),
        is_reusable=True,
    )

    body: dict[str, Any] = {"spec_content": _synthetic_openapi_spec(), "options": {}}
    if f3_enabled:
        body["f3_enabled"] = True
    if user_golden_tasks is not None:
        body["user_golden_tasks"] = user_golden_tasks

    resp = client.post(
        "/api/v1/generate",
        json=body,
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert resp.status_code == 202, resp.text
    sse = client.get(f"/api/v1/generate/{VALID_JOB_ID}/stream")
    assert sse.status_code == 200
    return _parse_sse_chunks(sse.content)


# ─── Tests ──────────────────────────────────────────────────────────────────


def test_pipeline_emits_f1_f2_validation_complete_on_pass(
    client: TestClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
    fake_f1_pass: Any,
) -> None:
    """Full happy path: F1 + F2 pass; F3 not triggered (default opt-out)."""
    from mcpgen_engine import pipeline as pipeline_module

    f1_mock = AsyncMock(return_value=fake_f1_pass)
    f2_mock = AsyncMock(return_value=_make_f2_pass())
    monkeypatch.setattr(pipeline_module, "run_f1", f1_mock)
    monkeypatch.setattr(pipeline_module, "run_f2", f2_mock)

    events = _post_and_consume(client, httpx_mock)
    stages = [e["data"]["stage"] + ":" + e["data"]["status"] for e in events]

    assert "F1:started" in stages
    assert "F1:completed" in stages
    assert "F2:started" in stages
    assert "F2:completed" in stages
    # F3 should NOT have triggered (F2 passed + sigma >= 0.4 + f3_enabled=False)
    assert "F3:started" not in stages
    assert "validation_complete:completed" in stages


def test_pipeline_f1_fail_skips_f2_and_f3(
    client: TestClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
    fake_f1_fail: Any,
) -> None:
    """D-07 fail-closed: F1 failure -> F2/F3 must NOT run; validation_complete with needs_review."""
    from mcpgen_engine import pipeline as pipeline_module

    f1_mock = AsyncMock(return_value=fake_f1_fail)
    f2_mock = AsyncMock()
    monkeypatch.setattr(pipeline_module, "run_f1", f1_mock)
    monkeypatch.setattr(pipeline_module, "run_f2", f2_mock)

    events = _post_and_consume(client, httpx_mock)
    stages = [e["data"]["stage"] + ":" + e["data"]["status"] for e in events]

    assert "F1:completed" in stages
    assert "F2:started" not in stages
    assert "F3:started" not in stages
    assert f2_mock.await_count == 0
    # validation_complete still emitted with needs_review badge
    terminal = [e for e in events if e["data"]["stage"] == "validation_complete"]
    assert len(terminal) == 1
    qr = terminal[0]["data"]["partial_result"]["quality_report"]
    assert qr["quality_badge"] == "needs_review"


def test_pipeline_f2_low_sigma_force_triggers_f3(
    client: TestClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
    fake_f1_pass: Any,
) -> None:
    """D-12: F2 sigma < 0.4 -> F3 force-triggered even with f3_enabled=False."""
    from mcpgen_engine import pipeline as pipeline_module

    monkeypatch.setattr(pipeline_module, "run_f1", AsyncMock(return_value=fake_f1_pass))
    monkeypatch.setattr(pipeline_module, "run_f2", AsyncMock(return_value=_make_f2_low_sigma()))
    monkeypatch.setattr(pipeline_module, "run_f3", AsyncMock(return_value=_make_f3_pass()))

    events = _post_and_consume(
        client,
        httpx_mock,
        user_golden_tasks=_minimal_golden_tasks(),
    )
    stages = [e["data"]["stage"] + ":" + e["data"]["status"] for e in events]
    assert "F3:started" in stages
    assert "F3:completed" in stages


def test_pipeline_f2_below_threshold_force_triggers_f3(
    client: TestClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
    fake_f1_pass: Any,
) -> None:
    """D-17: F2 overall < threshold -> F3 force-triggered."""
    from mcpgen_engine import pipeline as pipeline_module

    monkeypatch.setattr(pipeline_module, "run_f1", AsyncMock(return_value=fake_f1_pass))
    monkeypatch.setattr(
        pipeline_module, "run_f2", AsyncMock(return_value=_make_f2_below_threshold())
    )
    monkeypatch.setattr(pipeline_module, "run_f3", AsyncMock(return_value=_make_f3_pass()))

    events = _post_and_consume(
        client,
        httpx_mock,
        user_golden_tasks=_minimal_golden_tasks(),
    )
    stages = [e["data"]["stage"] + ":" + e["data"]["status"] for e in events]
    assert "F3:started" in stages


def test_pipeline_f3_enabled_runs_f3(
    client: TestClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
    fake_f1_pass: Any,
) -> None:
    """D-35: f3_enabled=True triggers F3 even with passing F2."""
    from mcpgen_engine import pipeline as pipeline_module

    monkeypatch.setattr(pipeline_module, "run_f1", AsyncMock(return_value=fake_f1_pass))
    monkeypatch.setattr(pipeline_module, "run_f2", AsyncMock(return_value=_make_f2_pass()))
    f3_mock = AsyncMock(return_value=_make_f3_pass())
    monkeypatch.setattr(pipeline_module, "run_f3", f3_mock)

    events = _post_and_consume(
        client,
        httpx_mock,
        f3_enabled=True,
        user_golden_tasks=_minimal_golden_tasks(),
    )
    stages = [e["data"]["stage"] + ":" + e["data"]["status"] for e in events]
    assert "F3:started" in stages
    assert f3_mock.await_count == 1


def test_pipeline_validation_complete_includes_quality_report(
    client: TestClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
    fake_f1_pass: Any,
) -> None:
    """D-30: validation_complete partial_result.quality_report has the report dict."""
    from mcpgen_engine import pipeline as pipeline_module

    monkeypatch.setattr(pipeline_module, "run_f1", AsyncMock(return_value=fake_f1_pass))
    monkeypatch.setattr(pipeline_module, "run_f2", AsyncMock(return_value=_make_f2_pass()))

    events = _post_and_consume(client, httpx_mock)
    terminal = [e for e in events if e["data"]["stage"] == "validation_complete"]
    assert len(terminal) == 1
    qr = terminal[0]["data"]["partial_result"]["quality_report"]
    assert "quality_badge" in qr
    assert "overall_score" in qr
    assert qr["quality_badge"] in {"premium", "verified", "standard", "needs_review"}


def test_quality_report_persisted_to_job_table(
    client: TestClient,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
    fake_f1_pass: Any,
) -> None:
    """The QualityReport is stored in _JOB_TABLE for GET /quality-report."""
    from mcpgen_engine import pipeline as pipeline_module

    monkeypatch.setattr(pipeline_module, "run_f1", AsyncMock(return_value=fake_f1_pass))
    monkeypatch.setattr(pipeline_module, "run_f2", AsyncMock(return_value=_make_f2_pass()))

    _post_and_consume(client, httpx_mock)
    job = _JOB_TABLE.get(VALID_JOB_ID)
    assert job is not None
    assert job.get("quality_report") is not None
    assert job.get("status") == "validation_complete"
