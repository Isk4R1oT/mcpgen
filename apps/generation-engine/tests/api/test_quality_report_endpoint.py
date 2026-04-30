"""GET /api/v1/generate/{job_id}/quality-report tests (Plan 05-08, CONTEXT D-36).

Verifies:
1. Unknown job_id -> 404.
2. Job in pre-validation state -> 409 Conflict.
3. Job at validation_complete -> 200 + QualityReport JSON.
4. POST body strictly-additive: pre-Phase-5 requests (without f3_enabled)
   parse cleanly; Phase-5 requests with new fields parse cleanly.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from mcpgen_engine.api.generate import _JOB_TABLE, _reset_job_table

VALID_JOB_ID = "gen_01HZW3J6V7XAEMP9N0DZTA8FB1"


@pytest.fixture(autouse=True)
def _isolated_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MCPGEN_CACHE_DIR", str(tmp_path / "mcpgen-cache"))
    from mcpgen_engine.settings import get_settings

    get_settings.cache_clear()
    _reset_job_table()


@pytest.fixture
def client() -> TestClient:
    from mcpgen_engine.main import app

    return TestClient(app)


# ─── GET /quality-report ────────────────────────────────────────────────────


def test_get_quality_report_unknown_job_returns_404(client: TestClient) -> None:
    resp = client.get(f"/api/v1/generate/{VALID_JOB_ID}/quality-report")
    assert resp.status_code == 404


def test_get_quality_report_pre_validation_returns_409(client: TestClient) -> None:
    """Job exists but hasn't reached validation_complete yet."""
    _JOB_TABLE[VALID_JOB_ID] = {
        "spec_url": "https://example.com/spec",
        "spec_content": None,
        "options": {},
        "status": "accepted",
        "quality_report": None,
    }
    resp = client.get(f"/api/v1/generate/{VALID_JOB_ID}/quality-report")
    assert resp.status_code == 409
    assert "not yet" in resp.json()["detail"].lower() or "complete" in resp.json()["detail"].lower()


def test_get_quality_report_validation_complete_returns_200(
    client: TestClient,
) -> None:
    """Job at validation_complete -> 200 + QualityReport body."""
    qr_payload: dict[str, Any] = {
        "spec_hash": "a" * 64,
        "f1_static": {
            "passed": True,
            "ts_compile_errors": [],
            "json_schema_errors": [],
            "mcp_compliance_errors": [],
            "secret_scan_findings": [],
            "bundle_bytes": 0,
        },
        "f2_smell": {"tool_scores": [], "overall_average": 4.5, "passed": True},
        "f3_agent_eval": None,
        "overall_score": 4.0,
        "quality_badge": "verified",
        "bundle_size_kb": 0,
        "retry_history": [],
        "f3_test_agent_id": None,
        "f2_low_confidence_run": False,
        "golden_task_set_origin": "hand_authored",
        "sandbox_environment": "real",
        "warnings": [],
        "generation_time_seconds": None,
        "total_cost_usd": None,
    }
    _JOB_TABLE[VALID_JOB_ID] = {
        "spec_url": "https://example.com/spec",
        "spec_content": None,
        "options": {},
        "status": "validation_complete",
        "quality_report": qr_payload,
    }
    resp = client.get(f"/api/v1/generate/{VALID_JOB_ID}/quality-report")
    assert resp.status_code == 200
    body = resp.json()
    assert body["quality_badge"] == "verified"
    assert body["spec_hash"] == "a" * 64


def test_get_quality_report_failed_job_returns_200(client: TestClient) -> None:
    """Failed-status job still returns the QR (D-36 pre-condition: complete OR failed)."""
    qr_payload: dict[str, Any] = {
        "spec_hash": "b" * 64,
        "f1_static": {
            "passed": False,
            "ts_compile_errors": ["TS_COMPILE_FAILED"],
            "json_schema_errors": [],
            "mcp_compliance_errors": [],
            "secret_scan_findings": [],
            "bundle_bytes": 0,
        },
        "f2_smell": {"tool_scores": [], "overall_average": 0.0, "passed": False},
        "f3_agent_eval": None,
        "overall_score": 0.0,
        "quality_badge": "needs_review",
        "bundle_size_kb": 0,
        "retry_history": [],
        "f3_test_agent_id": None,
        "f2_low_confidence_run": False,
        "golden_task_set_origin": "hand_authored",
        "sandbox_environment": "real",
        "warnings": [],
        "generation_time_seconds": None,
        "total_cost_usd": None,
    }
    _JOB_TABLE[VALID_JOB_ID] = {
        "spec_url": "https://example.com/spec",
        "spec_content": None,
        "options": {},
        "status": "failed",
        "quality_report": qr_payload,
    }
    resp = client.get(f"/api/v1/generate/{VALID_JOB_ID}/quality-report")
    assert resp.status_code == 200
    assert resp.json()["quality_badge"] == "needs_review"


