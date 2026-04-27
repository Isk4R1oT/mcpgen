"""Day-1 Qwen3-Coder smoke test (Pitfall #27 mitigation).

Requirements covered: GEN-13 prerequisite, OPS-03 fresh-session readiness.

Two tests live here:

1. `test_qwen3_coder_structured_output` — real-network end-to-end smoke against
   OpenRouter. Skipped when OPENROUTER_API_KEY is unset (or is the conftest
   placeholder) so that pre-API-key contributors are not blocked. Decorated
   with `requires_openrouter` + `skipif` rather than module-level `pytestmark`
   so the second test below can run unconditionally.

2. `test_extra_body_forwarded` (Phase 2 / Plan 02-01 / D-08 / Pitfall #2/B) —
   asserts the `extra_body.provider` pin from `mcpgen_engine.llm.sampling`
   round-trips into the OpenRouter chat-completions request body. Mocked via
   `pytest-httpx` so it runs on every CI run without a real API key. Fails
   fast if a future pydantic-ai bump silently drops `extra_body` propagation.

Phase 1 acceptance: test (1) exists and runs locally with a valid
OPENROUTER_API_KEY.
Phase 2 acceptance: test (1) runs in CI on every engine PR (wired in
Plan 02 main-ci.yml); test (2) gates every PR (no real key required).

NOTE: pydantic-ai 0.2.20 exports `OpenAIModel` (not `OpenAIChatModel`, which
is the newer 0.5+ API). When pydantic-ai is bumped, this file is the only
test to update.
"""

from __future__ import annotations

import json
import os

import pytest
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings
from pytest_httpx import HTTPXMock

from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import PASS_0_SETTINGS

# Skip the real-network smoke when no real key is present. The conftest
# `_sandbox_env` fixture sets a placeholder `sk-or-test-PLACEHOLDER` to allow
# module load tests for other files; we treat that placeholder as "no key".
_PLACEHOLDER = "sk-or-test-PLACEHOLDER"
_RAW_KEY = os.environ.get("OPENROUTER_API_KEY", "")
_HAS_REAL_KEY = bool(_RAW_KEY) and _RAW_KEY != _PLACEHOLDER


class ToolDescription(BaseModel):
    purpose: str
    when_to_use: list[str]


def _build_agent() -> Agent[None, ToolDescription]:
    provider = OpenAIProvider(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    model = OpenAIModel("qwen/qwen3-coder", provider=provider)
    return Agent(
        model=model,
        output_type=ToolDescription,
        system_prompt=(
            "You write tool descriptions for an MCP server. "
            "Output ONLY structured ToolDescription via the provided function call."
        ),
    )


SETTINGS = ModelSettings(temperature=0.3, top_p=0.9, max_tokens=256)


@pytest.mark.requires_openrouter
@pytest.mark.skipif(
    not _HAS_REAL_KEY,
    reason="OPENROUTER_API_KEY not set (or set to sandbox placeholder); "
    "Day-1 smoke test skipped",
)
async def test_qwen3_coder_structured_output() -> None:
    agent = _build_agent()
    # Provider routing pinning per Pitfall #2 + GEN-13 is exercised by
    # `test_extra_body_forwarded` below (mocked, runs always); this test
    # only verifies that the real-network call works end-to-end and that
    # PydanticAI structured output decodes cleanly.
    result = await agent.run(
        "Describe a tool called `customers_search` that searches Stripe customers by email.",
        model_settings=SETTINGS,
    )
    assert isinstance(result.output, ToolDescription)
    assert len(result.output.purpose) > 10
    assert len(result.output.when_to_use) > 0


async def test_extra_body_forwarded(httpx_mock: HTTPXMock) -> None:
    """D-08 / Pitfall B: assert provider routing pin reaches OpenRouter request body.

    Mocks the OpenRouter chat-completions endpoint with pytest-httpx,
    invokes a PydanticAI agent through the make_agent factory with
    PASS_0_SETTINGS, and asserts the intercepted request JSON body
    contains the exact `provider` dict from D-04.

    If pydantic-ai 0.2.x ever silently drops extra_body propagation,
    this test fails before merge.
    """
    # Mock OpenRouter chat-completions with a minimal function-call response.
    httpx_mock.add_response(
        method="POST",
        url="https://openrouter.ai/api/v1/chat/completions",
        json={
            "id": "test-resp",
            "object": "chat.completion",
            "created": 1735689600,  # Unix epoch — pydantic-ai parses this as datetime
            "model": "qwen/qwen3-coder",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "final_result",
                                    "arguments": json.dumps(
                                        {
                                            "purpose": "Search Stripe customers by email.",
                                            "when_to_use": [
                                                "When the user asks to find a customer.",
                                            ],
                                        }
                                    ),
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20},
        },
    )

    agent = make_agent(
        output_type=ToolDescription,
        system_prompt="test",
    )
    await agent.run("describe a tool", model_settings=PASS_0_SETTINGS)

    # Inspect the intercepted request — pytest-httpx exposes get_requests().
    requests = httpx_mock.get_requests()
    assert len(requests) >= 1, "expected at least one outbound HTTP request"
    chat_req = next(r for r in requests if r.url.path == "/api/v1/chat/completions")
    body = json.loads(chat_req.read())
    assert (
        "provider" in body
    ), f"extra_body.provider missing from request body: keys={list(body.keys())}"
    assert body["provider"] == {
        "order": ["atlas-cloud"],
        "allow_fallbacks": False,
        "quantizations": ["fp8"],
    }, f"provider routing mismatch: got {body['provider']!r}"
