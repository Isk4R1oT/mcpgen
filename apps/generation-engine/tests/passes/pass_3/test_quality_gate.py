"""Pass 3 quality_gate.py — single Qwen judge with parameter-specific 5-component rubric tests.

Verifies:
- ``_RUBRIC_THRESHOLD_PASS_3 = 3`` (D-16).
- ``_MAX_GATE_RETRIES_PASS_3 = 1`` (D-16).
- ``QUALITY_GATE_CONCURRENCY_PASS_3 = 10``.
- ``_GateScoresPass3`` schema is closed (extra='forbid').
- ``_judge_one_pass_3`` passes when all 5 scores >= 3; fails when any < 3.
- ``quality_gate_all_tools`` no-retry path (all schemas pass first try).
- Retry path that recovers (judge fails, second judge call passes →
  ``quality_warnings[name] = False``).
- Retry path that fails (judge fails both attempts →
  ``quality_warnings[name] = True``).
- ``INLINE_GATE_SETTINGS`` is the model_settings used in judge calls.
- ``_build_judge_prompt_pass_3`` truncates very large schema JSON.

All LLM responses are mocked via the ``httpx_mock`` fixture (no real
OpenRouter calls) OR via ``monkeypatch`` of ``_judge_one_pass_3`` for the
fan-out tests where call counting matters.

References:
- 03-CONTEXT.md D-16 (Phase 4 verbatim)
- docs/mcpgen-pass-3-design.md §1 (5 dimensions)
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest
from mcpgen_ir.types import (
    Pass1Output,
    Routing1,
    Rule1,
    SmartId,
    Tool1,
    Type,
    UniversalTool,
)
from pytest_httpx import HTTPXMock

from mcpgen_engine.llm.sampling import INLINE_GATE_SETTINGS
from mcpgen_engine.passes.pass_3 import quality_gate
from mcpgen_engine.passes.pass_3.quality_gate import (
    _GATE_SYSTEM_PROMPT_PASS_3,
    _MAX_GATE_RETRIES_PASS_3,
    _QUALITY_GATE_AGENT_PASS_3,
    _RUBRIC_THRESHOLD_PASS_3,
    QUALITY_GATE_CONCURRENCY_PASS_3,
    _build_judge_prompt_pass_3,
    _GateScoresPass3,
    _judge_one_pass_3,
    quality_gate_all_tools,
)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ─────────────────────────── Fixture builders ──────────────────────────────


def _mock_openrouter_function_call(
    payload: dict[str, Any], call_id: str = "call_1"
) -> dict[str, Any]:
    return {
        "id": "test-resp",
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
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": "final_result",
                                "arguments": json.dumps(payload),
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 10,
            "total_tokens": 20,
        },
    }


def _make_schema(name: str = "search") -> dict[str, Any]:
    """Minimal valid input schema for the judge to score."""
    return {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": (
                    "Search query string. Returns ranked results with smart IDs. "
                    f"Use natural-language phrasing for {name}."
                ),
            }
        },
        "required": ["query"],
        "additionalProperties": False,
    }


def _make_pass1_output() -> Pass1Output:
    smart_id = SmartId(
        format="{server}:{type}:{collection}:{identifier}",
        types=["object"],
        collections=["charge"],
    )
    return Pass1Output(
        tools=[
            Tool1(
                name="search",
                type=Type.universal,
                source_endpoints=["GET /v1/charges"],
            )
        ],
        routing=Routing1(
            smart_id=smart_id,
            rules=[
                Rule1(
                    universal_tool=UniversalTool.search,
                    target_endpoint="GET /v1/charges",
                    params_mapping={},
                )
            ],
        ),
        workflows=[],
        coverage_pct=100.0,
        coverage_proof=[],
    )


# ───────────────────────── Module-level constants ──────────────────────────


def test_rubric_threshold_pass_3_is_3() -> None:
    assert _RUBRIC_THRESHOLD_PASS_3 == 3


def test_max_gate_retries_pass_3_is_1() -> None:
    assert _MAX_GATE_RETRIES_PASS_3 == 1


def test_quality_gate_concurrency_pass_3_is_10() -> None:
    assert QUALITY_GATE_CONCURRENCY_PASS_3 == 10


def test_gate_agent_singleton_constructed() -> None:
    assert _QUALITY_GATE_AGENT_PASS_3 is not None


def test_gate_system_prompt_mentions_5_dimensions() -> None:
    """Pass 3 design §1 — five rubric dimensions."""
    assert "naming" in _GATE_SYSTEM_PROMPT_PASS_3
    assert "format" in _GATE_SYSTEM_PROMPT_PASS_3
    assert "enums" in _GATE_SYSTEM_PROMPT_PASS_3
    assert "defaults" in _GATE_SYSTEM_PROMPT_PASS_3
    assert "description" in _GATE_SYSTEM_PROMPT_PASS_3


def test_gate_scores_schema_is_closed() -> None:
    """``extra='forbid'`` so any LLM drift is rejected at decode time."""
    with pytest.raises(Exception):  # noqa: B017,PT011 — Pydantic raises here
        _GateScoresPass3.model_validate(
            {
                "naming": 4,
                "format": 4,
                "enums": 4,
                "defaults": 4,
                "description": 4,
                "rationale": "ok",
                "rogue_field": "should be rejected",
            }
        )


def test_gate_scores_schema_clamps_to_1_5() -> None:
    """``Field(ge=1, le=5)`` rejects out-of-range values."""
    with pytest.raises(Exception):  # noqa: B017,PT011 — Pydantic raises here
        _GateScoresPass3.model_validate(
            {
                "naming": 6,  # out of range
                "format": 4,
                "enums": 4,
                "defaults": 4,
                "description": 4,
                "rationale": "ok",
            }
        )


# ──────────────────────── _build_judge_prompt_pass_3 ───────────────────────


def test_build_judge_prompt_includes_tool_name_and_schema() -> None:
    schema = _make_schema()
    prompt = _build_judge_prompt_pass_3("search", schema)
    assert "Tool: search" in prompt
    assert "query" in prompt  # schema content embedded


def test_judge_prompt_truncates_huge_schema() -> None:
    """Schemas with very large JSON serialization are truncated to keep
    the prompt under the model's context budget."""
    huge_props = {f"prop_{i}": {"type": "string"} for i in range(2000)}
    huge_schema = {"type": "object", "properties": huge_props}
    prompt = _build_judge_prompt_pass_3("noop", huge_schema)
    # Truncation marker is present.
    assert "(truncated for judge prompt)" in prompt
    # Total prompt length is bounded (8000 schema cap + ~200 chars of
    # template = well under 9000 chars).
    assert len(prompt) < 9000