def test_get_quality_report_validation_complete_no_qr_returns_404(
    client: TestClient,
) -> None:
    """Job marked validation_complete but no QR field -> 404."""
    _JOB_TABLE[VALID_JOB_ID] = {
        "spec_url": "https://example.com/spec",
        "spec_content": None,
        "options": {},
        "status": "validation_complete",
        "quality_report": None,
    }
    resp = client.get(f"/api/v1/generate/{VALID_JOB_ID}/quality-report")
    assert resp.status_code == 404


# ─── POST /generate strictly-additive request body ──────────────────────────


def test_post_generate_accepts_f3_enabled(client: TestClient) -> None:
    """D-35: f3_enabled is accepted as boolean."""
    resp = client.post(
        "/api/v1/generate",
        json={
            "spec_url": "https://example.com/openapi.json",
            "f3_enabled": True,
        },
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert resp.status_code == 202
    job = _JOB_TABLE.get(VALID_JOB_ID)
    assert job is not None
    assert job.get("f3_enabled") is True


def test_post_generate_accepts_sandbox_credentials(client: TestClient) -> None:
    """D-35: sandbox_credentials accepted as Record<string, string>."""
    resp = client.post(
        "/api/v1/generate",
        json={
            "spec_url": "https://example.com/openapi.json",
            "sandbox_credentials": {"stripe.test_key": "sk_test_xxx"},
        },
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert resp.status_code == 202
    job = _JOB_TABLE.get(VALID_JOB_ID)
    assert job is not None
    assert job.get("sandbox_credentials") == {"stripe.test_key": "sk_test_xxx"}


def test_post_generate_accepts_user_golden_tasks(client: TestClient) -> None:
    """D-35: user_golden_tasks accepted as list of GoldenTask objects."""
    tasks = [
        {
            "task_id": "t1",
            "prompt": "Search for widgets",
            "expected_outcome": "agent_calls_search",
            "max_iterations": 5,
        }
    ]
    resp = client.post(
        "/api/v1/generate",
        json={
            "spec_url": "https://example.com/openapi.json",
            "user_golden_tasks": tasks,
        },
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert resp.status_code == 202
    job = _JOB_TABLE.get(VALID_JOB_ID)
    assert job is not None
    assert job.get("user_golden_tasks") == tasks


def test_post_generate_backward_compat_no_phase5_fields(client: TestClient) -> None:
    """Phase 1-4 clients without Phase-5 fields still POST cleanly."""
    resp = client.post(
        "/api/v1/generate",
        json={
            "spec_url": "https://example.com/openapi.json",
            "options": {"target_complexity": "standard"},
        },
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert resp.status_code == 202
    job = _JOB_TABLE.get(VALID_JOB_ID)
    assert job is not None
    assert job.get("f3_enabled") is False  # default
    assert job.get("sandbox_credentials") is None
    assert job.get("user_golden_tasks") is None


def test_post_generate_rejects_invalid_f3_enabled(client: TestClient) -> None:
    """f3_enabled must be boolean — strings/numbers reject."""
    resp = client.post(
        "/api/v1/generate",
        json={
            "spec_url": "https://example.com/openapi.json",
            "f3_enabled": "yes",
        },
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert resp.status_code == 400


def test_post_generate_rejects_invalid_sandbox_credentials(client: TestClient) -> None:
    """sandbox_credentials must be Record<string, string>."""
    resp = client.post(
        "/api/v1/generate",
        json={
            "spec_url": "https://example.com/openapi.json",
            "sandbox_credentials": {"key": 123},  # value not a string
        },
        headers={"Idempotency-Key": VALID_JOB_ID},
    )
    assert resp.status_code == 400
