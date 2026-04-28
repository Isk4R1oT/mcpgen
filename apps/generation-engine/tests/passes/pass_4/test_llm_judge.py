"""Pass 4 — tests for llm_judge.py (selective Qwen judgment for medium-confidence verbs).

Threats covered:
- T-03-OW (D-27): ``_LlmJudgeOutput`` Pydantic schema MUST omit
  ``openWorldHint`` (verified at ``model_fields`` level).
- T-03-VP (D-29): conservative defaults exactly match the design table.
- Pitfall #2: ``model_settings=PASS_4_SETTINGS`` reaches the OpenRouter
  request body (provider routing + max_tokens=512 verifies the right
  ``ModelSettings`` instance was used).

Mocks OpenRouter via pytest-httpx; no real API calls.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest
from mcpgen_ir.types import Descriptions, Pass2Output
from pytest_httpx import HTTPXMock

from mcpgen_engine.passes.pass_4 import llm_judge
from mcpgen_engine.passes.pass_4.llm_judge import (
    _CONSERVATIVE_DEFAULTS,
    PASS_4_JUDGE_AGENT,
    PASS_4_JUDGE_CONCURRENCY,
    _judge_one,
    _LlmJudgeOutput,
    judge_action_tools,
)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ─────────────────────────── _LlmJudgeOutput shape ──────────────────────────


def test_llm_judge_output_omits_open_world_hint_field() -> None:
    """D-27 invariant: openWorldHint MUST NOT be a field on _LlmJudgeOutput.

    The IR construction site (consistency.assemble_annotations_with_open_world_hint)
    adds openWorldHint=True Python-side. The LLM never gets a chance to set it.
    """
    fields = set(_LlmJudgeOutput.model_fields.keys())
    assert fields == {"readOnlyHint", "destructiveHint", "idempotentHint", "rationale"}
    assert "openWorldHint" not in fields


def test_llm_judge_output_extra_forbid() -> None:
    """ConfigDict(extra='forbid') rejects any unexpected field at decode time."""
    config = _LlmJudgeOutput.model_config
    assert config.get("extra") == "forbid"


def test_pass_4_judge_concurrency_constant_is_5() -> None:
    """D-26 Phase 2: per-pass concurrency cap is exactly 5."""
    assert PASS_4_JUDGE_CONCURRENCY == 5


def test_conservative_defaults_match_d29() -> None:
    """D-29: conservative defaults are (False, True, False) — UX safety."""
    assert _CONSERVATIVE_DEFAULTS == {
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": False,
    }


def test_pass_4_judge_agent_is_singleton() -> None:
    """Module-level Agent singleton is constructed exactly once at import."""
    assert PASS_4_JUDGE_AGENT is llm_judge.PASS_4_JUDGE_AGENT


# ─────────────────────────── Helpers ───────────────────────────────────────


def _qwen_response(content: dict[str, Any]) -> dict[str, Any]:
    """OpenRouter chat-completion JSON in PydanticAI tool-call shape."""
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 1735689600,
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
    }


def _make_pass2_output(descriptions: dict[str, Descriptions]) -> Pass2Output:
    return Pass2Output(descriptions=descriptions)


def _make_description(purpose: str = "X" * 25) -> Descriptions:
    return Descriptions(
        purpose=purpose,
        when_to_use=["x"],
        limitations=[],
        parameter_overview="Y" * 60,
        description_hash="hash_test",
    )


# ─────────────────────────── _judge_one happy path ──────────────────────────


async def test_judge_one_happy_path(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_qwen_response(
            {
                "readOnlyHint": False,
                "destructiveHint": False,
                "idempotentHint": True,
                "rationale": "Send is idempotent because the upstream dedupes.",
            }
        ),
    )
    triple = await _judge_one("messages_send", None)
    assert triple == {
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
    }


# ─────────────────────── Validation failure → conservative ───────────────────


async def test_judge_one_pydantic_validation_error_falls_back_to_conservative(
    httpx_mock: HTTPXMock,
) -> None:
    """LLM returns a non-coercible value → ValidationError after all retries
    → conservative defaults per D-29."""
    # `banana` is not coercible to bool by Pydantic v2. The agent's internal
    # `max_result_retries` will replay the request a bounded number of times;
    # is_reusable=True lets the mock serve every replay.
    bad_payload = _qwen_response(
        {
            "readOnlyHint": "banana",  # not coercible to bool
            "destructiveHint": False,
            "idempotentHint": False,
            "rationale": "junk",
        }
    )
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=bad_payload,
        is_reusable=True,
    )
    triple = await _judge_one("messages_send", None)
    assert triple == _CONSERVATIVE_DEFAULTS


async def test_judge_one_transient_http_error_falls_back_after_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Persistent transient HTTP error → conservative defaults after retries.

    Mocks at the Agent layer because the OpenAI client wraps any underlying
    ``httpx.HTTPError`` into ``openai.APIConnectionError`` (a non-httpx
    exception type) BEFORE it can reach our retry loop. Patching the agent
    directly with an ``httpx.HTTPError`` lets us exercise the retry +
    fallback path the production code is designed for (e.g. when a custom
    httpx hook re-raises pre-OpenAI-wrapping).
    """
    monkeypatch.setattr(asyncio, "sleep", _noop_sleep)

    async def always_fail(*_args: object, **_kwargs: object) -> None:
        raise httpx.ConnectError("simulated connection refused")

    monkeypatch.setattr(llm_judge.PASS_4_JUDGE_AGENT, "run", always_fail)
    triple = await _judge_one("messages_send", None)
    assert triple == _CONSERVATIVE_DEFAULTS


