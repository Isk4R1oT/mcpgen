"""Day-1 Sonnet smoke test — gates every Phase 5 PR.

Mirrors the role of ``test_smoke_qwen.py`` for the Anthropic SDK path. Verifies
that:

1. The pinned Sonnet model id (``claude-sonnet-4-5-20250929``) is reachable
   on the documented Override doc §7.3 path.
2. The Anthropic SDK tool-use loop pattern (``stop_reason == "tool_use"``)
   works end-to-end — Phase 5 F3 test-agent harness depends on this.
3. The ``llm.test_agent`` module load tolerates a missing
   ``ANTHROPIC_API_KEY`` (the placeholder pattern set in
   ``conftest.py``) so non-F3 tests can still import the module.

Cost per CI run: < $0.01 — one Sonnet call ≤ 200 tokens. Skipped (not
failed) when ``ANTHROPIC_API_KEY`` is absent or the placeholder, via the
``requires_anthropic`` marker routed through
``conftest.py::pytest_collection_modifyitems`` (T-5-03 mitigation).

Run locally with a real key:
    uv run pytest tests/test_smoke_sonnet.py -m requires_anthropic
"""

from __future__ import annotations

from typing import cast

import pytest
from anthropic.types import ToolParam, ToolUseBlock

from mcpgen_engine.llm.test_agent import ANTHROPIC, SONNET_MODEL_ID


def test_test_agent_module_imports_without_key() -> None:
    """Test 3 (unmarked — runs on every PR): import path smoke."""
    assert ANTHROPIC is not None
    assert SONNET_MODEL_ID == "claude-sonnet-4-5-20250929"


@pytest.mark.requires_anthropic
async def test_sonnet_reachable() -> None:
    """Test 1 (gated): smoke ping confirms Anthropic SDK + Sonnet snapshot reachable."""
    resp = await ANTHROPIC.messages.create(
        model=SONNET_MODEL_ID,
        max_tokens=64,
        messages=[{"role": "user", "content": "Say hello in one word."}],
    )
    assert resp.stop_reason in {"end_turn", "tool_use", "max_tokens"}
    assert len(resp.content) > 0


@pytest.mark.requires_anthropic
async def test_sonnet_tool_use_loop() -> None:
    """Test 2 (gated): tool-use round-trip — Phase 5 F3 test agent depends on this."""
    echo_tool = cast(
        ToolParam,
        {
            "name": "echo",
            "description": "Echo back the provided text.",
            "input_schema": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
                "additionalProperties": False,
            },
        },
    )
    resp = await ANTHROPIC.messages.create(
        model=SONNET_MODEL_ID,
        max_tokens=256,
        tools=[echo_tool],
        messages=[{"role": "user", "content": "Use the echo tool with text='hello'."}],
    )
    assert resp.stop_reason == "tool_use", f"expected tool_use, got {resp.stop_reason}"
    tool_use_blocks = [b for b in resp.content if isinstance(b, ToolUseBlock)]
    assert len(tool_use_blocks) >= 1
    assert tool_use_blocks[0].name == "echo"