def test_judge_prompt_no_truncation_for_small_schema() -> None:
    schema = _make_schema()
    prompt = _build_judge_prompt_pass_3("search", schema)
    assert "(truncated for judge prompt)" not in prompt


# ──────────────────────────── _judge_one_pass_3 ────────────────────────────


async def test_judge_one_passes_when_all_5_scores_at_or_above_3(
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(
            {
                "naming": 3,
                "format": 4,
                "enums": 5,
                "defaults": 3,
                "description": 4,
                "rationale": "all components at or above threshold",
            }
        ),
    )
    passes, scores = await _judge_one_pass_3("search", _make_schema())
    assert passes is True
    assert scores.naming == 3
    assert scores.enums == 5


async def test_judge_one_fails_when_any_score_below_3(
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(
            {
                "naming": 2,  # below threshold
                "format": 4,
                "enums": 4,
                "defaults": 4,
                "description": 4,
                "rationale": "naming is too vague",
            }
        ),
    )
    passes, scores = await _judge_one_pass_3("search", _make_schema())
    assert passes is False
    assert scores.naming == 2


async def test_judge_one_fails_when_description_below_3(
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(
            {
                "naming": 5,
                "format": 5,
                "enums": 5,
                "defaults": 5,
                "description": 2,
                "rationale": "descriptions don't follow MCP-Bundles template",
            }
        ),
    )
    passes, _ = await _judge_one_pass_3("search", _make_schema())
    assert passes is False


