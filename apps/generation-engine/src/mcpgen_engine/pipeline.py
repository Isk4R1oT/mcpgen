"""Phase-2 pipeline orchestrator: Stage A → Pass 0 → Pass 1.

Single async-generator (`run_pipeline`) chains the three architect-stage
modules and emits ``GenerationSseEvent`` instances compatible with the
frozen Phase-1 wire envelope (`packages/contracts/src/generation-api.ts`).

L1 fast-path:
1. Run Stage A → ``raw_ir`` (cheap; deterministic).
2. Compute ``l1_key(raw_ir.spec_hash)``.
3. If a hit: emit the same SSE event sequence with
   ``partial_result.cache='l1_hit'`` so the CLI can show the warm path.
4. Otherwise: run Pass 0 + Pass 1, persist the full architect output to L1.

The L1 store contains ``{raw_ir, pass_0_output, pass_1_output}`` so the
warm path can reconstruct the full result without re-running any stage.

Stage = retry boundary (engine v2 §5.1). Pass exceptions propagate as
`stage='failed'` SSE events; the orchestrator does NOT retry inside —
each pass owns its own retry logic per D-26 / D-34.

References:
- 02-CONTEXT.md D-37 (cache layers) + D-41 (GEN-12 zero-LLM second-run)
  + D-47 (Phase-2 SSE stage transitions)
- 02-RESEARCH.md §"Pipeline Orchestrator with SSE"
- 02-PATTERNS.md `pipeline.py` row
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, Literal, cast

import structlog
from mcpgen_ir.types import Pass0Output, Pass1Output, RawIR
from pydantic import BaseModel, ConfigDict
from ulid import ULID

from mcpgen_engine.cache import get_l1, l1_key, set_l1
from mcpgen_engine.passes.pass_0 import Pass0Error
from mcpgen_engine.passes.pass_0 import run as pass_0_run
from mcpgen_engine.passes.pass_0.filter import UserOptions
from mcpgen_engine.passes.pass_1 import Pass1Error
from mcpgen_engine.passes.pass_1 import run as pass_1_run
from mcpgen_engine.stages import stage_a
from mcpgen_engine.stages.stage_a import StageAError

_log = structlog.get_logger(__name__)


# ─────────────────────────── SSE event envelope ────────────────────────────
#
# Mirrors the frozen Phase-1 Zod contract in
# `packages/contracts/src/generation-api.ts`. Phase 2 only emits the subset
# `A`, `B`, `completed`, `failed` — Pass 2-5 / Stage E / F1-F3 land in later
# phases.

GenerationStage = Literal["A", "B", "C", "D", "E", "F1", "F2", "F3", "completed", "failed"]
GenerationStatus = Literal["started", "completed", "error"]


class GenerationSseError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str


class GenerationSseEvent(BaseModel):
    """Wire-shape mirror of Phase-1 `GenerationSseEvent` Zod schema."""

    model_config = ConfigDict(extra="forbid")

    job_id: str
    event_id: str
    stage: GenerationStage
    status: GenerationStatus
    # Frozen contract `packages/contracts/src/generation-api.ts` uses
    # `z.record(z.string(), z.unknown()).optional()` — `optional()` in Zod
    # means *undefined* (absent), NOT `null`. The field type is therefore
    # `dict[str, object]` (matching `z.unknown()`), and the serializer MUST
    # omit the key entirely when the value is None — see `model_dump_json`
    # call site in `api/generate.py` which passes `exclude_none=True`.
    partial_result: dict[str, object] | None = None
    error: GenerationSseError | None = None


# ─────────────────────────── Stable error codes ────────────────────────────
#
# Emitted in ``error.code`` of `failed` events — the CLI / frontend route on
# these strings rather than parsing free-text `message` fields.

_STAGE_A_ERROR_CODE = "STAGE_A_FAILED"
_PASS_0_ERROR_CODE = "PASS_0_FAILED"  # noqa: S105 — error code, not credential
_PASS_1_ERROR_CODE = "PASS_1_FAILED"  # noqa: S105 — error code, not credential
_INTERNAL_ERROR_CODE = "INTERNAL_ERROR"


def _stable_error_code(exc: BaseException) -> str:
    """Map known engine errors to stable SSE error codes.

    The error message itself usually contains the stage-specific code
    (e.g. "MULTI_SERVER_SPLIT_REQUIRED") — we keep that in the user-facing
    ``message`` field while the wire ``code`` stays stage-stable.
    """
    if isinstance(exc, StageAError):
        return _STAGE_A_ERROR_CODE
    if isinstance(exc, Pass0Error):
        return _PASS_0_ERROR_CODE
    if isinstance(exc, Pass1Error):
        return _PASS_1_ERROR_CODE
    return _INTERNAL_ERROR_CODE


# ─────────────────────────── Event constructor ─────────────────────────────


def _new_event_id() -> str:
    """Monotonic 26-char ULID (Crockford base32). One per emitted event."""
    return str(ULID())


def _event(
    *,
    job_id: str,
    stage: GenerationStage,
    status: GenerationStatus,
    partial_result: dict[str, object] | None,
    error: GenerationSseError | None,
) -> GenerationSseEvent:
    return GenerationSseEvent(
        job_id=job_id,
        event_id=_new_event_id(),
        stage=stage,
        status=status,
        partial_result=partial_result,
        error=error,
    )


# ─────────────────────────── Public orchestrator ───────────────────────────


async def run_pipeline(
    *,
    spec_url: str | None,
    spec_content: str | None,
    options: UserOptions,
    job_id: str,
) -> AsyncIterator[GenerationSseEvent]:
    """Phase-2 pipeline: Stage A → Pass 0 → Pass 1 with L1 fast-path.

    Yields SSE events in the D-47 sequence:

    - ``A:started`` → ``A:completed``
    - (L1 hit) ``completed:completed`` with ``cache='l1_hit'`` → return.
    - (cold) ``B:started`` (pass_0) → ``B:completed`` (pass_0)
            → ``B:started`` (pass_1) → ``B:completed`` (pass_1)
            → ``completed:completed``
    - On any exception: ``failed:error`` with stable ``code`` + raw ``message``.
    """
    spec_title = "MCPGen Generated Server"  # default; overridden after Stage A

    try:
        # Stage A — deterministic OpenAPI parse.
        yield _event(job_id=job_id, stage="A", status="started", partial_result=None, error=None)
        raw_ir = await stage_a.run(spec_url=spec_url, spec_content=spec_content)

        # L1 fast-path: skip Pass 0 + Pass 1 when the whole architect output
        # for this spec_hash is already cached.
        cache_key = l1_key(raw_ir.spec_hash)
        cached = get_l1(cache_key)
        if cached is not None:
            _log.info(
                "pipeline.l1_hit",
                job_id=job_id,
                spec_hash_prefix=raw_ir.spec_hash[:16],
                cache_key_prefix=cache_key[:16],
            )
            yield _event(
                job_id=job_id,
                stage="A",
                status="completed",
                partial_result={
                    "endpoint_count": str(len(raw_ir.endpoints)),
                    "cache": "l1_hit",
                },
                error=None,
            )
            yield _event(
                job_id=job_id,
                stage="completed",
                status="completed",
                partial_result={"phase": "architect_complete", "cache": "l1_hit"},
                error=None,
            )
            return

        # Cache miss: continue cold pipeline.
        yield _event(
            job_id=job_id,
            stage="A",
            status="completed",
            partial_result={"endpoint_count": str(len(raw_ir.endpoints))},
            error=None,
        )

        # Pass 0 — Stage B phase 1 (Tool Inventory & Naming).
        yield _event(
            job_id=job_id,
            stage="B",
            status="started",
            partial_result={"phase": "pass_0"},
            error=None,
        )
        pass_0_output = await pass_0_run(raw_ir, options)
        yield _event(
            job_id=job_id,
            stage="B",
            status="completed",
            partial_result={
                "phase": "pass_0",
                "tool_plan_count": str(len(pass_0_output.tool_plans)),
                "dropped_count": str(len(pass_0_output.dropped_endpoints)),
            },
            error=None,
        )

        # Pass 1 — Stage B phase 2 (Six-Tool Pattern Consolidation).
        yield _event(
            job_id=job_id,
            stage="B",
            status="started",
            partial_result={"phase": "pass_1"},
            error=None,
        )
        pass_1_output = await pass_1_run(pass_0_output, raw_ir, spec_title, options)
        yield _event(
            job_id=job_id,
            stage="B",
            status="completed",
            partial_result={
                "phase": "pass_1",
                "final_tool_count": str(len(pass_1_output.tools)),
                "coverage_pct": str(pass_1_output.coverage_pct),
            },
            error=None,
        )

        # Persist full architect output to L1 for next-run zero-LLM hit.
        # `by_alias=True` is required so `SecuritySchemes.in_` (Field alias
        # "in") round-trips through `model_validate` on cache reconstruction
        # (Pydantic uses alias on validation, field name on serialization
        # by default — without by_alias the second-run reload fails).
        set_l1(
            cache_key,
            cast(
                dict[str, Any],
                {
                    "raw_ir": raw_ir.model_dump(mode="json", by_alias=True),
                    "pass_0_output": pass_0_output.model_dump(mode="json", by_alias=True),
                    "pass_1_output": pass_1_output.model_dump(mode="json", by_alias=True),
                },
            ),
        )
        _log.info(
            "pipeline.l1_store",
            job_id=job_id,
            spec_hash_prefix=raw_ir.spec_hash[:16],
            cache_key_prefix=cache_key[:16],
        )

        yield _event(
            job_id=job_id,
            stage="completed",
            status="completed",
            partial_result={"phase": "architect_complete"},
            error=None,
        )

    except (StageAError, Pass0Error, Pass1Error) as exc:
        # Known stage / pass failures — emit `failed` event with stable code.
        _log.warning(
            "pipeline.failed",
            job_id=job_id,
            error_class=type(exc).__name__,
            error_code=_stable_error_code(exc),
        )
        yield _event(
            job_id=job_id,
            stage="failed",
            status="error",
            partial_result=None,
            error=GenerationSseError(code=_stable_error_code(exc), message=str(exc)),
        )

    except Exception as exc:
        # Unexpected failures — emit `failed` event with INTERNAL_ERROR and
        # re-raise so the FastAPI handler logs the stack trace via Sentry.
        _log.error(
            "pipeline.internal_error",
            job_id=job_id,
            error_class=type(exc).__name__,
        )
        yield _event(
            job_id=job_id,
            stage="failed",
            status="error",
            partial_result=None,
            error=GenerationSseError(code=_INTERNAL_ERROR_CODE, message=str(exc)),
        )
        raise


# ─────────────────────────── Helpers for tests ─────────────────────────────


def reconstruct_from_l1(cached: dict[str, Any]) -> tuple[RawIR, Pass0Output, Pass1Output]:
    """Re-validate the L1 payload back into typed IR objects.

    Used by tests + Phase 4 codegen consumer when both the cache hit and a
    hydrated `Pass1Output` are needed (the Phase-2 pipeline doesn't need
    this path itself — it only emits SSE events).
    """
    raw_ir = RawIR.model_validate(cached["raw_ir"])
    pass_0_output = Pass0Output.model_validate(cached["pass_0_output"])
    pass_1_output = Pass1Output.model_validate(cached["pass_1_output"])
    return raw_ir, pass_0_output, pass_1_output
