"""Smoke tests for FastAPI app + Sentry init."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_health_returns_ok() -> None:
    # Sentry init reads SENTRY_DSN from env; empty is fine.
    from mcpgen_engine.main import app

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_sentry_init_handles_empty_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENTRY_DSN", "")
    from mcpgen_engine.main import init_sentry

    # Should not raise.
    init_sentry()


def test_sentry_before_send_redacts_auth_headers() -> None:
    """Phase 9 (D-04): the inline `_sentry_before_send` was promoted to the
    shared `mcpgen_engine.observability.redact_before_send` helper; this test
    now exercises the shared helper through the same surface (auth-header
    redaction)."""
    from mcpgen_engine.observability import redact_before_send

    event = {
        "request": {
            "headers": {
                "Authorization": "Bearer sk-secret",
                "X-Upstream-Auth": "key-leak",
                "Cookie": "session=abc",
                "X-Other": "ok",
            }
        }
    }
    cleaned = redact_before_send(event, {})
    assert cleaned is not None
    request = cleaned["request"]
    assert isinstance(request, dict)
    headers = request["headers"]
    assert isinstance(headers, dict)
    assert headers["Authorization"] == "[REDACTED]"
    assert headers["X-Upstream-Auth"] == "[REDACTED]"
    assert headers["Cookie"] == "[REDACTED]"
    assert headers["X-Other"] == "ok"