async def test_judge_one_uses_inline_gate_settings(
    httpx_mock: HTTPXMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Capture the model_settings arg passed to agent.run; assert it IS
    the INLINE_GATE_SETTINGS singleton (object identity)."""
    captured: dict[str, Any] = {}

    original_run = _QUALITY_GATE_AGENT_PASS_3.run

    async def spy_run(prompt: str, **kwargs: Any) -> Any:
        captured["model_settings"] = kwargs.get("model_settings")
        return await original_run(prompt, **kwargs)

    monkeypatch.setattr(_QUALITY_GATE_AGENT_PASS_3, "run", spy_run)
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(
            {
                "naming": 4,
                "format": 4,
                "enums": 4,
                "defaults": 4,
                "description": 4,
                "rationale": "ok",
            }
        ),
    )
    await _judge_one_pass_3("search", _make_schema())
    assert captured["model_settings"] is INLINE_GATE_SETTINGS


# ────────────────────────── quality_gate_all_tools ─────────────────────────


async def test_quality_gate_all_tools_no_retry_when_all_pass(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """3 schemas, all pass first try → 3 judge calls total, no warnings."""
    call_count = 0

    async def fake_judge(
        name: str,  # noqa: ARG001
        schema: dict[str, Any],  # noqa: ARG001
    ) -> tuple[bool, _GateScoresPass3]:
        nonlocal call_count
        call_count += 1
        return True, _GateScoresPass3(
            naming=4,
            format=4,
            enums=4,
            defaults=4,
            description=4,
            rationale="ok",
        )

    monkeypatch.setattr(quality_gate, "_judge_one_pass_3", fake_judge)

    schemas = {
        "search": _make_schema("search"),
        "fetch": _make_schema("fetch"),
        "list_objects": _make_schema("list_objects"),
    }
    warnings = await quality_gate_all_tools(schemas, _make_pass1_output())
    assert call_count == 3
    assert warnings == {"search": False, "fetch": False, "list_objects": False}


async def test_quality_gate_all_tools_retries_then_passes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """1 schema; judge fails on attempt 1, passes on attempt 2 →
    ``quality_warnings[name] = False`` and 2 judge calls happened."""
    call_count = 0

    async def fake_judge(
        name: str,  # noqa: ARG001
        schema: dict[str, Any],  # noqa: ARG001
    ) -> tuple[bool, _GateScoresPass3]:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return False, _GateScoresPass3(
                naming=2,
                format=4,
                enums=4,
                defaults=4,
                description=4,
                rationale="poor first time",
            )
        return True, _GateScoresPass3(
            naming=4,
            format=4,
            enums=4,
            defaults=4,
            description=4,
            rationale="ok second time",
        )

    monkeypatch.setattr(quality_gate, "_judge_one_pass_3", fake_judge)

    warnings = await quality_gate_all_tools({"search": _make_schema()}, _make_pass1_output())
    assert call_count == 2
    assert warnings == {"search": False}


async def test_quality_gate_all_tools_retries_then_still_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Judge fails twice → ``quality_warnings[name] = True``, 2 judge calls."""
    call_count = 0

    async def fake_judge(
        name: str,  # noqa: ARG001
        schema: dict[str, Any],  # noqa: ARG001
    ) -> tuple[bool, _GateScoresPass3]:
        nonlocal call_count
        call_count += 1
        return False, _GateScoresPass3(
            naming=2,
            format=2,
            enums=2,
            defaults=2,
            description=2,
            rationale="bad",
        )

    monkeypatch.setattr(quality_gate, "_judge_one_pass_3", fake_judge)

    warnings = await quality_gate_all_tools({"search": _make_schema()}, _make_pass1_output())
    assert call_count == 2  # initial + 1 retry per D-16
    assert warnings == {"search": True}


async def test_quality_gate_all_tools_empty_dict() -> None:
    """No schemas → empty warnings, no LLM calls."""
    warnings = await quality_gate_all_tools({}, _make_pass1_output())
    assert warnings == {}


async def test_quality_gate_all_tools_respects_external_semaphore(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Caller-supplied semaphore is honored (concurrency cap is observed)."""
    in_flight = 0
    max_in_flight = 0

    async def fake_judge(
        name: str,  # noqa: ARG001
        schema: dict[str, Any],  # noqa: ARG001
    ) -> tuple[bool, _GateScoresPass3]:
        nonlocal in_flight, max_in_flight
        in_flight += 1
        max_in_flight = max(max_in_flight, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        return True, _GateScoresPass3(
            naming=4,
            format=4,
            enums=4,
            defaults=4,
            description=4,
            rationale="ok",
        )

    monkeypatch.setattr(quality_gate, "_judge_one_pass_3", fake_judge)

    schemas = {f"tool_{i}": _make_schema() for i in range(20)}
    sem = asyncio.Semaphore(3)
    await quality_gate_all_tools(schemas, _make_pass1_output(), sem=sem)
    assert max_in_flight <= 3


# ─────────── Module pure-fn invariants — no model construction ─────────────


def test_no_direct_model_construction_in_quality_gate() -> None:
    src = pytest.importorskip("inspect").getsource(quality_gate)
    assert "OpenAIModel(" not in src
    assert "OpenAIProvider(" not in src
    assert "OpenRouterModel(" not in src
