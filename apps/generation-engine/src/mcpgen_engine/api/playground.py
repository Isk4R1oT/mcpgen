"""Playground execution API — live sandbox for testing a generated MCP server.

The user lands on `/generate/<job>/playground` after Stage E completes; this
module spawns the generated tenant Worker via ``wrangler dev --local`` (reusing
F3's ``server_runner.spawn_server``), keeps it alive for a 45-minute session
TTL, and runs a streaming Anthropic-Sonnet agent loop on each ``invoke`` call.

Why this isn't just F3:

- F3 (``stage_f.test_agent_harness.run_golden_task``) is BATCH eval —
  spins up a server, runs N pre-defined golden tasks one after another,
  tears down. The full trajectory accumulates and returns at the end.
- Playground is INTERACTIVE — keep the server alive across many user-driven
  invocations, stream agent events back to the UI in real time, persist
  each run for the history rail.

Design:

- Module-level ``_SESSIONS: dict[str, PlaygroundSession]`` maps ``job_id`` →
  one running wrangler subprocess. Each session has a ``stop_evt`` that the
  hold-open task awaits inside the ``spawn_server`` context manager — when
  we want to tear the subprocess down (TTL expiry / explicit DELETE) we
  ``stop_evt.set()`` and the context manager's exit cascade fires.
- Each invoke takes a per-session ``asyncio.Lock`` because ``wrangler dev``
  isn't concurrency-safe (single-isolate, race conditions on shared in-mem
  state in the generated Worker).
- Agent loop is a streaming variant of ``run_golden_task`` — same pattern
  (``stop_reason == 'tool_use'`` → JSON-RPC ``tools/call``) but yields SSE
  events at every state change (turn start, tool call, tool result, final
  message) so the UI's live trace rail can update incrementally.

BYOK is a v0.1 follow-up. For MVP we use the same module-level
``ANTHROPIC`` client as F3 — env-keyed. The UI footer's "using your key"
copy stays as future-truth; backend uses server key today. The
``deletes in 45m`` invariant holds either way (we never persist the key).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from anthropic import APIStatusError, RateLimitError
from anthropic.types import MessageParam, ToolParam
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from mcpgen_engine.llm.sampling import F3_TEST_AGENT_SETTINGS
from mcpgen_engine.llm.test_agent import ANTHROPIC, SONNET_MODEL_ID
from mcpgen_engine.stages.stage_f.server_runner import spawn_server
from mcpgen_engine.stages.stage_f.test_agent_harness import (
    _execute_mcp_tool_call,
    mcp_tool_to_anthropic,
)

log = logging.getLogger(__name__)

_SESSION_TTL: timedelta = timedelta(minutes=45)
_AGENT_MAX_ITERATIONS: int = 10
_TOOL_RESULT_TRUNCATE_CHARS: int = 5000


# ─── Session state ─────────────────────────────────────────────────────────


@dataclass
class PlaygroundSession:
    """Live wrangler-dev subprocess attached to a generation."""

    job_id: str
    server_url: str
    mcp_tools: list[dict[str, Any]]
    expires_at: datetime
    stop_evt: asyncio.Event
    hold_task: asyncio.Task[None]
    invoke_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_SESSIONS: dict[str, PlaygroundSession] = {}
_SESSIONS_LOCK = asyncio.Lock()


# ─── Output dir resolution ─────────────────────────────────────────────────
#
# Imported lazily to avoid a circular import (pipeline → playground via the
# router include in main; playground needs resolve_output_dir from pipeline).
def _resolve_generated_dir(job_id: str) -> Path:
    from mcpgen_engine.pipeline import resolve_output_dir

    return resolve_output_dir(job_id)


# ─── Tools/list discovery ──────────────────────────────────────────────────


async def _discover_mcp_tools(server_url: str) -> list[dict[str, Any]]:
    """POST tools/list against the live MCP server, return the tool list.

    The server is already healthchecked by ``spawn_server`` so this should
    succeed on the first attempt; we still set a generous timeout against
    cold-start tail latency.
    """
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
        resp = await client.post(server_url, json=body, headers=headers)
        resp.raise_for_status()
        envelope = resp.json()
        result = envelope.get("result", {})
        tools = result.get("tools", [])
        return tools if isinstance(tools, list) else []


# ─── Session lifecycle ─────────────────────────────────────────────────────


async def _hold_session_open(
    job_id: str,
    generated_dir: Path,
    ready_url: asyncio.Future[str],
    stop_evt: asyncio.Event,
) -> None:
    """Background task: hold the spawn_server context manager open until stop.

    The context manager handles SIGTERM cascade on exit, so all we have to
    do is wait inside it. On any exception during spawn we resolve the
    future with the error so callers don't hang forever.
    """
    try:
        async with spawn_server(generated_dir) as server_url:
            if not ready_url.done():
                ready_url.set_result(server_url)
            await stop_evt.wait()
    except Exception as exc:
        if not ready_url.done():
            ready_url.set_exception(exc)
    finally:
        # Drop ourselves from the cache on the way out — TTL expiry + explicit
        # teardown both reach this branch.
        _SESSIONS.pop(job_id, None)


async def _create_session(job_id: str) -> PlaygroundSession:
    """Spawn a new wrangler-dev subprocess + cache as a session.

    Caller holds ``_SESSIONS_LOCK`` and has verified no entry exists yet.
    """
    generated_dir = _resolve_generated_dir(job_id)
    if not generated_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"generated dir for job {job_id} not found at {generated_dir}; "
                "regenerate the spec — the on-disk Stage E output may have been "
                "evicted between Engine restarts"
            ),
        )

    stop_evt = asyncio.Event()
    ready_url: asyncio.Future[str] = asyncio.get_running_loop().create_future()
    hold_task = asyncio.create_task(
        _hold_session_open(job_id, generated_dir, ready_url, stop_evt),
        name=f"playground-hold-{job_id}",
    )

    try:
        server_url = await asyncio.wait_for(ready_url, timeout=45.0)
    except (TimeoutError, Exception) as exc:
        # Spawn failed → clean up the hold task before re-raising.
        stop_evt.set()
        with contextlib.suppress(TimeoutError, Exception):
            await asyncio.wait_for(hold_task, timeout=5.0)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"playground sandbox spawn failed: {exc}",
        ) from exc

    try:
        mcp_tools = await _discover_mcp_tools(server_url)
    except Exception as exc:
        stop_evt.set()
        with contextlib.suppress(Exception):
            await asyncio.wait_for(hold_task, timeout=5.0)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"playground tools/list discovery failed: {exc}",
        ) from exc

    session = PlaygroundSession(
        job_id=job_id,
        server_url=server_url,
        mcp_tools=mcp_tools,
        expires_at=datetime.now(UTC) + _SESSION_TTL,
        stop_evt=stop_evt,
        hold_task=hold_task,
    )
    _SESSIONS[job_id] = session
    log.info("playground.session.spawned", extra={"job_id": job_id, "tool_count": len(mcp_tools)})
    return session


async def _get_or_create_session(job_id: str) -> PlaygroundSession:
    """Return live session for ``job_id``, spawning if needed; bump TTL."""
    async with _SESSIONS_LOCK:
        existing = _SESSIONS.get(job_id)
        if existing is not None:
            existing.expires_at = datetime.now(UTC) + _SESSION_TTL
            return existing
        return await _create_session(job_id)


async def _teardown_session(job_id: str) -> bool:
    """Kill the subprocess + drop the session entry. Returns True if found."""
    async with _SESSIONS_LOCK:
        session = _SESSIONS.get(job_id)
        if session is None:
            return False
        session.stop_evt.set()
    try:
        await asyncio.wait_for(session.hold_task, timeout=10.0)
    except TimeoutError:
        log.warning("playground.session.teardown.timeout", extra={"job_id": job_id})
    return True


# ─── Streaming agent loop ──────────────────────────────────────────────────


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=10),
    retry=retry_if_exception_type((APIStatusError, RateLimitError, httpx.NetworkError)),
    reraise=True,
)
async def _agent_step_with_retry(
    messages: list[dict[str, Any]],
    anthropic_tools: list[dict[str, Any]],
) -> Any:
    """One Sonnet round-trip with the same retry envelope F3 uses."""
    from typing import cast

    return await ANTHROPIC.messages.create(
        model=SONNET_MODEL_ID,
        max_tokens=cast(int, F3_TEST_AGENT_SETTINGS["max_tokens"]),
        temperature=cast(float, F3_TEST_AGENT_SETTINGS["temperature"]),
        top_p=cast(float, F3_TEST_AGENT_SETTINGS["top_p"]),
        tools=cast(list[ToolParam], anthropic_tools),
        messages=cast(list[MessageParam], list(messages)),
    )


def _sse_frame(event: str, data: dict[str, Any], event_id: str | None = None) -> bytes:
    """Format an SSE frame as ``id:\\nevent:\\ndata:\\n\\n``."""
    parts: list[str] = []
    if event_id is not None:
        parts.append(f"id: {event_id}")
    parts.append(f"event: {event}")
    parts.append(f"data: {json.dumps(data, separators=(',', ':'))}")
    parts.append("")
    parts.append("")
    return "\n".join(parts).encode("utf-8")


async def _stream_agent_loop(
    session: PlaygroundSession,
    prompt: str,
    pinned_tool: str | None,
) -> AsyncIterator[bytes]:
    """Run a multi-turn agent against the spawned server; yield SSE events.

    Events emitted:
      - ``agent_start`` { turn: int }
      - ``tool_call`` { request_id, name, args }
      - ``tool_result`` { request_id, lat_ms, in_tokens, out_tokens, ok, content }
      - ``agent_message`` { text, stop_reason }
      - ``done`` { total_in_tk, total_out_tk, total_lat_ms, agent_reply, status, traces }

    Errors during the loop terminate with a ``done`` event carrying
    ``status = 'failed'`` + ``failure_reason``.
    """
    if not session.mcp_tools:
        yield _sse_frame(
            "done",
            {
                "status": "failed",
                "failure_reason": "no MCP tools discovered on this server",
                "total_in_tk": 0,
                "total_out_tk": 0,
                "total_lat_ms": 0,
                "agent_reply": None,
                "traces": [],
            },
        )
        return

    # Filter tools to a single one when the user pinned a specific tool —
    # this is debug mode, agent must use that exact tool.
    visible_tools = (
        [t for t in session.mcp_tools if t.get("name") == pinned_tool]
        if pinned_tool
        else session.mcp_tools
    )
    if not visible_tools:
        yield _sse_frame(
            "done",
            {
                "status": "failed",
                "failure_reason": f"pinned tool '{pinned_tool}' not found on server",
                "total_in_tk": 0,
                "total_out_tk": 0,
                "total_lat_ms": 0,
                "agent_reply": None,
                "traces": [],
            },
        )
        return

    anthropic_tools = [mcp_tool_to_anthropic(t) for t in visible_tools]
    messages: list[dict[str, Any]] = [{"role": "user", "content": prompt}]
    traces: list[dict[str, Any]] = []
    total_in = 0
    total_out = 0
    total_lat = 0
    final_text: str | None = None
    status_label = "ok"
    failure_reason: str | None = None

    async with session.invoke_lock:
        try:
            for turn in range(_AGENT_MAX_ITERATIONS):
                yield _sse_frame("agent_start", {"turn": turn + 1})

                step_started_at = time.perf_counter()
                resp = await _agent_step_with_retry(messages, anthropic_tools)
                step_lat_ms = int((time.perf_counter() - step_started_at) * 1000)
                total_lat += step_lat_ms

                # Anthropic reports usage on every messages.create response.
                usage_in = int(getattr(resp.usage, "input_tokens", 0) or 0)
                usage_out = int(getattr(resp.usage, "output_tokens", 0) or 0)
                total_in += usage_in
                total_out += usage_out

                step_text = ""
                tool_use_blocks: list[Any] = []
                for block in resp.content:
                    btype = getattr(block, "type", "")
                    if btype == "text":
                        step_text += getattr(block, "text", "")
                    elif btype == "tool_use":
                        tool_use_blocks.append(block)

                if step_text:
                    yield _sse_frame(
                        "agent_message",
                        {"text": step_text, "stop_reason": resp.stop_reason},
                    )

                if resp.stop_reason == "end_turn":
                    final_text = step_text
                    break

                if resp.stop_reason != "tool_use":
                    # max_tokens / pause_turn / stop_sequence — can't recover.
                    final_text = step_text
                    failure_reason = f"agent stopped with reason '{resp.stop_reason}'"
                    status_label = "failed"
                    break

                # Execute every tool_use block sequentially against the MCP
                # server (parallel calls aren't safe — wrangler dev runs on a
                # single isolate and our generated handlers may share state).
                tool_results: list[dict[str, Any]] = []
                for block in tool_use_blocks:
                    request_id = block.id
                    args_obj = block.input if isinstance(block.input, dict) else {}
                    yield _sse_frame(
                        "tool_call",
                        {
                            "request_id": request_id,
                            "name": block.name,
                            "args": args_obj,
                        },
                    )

                    call_started = time.perf_counter()
                    try:
                        envelope = await _execute_mcp_tool_call(
                            session.server_url, block, sandbox_credentials=None
                        )
                        ok = "error" not in envelope or envelope.get("error") is None
                    except Exception as exc:
                        envelope = {"error": {"message": str(exc), "code": -32000}}
                        ok = False
                    call_lat_ms = int((time.perf_counter() - call_started) * 1000)

                    jr_result = envelope.get("result")
                    if isinstance(jr_result, dict):
                        payload = jr_result.get("content") or jr_result
                    else:
                        payload = envelope.get("error") or envelope
                    truncated = json.dumps(payload)[:_TOOL_RESULT_TRUNCATE_CHARS]

                    trace_row = {
                        "n": len(traces) + 1,
                        "name": block.name,
                        "args": args_obj,
                        "in": usage_in,  # rough — Anthropic charges input on next turn
                        "out": len(truncated) // 4,  # cheap token estimate
                        "lat": call_lat_ms,
                        "ok": ok,
                    }
                    traces.append(trace_row)
                    yield _sse_frame(
                        "tool_result",
                        {
                            "request_id": request_id,
                            "lat_ms": call_lat_ms,
                            "ok": ok,
                            "content": truncated,
                        },
                    )

                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": request_id,
                            "content": truncated,
                        }
                    )

                messages.append({"role": "assistant", "content": resp.content})
                messages.append({"role": "user", "content": tool_results})
            else:
                failure_reason = "max_iterations reached without end_turn"
                status_label = "failed"
        except (APIStatusError, RateLimitError) as exc:
            status_label = "failed"
            failure_reason = f"anthropic_error: {type(exc).__name__}: {exc}"
        except Exception as exc:
            status_label = "failed"
            failure_reason = f"agent_loop_error: {exc}"
            log.exception("playground.agent_loop.error", extra={"job_id": session.job_id})

    yield _sse_frame(
        "done",
        {
            "status": status_label,
            "failure_reason": failure_reason,
            "total_in_tk": total_in,
            "total_out_tk": total_out,
            "total_lat_ms": total_lat,
            "agent_reply": final_text,
            "traces": traces,
        },
    )


# ─── TTL janitor ───────────────────────────────────────────────────────────


async def _ttl_janitor() -> None:
    """Background task: kill expired sessions every 60 seconds.

    Started from the FastAPI lifespan in main.py (mirrors the keepwarm
    pattern). Survives spawn errors per-session — never crashes the loop.
    """
    while True:
        try:
            await asyncio.sleep(60)
            now = datetime.now(UTC)
            expired: list[str] = []
            async with _SESSIONS_LOCK:
                for job_id, session in _SESSIONS.items():
                    if session.expires_at <= now:
                        expired.append(job_id)
            for job_id in expired:
                log.info("playground.session.expired", extra={"job_id": job_id})
                await _teardown_session(job_id)
        except asyncio.CancelledError:
            return
        except Exception:
            log.exception("playground.ttl_janitor.error")
            # Don't crash the janitor loop on transient failures.


_janitor_task: asyncio.Task[None] | None = None


def start_ttl_janitor() -> None:
    """Start the TTL background task. Idempotent."""
    global _janitor_task
    if _janitor_task is None or _janitor_task.done():
        _janitor_task = asyncio.create_task(_ttl_janitor(), name="playground-ttl-janitor")


async def stop_ttl_janitor() -> None:
    """Cancel the TTL janitor + tear down all live sessions."""
    global _janitor_task
    if _janitor_task is not None and not _janitor_task.done():
        _janitor_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _janitor_task
        _janitor_task = None
    # Drain remaining sessions so SIGTERM cascades fire on engine shutdown.
    job_ids: list[str]
    async with _SESSIONS_LOCK:
        job_ids = list(_SESSIONS.keys())
    for job_id in job_ids:
        await _teardown_session(job_id)


# ─── HTTP API ──────────────────────────────────────────────────────────────


router = APIRouter(prefix="/api/v1/playground", tags=["playground"])


class CreateSessionBody(BaseModel):
    job_id: str = Field(min_length=1, max_length=64)


class CreateSessionResponse(BaseModel):
    session_id: str
    expires_at: str
    tools: list[dict[str, Any]]


class InvokeBody(BaseModel):
    prompt: str = Field(min_length=1, max_length=8192)
    pinned_tool: str | None = Field(default=None, max_length=128)


@router.post("/sessions", response_model=CreateSessionResponse)
async def create_session_endpoint(body: CreateSessionBody) -> CreateSessionResponse:
    """Create or reuse a sandbox session for ``job_id``."""
    session = await _get_or_create_session(body.job_id)
    return CreateSessionResponse(
        session_id=session.job_id,
        expires_at=session.expires_at.isoformat(),
        tools=session.mcp_tools,
    )


@router.post("/sessions/{job_id}/invoke")
async def invoke_endpoint(job_id: str, body: InvokeBody) -> StreamingResponse:
    """Run a streaming agent loop against the sandbox session."""
    session = await _get_or_create_session(job_id)
    return StreamingResponse(
        _stream_agent_loop(session, body.prompt, body.pinned_tool),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/sessions/{job_id}")
async def teardown_endpoint(job_id: str) -> dict[str, Any]:
    """Explicit teardown — UI footer 'delete now' link."""
    found = await _teardown_session(job_id)
    return {"job_id": job_id, "found": found, "deleted_at": datetime.now(UTC).isoformat()}


# Test-only / introspection helper. Not registered on the router.
def _list_session_ids_for_test() -> list[str]:
    return list(_SESSIONS.keys())


# Suppress unused-import warning for uuid — kept available for callers that
# want to mint deterministic request_ids in extensions.
_ = uuid
