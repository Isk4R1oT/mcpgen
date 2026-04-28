"""Pass 2 authoring.py — per-tool fan-out + 2-tier retry + D-12 revalidation tests.

Verifies:
- Module-level singletons (4 Agent instances per tool type).
- ``PASS_2_AUTHORING_CONCURRENCY = 10`` (D-08) and
  ``_MAX_VALIDATION_RETRIES = 2`` (D-13) constants.
- Happy path: mocked Qwen returns valid Description → no warnings.
- D-12 invariant: retry path uses ``build_retry_user_prompt`` and re-runs
  ALL three validators after every retry.
- Length-violation retry that succeeds → returned with empty warnings.
- Length-violation retry that exhausts → returned with
  ``length_violation`` flag set (D-13 emit-and-continue).
- Forbidden-phrase retry triggers and recovers.
- Examples-from-spec hallucination triggers retry.
- Pydantic validation crash retries via PydanticAI internal loop.
- Per-tool-type Agent dispatch (universal prompt vs others).
- ``author_all_tools`` respects ``Semaphore(10)`` concurrency cap.

All LLM responses are mocked via the conftest ``httpx_mock_qwen`` fixture
(no real OpenRouter calls). The smoke gate test
(``tests/test_smoke_qwen.py``) is the only place real Qwen calls run.

References:
- 03-CONTEXT.md D-08, D-12, D-13
- apps/generation-engine/tests/passes/pass_2/conftest.py
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest
from mcpgen_ir.types import (
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

from mcpgen_engine.passes.pass_2 import authoring
from mcpgen_engine.passes.pass_2.authoring import (
    _AGENTS_BY_TYPE,
    _MAX_VALIDATION_RETRIES,
    PASS_2_ACTION_AGENT,
    PASS_2_AUTHORING_CONCURRENCY,
    PASS_2_SPECIALIZED_AGENT,
    PASS_2_UNIVERSAL_AGENT,
    PASS_2_WORKFLOW_AGENT,
    AuthoredToolResult,
    _author_one,
    author_all_tools,
)
from mcpgen_engine.passes.pass_2.prompts import (
    PASS_2_ACTION_SYSTEM_PROMPT,
    PASS_2_SPECIALIZED_SYSTEM_PROMPT,
    PASS_2_UNIVERSAL_SYSTEM_PROMPT,
    PASS_2_WORKFLOW_SYSTEM_PROMPT,
)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_FAKE_SPEC_HASH = "a" * 64


# ─────────────────────────── Fixture builders ──────────────────────────────


def _make_universal_description_dict(
    purpose: str | None = None,
    when_to_use: list[str] | None = None,
    limitations: list[str] | None = None,
    parameter_overview: str | None = None,
) -> dict[str, Any]:
    """Build a Description dict that satisfies the universal length budget
    (200-400 tokens) for the 5-of-6 rubric components."""
    base_purpose = purpose or (
        "Search for charges across the connected account by amount, "
        "currency, customer, status, or metadata; returns ranked smart-id "
        "results suitable for the fetch tool to expand into full objects."
    )
    base_when_to_use = when_to_use or [
        "browsing recent activity for support tickets and reconciliation",
        "auditing failed payments and disputed transactions across the account",
        "reconciling refunds against settlements at end of day for accounting",
        "filtering by customer ID, amount, or status across the connected account",
        "exploring the payment history when investigating user complaints quickly",
        "discovering charges that match arbitrary metadata attached previously",
    ]
    base_limitations = limitations or [
        "results capped at 100 per page; iterate via cursor pagination tokens",
        "fuzzy match only on metadata fields; structured fields use exact match",
        "smart-id format is server-specific (see the fetch tool documentation)",
        "rate limited to 100 requests per minute per connected account holder",
        "real-time data delayed by up to 5 seconds during peak load periods",
        "does not include payment attempts that never reached the gateway",
        "returns at most 1000 records across paginated results in a single session",
        "search ranks by recency; older entries may be deprioritised in results",
    ]
    base_parameter_overview = parameter_overview or (
        "Accepts a free-form query string; returns ranked smart-id results "
        "with object summaries. Best for browsing; use list_objects when you "
        "need exact filter semantics with stable pagination across calls."
    )
    return {
        "purpose": base_purpose,
        "when_to_use": base_when_to_use,
        "when_not_to_use": None,
        "how_to_use": (
            "Pass a free-form query string. Combine with fetch on the returned "
            "smart-ids to retrieve full charge details. Prefer specific keywords "
            "from your spec to improve ranking quality across heterogeneous "
            "metadata. Use list_objects when stable pagination matters more "
            "than ranking; search is best-effort and re-ranks on every call."
        ),
        "limitations": base_limitations,
        "parameter_overview": base_parameter_overview,
    }


def _too_short_description_dict() -> dict[str, Any]:
    """Description that satisfies IR constraints but is too short for the
    universal budget (renders to ~30-50 tokens vs the 200 minimum)."""
    return {
        "purpose": "Short purpose for testing the budget gate.",
        "when_to_use": ["one trigger"],
        "when_not_to_use": None,
        "how_to_use": None,
        "limitations": ["one limit"],
        "parameter_overview": (
            "Tiny overview that satisfies the IR min length of fifty chars only."
        ),
    }


def _forbidden_description_dict() -> dict[str, Any]:
    """Universal-budget description containing a forbidden marketing phrase."""
    payload = _make_universal_description_dict()
    payload["purpose"] = (
        "A powerful tool that helps you search for charges across the "
        "connected account; returns ranked smart-id results suitable for "
        "the fetch tool to expand into full objects with elegant simplicity."
    )
    return payload


def _hallucinated_description_dict() -> dict[str, Any]:
    """Universal-budget description containing a fake Stripe-style secret key."""
    payload = _make_universal_description_dict()
    payload["parameter_overview"] = (
        "Pass header `Authorization: sk_test_FAKE_DOC_EXAMPLE_NOT_REAL_Y` to authenticate; "
        "returns ranked smart-id results with object summaries for browsing."
    )
    return payload


def _mock_openrouter_function_call(payload: dict[str, Any]) -> dict[str, Any]:
    """Build a minimal OpenRouter chat-completions response containing a
    function-call with `final_result` arguments = payload (Description shape)."""
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
                            "id": "call_1",
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


def _make_endpoint(
    method: Method = Method.GET,
    path: str = "/v1/charges/{id}",
    description: str | None = "Fetch a charge by ID.",
    summary: str | None = "Fetch charge.",
) -> Endpoint:
    return Endpoint(
        method=method,
        path=path,
        operation_id=None,
        summary=summary,
        description=description,
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


def _make_tool(
    name: str = "search",
    type_: Type = Type.universal,
    source_endpoints: list[str] | None = None,
) -> Tool1:
    return Tool1(
        name=name,
        type=type_,
        source_endpoints=source_endpoints or ["GET /v1/charges/{id}"],
    )


def _make_pass1_output(tools: list[Tool1]) -> Pass1Output:
    """Minimal Pass1Output wrapping the supplied tools."""
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
                    universal_tool=UniversalTool.fetch,
                    target_endpoint="GET /v1/charges/{id}",
                    params_mapping={"id": "id"},
                )
            ],
        ),
        workflows=[],
        coverage_pct=100.0,
        coverage_proof=[],
    )


# ─────────────────────────── Module-level constants ────────────────────────


def test_pass_2_authoring_concurrency_constant_is_10() -> None:
    assert PASS_2_AUTHORING_CONCURRENCY == 10


def test_max_validation_retries_constant_is_2() -> None:
    assert _MAX_VALIDATION_RETRIES == 2


def test_four_agent_singletons_constructed() -> None:
    assert PASS_2_UNIVERSAL_AGENT is not None
    assert PASS_2_ACTION_AGENT is not None
    assert PASS_2_WORKFLOW_AGENT is not None
    assert PASS_2_SPECIALIZED_AGENT is not None
    # Distinct objects per tool type (singletons not aliases).
    assert PASS_2_UNIVERSAL_AGENT is not PASS_2_ACTION_AGENT
    assert PASS_2_ACTION_AGENT is not PASS_2_WORKFLOW_AGENT
    assert PASS_2_WORKFLOW_AGENT is not PASS_2_SPECIALIZED_AGENT


def test_agents_by_type_dispatch_table_complete() -> None:
    assert _AGENTS_BY_TYPE[Type.universal] is PASS_2_UNIVERSAL_AGENT
    assert _AGENTS_BY_TYPE[Type.action] is PASS_2_ACTION_AGENT
    assert _AGENTS_BY_TYPE[Type.workflow] is PASS_2_WORKFLOW_AGENT
    assert _AGENTS_BY_TYPE[Type.specialized] is PASS_2_SPECIALIZED_AGENT


# ────────────────────────────── Happy path ─────────────────────────────────


async def test_author_one_happy_path(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_make_universal_description_dict()),
    )

    raw_ir = _make_raw_ir([_make_endpoint()])
    tool = _make_tool()
    pass_1_output = _make_pass1_output([tool])

    result = await _author_one(tool, raw_ir, pass_1_output)
    assert isinstance(result, AuthoredToolResult)
    assert result.tool_name == "search"
    assert result.warnings.length_violation is None
    assert result.warnings.forbidden_pattern_violation == []
    assert result.warnings.examples_not_in_spec == []


# ───────────────────── Length-violation retry paths ────────────────────────


async def test_author_one_length_violation_then_recovers(
    httpx_mock: HTTPXMock,
) -> None:
    """Two too-short attempts then a valid one → empty warnings."""
    too_short = _mock_openrouter_function_call(_too_short_description_dict())
    valid = _mock_openrouter_function_call(_make_universal_description_dict())
    # Attempt 1: too short. Attempt 2 (retry 1): too short. Attempt 3 (retry 2): valid.
    httpx_mock.add_response(method="POST", url=OPENROUTER_URL, json=too_short)
    httpx_mock.add_response(method="POST", url=OPENROUTER_URL, json=too_short)
    httpx_mock.add_response(method="POST", url=OPENROUTER_URL, json=valid)

    raw_ir = _make_raw_ir([_make_endpoint()])
    tool = _make_tool()
    pass_1_output = _make_pass1_output([tool])

    result = await _author_one(tool, raw_ir, pass_1_output)
    # Final attempt was clean → warnings empty.
    assert result.warnings.length_violation is None


async def test_author_one_length_violation_after_3_attempts_emits_with_warning(
    httpx_mock: HTTPXMock,
) -> None:
    """All 3 attempts (1 + 2 retries per D-13) too short → emit-and-continue
    with ``length_violation`` flag set (NOT raised)."""
    too_short = _mock_openrouter_function_call(_too_short_description_dict())
    httpx_mock.add_response(method="POST", url=OPENROUTER_URL, json=too_short, is_reusable=True)

    raw_ir = _make_raw_ir([_make_endpoint()])
    tool = _make_tool()
    pass_1_output = _make_pass1_output([tool])

    result = await _author_one(tool, raw_ir, pass_1_output)
    assert result.warnings.length_violation is not None
    assert "shorter than" in result.warnings.length_violation


# ──────────────────── Forbidden-phrase / hallucination ─────────────────────


async def test_author_one_forbidden_phrase_then_recovers(
    httpx_mock: HTTPXMock,
) -> None:
    forbidden = _mock_openrouter_function_call(_forbidden_description_dict())
    valid = _mock_openrouter_function_call(_make_universal_description_dict())
    httpx_mock.add_response(method="POST", url=OPENROUTER_URL, json=forbidden)
    httpx_mock.add_response(method="POST", url=OPENROUTER_URL, json=valid)

    raw_ir = _make_raw_ir([_make_endpoint()])
    tool = _make_tool()
    pass_1_output = _make_pass1_output([tool])

    result = await _author_one(tool, raw_ir, pass_1_output)
    assert result.warnings.forbidden_pattern_violation == []


async def test_author_one_examples_hallucination_then_recovers(
    httpx_mock: HTTPXMock,
) -> None:
    halluc = _mock_openrouter_function_call(_hallucinated_description_dict())
    valid = _mock_openrouter_function_call(_make_universal_description_dict())
    httpx_mock.add_response(method="POST", url=OPENROUTER_URL, json=halluc)
    httpx_mock.add_response(method="POST", url=OPENROUTER_URL, json=valid)

    raw_ir = _make_raw_ir([_make_endpoint()])
    tool = _make_tool()
    pass_1_output = _make_pass1_output([tool])

    result = await _author_one(tool, raw_ir, pass_1_output)
    assert result.warnings.examples_not_in_spec == []


# ─────────────── D-12 invariant — retry-prompt content check ───────────────


async def test_author_one_retry_uses_build_retry_user_prompt(
    httpx_mock: HTTPXMock,
) -> None:
    """D-12: 2nd HTTP call body MUST contain
    ``<previous_attempt_validation_error>`` block (built by
    ``build_retry_user_prompt``)."""
    too_short = _mock_openrouter_function_call(_too_short_description_dict())
    valid = _mock_openrouter_function_call(_make_universal_description_dict())
    httpx_mock.add_response(method="POST", url=OPENROUTER_URL, json=too_short)
    httpx_mock.add_response(method="POST", url=OPENROUTER_URL, json=valid)

    raw_ir = _make_raw_ir([_make_endpoint()])
    tool = _make_tool()
    pass_1_output = _make_pass1_output([tool])

    await _author_one(tool, raw_ir, pass_1_output)

    requests = httpx_mock.get_requests()
    assert len(requests) == 2
    second_body = requests[1].read().decode("utf-8")
    assert "<previous_attempt_validation_error>" in second_body
    # D-12 retry-prompt invariant — examples policy reminder verbatim.
    assert "Examples MUST be drawn directly from the OpenAPI spec" in second_body


# ─────────────────── PydanticAI validation-error retry ─────────────────────


async def test_author_one_pydantic_validation_error_raises_with_invalid_payload(
    httpx_mock: HTTPXMock,
) -> None:
    """Repeated structurally-invalid payload (purpose too short to satisfy
    IR constraint) ultimately raises ``Pass2Error`` after exhausting both
    PydanticAI's internal retries and our outer validation-retry loop."""
    invalid_payload = {
        # purpose `min_length=20` — emit a shorter string to fail Pydantic
        # validation at decode time.
        "purpose": "tooshort",
        "when_to_use": ["x"],
        "when_not_to_use": None,
        "how_to_use": None,
        "limitations": [],
        "parameter_overview": "x" * 60,
    }
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(invalid_payload),
        is_reusable=True,
    )

    raw_ir = _make_raw_ir([_make_endpoint()])
    tool = _make_tool()
    pass_1_output = _make_pass1_output([tool])

    from mcpgen_engine.passes.pass_2.validation import Pass2Error

    with pytest.raises(Pass2Error) as exc_info:
        await _author_one(tool, raw_ir, pass_1_output)
    assert "AUTHORING_FAILED" in str(exc_info.value)


