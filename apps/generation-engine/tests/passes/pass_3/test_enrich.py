"""Pass 3 enrich.py — D-17 concurrency + D-12/D-24 retry-revalidation tests.

Verifies:
- ``PASS_3_ENRICHMENT_CONCURRENCY = 20`` (D-17 pipeline-scoped) and
  ``_MAX_VALIDATION_RETRIES = 2`` (D-13 cap analog) constants.
- Module-level ``PASS_3_ENRICHMENT_AGENT`` singleton built via
  ``make_agent`` (Pitfall A — no direct OpenAIModel/Provider construction).
- Happy path: mocked Qwen returns a valid ``ParameterEnrichment`` →
  returned verbatim.
- Pydantic validation crash → outer retry loop kicks in.
- D-12 / D-24 invariant: retry path uses ``build_param_retry_user_prompt``
  and the 2nd HTTP-call body contains the verbatim D-24 examples policy.
- Retry exhaustion → deterministic 5-component fallback (no raise).
- ``_build_deterministic_fallback`` covers required / default / 5-component
  shape.
- ``enrich_all_params`` respects the pipeline-scoped Semaphore(20) cap
  across multiple tools (NOT per-tool).
- ``enrich_all_params`` returns a dict grouped by tool_name with stable
  per-tool ordering.
- Every Agent call uses ``model_settings=PASS_3_SETTINGS`` (Pitfall #2).

All LLM responses are mocked via the ``httpx_mock`` fixture (no real
OpenRouter calls; the smoke gate test ``tests/test_smoke_qwen.py`` is the
only place real Qwen calls run).

References:
- 03-CONTEXT.md D-13 (retry cap), D-17 (concurrency), D-24 (D-12 retry
  invariant for Pass 3)
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from pydantic_ai.settings import ModelSettings
from pytest_httpx import HTTPXMock

from mcpgen_engine.llm.sampling import PASS_3_SETTINGS
from mcpgen_engine.passes.pass_3 import enrich as enrich_module
from mcpgen_engine.passes.pass_3.enrich import (
    _MAX_VALIDATION_RETRIES,
    PASS_3_ENRICHMENT_AGENT,
    PASS_3_ENRICHMENT_CONCURRENCY,
    ParameterEnrichment,
    _build_deterministic_fallback,
    _enrich_one,
    enrich_all_params,
)
from mcpgen_engine.passes.pass_3.extract import ParameterSpec

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ─────────────────────────── Fixture builders ──────────────────────────────


def _make_param(
    name: str = "amount",
    type_: str = "integer",
    required: bool = True,
    default: Any = None,
    description: str | None = "The charge amount in cents",
    source_endpoint_id: str = "POST /v1/charges",
    source_field: str = "parameters[0].amount",
    enum: list[str] | None = None,
    format_: str | None = None,
) -> ParameterSpec:
    """Build a minimal `ParameterSpec` for tests."""
    return ParameterSpec(
        name=name,
        type=type_,
        format=format_,
        enum=enum,
        required=required,
        default=default,
        source_endpoint_id=source_endpoint_id,
        source_field=source_field,
        description=description,
    )


def _valid_enrichment_dict(
    description: str | None = None,
    example: str | None = "1000",
    suggested_rename: str | None = None,
    inferred_enum: list[str] | None = None,
) -> dict[str, Any]:
    """Build a `ParameterEnrichment`-shaped dict satisfying the 20-char minimum."""
    return {
        "description": description
        or (
            "WHAT: The amount parameter (integer, required).\n"
            "FORMAT: integer cents.\n"
            "WHEN: Required for this tool.\n"
            "EXAMPLE: 1000 (one thousand cents).\n"
            "DEFAULT: (no default — required)"
        ),
        "example": example,
        "suggested_rename": suggested_rename,
        "inferred_enum": inferred_enum,
    }


def _short_enrichment_dict() -> dict[str, Any]:
    """Build an enrichment dict that fails ``description: min_length=20`` validation."""
    return {
        "description": "tooshort",  # 8 chars, fails min_length=20
        "example": None,
        "suggested_rename": None,
        "inferred_enum": None,
    }


def _mock_openrouter_function_call(payload: dict[str, Any]) -> dict[str, Any]:
    """Build a minimal OpenRouter chat-completions response wrapping `payload`."""
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


# ─────────────────────────── Module-level constants ────────────────────────


def test_pass_3_enrichment_concurrency_constant_is_20() -> None:
    """D-17 — pipeline-scoped, NOT per-tool."""
    assert PASS_3_ENRICHMENT_CONCURRENCY == 20


def test_max_validation_retries_constant_is_2() -> None:
    """D-13 cap analog for Pass 3."""
    assert _MAX_VALIDATION_RETRIES == 2


def test_enrichment_agent_singleton_constructed() -> None:
    """Module-level Agent built via ``make_agent`` is non-None."""
    assert PASS_3_ENRICHMENT_AGENT is not None


def test_no_direct_model_construction_in_enrich() -> None:
    """Pitfall A: ``make_agent`` is the only legal construction site."""
    import inspect

    src = inspect.getsource(enrich_module)
    assert "OpenAIModel(" not in src
    assert "OpenAIProvider(" not in src
    assert "OpenRouterModel(" not in src


# ─────────────────────────── Deterministic fallback ────────────────────────


def test_build_deterministic_fallback_contains_5_components() -> None:
    """Fallback description must include all 5 MCP-Bundles labels."""
    param = _make_param(name="limit", type_="integer", required=False, default=25, description=None)
    fallback = _build_deterministic_fallback(param)
    assert "WHAT:" in fallback.description
    assert "FORMAT:" in fallback.description
    assert "WHEN:" in fallback.description
    assert "EXAMPLE:" in fallback.description
    assert "DEFAULT:" in fallback.description
    assert fallback.example is None
    assert fallback.suggested_rename is None
    assert fallback.inferred_enum is None


def test_build_deterministic_fallback_required_param_states_required() -> None:
    """Required param → 'required' surfaces in the WHAT line."""
    param = _make_param(name="customer_id", type_="string", required=True)
    fallback = _build_deterministic_fallback(param)
    assert "required" in fallback.description


def test_build_deterministic_fallback_with_default() -> None:
    """Numeric default surfaces in the DEFAULT line."""
    param = _make_param(name="limit", type_="integer", required=False, default=25, description=None)
    fallback = _build_deterministic_fallback(param)
    assert "default=25" in fallback.description


# ─────────────────────────── Happy path ────────────────────────────────────


async def test_enrich_one_happy_path(httpx_mock: HTTPXMock) -> None:
    """Mocked Qwen returns a valid enrichment → no fallback, no retries."""
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_valid_enrichment_dict()),
    )

    param = _make_param()
    result = await _enrich_one(
        param, tool_name="charges_create", tool_type="action", generation_id="test"
    )
    assert isinstance(result, ParameterEnrichment)
    assert result.example == "1000"
    assert "WHAT:" in result.description
    # Single HTTP call — no retries.
    assert len(httpx_mock.get_requests()) == 1


# ─────────────────── Pydantic validation retry path ────────────────────────


async def test_enrich_one_pydantic_validation_error_triggers_retry(
    httpx_mock: HTTPXMock,
) -> None:
    """Invalid output (description too short) on first try → retry path → recovers."""
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_short_enrichment_dict()),
    )
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_valid_enrichment_dict()),
    )

    param = _make_param()
    result = await _enrich_one(
        param, tool_name="charges_create", tool_type="action", generation_id="test"
    )
    # Recovery succeeded.
    assert isinstance(result, ParameterEnrichment)
    assert "WHAT:" in result.description
    assert len(httpx_mock.get_requests()) == 2


# ─────────────────── D-12 invariant — retry-prompt content ─────────────────


async def test_enrich_one_retry_uses_build_param_retry_user_prompt(
    monkeypatch: Any,
) -> None:
    """D-12/D-24: when the outer retry loop fires, the 2nd prompt MUST contain
    the verbatim D-24 reminder.

    PydanticAI's internal output-retry loop absorbs ``ValidationError`` from
    structured output decoding and re-prompts the model in-band BEFORE our
    outer loop sees it. To deterministically witness our outer
    ``build_param_retry_user_prompt`` invocation we monkeypatch
    ``Agent.run`` to raise ``ValidationError`` on the first call (simulating
    a pass-through after PydanticAI's internal retries also exhaust) and
    succeed on the second.
    """
    captured_prompts: list[str] = []
    valid_payload = _valid_enrichment_dict()
    call_count = {"n": 0}

    async def fake_run(self: Any, prompt: str, **kwargs: Any) -> Any:  # noqa: ARG001
        captured_prompts.append(prompt)
        call_count["n"] += 1
        if call_count["n"] == 1:
            # Raise a ValidationError that bubbles past PydanticAI's internal
            # retry — this is what our outer loop is designed to catch.
            ParameterEnrichment.model_validate({"description": "tooshort"})

        class _FakeResult:
            output = ParameterEnrichment.model_validate(valid_payload)

        return _FakeResult()

    monkeypatch.setattr(
        PASS_3_ENRICHMENT_AGENT,
        "run",
        fake_run.__get__(PASS_3_ENRICHMENT_AGENT, type(PASS_3_ENRICHMENT_AGENT)),
    )

    param = _make_param()
    result = await _enrich_one(
        param, tool_name="charges_create", tool_type="action", generation_id="test"
    )

    # Outer retry kicked: 2 calls, first prompt is initial, second is retry.
    assert isinstance(result, ParameterEnrichment)
    assert len(captured_prompts) == 2
    second = captured_prompts[1]
    assert "<previous_attempt_validation_error>" in second
    # D-24 verbatim re-included in EVERY retry per D-12 invariant.
    assert "Parameter examples MUST be derivable from spec" in second
    assert "fake API keys" in second
    assert "real-looking PII" in second


# ─────────────────── Retry exhaustion → deterministic fallback ─────────────


async def test_enrich_one_falls_back_to_deterministic_after_exhaustion(
    httpx_mock: HTTPXMock,
) -> None:
    """All 3 attempts (1 initial + 2 retries) invalid → deterministic fallback."""
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_short_enrichment_dict()),
        is_reusable=True,
    )

    param = _make_param(name="limit", type_="integer", required=False, default=25, description=None)
    result = await _enrich_one(param, tool_name="t", tool_type="action", generation_id="test")
    # Did NOT raise; returned the deterministic fallback.
    assert isinstance(result, ParameterEnrichment)
    assert "WHAT:" in result.description
    assert "FORMAT:" in result.description
    assert "WHEN:" in result.description
    assert "EXAMPLE:" in result.description
    assert "DEFAULT:" in result.description
    assert result.example is None


# ─────────────────── PASS_3_SETTINGS plumbed through (Pitfall #2) ──────────


async def test_uses_pass_3_settings(monkeypatch: Any) -> None:
    """Every Agent call uses ``model_settings=PASS_3_SETTINGS`` (Pitfall #2)."""
    captured_settings: list[ModelSettings | None] = []

    valid_payload = _valid_enrichment_dict()

    async def fake_run(self: Any, prompt: str, **kwargs: Any) -> Any:  # noqa: ARG001
        captured_settings.append(kwargs.get("model_settings"))

        class _FakeResult:
            output = ParameterEnrichment.model_validate(valid_payload)

        return _FakeResult()

    monkeypatch.setattr(
        PASS_3_ENRICHMENT_AGENT,
        "run",
        fake_run.__get__(PASS_3_ENRICHMENT_AGENT, type(PASS_3_ENRICHMENT_AGENT)),
    )

    param = _make_param()
    await _enrich_one(param, tool_name="t", tool_type="action", generation_id="test")

    assert len(captured_settings) == 1
    # Object identity — must be the exact PASS_3_SETTINGS singleton.
    assert captured_settings[0] is PASS_3_SETTINGS


# ─────────────────── Pipeline-scoped concurrency cap (D-17) ────────────────


async def test_enrich_all_params_concurrency_pipeline_scoped(
    monkeypatch: Any,
) -> None:
    """3 tools x 10 params = 30 params total; max in-flight must NEVER exceed 20.

    Asserts the Semaphore is PIPELINE-scoped (D-17), not per-tool. If it were
    per-tool we'd see 3x concurrent batches (and could exceed 20).
    """
    in_flight = 0
    max_in_flight = 0

    valid_payload = _valid_enrichment_dict()

    async def fake_run(self: Any, prompt: str, **kwargs: Any) -> Any:  # noqa: ARG001
        nonlocal in_flight, max_in_flight
        in_flight += 1
        max_in_flight = max(max_in_flight, in_flight)
        try:
            await asyncio.sleep(0.005)

            class _FakeResult:
                output = ParameterEnrichment.model_validate(valid_payload)

            return _FakeResult()
        finally:
            in_flight -= 1

    monkeypatch.setattr(
        PASS_3_ENRICHMENT_AGENT,
        "run",
        fake_run.__get__(PASS_3_ENRICHMENT_AGENT, type(PASS_3_ENRICHMENT_AGENT)),
    )

    extracted = {
        f"tool_{i}": [
            _make_param(
                name=f"p_{i}_{j}",
                source_endpoint_id=f"GET /e/{i}/{j}",
                source_field=f"parameters[0].p_{i}_{j}",
            )
            for j in range(10)
        ]
        for i in range(3)
    }
    tool_types = {tool_name: "action" for tool_name in extracted}

    result = await enrich_all_params(extracted, tool_types)

    assert sum(len(v) for v in result.values()) == 30
    assert max_in_flight <= PASS_3_ENRICHMENT_CONCURRENCY, (
        f"max_in_flight={max_in_flight} exceeded pipeline cap of "
        f"{PASS_3_ENRICHMENT_CONCURRENCY}"
    )


# ─────────────────── Output grouping & ordering ────────────────────────────


async def test_enrich_all_params_groups_by_tool_name(monkeypatch: Any) -> None:
    """Result keyed by tool_name with stable per-tool ordering."""
    valid_payload = _valid_enrichment_dict()

    async def fake_run(self: Any, prompt: str, **kwargs: Any) -> Any:  # noqa: ARG001
        class _FakeResult:
            output = ParameterEnrichment.model_validate(valid_payload)

        return _FakeResult()

    monkeypatch.setattr(
        PASS_3_ENRICHMENT_AGENT,
        "run",
        fake_run.__get__(PASS_3_ENRICHMENT_AGENT, type(PASS_3_ENRICHMENT_AGENT)),
    )

    p1 = _make_param(name="alpha", source_field="parameters[0].alpha", source_endpoint_id="GET /a")
    p2 = _make_param(name="beta", source_field="parameters[1].beta", source_endpoint_id="GET /a")
    p3 = _make_param(name="gamma", source_field="parameters[0].gamma", source_endpoint_id="GET /b")
    extracted = {"tool_a": [p1, p2], "tool_b": [p3]}
    tool_types = {"tool_a": "action", "tool_b": "action"}

    result = await enrich_all_params(extracted, tool_types)

    assert set(result.keys()) == {"tool_a", "tool_b"}
    assert len(result["tool_a"]) == 2
    assert len(result["tool_b"]) == 1
    # Per-tool ordering preserved (output[i].param matches input[i]).
    assert result["tool_a"][0][0].name == "alpha"
    assert result["tool_a"][1][0].name == "beta"
    assert result["tool_b"][0][0].name == "gamma"


async def test_enrich_all_params_handles_empty_input() -> None:
    """Empty `extracted` dict → empty result; no LLM calls."""
    result = await enrich_all_params({}, {})
    assert result == {}
