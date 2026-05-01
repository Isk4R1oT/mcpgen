"""Pass 2 quality_gate.py — single Qwen judge with abbreviated 4-component rubric tests.

Verifies:
- ``_RUBRIC_THRESHOLD = 3`` (D-09).
- ``_MAX_GATE_RETRIES = 1`` (D-09).
- ``_judge_one`` passes when all 4 scores >= 3; fails when any < 3.
- ``quality_gate_all_tools`` no-retry path (all tools pass first try).
- Retry path that recovers (judge fails, re-author succeeds, judge passes).
- Retry path that fails (judge fails, re-author runs, judge still fails →
  ``quality_warnings[name] = True``, description is the re-authored one).
- ``_GateScores`` schema is closed (extra='forbid').
- INLINE_GATE_SETTINGS is the model_settings used in judge calls.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from mcpgen_ir.types import (
    Description,
    Endpoint,
    Method,
    Pass1Output,
    RawIR,
    Routing1,
    Rule1,
    SmartId,
    SpecFormat,
    Tool1,
    Type,
    UniversalTool,
)
from pytest_httpx import HTTPXMock

from mcpgen_engine.llm.sampling import INLINE_GATE_SETTINGS
from mcpgen_engine.passes.pass_2 import quality_gate
from mcpgen_engine.passes.pass_2.authoring import AuthoredToolResult, Pass2WarningSet
from mcpgen_engine.passes.pass_2.quality_gate import (
    _GATE_SYSTEM_PROMPT,
    _MAX_GATE_RETRIES,
    _QUALITY_GATE_AGENT,
    _RUBRIC_THRESHOLD,
    QUALITY_GATE_CONCURRENCY,
    _GateScores,
    _judge_one,
    quality_gate_all_tools,
)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_FAKE_SPEC_HASH = "a" * 64


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
        "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20},
    }


def _make_description() -> Description:
    return Description(
        purpose="Search for charges by amount, currency, customer, or status.",
        when_to_use=["finding charges by attribute"],
        when_not_to_use=None,
        how_to_use=None,
        limitations=["query is best-effort, not exact match"],
        parameter_overview=("Accepts a free-form query string; returns ranked smart-id results."),
    )


def _make_tool(
    name: str = "search",
    type_: Type = Type.universal,
    source_endpoints: list[str] | None = None,
) -> Tool1:
    return Tool1(
        name=name,
        type=type_,
        source_endpoints=source_endpoints or ["GET /v1/charges"],
    )


def _make_endpoint(
    path: str = "/v1/charges",
) -> Endpoint:
    return Endpoint(
        method=Method.GET,
        path=path,
        operation_id=None,
        summary="Get charges.",
        description="Get charges.",
        parameters=[],
        request_body=None,
        responses={"200": {}},
        tags=[],
        deprecated=False,
    )


def _make_raw_ir(endpoints: list[Endpoint]) -> RawIR:
    return RawIR(
        spec_format=SpecFormat.openapi_3_1,
        spec_hash=_FAKE_SPEC_HASH,
        endpoints=endpoints,
        schemas={},
        security_schemes={},
        dependency_graph={},
    )


def _make_pass1_output(tools: list[Tool1]) -> Pass1Output:
    smart_id = SmartId(
        format="{server}:{type}:{collection}:{identifier}",
        types=["object"],
        collections=["charge"],
    )
    return Pass1Output(
        tools=tools,
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


# ─────────────────────────── Module-level constants ────────────────────────


def test_rubric_threshold_is_3() -> None:
    assert _RUBRIC_THRESHOLD == 3


def test_max_gate_retries_is_1() -> None:
    assert _MAX_GATE_RETRIES == 1


def test_quality_gate_concurrency_is_10() -> None:
    assert QUALITY_GATE_CONCURRENCY == 10


def test_gate_agent_singleton_constructed() -> None:
    assert _QUALITY_GATE_AGENT is not None


def test_gate_system_prompt_mentions_4_components() -> None:
    assert "purpose" in _GATE_SYSTEM_PROMPT
    assert "guidelines" in _GATE_SYSTEM_PROMPT
    assert "limitations" in _GATE_SYSTEM_PROMPT
    assert "parameter_overview" in _GATE_SYSTEM_PROMPT
    # Examples + Length explicitly excluded (D-09 abbreviated rubric).
    assert "Do NOT score Examples or Length" in _GATE_SYSTEM_PROMPT


def test_gate_scores_schema_is_closed() -> None:
    """``extra='forbid'`` so any LLM drift is rejected at decode time."""
    with pytest.raises(Exception):  # noqa: B017,PT011 — Pydantic raises here
        _GateScores.model_validate(
            {
                "purpose": 4,
                "guidelines": 4,
                "limitations": 4,
                "parameter_overview": 4,
                "rationale": "ok",
                "rogue_field": "should be rejected",
            }
        )


# ───────────────────────────── _judge_one ──────────────────────────────────


async def test_judge_one_passes_when_all_scores_at_threshold(
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(
            {
                "purpose": 3,
                "guidelines": 4,
                "limitations": 5,
                "parameter_overview": 3,
                "rationale": "minimum acceptable across the board",
            }
        ),
    )
    tool = _make_tool()
    passes, scores = await _judge_one(tool, _make_description(), generation_id="test")
    assert passes is True
    assert scores.purpose == 3


async def test_judge_one_fails_when_any_score_below_threshold(
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(
            {
                "purpose": 2,
                "guidelines": 4,
                "limitations": 4,
                "parameter_overview": 4,
                "rationale": "purpose is too vague",
            }
        ),
    )
    tool = _make_tool()
    passes, scores = await _judge_one(tool, _make_description(), generation_id="test")
    assert passes is False
    assert scores.purpose == 2


async def test_judge_one_fails_when_parameter_overview_below_threshold(
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(
            {
                "purpose": 5,
                "guidelines": 5,
                "limitations": 5,
                "parameter_overview": 2,
                "rationale": "parameter overview missing",
            }
        ),
    )
    tool = _make_tool()
    passes, _ = await _judge_one(tool, _make_description(), generation_id="test")
    assert passes is False


async def test_judge_one_uses_inline_gate_settings(
    httpx_mock: HTTPXMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Capture the model_settings arg passed to agent.run; assert it IS
    the INLINE_GATE_SETTINGS singleton (object identity)."""
    captured: dict[str, Any] = {}

    original_run = _QUALITY_GATE_AGENT.run

    async def spy_run(prompt: str, **kwargs: Any) -> Any:
        captured["model_settings"] = kwargs.get("model_settings")
        return await original_run(prompt, **kwargs)

    monkeypatch.setattr(_QUALITY_GATE_AGENT, "run", spy_run)
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(
            {
                "purpose": 4,
                "guidelines": 4,
                "limitations": 4,
                "parameter_overview": 4,
                "rationale": "ok",
            }
        ),
    )
    tool = _make_tool()
    await _judge_one(tool, _make_description(), generation_id="test")
    assert captured["model_settings"] is INLINE_GATE_SETTINGS