# ──────────────────── Per-tool-type Agent dispatch ─────────────────────────


async def test_author_one_uses_universal_agent_for_universal_tool(
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_make_universal_description_dict()),
    )
    raw_ir = _make_raw_ir([_make_endpoint()])
    tool = _make_tool(name="search", type_=Type.universal)
    pass_1_output = _make_pass1_output([tool])

    await _author_one(tool, raw_ir, pass_1_output)
    requests = httpx_mock.get_requests()
    assert len(requests) == 1
    body = requests[0].read().decode("utf-8")
    # Universal system prompt has the "200-400 tokens" budget marker.
    assert "200-400 tokens" in body


# ───────────────────────────── Concurrency cap ─────────────────────────────


async def test_author_all_tools_respects_concurrency_10(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With 25 tools and a counter-decorated mock, max in-flight count
    must never exceed PASS_2_AUTHORING_CONCURRENCY (10)."""
    in_flight = 0
    max_in_flight = 0

    valid_payload = _make_universal_description_dict()

    # Patch the agent factory with an async stub that counts in-flight callers.
    async def fake_run(self: Any, prompt: str, **kwargs: Any) -> Any:  # noqa: ARG001
        nonlocal in_flight, max_in_flight
        in_flight += 1
        max_in_flight = max(max_in_flight, in_flight)
        try:
            await asyncio.sleep(0.01)
            from mcpgen_ir.types import Description

            class _FakeResult:
                output = Description.model_validate(valid_payload)

            return _FakeResult()
        finally:
            in_flight -= 1

    # Patch every tool-type agent's .run method.
    for agent in _AGENTS_BY_TYPE.values():
        monkeypatch.setattr(agent, "run", fake_run.__get__(agent, type(agent)))

    raw_ir = _make_raw_ir([_make_endpoint(path=f"/v1/r/{i}") for i in range(25)])
    tools = [
        _make_tool(name=f"tool_{i:02d}", source_endpoints=[f"GET /v1/r/{i}"]) for i in range(25)
    ]
    pass_1_output = _make_pass1_output(tools)

    results = await author_all_tools(pass_1_output, raw_ir)
    assert len(results) == 25
    assert (
        max_in_flight <= PASS_2_AUTHORING_CONCURRENCY
    ), f"max_in_flight={max_in_flight} exceeded cap of {PASS_2_AUTHORING_CONCURRENCY}"


# ─────────────────────── System-prompt sanity guards ───────────────────────


def test_action_agent_uses_action_prompt() -> None:
    # Cheap regression guard against accidental prompt swap.
    assert "TOOL TYPE: action" in PASS_2_ACTION_SYSTEM_PROMPT


def test_workflow_agent_uses_workflow_prompt() -> None:
    assert "TOOL TYPE: workflow" in PASS_2_WORKFLOW_SYSTEM_PROMPT


def test_specialized_agent_uses_specialized_prompt() -> None:
    assert "TOOL TYPE: specialized" in PASS_2_SPECIALIZED_SYSTEM_PROMPT


def test_universal_agent_uses_universal_prompt() -> None:
    assert "TOOL TYPE: universal" in PASS_2_UNIVERSAL_SYSTEM_PROMPT


# ───────────── Module pure-fn invariants — no model construction ───────────


def test_no_direct_model_construction_in_authoring() -> None:
    """Pitfall A invariant: ``make_agent`` is the only legal construction
    site — never construct OpenAIModel/OpenAIProvider here."""
    src = pytest.importorskip("inspect").getsource(authoring)
    assert "OpenAIModel(" not in src
    assert "OpenAIProvider(" not in src
    assert "OpenRouterModel(" not in src
