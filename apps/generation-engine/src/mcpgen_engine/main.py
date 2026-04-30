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

import sentry_sdk
import structlog
from fastapi import FastAPI

from mcpgen_engine.api import generate as generate_api
from mcpgen_engine.observability import configure_langfuse_otel, redact_before_send
from mcpgen_engine.stages.stage_e.validate import ensure_codegen_node_modules

_log = structlog.get_logger(__name__)


def init_sentry() -> None:
    """Init Sentry SDK with empty-DSN safety (FND-10, D-19).

    Empty SENTRY_DSN is acceptable in Phase 1 (Sentry SDK no-ops when dsn is
    falsy). Phase 9 fills DSN per env via flyctl secrets.

    Phase 9 (D-04): `before_send` is the shared `redact_before_send` from
    `mcpgen_engine.observability` — single source of truth mirroring the TS
    `redactBeforeSend` in `@mcpgen/contracts/sentry-redaction`.
    """
    # T-1-09: SENTRY_DSN comes from env var; never logged. before_send redacts auth headers.
    sentry_sdk.init(
        dsn=os.environ.get("SENTRY_DSN", ""),
        environment=os.environ.get("ENVIRONMENT", "development"),
        release=os.environ.get("SENTRY_RELEASE", ""),
        traces_sample_rate=0.1,
        before_send=redact_before_send,
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
