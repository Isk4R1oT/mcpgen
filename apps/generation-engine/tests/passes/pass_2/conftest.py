"""Pass 2 — pytest fixtures.

Wave-0 scaffolding: provides the canonical fixture set used by Plans 03-02 /
03-03 / 03-04 once Pass 2 implementation lands. All fixtures load from
`packages/engine-fixtures/stripe/` (Phase 2 hand-tuned ground truth) and
return validated Pydantic models.

Fixtures:
- `stripe_pass1_output` — `Pass1Output` for Stripe (6 universal + 3 actions).
- `stripe_raw_ir` — `RawIR` for Stripe.
- `httpx_mock_qwen` — pytest-httpx wrapper that mocks OpenRouter
  chat-completion responses in the PydanticAI tool-call shape.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from mcpgen_ir.types import Pass1Output, RawIR
from pytest_httpx import HTTPXMock

# tests/passes/pass_2/conftest.py → parents[5] is the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[5]
_STRIPE_FIXTURES = _REPO_ROOT / "packages" / "engine-fixtures" / "stripe"


def _load_json(name: str) -> dict[str, Any]:
    path = _STRIPE_FIXTURES / name
    if not path.exists():
        pytest.skip(f"Fixture {path} not yet hand-tuned (Phase 2 pending or moved)")
    parsed: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return parsed


@pytest.fixture
def stripe_pass1_output() -> Pass1Output:
    """Stripe Pass 1 output (6 universal + 3 actions, Phase 2 hand-tuned)."""
    return Pass1Output.model_validate(_load_json("pass-1-output.json"))


@pytest.fixture
def stripe_raw_ir() -> RawIR:
    """Stripe RawIR (Phase 2 hand-tuned ground truth)."""
    return RawIR.model_validate(_load_json("ir.json"))


@pytest.fixture
def httpx_mock_qwen(httpx_mock: HTTPXMock) -> Callable[[dict[str, Any]], None]:
    """Helper to mock OpenRouter chat-completion responses in PydanticAI shape.

    Returns a callable `add_qwen_response(content: dict)` that registers a
    single response. The body matches the PydanticAI tool-call shape:
    `{"choices": [{"message": {"tool_calls": [{"function": {"name":
    "final_result", "arguments": "<json-encoded content>"}}]}}]}`.
    """

    def add_qwen_response(content: dict[str, Any]) -> None:
        httpx_mock.add_response(
            method="POST",
            url="https://openrouter.ai/api/v1/chat/completions",
            json={
                "id": "chatcmpl-test",
                "object": "chat.completion",
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
                                        "arguments": json.dumps(content),
                                    },
                                }
                            ],
                        },
                        "finish_reason": "tool_calls",
                    }
                ],
                "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150},
            },
        )

    return add_qwen_response
