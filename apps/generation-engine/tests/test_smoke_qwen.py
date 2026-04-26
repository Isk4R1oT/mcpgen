"""Day-1 Qwen3-Coder smoke test (Pitfall #27 mitigation).

Requirements covered: GEN-13 prerequisite, OPS-03 fresh-session readiness.
Skipped when OPENROUTER_API_KEY is unset (or set to the conftest placeholder)
so that pre-API-key contributors are not blocked.

Phase 1 acceptance: this test EXISTS and runs locally with a valid
OPENROUTER_API_KEY.
Phase 2 acceptance: this test runs in CI on every engine PR (already wired
in Plan 02 main-ci.yml).

NOTE: pydantic-ai 0.2.20 exports `OpenAIModel` (not `OpenAIChatModel`, which
is the newer 0.5+ API). When pydantic-ai is bumped, this file is the only
test to update.
"""

from __future__ import annotations

import os

import pytest
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings

# Skip when no real key is present. The conftest `_sandbox_env` fixture sets a
# placeholder `sk-or-test-PLACEHOLDER` to allow module load tests for other
# files; we treat that placeholder as "no key" here.
_PLACEHOLDER = "sk-or-test-PLACEHOLDER"
_RAW_KEY = os.environ.get("OPENROUTER_API_KEY", "")
_HAS_REAL_KEY = bool(_RAW_KEY) and _RAW_KEY != _PLACEHOLDER

pytestmark = [
    pytest.mark.requires_openrouter,
    pytest.mark.skipif(
        not _HAS_REAL_KEY,
        reason="OPENROUTER_API_KEY not set (or set to sandbox placeholder); "
        "Day-1 smoke test skipped",
    ),
]


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


async def test_qwen3_coder_structured_output() -> None:
    agent = _build_agent()
    # Provider routing pinning per Pitfall #2 + GEN-13 lands in Phase 2; the
    # Phase 1 smoke test only verifies that the call works end-to-end against
    # OpenRouter and that PydanticAI structured output decodes cleanly.
    result = await agent.run(
        "Describe a tool called `customers_search` that searches Stripe customers by email.",
        model_settings=SETTINGS,
    )
    assert isinstance(result.output, ToolDescription)
    assert len(result.output.purpose) > 10
    assert len(result.output.when_to_use) > 0
