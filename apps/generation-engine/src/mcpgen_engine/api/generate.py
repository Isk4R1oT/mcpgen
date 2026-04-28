"""POST /api/v1/generate + GET /api/v1/generate/{job_id}/stream.

Hand-rolled SSE wire format per Phase-1 D-09 contract — no `sse-starlette`
dependency. The wire shape mirrors the frozen Zod envelope in
`packages/contracts/src/generation-api.ts`:

    id: <26-char ULID>
    event: <stage>
    data: <JSON GenerationSseEvent>
    \\n

Phase-2 surface:

- ``POST /api/v1/generate`` — accepts ``{spec_url | spec_content, options}``,
  validates the ``Idempotency-Key`` header against ``GEN_ID_REGEX``, returns
  ``202 + {job_id, sse_url}``. Job parameters are buffered in an in-process
  dict; Phase 6+ swaps to the Postgres ``generations`` table from Phase-1
  D-08.
- ``GET /api/v1/generate/{job_id}/stream`` — returns ``text/event-stream``
  with hand-rolled SSE generator. Supports ``Last-Event-ID`` header for
  resume; events with ``event_id <= last_event_id`` (string compare —
  ULIDs are lexicographically monotonic) are skipped.

References:
- 02-CONTEXT.md D-47 (Phase-2 SSE transitions) + D-48 (Idempotency-Key
  validation against GEN_ID_REGEX)
- 02-RESEARCH.md §"Phase 2 SSE FastAPI handler" (hand-rolled — no
  sse-starlette dep)
- 02-PATTERNS.md `api/generate.py` row
- packages/contracts/src/idempotency.ts (FROZEN GEN_ID_REGEX)
- packages/contracts/src/generation-api.ts (FROZEN SSE envelope)
"""

from __future__ import annotations

import re
from collections.abc import AsyncIterator
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from mcpgen_engine.cache import get_l1, l1_key
from mcpgen_engine.passes.pass_0.filter import UserOptions
from mcpgen_engine.pipeline import run_pipeline
from mcpgen_engine.stages import stage_a

router = APIRouter()

# `GEN_ID_REGEX` mirror of `packages/contracts/src/idempotency.ts` Phase-1
# D-11 lock: `gen_<26-char Crockford ULID>`.
GEN_ID_REGEX = re.compile(r"^gen_[0-9A-HJKMNP-TV-Z]{26}$")
IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"
LAST_EVENT_ID_HEADER = "Last-Event-ID"

# In-memory job table — Phase 2 single-process. Phase 6+ migrates to the
# Postgres `generations` table (Phase-1 D-08 schema). Reset between unit
# tests via `_reset_job_table()` below.
_JOB_TABLE: dict[str, dict[str, Any]] = {}

_log = structlog.get_logger(__name__)


# ─────────────────────────── Request validation ────────────────────────────


def _validate_idempotency_key(key: str) -> None:
    """Reject malformed / missing ``Idempotency-Key`` per D-48 (no fallback).

    Empty key → 400. Wrong shape → 400. The regex mirrors the frozen
    Phase-1 contract one-to-one; any change there must update this regex.
    """
    if not key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"missing required header: {IDEMPOTENCY_KEY_HEADER}",
        )
    if not GEN_ID_REGEX.match(key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(f"invalid {IDEMPOTENCY_KEY_HEADER}: expected gen_<26-char ULID> (got {key!r})"),
        )


def _build_user_options(raw: dict[str, Any]) -> UserOptions:
    """Deserialize the request `options` field into Pass-0 ``UserOptions``.

    Empty / missing → defaults (``target_complexity='standard'`` etc.).
    """
    target_complexity = raw.get("target_complexity") or "standard"
    if target_complexity not in {"minimal", "standard", "comprehensive"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "invalid options.target_complexity: expected one of "
                f"minimal/standard/comprehensive (got {target_complexity!r})"
            ),
        )
    max_tools_override_raw = raw.get("max_tools_override")
    max_tools_override: int | None = None
    if max_tools_override_raw is not None:
        if not isinstance(max_tools_override_raw, int) or not 50 <= max_tools_override_raw <= 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="options.max_tools_override must be an int in [50, 100]",
            )
        max_tools_override = max_tools_override_raw

    return UserOptions(
        target_complexity=target_complexity,
        max_tools_override=max_tools_override,
        explicit_includes=raw.get("explicit_includes") or [],
        explicit_excludes=raw.get("explicit_excludes") or [],
    )


# ───────────────────────────── HTTP handlers ───────────────────────────────


