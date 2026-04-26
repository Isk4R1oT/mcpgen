"""MCPGen generation engine — FastAPI entrypoint.

Phase 1: scaffold only. /health returns 200; no Pass code wired.
Phase 2+ wires POST /api/v1/generate handler.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import sentry_sdk
from fastapi import FastAPI

from .observability import configure_langfuse_otel

if TYPE_CHECKING:
    from sentry_sdk._types import Event, Hint


def _sentry_before_send(event: Event, _hint: Hint) -> Event | None:
    """Architecture §11.3 + Pitfall #12: redact auth headers + spec content.

    Phase 1 wires the contract; Phase 4 expands the redaction set as more event
    shapes appear. We redact `Authorization`, `X-Upstream-Auth`, and `Cookie`
    request headers if Sentry serialises them.

    Returns the (possibly mutated) event. Returning None would drop the event;
    we never drop in Phase 1.
    """
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            for key in ("Authorization", "X-Upstream-Auth", "Cookie"):
                if key in headers:
                    headers[key] = "[REDACTED]"
    return event


def init_sentry() -> None:
    """Init Sentry SDK with empty-DSN safety (FND-10, D-19).

    Empty SENTRY_DSN is acceptable in Phase 1 (Sentry SDK no-ops when dsn is
    falsy). Phase 9 fills DSN per env via flyctl secrets.
    """
    # T-1-09: SENTRY_DSN comes from env var; never logged. before_send redacts auth headers.
    sentry_sdk.init(
        dsn=os.environ.get("SENTRY_DSN", ""),
        environment=os.environ.get("ENVIRONMENT", "development"),
        release=os.environ.get("SENTRY_RELEASE", ""),
        traces_sample_rate=0.1,
        before_send=_sentry_before_send,
    )


def create_app() -> FastAPI:
    """FastAPI factory. Phase 1: only /health endpoint."""
    init_sentry()
    configure_langfuse_otel()

    app = FastAPI(title="mcpgen-generation-engine", version="0.0.0")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