# ─────────────────── quality_gate_all_tools — happy path ───────────────────


async def test_quality_gate_all_tools_no_retry_when_pass(
    httpx_mock: HTTPXMock,
) -> None:
    """3 descriptions, all pass the gate first try → 3 OpenRouter calls,
    quality_warnings all False."""
    passing_score = {
        "purpose": 4,
        "guidelines": 4,
        "limitations": 4,
        "parameter_overview": 4,
        "rationale": "ok",
    }
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(passing_score),
        is_reusable=True,
    )

    tools = [
        _make_tool(name="search"),
        _make_tool(name="fetch", source_endpoints=["GET /v1/x"]),
        _make_tool(name="list_objects", source_endpoints=["GET /v1/x"]),
    ]
    descriptions = {t.name: _make_description() for t in tools}
    pass_1_output = _make_pass1_output(tools)
    raw_ir = _make_raw_ir([_make_endpoint(), _make_endpoint("/v1/x")])

    final_descriptions, quality_warnings = await quality_gate_all_tools(
        descriptions, pass_1_output, raw_ir, generation_id="test"
    )

    assert len(httpx_mock.get_requests()) == 3
    assert quality_warnings == {"search": False, "fetch": False, "list_objects": False}
    # Descriptions returned unchanged (same identity not required, equality OK).
    assert set(final_descriptions.keys()) == {"search", "fetch", "list_objects"}


# ─────────────────── quality_gate_all_tools — retry-pass path ──────────────


