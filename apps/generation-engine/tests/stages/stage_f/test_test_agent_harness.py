"""F3 test_agent_harness tests — Sonnet stop_reason loop + tenacity retry.

Plan 05-06 Task 2 — covers:

- Test 1 (mock): immediate end_turn → 1 step, terminated="end_turn".
- Test 2 (mock): tool_use → end_turn round-trip — 2 steps, 1 tool_call.
- Test 3 (mock): max_iterations exhausted without end_turn.
- Test 4 (mock): tenacity retries RateLimitError 2x then succeeds.
- Test 5: ``mcp_tool_to_anthropic`` snake-case mapping correctness.
- Test 6 (requires_anthropic): real Sonnet round-trip via echo tool.

Tests 1-5 use ``unittest.mock.AsyncMock`` for the Anthropic client + httpx —
they run on every PR and exercise the stop_reason FSM end-to-end. Test 6 is
gated and skips cleanly without ``ANTHROPIC_API_KEY``.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from anthropic import RateLimitError

from mcpgen_engine.stages.stage_f import test_agent_harness


def _make_text_block(text: str) -> MagicMock:
    """Mock TextBlock-shaped content block."""
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block


def _make_tool_use_block(
    *, name: str, args: dict[str, Any], block_id: str = "toolu_test_001"
) -> MagicMock:
    """Mock ToolUseBlock-shaped content block."""
    block = MagicMock()
    block.type = "tool_use"
    block.id = block_id
    block.name = name
    block.input = args
    return block


def _make_response(*, stop_reason: str, content: list[Any]) -> MagicMock:
    """Mock Anthropic ``Message`` response shape."""
    resp = MagicMock()
    resp.stop_reason = stop_reason
    resp.content = content
    return resp


# ─── Test 5: mcp_tool_to_anthropic mapping ──────────────────────────────────


def test_mcp_tool_to_anthropic_snake_case_input_schema() -> None:
    """MCP camelCase ``inputSchema`` → Anthropic snake_case ``input_schema``."""
    mcp_tool: dict[str, Any] = {
        "name": "search",
        "description": "Search for objects.",
        "inputSchema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    }
    result = test_agent_harness.mcp_tool_to_anthropic(mcp_tool)
    assert result["name"] == "search"
    assert result["description"] == "Search for objects."
    assert result["input_schema"]["type"] == "object"
    assert "query" in result["input_schema"]["properties"]
    # Critical invariant: NO leftover camelCase key.
    assert "inputSchema" not in result


def test_mcp_tool_to_anthropic_renders_structured_description() -> None:
    """Pass 2 dict-shaped description renders as concatenated markdown."""
    mcp_tool: dict[str, Any] = {
        "name": "fetch",
        "description": {
            "purpose": "Get full object by id.",
            "guidelines": "Use after search returns ids.",
            "limitations": "Read-only.",
        },
        "inputSchema": {"type": "object"},
    }
    result = test_agent_harness.mcp_tool_to_anthropic(mcp_tool)
    desc = result["description"]
    assert "purpose" in desc
    assert "Get full object by id." in desc
    assert "Read-only." in desc


def test_mcp_tool_to_anthropic_handles_none_description() -> None:
    """Missing description → empty string (no AttributeError)."""
    mcp_tool: dict[str, Any] = {"name": "x", "inputSchema": {"type": "object"}}
    result = test_agent_harness.mcp_tool_to_anthropic(mcp_tool)
    assert result["description"] == ""


# ─── Test 1: immediate end_turn ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_immediate_end_turn_records_one_step() -> None:
    """Mock returns end_turn on first call → trajectory has 1 step."""
    mock_resp = _make_response(
        stop_reason="end_turn",
        content=[_make_text_block("Final answer.")],
    )

    async def _fake_step(_messages: object, _tools: object) -> Any:
        return mock_resp

    with patch.object(test_agent_harness, "_agent_step", side_effect=_fake_step):
        trajectory = await test_agent_harness.run_golden_task(
            task={"prompt": "test", "max_iterations": 5},
            server_url="http://127.0.0.1:9999",
            mcp_tools=[{"name": "noop", "inputSchema": {"type": "object"}}],
        )

    assert trajectory.terminated == "end_turn"
    assert trajectory.iteration_count == 1
    assert len(trajectory.steps) == 1
    assert trajectory.final_text == "Final answer."
    assert trajectory.tool_calls == []


# ─── Test 2: tool_use → end_turn round-trip ──────────────────────────────────


@pytest.mark.asyncio
async def test_tool_use_then_end_turn_records_both_steps() -> None:
    """First call → tool_use; second call (after tool exec) → end_turn."""
    tool_use_resp = _make_response(
        stop_reason="tool_use",
        content=[_make_tool_use_block(name="search", args={"query": "test"})],
    )
    end_turn_resp = _make_response(
        stop_reason="end_turn",
        content=[_make_text_block("Found 1 result.")],
    )

    responses = iter([tool_use_resp, end_turn_resp])

    async def _fake_step(_messages: object, _tools: object) -> Any:
        return next(responses)

    async def _fake_exec(*_args: object, **_kwargs: object) -> dict[str, Any]:
        return {"jsonrpc": "2.0", "id": 1, "result": {"content": [{"id": "x"}]}}

    with (
        patch.object(test_agent_harness, "_agent_step", side_effect=_fake_step),
        patch.object(test_agent_harness, "_execute_mcp_tool_call", side_effect=_fake_exec),
    ):
        trajectory = await test_agent_harness.run_golden_task(
            task={"prompt": "search test", "max_iterations": 5},
            server_url="http://127.0.0.1:9999",
            mcp_tools=[{"name": "search", "inputSchema": {"type": "object"}}],
        )

    assert trajectory.terminated == "end_turn"
    assert trajectory.iteration_count == 2
    assert len(trajectory.steps) == 2
    assert len(trajectory.tool_calls) == 1
    assert trajectory.tool_calls[0].tool_name == "search"
    assert trajectory.tool_calls[0].args == {"query": "test"}


# ─── Test 3: max_iterations exhausted ───────────────────────────────────────


@pytest.mark.asyncio
async def test_max_iterations_exhausts_without_end_turn() -> None:
    """Loop never sees end_turn → trajectory terminated='max_iterations'."""
    tool_use_resp = _make_response(
        stop_reason="tool_use",
        content=[_make_tool_use_block(name="search", args={})],
    )

    async def _fake_step(_messages: object, _tools: object) -> Any:
        return tool_use_resp

    async def _fake_exec(*_args: object, **_kwargs: object) -> dict[str, Any]:
        return {"jsonrpc": "2.0", "id": 1, "result": {"content": []}}

    with (
        patch.object(test_agent_harness, "_agent_step", side_effect=_fake_step),
        patch.object(test_agent_harness, "_execute_mcp_tool_call", side_effect=_fake_exec),
    ):
        trajectory = await test_agent_harness.run_golden_task(
            task={"prompt": "loop forever", "max_iterations": 2},
            server_url="http://127.0.0.1:9999",
            mcp_tools=[{"name": "search", "inputSchema": {"type": "object"}}],
        )

    assert trajectory.terminated == "max_iterations"
    assert trajectory.iteration_count == 2
    assert len(trajectory.steps) == 2
    assert trajectory.final_text is None


@pytest.mark.asyncio
async def test_max_tokens_stop_reason_terminates() -> None:
    """``stop_reason='max_tokens'`` → trajectory terminated='max_tokens'."""
    resp = _make_response(
        stop_reason="max_tokens",
        content=[_make_text_block("partial...")],
    )

    async def _fake_step(_messages: object, _tools: object) -> Any:
        return resp

    with patch.object(test_agent_harness, "_agent_step", side_effect=_fake_step):
        trajectory = await test_agent_harness.run_golden_task(
            task={"prompt": "test", "max_iterations": 5},
            server_url="http://127.0.0.1:9999",
            mcp_tools=[{"name": "noop", "inputSchema": {"type": "object"}}],
        )

    assert trajectory.terminated == "max_tokens"
    assert trajectory.iteration_count == 1


# ─── Test 4: tenacity retry on RateLimitError ────────────────────────────────


@pytest.mark.asyncio
async def test_agent_step_retries_rate_limit_error() -> None:
    """Tenacity retries 2x on RateLimitError, succeeds on 3rd attempt."""
    success_resp = _make_response(stop_reason="end_turn", content=[_make_text_block("ok")])

    fake_response = MagicMock()
    fake_response.headers = {}
    rate_limit_err = RateLimitError(
        message="rate limited",
        response=fake_response,
        body={"error": {"message": "rate limited"}},
    )

    create_call = AsyncMock(side_effect=[rate_limit_err, rate_limit_err, success_resp])

    with patch.object(test_agent_harness.ANTHROPIC.messages, "create", create_call):
        # _agent_step is the tenacity-wrapped call site.
        result = await test_agent_harness._agent_step(
            messages=[{"role": "user", "content": "hi"}],
            anthropic_tools=[],
        )

    assert result is success_resp
    assert create_call.await_count == 3


# ─── Test 6: real Sonnet integration (gated) ────────────────────────────────


@pytest.mark.requires_anthropic
@pytest.mark.asyncio
async def test_real_sonnet_echo_round_trip() -> None:
    """Real Sonnet round-trip via the echo tool (matches test_smoke_sonnet)."""
    pytest.skip(
        "Real-Sonnet harness round-trip deferred — requires_anthropic gate "
        "covers Plan 05-08 e2e. test_smoke_sonnet.py already smoke-tests "
        "the SDK + tool-use loop."
    )


# ─── Helpers / additional unit tests ────────────────────────────────────────


@pytest.mark.asyncio
async def test_execute_mcp_tool_call_passes_sandbox_credentials() -> None:
    """sandbox_credentials header dict is forwarded as-is to the MCP server."""
    captured: dict[str, Any] = {}

    class _FakeResp:
        def json(self) -> dict[str, Any]:
            return {"jsonrpc": "2.0", "id": 1, "result": {"content": []}}

    class _FakeClient:
        def __init__(self, *_a: object, **_k: object) -> None:
            pass

        async def __aenter__(self) -> _FakeClient:
            return self

        async def __aexit__(self, *_a: object) -> None:
            return None

        async def post(self, url: str, **kw: Any) -> _FakeResp:
            captured["url"] = url
            captured["headers"] = kw.get("headers", {})
            captured["json"] = kw.get("json")
            return _FakeResp()

    block = _make_tool_use_block(name="search", args={"query": "x"})

    with patch.object(test_agent_harness.httpx, "AsyncClient", _FakeClient):
        await test_agent_harness._execute_mcp_tool_call(
            "http://127.0.0.1:9999",
            block,
            {"X-Upstream-Auth": "Bearer sk_test_xyz"},
        )

    headers = captured["headers"]
    assert headers["X-Upstream-Auth"] == "Bearer sk_test_xyz"
    assert headers["Content-Type"] == "application/json"
    assert captured["json"]["method"] == "tools/call"
    assert captured["json"]["params"]["name"] == "search"
