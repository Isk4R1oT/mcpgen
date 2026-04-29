"""MCPGen generation engine — FastAPI entrypoint.

Phase 1: scaffold only. /health returns 200; no Pass code wired.
Phase 2: wires POST /api/v1/generate + GET /api/v1/generate/{job_id}/stream
via ``api.generate.router``.
Phase 4 (Plan 04-11): FastAPI lifespan handler pre-warms
``packages/codegen-templates/node_modules`` so the first Stage E
``tsc --noEmit`` invocation doesn't pay the ~30s cold-install cost
(CONTEXT D-39).
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

import sentry_sdk
import structlog
from fastapi import FastAPI

from .api import generate as generate_api
from .observability import configure_langfuse_otel
from .stages.stage_e.validate import ensure_codegen_node_modules

if TYPE_CHECKING:
    from sentry_sdk._types import Event, Hint

_log = structlog.get_logger(__name__)


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


@asynccontextmanager
async def _engine_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """FastAPI startup/shutdown hooks.

    On startup, pre-warm ``packages/codegen-templates/node_modules`` so the
    first Stage E ``tsc --noEmit`` invocation doesn't pay the ~30s
    cold-install cost (CONTEXT D-39). Idempotent — repeat startups skip
    the install when the dir is already populated.

    Failures are logged but not raised — the engine should still serve
    /health even if codegen-templates is misconfigured (developers can
    diagnose from the structured log).
    """
    try:
        nm = ensure_codegen_node_modules()
        _log.info("engine.startup.codegen_templates_ready", path=str(nm))
    except Exception as exc:
        # Defensive: degraded engine still serves /health; developer can
        # diagnose codegen-templates issues from the structured log line.
        _log.warning("engine.startup.codegen_templates_failed", error=repr(exc))
    yield


def create_app() -> FastAPI:
    """FastAPI factory.

    Wires the ``_engine_lifespan`` startup hook (Plan 04-11) so the
    pre-warmed ``packages/codegen-templates/node_modules`` is ready before
    the first Stage E ``tsc --noEmit`` request lands.
    """
    init_sentry()
    configure_langfuse_otel()

    app = FastAPI(
        title="mcpgen-generation-engine",
        version="0.0.0",
        lifespan=_engine_lifespan,
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # Phase 2: POST /api/v1/generate + GET /api/v1/generate/{job_id}/stream.
    app.include_router(generate_api.router)

    return app


app = create_app()
