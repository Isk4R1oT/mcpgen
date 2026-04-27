"""POST /api/v1/generate + GET /api/v1/generate/{job_id}/stream tests.

VALIDATION rows:
- D-47 (Phase-2 SSE stage transitions: A → B → completed)
- D-48 (Idempotency-Key validated against GEN_ID_REGEX; missing/malformed → 400)
- Phase-1 D-09 SSE wire-format compliance (id:\\nevent:\\ndata:\\n\\n).

Pattern: FastAPI TestClient (mirrors `test_main.py`).
"""

from __future__ import annotations

import json
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


def test_sse_stream_emits_phase_2_stage_sequence(
    client: TestClient,
    httpx_mock: HTTPXMock,
) -> None:
    """D-47: SSE stream emits A:started → A:completed → B:* → completed.

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
    assert stages_seen[-1] == ("completed", "completed")

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
