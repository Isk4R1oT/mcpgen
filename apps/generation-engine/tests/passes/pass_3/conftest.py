"""Pass 3 — pytest fixtures.

Wave-0 scaffolding: provides the canonical fixture set used by Plans 03-05 /
03-06 / 03-07 / 03-08 / 03-09 once Pass 3 implementation lands. Mirrors the
Pass 2 conftest plus a `stripe_pass2_output` fixture (skips if the
hand-tuned Pass 2 fixture file isn't yet committed in
`packages/engine-fixtures/stripe/pass-2-output.json` — that fixture lands
in Plan 03-12 alongside the Pass 2 implementation freeze).

Fixtures:
- `stripe_pass1_output` — `Pass1Output` for Stripe.
- `stripe_raw_ir` — `RawIR` for Stripe.
- `stripe_pass2_output` — `Pass2Output` (skip if missing — Plan 03-12 lands it).
- `httpx_mock_qwen` — pytest-httpx wrapper for OpenRouter chat-completion mocks.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from mcpgen_ir.types import Pass1Output, Pass2Output, RawIR
from pytest_httpx import HTTPXMock

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
    return Pass1Output.model_validate(_load_json("pass-1-output.json"))


@pytest.fixture
def stripe_raw_ir() -> RawIR:
    return RawIR.model_validate(_load_json("ir.json"))


@pytest.fixture
def stripe_pass2_output() -> Pass2Output:
    """Stripe Pass 2 output (Plan 03-12 hand-tunes; skips until then)."""
    return Pass2Output.model_validate(_load_json("pass-2-output.json"))


@pytest.fixture
def httpx_mock_qwen(httpx_mock: HTTPXMock) -> Callable[[dict[str, Any]], None]:
    """Helper to mock OpenRouter chat-completion responses in PydanticAI shape."""

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
