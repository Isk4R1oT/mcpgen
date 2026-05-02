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

import os
import re
from collections.abc import AsyncIterator
from typing import Any, cast

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response, StreamingResponse
from mcpgen_ir.types import StageEManifest

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

    dev_local_raw = raw.get("dev_local", False)
    if not isinstance(dev_local_raw, bool):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="options.dev_local must be a boolean",
        )
    dev_local: bool = dev_local_raw

    return UserOptions(
        target_complexity=target_complexity,
        max_tools_override=max_tools_override,
        explicit_includes=raw.get("explicit_includes") or [],
        explicit_excludes=raw.get("explicit_excludes") or [],
        dev_local=dev_local,
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

    # Phase 5 D-35 strictly-additive request body fields (all optional).
    f3_enabled_raw = body.get("f3_enabled", False)
    if not isinstance(f3_enabled_raw, bool):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="f3_enabled must be a boolean",
        )
    f3_enabled: bool = f3_enabled_raw

    sandbox_credentials_raw = body.get("sandbox_credentials")
    sandbox_credentials: dict[str, str] | None = None
    if sandbox_credentials_raw is not None:
        if not isinstance(sandbox_credentials_raw, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in sandbox_credentials_raw.items()
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="sandbox_credentials must be Record<string, string>",
            )
        sandbox_credentials = dict(sandbox_credentials_raw)

    user_golden_tasks_raw = body.get("user_golden_tasks")
    user_golden_tasks: list[dict[str, Any]] | None = None
    if user_golden_tasks_raw is not None:
        if not isinstance(user_golden_tasks_raw, list) or not all(
            isinstance(t, dict) for t in user_golden_tasks_raw
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="user_golden_tasks must be a list of GoldenTask objects",
            )
        user_golden_tasks = list(user_golden_tasks_raw)

    _JOB_TABLE[job_id] = {
        "spec_url": spec_url,
        "spec_content": spec_content,
        "options": options,
        "f3_enabled": f3_enabled,
        "sandbox_credentials": sandbox_credentials,
        "user_golden_tasks": user_golden_tasks,
        "status": "accepted",
        "quality_report": None,
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

    raw_ir, _ = await stage_a.run(
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
    for key in (
        "pass_2_output",
        "pass_3_output",
        "pass_4_output",
        "pass_5_output",
        "stage_e_manifest",
    ):
        if key in cached:
            payload[key] = cached[key]
    return payload


# ─────────────────────────── Quality Report endpoint ──────────────────────


# Statuses that indicate a QualityReport is available (D-36 pre-condition).
_QR_TERMINAL_STATUSES: frozenset[str] = frozenset({"validation_complete", "failed"})


@router.get("/api/v1/generate/{job_id}/quality-report")
async def quality_report(job_id: str) -> dict[str, Any]:
    """Phase 5 D-36: return the full QualityReport JSON after validation.

    Pre-condition: job in ``validation_complete`` OR ``failed`` status.
    Used by the CLI + frontend (Phase 7) as the SSE-resume fallback per
    Pitfall #20 — clients that miss the terminal SSE event can still
    fetch the QR from this endpoint.

    Failure modes:
      - 404 — unknown ``job_id`` OR job exists but ``quality_report`` is
        not yet populated.
      - 409 — job exists but is still mid-pipeline (status is neither
        ``validation_complete`` nor ``failed``).
    """
    job = _JOB_TABLE.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"unknown job: {job_id}",
        )
    job_status = job.get("status", "accepted")
    if job_status not in _QR_TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"job {job_id} not yet at validation_complete " f"(current status: {job_status})"
            ),
        )
    qr = job.get("quality_report")
    if qr is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"QualityReport not produced for job {job_id}",
        )
    return cast("dict[str, Any]", qr)


# ─────────────────────────── Stage E output endpoint ───────────────────────


# File extensions that should be served as text. Anything else is treated as
# binary (application/octet-stream) — Stage E currently only emits text
# files, so the binary branch is effectively unreachable in v1.
_TEXT_EXTENSIONS: frozenset[str] = frozenset(
    {".ts", ".tsx", ".js", ".json", ".jsonc", ".yaml", ".yml", ".md", ".toml", ".html", ".txt"}
)


def _validate_relative_path(relative_path: str) -> None:
    """Reject path-traversal attempts BEFORE touching disk (T-04-12-output-endpoint-traversal).

    A safe relative path:
    - is non-empty.
    - does not contain ``..`` as a path segment.
    - does not start with ``/`` (no absolute paths).
    - does not contain backslashes (no Windows-style traversal).
    - does not contain NUL bytes.
    """
    if not relative_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="relative_path must be non-empty",
        )
    if relative_path.startswith("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="relative_path must not start with '/'",
        )
    if "\\" in relative_path or "\x00" in relative_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="relative_path must not contain '\\' or NUL bytes",
        )
    # Reject `..` as a literal path segment — covers `../etc/passwd`,
    # `foo/../../bar`, and `..` alone. We split on both `/` (POSIX) and check
    # the raw string for the segment to catch any URL-decoder quirk.
    parts = relative_path.split("/")
    for part in parts:
        if part == "..":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="relative_path must not contain '..' segments",
            )