async def test_quality_gate_all_tools_retries_on_fail_then_passes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """1 description; judge call 1 fails, re-author runs, judge call 2 passes
    → ``quality_warnings[name] = False`` and ``final_descriptions[name]``
    is the re-authored Description."""
    tool = _make_tool()
    pass_1_output = _make_pass1_output([tool])
    raw_ir = _make_raw_ir([_make_endpoint()])
    original_description = _make_description()

    re_authored_description = Description(
        purpose="A wholly re-authored purpose for charges search after rubric retry.",
        when_to_use=["RE_AUTHORED_TRIGGER"],
        when_not_to_use=None,
        how_to_use=None,
        limitations=["RE_AUTHORED_LIMIT"],
        parameter_overview=("Re-authored parameter overview specific to this retry test path."),
    )

    judge_call_count = 0

    async def fake_judge_one(
        t: Tool1,  # noqa: ARG001 — signature must match real _judge_one
        d: Description,  # noqa: ARG001
        *,
        generation_id: str,  # noqa: ARG001 — Phase 10 plan 10-03 threading
    ) -> tuple[bool, _GateScores]:
        nonlocal judge_call_count
        judge_call_count += 1
        # Call 1: fail (purpose=2). Call 2 (post-retry): pass (all 4).
        if judge_call_count == 1:
            return False, _GateScores(
                purpose=2,
                guidelines=4,
                limitations=4,
                parameter_overview=4,
                rationale="poor first time",
            )
        return True, _GateScores(
            purpose=4,
            guidelines=4,
            limitations=4,
            parameter_overview=4,
            rationale="ok second time",
        )

    async def fake_retry_author(
        t: Tool1,
        ir: RawIR,  # noqa: ARG001 — signature must match real _author_one
        p: Pass1Output,  # noqa: ARG001
        *,
        generation_id: str,  # noqa: ARG001 — Phase 10 plan 10-03 threading
    ) -> AuthoredToolResult:
        return AuthoredToolResult(
            tool_name=t.name,
            description=re_authored_description,
            warnings=Pass2WarningSet(),
        )

    monkeypatch.setattr(quality_gate, "_judge_one", fake_judge_one)
    monkeypatch.setattr(quality_gate, "_retry_author_one", fake_retry_author)

    final_descriptions, quality_warnings = await quality_gate_all_tools(
        {tool.name: original_description}, pass_1_output, raw_ir, generation_id="test"
    )
    assert quality_warnings == {tool.name: False}
    assert final_descriptions[tool.name] is re_authored_description
    assert judge_call_count == 2


# ─────────────────── quality_gate_all_tools — retry-fail path ──────────────


async def test_quality_gate_all_tools_retries_then_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Judge fails twice, re-author runs once → ``quality_warnings[name]``
    True and ``final_descriptions[name]`` is the re-authored Description
    (D-09 emit-and-continue: gate accepts even on failure)."""
    tool = _make_tool()
    pass_1_output = _make_pass1_output([tool])
    raw_ir = _make_raw_ir([_make_endpoint()])
    original_description = _make_description()

    re_authored_description = Description(
        purpose="Another re-authored purpose for the retry-fail test path.",
        when_to_use=["TRIG"],
        when_not_to_use=None,
        how_to_use=None,
        limitations=["LIM"],
        parameter_overview=("Another re-authored parameter overview for retry-fail testing."),
    )

    judge_call_count = 0

    async def fake_judge_one(
        t: Tool1,  # noqa: ARG001 — signature must match real _judge_one
        d: Description,  # noqa: ARG001
        *,
        generation_id: str,  # noqa: ARG001 — Phase 10 plan 10-03 threading
    ) -> tuple[bool, _GateScores]:
        nonlocal judge_call_count
        judge_call_count += 1
        return False, _GateScores(
            purpose=2,
            guidelines=2,
            limitations=2,
            parameter_overview=2,
            rationale="bad",
        )

    async def fake_retry_author(
        t: Tool1,
        ir: RawIR,  # noqa: ARG001 — signature must match real _author_one
        p: Pass1Output,  # noqa: ARG001
        *,
        generation_id: str,  # noqa: ARG001 — Phase 10 plan 10-03 threading
    ) -> AuthoredToolResult:
        return AuthoredToolResult(
            tool_name=t.name,
            description=re_authored_description,
            warnings=Pass2WarningSet(),
        )

    monkeypatch.setattr(quality_gate, "_judge_one", fake_judge_one)
    monkeypatch.setattr(quality_gate, "_retry_author_one", fake_retry_author)

    final_descriptions, quality_warnings = await quality_gate_all_tools(
        {tool.name: original_description}, pass_1_output, raw_ir, generation_id="test"
    )
    assert quality_warnings == {tool.name: True}
    assert final_descriptions[tool.name] is re_authored_description
    # Exactly 2 judge calls = initial + 1 retry per D-09.
    assert judge_call_count == 2


# ───────────── Module pure-fn invariants — no model construction ───────────


def test_no_direct_model_construction_in_quality_gate() -> None:
    src = pytest.importorskip("inspect").getsource(quality_gate)
    assert "OpenAIModel(" not in src
    assert "OpenAIProvider(" not in src
    assert "OpenRouterModel(" not in src