async def _noop_sleep(_seconds: float) -> None:
    return None


# ─────────────────────────── judge_action_tools API ─────────────────────────


async def test_judge_action_tools_empty_returns_empty_dict() -> None:
    result = await judge_action_tools([], None)
    assert result == {}


async def test_judge_action_tools_uses_pass_2_descriptions(
    httpx_mock: HTTPXMock,
) -> None:
    """Pass 2 description excerpt MUST appear in the prompt sent to the LLM."""
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_qwen_response(
            {
                "readOnlyHint": False,
                "destructiveHint": False,
                "idempotentHint": False,
                "rationale": "x",
            }
        ),
    )
    description_purpose = "MARKER_PURPOSE_FOR_PROMPT_INJECTION_TEST_1234567890"
    pass_2 = _make_pass2_output({"tool_a": _make_description(purpose=description_purpose)})
    await judge_action_tools(["tool_a"], pass_2)

    # Verify prompt body contains the description excerpt.
    requests = httpx_mock.get_requests()
    assert len(requests) >= 1
    body = json.loads(requests[0].read())
    user_text = json.dumps(body)
    assert description_purpose in user_text


async def test_judge_action_tools_concurrency_capped_at_5(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Supply 15 tool names; assert max in-flight count never exceeds 5."""
    in_flight = 0
    max_in_flight = 0
    lock = asyncio.Lock()

    async def fake_judge_one(_name: str, _desc: str | None) -> dict[str, bool]:
        nonlocal in_flight, max_in_flight
        async with lock:
            in_flight += 1
            max_in_flight = max(max_in_flight, in_flight)
        # Yield to scheduler so other coros can pile up to the cap.
        await asyncio.sleep(0.01)
        async with lock:
            in_flight -= 1
        return {
            "readOnlyHint": False,
            "destructiveHint": False,
            "idempotentHint": False,
        }

    monkeypatch.setattr(llm_judge, "_judge_one", fake_judge_one)

    names = [f"tool_{i}" for i in range(15)]
    await judge_action_tools(names, None)
    assert max_in_flight <= PASS_4_JUDGE_CONCURRENCY
    assert max_in_flight >= 1  # sanity — concurrency actually ran


async def test_judge_action_tools_returns_all_names(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every input name MUST appear in the output dict."""

    async def fake_judge_one(_name: str, _desc: str | None) -> dict[str, bool]:
        return {
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
        }

    monkeypatch.setattr(llm_judge, "_judge_one", fake_judge_one)
    names = ["a", "b", "c"]
    result = await judge_action_tools(names, None)
    assert set(result.keys()) == set(names)


# ─────────────────────────── PASS_4_SETTINGS forwarded ──────────────────────


async def test_uses_pass_4_settings_provider_routing(httpx_mock: HTTPXMock) -> None:
    """Pitfall #2: PASS_4_SETTINGS reaches the request body (provider routing
    + max_tokens=512 are unique to PASS_4_SETTINGS vs other pass settings)."""
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_qwen_response(
            {
                "readOnlyHint": False,
                "destructiveHint": False,
                "idempotentHint": False,
                "rationale": "x",
            }
        ),
    )
    await _judge_one("messages_send", None)
    requests = httpx_mock.get_requests()
    body = json.loads(requests[0].read())
    # PASS_4_SETTINGS embeds _PROVIDER_ROUTING.
    assert body.get("provider") == {
        "order": ["atlas-cloud"],
        "allow_fallbacks": False,
        "quantizations": ["fp8"],
    }
    # PASS_4_SETTINGS uses max_tokens=512 (PydanticAI sends as max_completion_tokens).
    # Either field must equal 512.
    candidate_keys = ("max_tokens", "max_completion_tokens")
    matched = [k for k in candidate_keys if body.get(k) == 512]
    assert matched, f"expected max_tokens=512 in body keys={list(body.keys())}"


# ─────────────────────────── Module integration ─────────────────────────────


def test_module_uses_make_agent_only() -> None:
    """Smoke test: PASS_4_JUDGE_AGENT is a pydantic_ai.Agent instance."""
    from pydantic_ai import Agent as _Agent

    assert isinstance(PASS_4_JUDGE_AGENT, _Agent)


# ──────────────── PASS_4_SETTINGS object identity preserved ────────────────


def test_pass_4_settings_is_imported_from_sampling() -> None:
    """The judge module imports PASS_4_SETTINGS from llm.sampling, not a local copy."""
    from mcpgen_engine.llm import sampling as _sampling
    from mcpgen_engine.passes.pass_4 import llm_judge as _judge

    # Module-level reference: the name `PASS_4_SETTINGS` should resolve to
    # the same object via the sampling import path.
    assert _judge.PASS_4_SETTINGS is _sampling.PASS_4_SETTINGS  # type: ignore[attr-defined]