@router.post("/api/v1/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate(req: Request) -> dict[str, str]:
    """Accept a generation job; return the SSE URL the client should consume.

    Body shape (Phase-1 frozen contract):

        {
          "spec_url"?: string,
          "spec_content"?: string,
          "options"?: { target_complexity, explicit_includes,
                        explicit_excludes, max_tools_override }
        }

    Exactly one of ``spec_url`` / ``spec_content`` must be set.
    """
    body: dict[str, Any] = await req.json()
    spec_url = body.get("spec_url")
    spec_content = body.get("spec_content")
    options_raw = body.get("options") or {}

    job_id = req.headers.get(IDEMPOTENCY_KEY_HEADER, "")
    _validate_idempotency_key(job_id)

    if (spec_url is None) == (spec_content is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="exactly one of spec_url or spec_content must be provided",
        )

    options = _build_user_options(options_raw if isinstance(options_raw, dict) else {})

    _JOB_TABLE[job_id] = {
        "spec_url": spec_url,
        "spec_content": spec_content,
        "options": options,
    }

    _log.info(
        "api.generate.accepted",
        job_id=job_id,
        has_spec_url=spec_url is not None,
        has_spec_content=spec_content is not None,
    )
    return {"job_id": job_id, "sse_url": f"/api/v1/generate/{job_id}/stream"}


@router.get("/api/v1/generate/{job_id}/stream")
async def stream(job_id: str, request: Request) -> StreamingResponse:
    """Return ``text/event-stream`` with hand-rolled SSE wire format.

    ``Last-Event-ID`` header is honoured per Phase-1 D-09 — any event with
    ``event_id <= last_event_id`` (string compare; ULIDs are lex-monotonic)
    is dropped from the output.
    """
    job = _JOB_TABLE.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"unknown job: {job_id}",
        )

    last_event_id = request.headers.get(LAST_EVENT_ID_HEADER, "")

    return StreamingResponse(
        _sse_generator(job_id=job_id, job=job, last_event_id=last_event_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx proxy buffering
        },
    )


@router.get("/api/v1/generate/{job_id}/artifacts")
async def artifacts(job_id: str) -> dict[str, Any]:
    """Return the L1-cached architect+author bundle for ``job_id``.

    Phase 3 surface for the CLI (D-34): after consuming the SSE stream to
    its ``completed`` event, the CLI fetches this endpoint to materialise
    the output directory. Because Pipeline persists to L1 keyed by
    ``raw_ir.spec_hash``, we re-derive the spec hash from the stored job
    parameters — Stage A is fully deterministic so this is cheap on a
    warm filesystem cache.

    Returned keys mirror the L1 layout per D-34::

        {
          "raw_ir":         <serialised RawIR>,
          "pass_0_output":  <serialised Pass0Output>,
          "pass_1_output":  <serialised Pass1Output>,
          "pass_2_output":  <serialised Pass2Output>,
          "pass_3_output":  <serialised Pass3Output>,
          "pass_4_output":  <serialised Pass4Output>,
        }

    The Pass 2/3/4 keys are present from Phase 3 onward; Phase 2 callers
    that only consumed the first 3 keys keep working unchanged.

    404 if the job_id is unknown OR the L1 entry is missing (e.g. cache
    eviction between SSE completion and this call).
    """
    job = _JOB_TABLE.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"unknown job: {job_id}",
        )

    raw_ir = await stage_a.run(
        spec_url=job["spec_url"],
        spec_content=job["spec_content"],
    )
    cache_key = l1_key(raw_ir.spec_hash)
    cached = get_l1(cache_key)
    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"artifacts for job {job_id} not in L1 cache "
                "(eviction or pipeline not yet complete)"
            ),
        )
    payload: dict[str, Any] = {
        "raw_ir": cached["raw_ir"],
        "pass_0_output": cached["pass_0_output"],
        "pass_1_output": cached["pass_1_output"],
    }
    # Phase 3 additions (D-34) — present from this version onward; older L1
    # entries written by a Phase-2 engine won't have them, in which case we
    # omit the key (CLI consumers feature-test on presence).
    for key in ("pass_2_output", "pass_3_output", "pass_4_output"):
        if key in cached:
            payload[key] = cached[key]
    return payload


# ─────────────────────────── SSE wire generator ────────────────────────────


async def _sse_generator(
    *,
    job_id: str,
    job: dict[str, Any],
    last_event_id: str,
) -> AsyncIterator[bytes]:
    """Format each pipeline event as: ``id:\\nevent:\\ndata:\\n\\n``."""
    options = job["options"]
    if not isinstance(options, UserOptions):
        # Defensive: should never happen — ``generate`` only stores UserOptions.
        raise RuntimeError("job options corrupted")  # noqa: TRY004 — internal invariant

    async for event in run_pipeline(
        spec_url=job["spec_url"],
        spec_content=job["spec_content"],
        options=options,
        job_id=job_id,
    ):
        if last_event_id and event.event_id <= last_event_id:
            # Already delivered on a prior connection — D-09 resume.
            continue

        # Frozen contract `packages/contracts/src/generation-api.ts` declares
        # `partial_result` and `error` with Zod `.optional()` — i.e. allowed
        # to be *absent* but NOT `null`. Pydantic's default
        # ``model_dump_json()`` would emit ``"partial_result": null`` /
        # ``"error": null`` when those fields are unset, which trips the CLI
        # consumer's Zod validation (`Expected object, received null`).
        # ``exclude_none=True`` drops the keys entirely so the wire payload
        # matches the frozen schema.
        payload = (
            f"id: {event.event_id}\n"
            f"event: {event.stage}\n"
            f"data: {event.model_dump_json(exclude_none=True)}\n\n"
        )
        yield payload.encode("utf-8")


# ─────────────────────────── Test-only helpers ─────────────────────────────


def _reset_job_table() -> None:
    """Wipe the in-process job table — used by tests for isolation."""
    _JOB_TABLE.clear()
