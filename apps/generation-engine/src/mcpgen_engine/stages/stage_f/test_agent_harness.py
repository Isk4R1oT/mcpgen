"""F3 test-agent harness (CONTEXT D-19).

Real Sonnet 4.5 (the documented Override doc §7.3 exception). Drives a
multi-turn agent loop driven by ``response.stop_reason``; records the full
trajectory for ``QualityReport`` debug + Phase-9 calibration.

Two distinct roles (do NOT collapse — see ``llm/test_agent.py`` docstring):

- **test AGENT** (this harness) → real Sonnet via ``AsyncAnthropic``.
- **LLM JUDGE** (``f3_agent_eval.py`` — Plan 05-07) → Qwen3-Coder via
  ``make_agent``; stays inside the Override doc §0 single-model invariant.

Loop pattern (RESEARCH §5.1, citing Anthropic's tool-use docs):

1. ``client.messages.create`` → response with ``stop_reason``.
2. ``stop_reason == "end_turn"`` → final answer recorded; loop exits.
3. ``stop_reason == "tool_use"`` → execute every ``ToolUseBlock`` against
   the MCP server via JSON-RPC ``tools/call``; append assistant + tool_result
   blocks to messages; loop continues.
4. Other stop reasons (``max_tokens``, ``pause_turn``, ``stop_sequence``) →
   recorded as terminated state; loop exits.
5. ``max_iterations`` reached → recorded as ``"max_iterations"``.

Tenacity wraps ``_agent_step`` with 3-attempt exponential backoff for
``RateLimitError`` / ``APIStatusError`` / ``httpx.NetworkError`` — defense
in depth on top of the SDK's built-in ``max_retries=2``.

Concurrency: callers cap parallel ``run_golden_task`` invocations at
``_AGENT_CONCURRENCY = 3`` per CONTEXT D-19 (Anthropic per-org rate limits).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, cast

import httpx
from anthropic import APIStatusError, RateLimitError
from anthropic.types import MessageParam, ToolParam, ToolUseBlock
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from mcpgen_engine.llm.sampling import F3_TEST_AGENT_SETTINGS
from mcpgen_engine.llm.test_agent import ANTHROPIC, SONNET_MODEL_ID

log = logging.getLogger(__name__)

# Anthropic per-org rate limits (CONTEXT D-19). Callers (Plan 05-07
# f3_agent_eval orchestrator) wrap parallel task runs in
# ``asyncio.Semaphore(_AGENT_CONCURRENCY)``.
_AGENT_CONCURRENCY: int = 3

# Per-call truncation cap on tool_result content. Sonnet's context window is
# generous but agent trajectory accumulates rapidly; 5000 chars/tool_result
# matches Phase 5 RESEARCH §5.1 budget. Callers needing the raw payload look
# at the recorded TaskTrajectory (raw upstream data lives in trajectory steps).
_TOOL_RESULT_TRUNCATE_CHARS: int = 5000


@dataclass(frozen=True)
class ToolCall:
    """Single tool call recorded during an agent turn."""

    tool_use_id: str
    tool_name: str
    args: dict[str, Any]


@dataclass(frozen=True)
class TrajectoryStep:
    """One agent turn (one ``messages.create`` round-trip)."""

    turn: int
    stop_reason: str
    text_content: str
    tool_calls: list[ToolCall] = field(default_factory=list)


@dataclass(frozen=True)
class TaskTrajectory:
    """Full per-task trajectory persisted into ``QualityReport`` debug payload."""

    steps: list[TrajectoryStep]
    tool_calls: list[ToolCall]  # flattened across all steps
    iteration_count: int
    terminated: str  # end_turn / tool_use / max_iterations / max_tokens / ...
    final_text: str | None


def _render_description_for_agent(description: dict[str, Any] | str | None) -> str:
    """Concatenate Pass 2 description components in stable order.

    Pass 2 emits ``ToolDescription`` as a structured dict
    (``purpose`` / ``guidelines`` / ``limitations`` / ``parameter_overview``).
    Anthropic's tool format wants a single string. We render a markdown-
    flavoured concatenation that preserves component boundaries — consistent
    with the F2 smell scan's prompt format so the agent sees the same surface.
    """
    if description is None:
        return ""
    if isinstance(description, str):
        return description
    parts: list[str] = []
    for key in ("purpose", "guidelines", "limitations", "parameter_overview"):
        val = description.get(key)
        if val:
            parts.append(f"## {key}\n{val}")
    return "\n\n".join(parts)


def mcp_tool_to_anthropic(mcp_tool: dict[str, Any]) -> dict[str, Any]:
    """Map an MCP ``FinalTool`` dict to Anthropic's tool format.

    MCP uses camelCase ``inputSchema``; Anthropic uses snake_case
    ``input_schema``. RESEARCH §5.3 — the conversion is mechanical.
    """
    return {
        "name": mcp_tool["name"],
        "description": _render_description_for_agent(mcp_tool.get("description")),
        "input_schema": mcp_tool.get("inputSchema", {}),
    }


async def _execute_mcp_tool_call(
    server_url: str,
    tool_use: ToolUseBlock,
    sandbox_credentials: dict[str, str] | None,
) -> dict[str, Any]:
    """POST ``tools/call`` JSON-RPC against the spawned MCP server.

    Pass-through credentials default — when ``sandbox_credentials`` carries a
    pre-formatted ``X-Upstream-Auth`` value, forward it as a header. The
    sandbox adapter (``stages/stage_f/sandbox/*.py``) is the source of truth
    for credential formatting — this function is dumb on purpose.

    Returns the raw JSON-RPC envelope so callers can inspect both
    ``result.content`` and ``error`` (MCP error shape) without losing context.
    """
    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool_use.name, "arguments": tool_use.input},
    }
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    # Sandbox credentials are pre-formatted by the sandbox adapter
    # (e.g. {"X-Upstream-Auth": "Bearer sk_test_..."}). Merge as-is.
    if sandbox_credentials:
        headers.update(sandbox_credentials)
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
        resp = await client.post(server_url, json=body, headers=headers)
        return resp.json()  # type: ignore[no-any-return]


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=10),
    retry=retry_if_exception_type((APIStatusError, RateLimitError, httpx.NetworkError)),
    reraise=True,
)
async def _agent_step(
    messages: Sequence[dict[str, Any]],
    anthropic_tools: list[dict[str, Any]],
) -> Any:
    """One Sonnet round-trip with retry on transient errors.

    Tenacity layered on top of the SDK's ``max_retries=2`` (RESEARCH §6.1):
    SDK handles 429/5xx with built-in backoff; tenacity catches network
    blips against the spawned ``wrangler dev`` subprocess + per-call
    ``RateLimitError`` slip-through.
    """
    return await ANTHROPIC.messages.create(
        model=SONNET_MODEL_ID,
        max_tokens=cast(int, F3_TEST_AGENT_SETTINGS["max_tokens"]),
        temperature=cast(float, F3_TEST_AGENT_SETTINGS["temperature"]),
        top_p=cast(float, F3_TEST_AGENT_SETTINGS["top_p"]),
        tools=cast(list[ToolParam], anthropic_tools),
        messages=cast(list[MessageParam], list(messages)),
    )


async def run_golden_task(
    *,
    task: dict[str, Any],
    server_url: str,
    mcp_tools: list[dict[str, Any]],
    sandbox_credentials: dict[str, str] | None = None,
) -> TaskTrajectory:
    """Drive a multi-turn Sonnet loop against a single golden task.

    Args:
        task: ``GoldenTask`` Pydantic dict (Plan 05-01) — at minimum carries
            ``prompt`` (str) + ``max_iterations`` (int, default 10).
        server_url: URL of the spawned tenant Worker
            (``http://127.0.0.1:{port}`` — yielded by
            ``server_runner.spawn_server``).
        mcp_tools: List of MCP ``FinalTool`` dicts (already converted from
            ``Pass5Output.final_tools``).
        sandbox_credentials: Optional pre-formatted upstream-auth header
            map (e.g. ``{"X-Upstream-Auth": "Bearer sk_test_..."}``).
            Plan 05-06 Task 3 sandbox adapters emit this shape.

    Returns:
        ``TaskTrajectory`` with full per-step record + termination cause.
    """
    anthropic_tools = [mcp_tool_to_anthropic(t) for t in mcp_tools]
    messages: list[dict[str, Any]] = [{"role": "user", "content": task["prompt"]}]
    steps: list[TrajectoryStep] = []
    all_tool_calls: list[ToolCall] = []
    max_iter = int(task.get("max_iterations", 10))

    for turn in range(max_iter):
        resp = await _agent_step(messages, anthropic_tools)
        text_content = ""
        step_tool_calls: list[ToolCall] = []
        for block in resp.content:
            btype = getattr(block, "type", "")
            if btype == "text":
                text_content += getattr(block, "text", "")
            elif btype == "tool_use":
                args_obj = block.input if isinstance(block.input, dict) else {}
                tc = ToolCall(
                    tool_use_id=block.id,
                    tool_name=block.name,
                    args=args_obj,
                )
                step_tool_calls.append(tc)
                all_tool_calls.append(tc)

        steps.append(
            TrajectoryStep(
                turn=turn,
                stop_reason=resp.stop_reason,
                text_content=text_content,
                tool_calls=step_tool_calls,
            )
        )

        if resp.stop_reason == "end_turn":
            return TaskTrajectory(
                steps=steps,
                tool_calls=all_tool_calls,
                iteration_count=turn + 1,
                terminated="end_turn",
                final_text=text_content,
            )

        if resp.stop_reason == "tool_use":
            # Execute every tool_use block against the MCP server.
            tool_results: list[dict[str, Any]] = []
            for block in resp.content:
                if getattr(block, "type", "") != "tool_use":
                    continue
                result = await _execute_mcp_tool_call(server_url, block, sandbox_credentials)
                # Unpack JSON-RPC envelope: prefer result.content; fallback to error.
                jr_result = result.get("result")
                if isinstance(jr_result, dict):
                    payload = jr_result.get("content") or jr_result
                else:
                    payload = result.get("error") or result
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(payload)[:_TOOL_RESULT_TRUNCATE_CHARS],
                    }
                )
            messages.append({"role": "assistant", "content": resp.content})
            messages.append({"role": "user", "content": tool_results})
            continue

        # Other stop reasons: max_tokens / pause_turn / stop_sequence.
        return TaskTrajectory(
            steps=steps,
            tool_calls=all_tool_calls,
            iteration_count=turn + 1,
            terminated=resp.stop_reason,
            final_text=text_content,
        )

    return TaskTrajectory(
        steps=steps,
        tool_calls=all_tool_calls,
        iteration_count=max_iter,
        terminated="max_iterations",
        final_text=None,
    )
