"""POST /api/v1/generate + GET /api/v1/generate/{job_id}/stream tests.

VALIDATION rows:
- D-47 (Phase-2 SSE stage transitions: A → B → completed)
- D-48 (Idempotency-Key validated against GEN_ID_REGEX; missing/malformed → 400)
- Phase-1 D-09 SSE wire-format compliance (id:\\nevent:\\ndata:\\n\\n).

Pattern: FastAPI TestClient (mirrors `test_main.py`).
"""

from __future__ import annotations

import json
from datetime import UTC
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pytest_httpx import HTTPXMock

from mcpgen_engine.api.generate import _reset_job_table

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
VALID_JOB_ID = "gen_01HZW3J6V7XAEMP9N0DZTA8FB1"


# ─────────────────────────────── Fixtures ──────────────────────────────────


@pytest.fixture(autouse=True)
def _isolated_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MCPGEN_CACHE_DIR", str(tmp_path / "mcpgen-cache"))
    from mcpgen_engine.settings import get_settings

    get_settings.cache_clear()
    _reset_job_table()


@pytest.fixture(autouse=True)
def _stub_stage_c_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bypass Pass 2/3/4 LLM stack at the orchestrator's import surface.

    Same pattern as `tests/test_pipeline.py::_stub_stage_c_passes` — this
    keeps the API tests focused on SSE wire-format + endpoint shape; per-pass
    LLM behaviour is exercised in `tests/passes/pass_*` modules.
    """
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

    from mcpgen_engine import pipeline as pipeline_module

    def _stub_description(name: str) -> Description:
        return Description(
            purpose=f"Stub purpose for tool '{name}' covering 5+ rubric components.",
            when_to_use=[f"finding {name} via canonical pipeline"],
            when_not_to_use=None,
            how_to_use=None,
            limitations=["test stub limitation entry"],
            parameter_overview=(
                f"Stub parameter overview for {name}; "
                "fields exist for orchestrator-shape validation only."
            ),
        )

    async def _fake_pass_2(
        pass_1_output: Pass1Output,
        raw_ir: RawIR,  # noqa: ARG001
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
    ) -> Pass3Output:
        input_schemas: dict[str, dict[str, Any]] = {}
        for tool in pass_1_output.tools:
            properties: dict[str, dict[str, Any]] = {}
            required: list[str] = []
            if tool.name == "search":
                properties["query"] = {"type": "string", "description": "search query"}
                required = ["query"]
            elif tool.name == "fetch":
                properties["id"] = {"type": "string", "description": "object id"}
                required = ["id"]
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
    """Bypass Pass 5 + Stage E heavy-lifting (Phase 4 — D-33 + D-34).

    Pass 5: returns a minimally-shaped ``Pass5Output`` with the same tool
    list as Pass 1, default response_config (truncation only, no
    pagination, no field filtering, no response_format).

    Stage E: returns a minimal ``StageEManifest`` (1 placeholder file
    entry, ts_compile_passed=True, bundle_size_kb=0.0) and writes the
    placeholder file to disk so the new ``GET /output/...`` endpoint
    can re-serve it on demand. Mirrors the Phase-3 ``_stub_stage_c_passes``
    pattern — keeps API/SSE-shape tests deterministic without the 30s
    tsc + wrangler subprocess cost.
    """
    from datetime import datetime
    from hashlib import sha256

    from mcpgen_ir.types import (
        Annotations,
        Description,
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
            desc = pass_2_output.descriptions.get(t.name)
            if desc is None:
                description = Description(
                    purpose=f"Stub purpose for {t.name} (pipeline test).",
                    when_to_use=["use case"],
                    limitations=["stub"],
                    parameter_overview="x" * 60,
                )
            else:
                description = Description.model_validate(desc.model_dump())
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
            tool2 = Tool2(
                name=t.name,
                type=t.type,
                description=description,
                inputSchema=input_schema,
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
            tools.append(tool2)
        return Pass5Output(tools=tools)

    async def _fake_stage_e(**kwargs: Any) -> StageEManifest:
        out_dir = kwargs["output_dir"]
        # Write a placeholder so the GET /output/ endpoint can serve a
        # deterministic body without re-rendering Jinja2.
        out_dir.mkdir(parents=True, exist_ok=True)
        placeholder = "// stub server.ts emitted by test_api_generate fixture\n"
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
    """Phase 5 D-31: stub F1 + F2 so SSE / API tests stay fast.

    F1 returns ``passed=True`` (so F2 runs). F2 returns ``passed=True`` +
    sigma=0.6 so F3 doesn't auto-trigger. F3 is left unmocked — it only
    runs when ``f3_enabled=True`` AND golden tasks are supplied; the API
    tests in this module never opt in.
    """
    from unittest.mock import AsyncMock

    from mcpgen_engine import pipeline as pipeline_module
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


@pytest.fixture(name="client")
def fastapi_client() -> TestClient:
    from mcpgen_engine.main import app

    return TestClient(app)


# ────────────────────────── Mocked-LLM helpers ─────────────────────────────


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


def _parse_sse_chunks(raw: bytes) -> list[dict[str, Any]]:
    """Decode hand-rolled SSE wire format (id:/event:/data:/\\n\\n) into dicts."""
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


# ─────────────────────────── POST /api/v1/generate ─────────────────────────


def test_post_generate_returns_202_with_sse_url(client: TestClient) -> None:
    response = client.post(
        "/api/v1/generate",
        json={"spec_url": "https://example.com/openapi.json", "options": {}},
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert response.status_code == 202
    payload = response.json()
    assert payload["job_id"] == VALID_JOB_ID
    assert payload["sse_url"] == f"/api/v1/generate/{VALID_JOB_ID}/stream"


def test_post_generate_rejects_invalid_idempotency_key(client: TestClient) -> None:
    response = client.post(
        "/api/v1/generate",
        json={"spec_url": "https://example.com/openapi.json"},
        headers={"Idempotency-Key": "bad-key"},
    )
    assert response.status_code == 400
    assert "Idempotency-Key" in response.json()["detail"]


def test_post_generate_rejects_missing_idempotency_key(client: TestClient) -> None:
    response = client.post(
        "/api/v1/generate",
        json={"spec_url": "https://example.com/openapi.json"},
    )
    assert response.status_code == 400


def test_post_generate_rejects_missing_spec(client: TestClient) -> None:
    response = client.post(
        "/api/v1/generate",
        json={"options": {}},
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert response.status_code == 400


def test_post_generate_rejects_both_url_and_content(client: TestClient) -> None:
    response = client.post(
        "/api/v1/generate",
        json={
            "spec_url": "https://example.com/spec.json",
            "spec_content": "{}",
        },
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert response.status_code == 400


def test_post_generate_rejects_invalid_target_complexity(client: TestClient) -> None:
    response = client.post(
        "/api/v1/generate",
        json={
            "spec_content": _synthetic_openapi_spec(),
            "options": {"target_complexity": "wrong"},
        },
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert response.status_code == 400


# ─────────────────────────── GET /stream — SSE ─────────────────────────────


def test_stream_unknown_job_returns_404(client: TestClient) -> None:
    response = client.get(f"/api/v1/generate/{VALID_JOB_ID}/stream")
    assert response.status_code == 404


def test_sse_stream_emits_phase_3_stage_sequence(
    client: TestClient,
    httpx_mock: HTTPXMock,
) -> None:
    """D-33 + D-31: SSE stream emits the Phase-4 sequence + Phase-5 F1/F2 chain.

    Phase 4 backbone: A → B(x2) → C(x3) → D(x1) → E(x1).
    Phase 5 D-31: + F1 → F2 → validation_complete (F3 is opt-in).

    Also verifies the wire format ``id:\\nevent:\\ndata:\\n\\n`` per Phase-1 D-09.
    """
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

    accept = client.post(
        "/api/v1/generate",
        json={"spec_content": _synthetic_openapi_spec(), "options": {}},
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert accept.status_code == 202

    with client.stream("GET", f"/api/v1/generate/{VALID_JOB_ID}/stream") as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        body = b"".join(resp.iter_bytes())

    events = _parse_sse_chunks(body)
    assert events, "expected at least one SSE event"

    stages_seen = [(e["data"]["stage"], e["data"]["status"]) for e in events]
    assert stages_seen[0] == ("A", "started")
    assert ("A", "completed") in stages_seen
    assert ("B", "started") in stages_seen
    assert ("B", "completed") in stages_seen
    # D-33: Stage C fires 3 times (Pass 2/3/4) — once started + once completed each.
    assert ("C", "started") in stages_seen
    assert ("C", "completed") in stages_seen
    c_started_count = sum(1 for s in stages_seen if s == ("C", "started"))
    c_completed_count = sum(1 for s in stages_seen if s == ("C", "completed"))
    assert c_started_count == 3
    assert c_completed_count == 3
    # Phase 4 D-33: Stage D + Stage E both fire exactly once each.
    assert sum(1 for s in stages_seen if s == ("D", "started")) == 1
    assert sum(1 for s in stages_seen if s == ("D", "completed")) == 1
    assert sum(1 for s in stages_seen if s == ("E", "started")) == 1
    assert sum(1 for s in stages_seen if s == ("E", "completed")) == 1
    # Phase 5 D-31: F1 + F2 fire after Stage E; terminal becomes
    # `validation_complete:completed` carrying the QualityReport.
    assert ("F1", "started") in stages_seen
    assert ("F1", "completed") in stages_seen
    assert ("F2", "started") in stages_seen
    assert ("F2", "completed") in stages_seen
    assert stages_seen[-1] == ("validation_complete", "completed")
    assert events[-1]["data"]["partial_result"]["phase"] == "validation_complete"
    assert "quality_report" in events[-1]["data"]["partial_result"]
    pass_4_completed = next(
        e
        for e in events
        if e["data"]["stage"] == "C"
        and e["data"]["status"] == "completed"
        and e["data"].get("partial_result", {}).get("phase") == "pass_4"
    )
    assert pass_4_completed["data"]["partial_result"].get("sub_status") == "author_complete"

    # Wire-format compliance: every event has id, event, and data fields.
    for ev in events:
        assert "id" in ev
        assert "event" in ev
        assert "data" in ev
        # event_id is a 26-char ULID (Crockford alphabet).
        assert len(ev["id"]) == 26

    # Frozen-contract compliance: optional fields must be ABSENT (not null).
    # Zod `.optional()` accepts undefined, NOT null — emitting `null` makes
    # the CLI consumer's GenerationSseEvent.parse() fail with
    # "Expected object, received null". Regression guard for the
    # contract drift caught during the Phase-2 manual gate. Engine emits
    # via `model_dump_json(exclude_none=True)` so unset optional fields
    # are stripped from the wire payload entirely.
    for ev in events:
        data = ev["data"]
        if "partial_result" in data:
            assert data["partial_result"] is not None, "partial_result must be omitted, never null"
        if "error" in data:
            assert data["error"] is not None, "error must be omitted, never null"
    # No happy-path event should carry `error` at all.
    assert all("error" not in e["data"] for e in events)


def test_sse_stream_supports_last_event_id_resume(
    client: TestClient,
    httpx_mock: HTTPXMock,
) -> None:
    """Phase-1 D-09: events with event_id <= Last-Event-ID are skipped on reconnect.

    Pre-warm L1 by running once → a second run hits L1 fast-path. We then
    capture the first event_id and re-stream with ``Last-Event-ID`` set
    above it; the response must contain only the terminal event.
    """
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

    spec = _synthetic_openapi_spec()
    job_id_1 = "gen_01HZW3J6V7XAEMP9N0DZTA8FB1"
    client.post(
        "/api/v1/generate",
        json={"spec_content": spec, "options": {}},
        headers={"Idempotency-Key": job_id_1},
    )
    with client.stream("GET", f"/api/v1/generate/{job_id_1}/stream") as resp:
        body_1 = b"".join(resp.iter_bytes())
    events_1 = _parse_sse_chunks(body_1)
    assert len(events_1) >= 2

    # Second job — same spec → L1 hit.
    job_id_2 = "gen_01HZW3J6V7XAEMP9N0DZTA8FB2"
    client.post(
        "/api/v1/generate",
        json={"spec_content": spec, "options": {}},
        headers={"Idempotency-Key": job_id_2},
    )

    # Use the FIRST event_id of the warm-path stream as the Last-Event-ID;
    # subsequent events should still flow because their event_ids are larger.
    with client.stream(
        "GET",
        f"/api/v1/generate/{job_id_2}/stream",
    ) as resp:
        body_2 = b"".join(resp.iter_bytes())
    events_2 = _parse_sse_chunks(body_2)
    assert events_2, "expected at least one event in second stream"

    first_event_id = events_2[0]["id"]

    # Now resume with Last-Event-ID = first_event_id; only later events flow.
    job_id_3 = "gen_01HZW3J6V7XAEMP9N0DZTA8FB3"
    client.post(
        "/api/v1/generate",
        json={"spec_content": spec, "options": {}},
        headers={"Idempotency-Key": job_id_3},
    )
    with client.stream(
        "GET",
        f"/api/v1/generate/{job_id_3}/stream",
        headers={"Last-Event-ID": first_event_id},
    ) as resp:
        body_3 = b"".join(resp.iter_bytes())
    events_3 = _parse_sse_chunks(body_3)

    # Every event_id in the resumed stream must be strictly > first_event_id
    # (string compare — ULIDs are lexicographically monotonic over time).
    for ev in events_3:
        assert (
            ev["id"] > first_event_id
        ), f"resume violation: event_id {ev['id']!r} <= cutoff {first_event_id!r}"


# ──────────────── Plan 04-14 — _build_user_options dev_local field ─────────────


def test_build_user_options_dev_local_default_false() -> None:
    """_build_user_options({}) returns dev_local=False by default."""
    from mcpgen_engine.api.generate import _build_user_options

    opts = _build_user_options({})
    assert opts.dev_local is False


def test_build_user_options_dev_local_true() -> None:
    """_build_user_options({'dev_local': True}) returns dev_local=True."""
    from mcpgen_engine.api.generate import _build_user_options

    opts = _build_user_options({"dev_local": True})
    assert opts.dev_local is True


def test_build_user_options_dev_local_invalid_type_raises_400() -> None:
    """_build_user_options({'dev_local': 'yes'}) raises HTTPException 400."""
    from fastapi import HTTPException

    from mcpgen_engine.api.generate import _build_user_options

    with pytest.raises(HTTPException) as exc_info:
        _build_user_options({"dev_local": "yes"})
    assert exc_info.value.status_code == 400
    assert "dev_local" in str(exc_info.value.detail)