@router.get("/api/v1/generate/{job_id}/output/{relative_path:path}")
async def output_file(job_id: str, relative_path: str) -> Response:
    """Stream a single Stage-E generated file by ``relative_path`` (D-47).

    The CLI calls this once per file in ``stage_e_manifest.files`` after
    SSE has reached ``shape_codegen_complete``.  We re-render the file
    deterministically from the cached manifest entry — the actual generated
    bytes are NOT in L1 (D-34); the manifest carries
    ``{relative_path, render_template, render_inputs_hash, sha256_content_hash}``
    and Stage E re-renders identically because Jinja2 + StrictUndefined +
    deterministic input data produces bit-identical output (GEN-12 / D-36).

    Pre-conditions:
      - Job exists in ``_JOB_TABLE`` (created by ``POST /api/v1/generate``).
      - L1 entry exists for the spec_hash AND contains ``stage_e_manifest``
        (i.e. pipeline has reached ``shape_codegen_complete``).
      - ``relative_path`` is in the manifest's file list.

    Returns:
      ``200 + Response(body, media_type=text/plain | octet-stream)``.

    Failure modes:
      - 400 — path traversal attempt.
      - 404 — unknown job, no L1 entry, no Stage E manifest, or file not
        listed in the manifest.
      - 500 — re-render failed (Stage E template error after L1 hit; should
        never happen because the manifest's render_template was just used to
        produce the cached sha256).
    """
    _validate_relative_path(relative_path)

    job = _JOB_TABLE.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"unknown job: {job_id}",
        )

    # Re-derive spec_hash from the stored job parameters (Stage A is fully
    # deterministic so this is cheap on a warm filesystem cache).
    raw_ir, _ = await stage_a.run(
        spec_url=job["spec_url"],
        spec_content=job["spec_content"],
    )
    cache_key = l1_key(raw_ir.spec_hash)
    cached = get_l1(cache_key)
    if cached is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"output for job {job_id} not in L1 cache (eviction or pipeline not yet complete)"
            ),
        )
    if "stage_e_manifest" not in cached:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"job {job_id} has not reached shape_codegen_complete — "
                "no stage_e_manifest in L1 entry"
            ),
        )

    manifest = StageEManifest.model_validate(cached["stage_e_manifest"])
    file_entry = next(
        (f for f in manifest.files if f.relative_path == relative_path),
        None,
    )
    if file_entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(f"file {relative_path!r} not listed in stage_e_manifest for job {job_id}"),
        )

    # Re-render from the on-disk Stage E output dir produced during the
    # original `run_pipeline` call. The dir is at
    # `${MCPGEN_OUTPUT_DIR or /tmp/mcpgen-engine-output}/<job_id>` per
    # `pipeline.resolve_output_dir`. Stage E writes files atomically there
    # before this endpoint can be called (the SSE caller waits for
    # `shape_codegen_complete` first), so a simple read is correct.
    from mcpgen_engine.pipeline import resolve_output_dir

    output_dir = resolve_output_dir(job_id)
    file_path = output_dir / relative_path
    # Defense in depth: resolve and re-check containment in case symlink
    # shenanigans somehow slipped past _validate_relative_path.
    try:
        resolved = file_path.resolve(strict=True)
        resolved.relative_to(output_dir.resolve(strict=True))
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"file {relative_path!r} missing from output dir "
                f"(re-render required); reason: {exc}"
            ),
        ) from exc

    # CR-01 (Phase 5 review fix): Read from the canonicalised ``resolved``
    # path under ``O_NOFOLLOW`` semantics — NOT from the unresolved
    # ``file_path``. Two threats are mitigated here:
    #
    # 1. TOCTOU symlink-swap race. Between the ``resolve(strict=True)``
    #    containment check above and the read, an attacker who can write
    #    inside ``output_dir`` (e.g. a co-tenant on a shared host whose
    #    ``MCPGEN_OUTPUT_DIR`` defaults to ``/tmp/mcpgen-engine-output``) can
    #    swap a regular file for a symlink pointing outside the dir.
    #    ``Path.read_bytes()`` re-resolves the symlink at read time, so the
    #    body returned would be the *post-swap* target (e.g. ``/etc/passwd``).
    # 2. Final-component symlink. If the relative path itself terminates in a
    #    symlink that ``resolve()`` followed to a path inside the dir, the
    #    link can be re-pointed before the read; ``O_NOFOLLOW`` refuses to
    #    open the final component if it is a symlink, failing closed.
    #
    # Containment was already validated against ``resolved`` (the
    # canonicalised target), so reading via ``resolved`` is safe. We open
    # with ``O_NOFOLLOW`` to refuse a swap of the final component into a
    # symlink between resolve() and open(). On filesystems where the entry
    # is genuinely a symlink (it never is for Stage E output — Jinja2 writes
    # regular files), ``os.open`` raises ``OSError(ELOOP)`` which we surface
    # as 404 to avoid leaking implementation detail.
    try:
        fd = os.open(resolved, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError as exc:
        # ELOOP (symlink with O_NOFOLLOW) or ENOENT (raced unlink).
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"file {relative_path!r} no longer readable in output dir "
                f"(symlink rejected or removed); reason: {exc}"
            ),
        ) from exc
    try:
        body = os.read(fd, os.fstat(fd).st_size)
    finally:
        os.close(fd)
    suffix = resolved.suffix.lower()
    if suffix in _TEXT_EXTENSIONS or resolved.name.startswith("."):
        return Response(content=body, media_type="text/plain; charset=utf-8")
    return Response(content=body, media_type="application/octet-stream")


# ─────────────────────────── SSE wire generator ────────────────────────────


def _record_quality_report(job_id: str, qr: dict[str, Any]) -> None:
    """Persist QualityReport into _JOB_TABLE for GET /quality-report (D-36)."""
    job = _JOB_TABLE.get(job_id)
    if job is None:
        return
    job["quality_report"] = qr
    job["status"] = "validation_complete"


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
        f3_enabled=job.get("f3_enabled", False),
        sandbox_credentials=job.get("sandbox_credentials"),
        user_golden_tasks=job.get("user_golden_tasks"),
        record_quality_report=_record_quality_report,
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
