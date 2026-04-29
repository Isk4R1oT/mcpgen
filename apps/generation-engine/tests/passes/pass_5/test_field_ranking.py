"""Pass 5 field_ranking.py — heuristic + deterministic + LLM ranker tests.

Verifies:
- ``heuristic_score`` implements Pass 5 design Appendix B verbatim:
  required → +0.5; high-value patterns → +0.3; low-value patterns → -0.3;
  description signals → +0.2 / -0.3.
- ``deterministic_ranking`` cutoff +0.3 / -0.3 → always_include /
  always_exclude; uncertain middle → opt_in (D-11 conservative bias).
- ``FieldRanking`` Pydantic model has ``extra='forbid'`` (D-09 LLM-output
  injection mitigation).
- ``rank_fields_for_tool``: ≤10 fields → deterministic only (NO LLM call).
- ``rank_fields_for_tool``: >10 fields → LLM call with mocked
  OpenRouter response.
- Transient ``httpx.HTTPError`` retried up to 3 times with exponential
  backoff (D-11 inner retry tier).
- Validation failure → 1 outer retry → deterministic fallback (D-11
  policy: 1 outer retry then fallback, NOT 2 like Pass 3 D-26).
- Module-level constants: concurrency = 10 (D-06), max validation
  retries = 1 (D-11), field-count threshold = 10.
- ``PASS_5_FIELD_RANKING_AGENT`` constructed via ``make_agent`` (D-01
  invariant — no direct ``OpenAIModel``/``OpenAIProvider`` construction).
- ``rank_fields_for_tool`` invokes Agent with ``model_settings=
  PASS_5_SETTINGS`` (Pitfall #2).

References:
- 04-CONTEXT.md D-01 + D-06 + D-09 + D-11.
- docs/mcpgen-pass-5-design.md §1.4 + §7 + Appendix B.
- Analog: tests/passes/pass_3/test_enrich.py.
"""

from __future__ import annotations

import asyncio
import inspect
import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest
from mcpgen_ir.types import Tool1
from pydantic import ValidationError
from pydantic_ai.settings import ModelSettings
from pytest_httpx import HTTPXMock

from mcpgen_engine.llm.sampling import PASS_5_SETTINGS
from mcpgen_engine.passes.pass_5 import field_ranking as field_ranking_module
from mcpgen_engine.passes.pass_5.field_ranking import (
    _FIELD_COUNT_LLM_THRESHOLD,
    _MAX_VALIDATION_RETRIES,
    PASS_5_FIELD_RANKING_AGENT,
    PASS_5_FIELD_RANKING_CONCURRENCY,
    FieldRanking,
    deterministic_ranking,
    heuristic_score,
    rank_all_fields,
    rank_fields_for_tool,
)
from mcpgen_engine.passes.pass_5.output_schema import OutputSchemaSpec

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ─────────────────────────── Fixture builders ──────────────────────────────


def _mock_openrouter_function_call(payload: dict[str, Any]) -> dict[str, Any]:
    """Build a minimal OpenRouter chat-completions response wrapping ``payload``."""
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


def _valid_ranking_payload() -> dict[str, Any]:
    return {
        "always_include": ["id", "name", "status"],
        "opt_in": ["metadata", "attributes"],
        "always_exclude": ["_internal_id", "raw_payload"],
    }


# ─────────────────────────── Module-level constants ────────────────────────


def test_concurrency_limit_10() -> None:
    """D-06 — per-tool concurrency cap is 10."""
    assert PASS_5_FIELD_RANKING_CONCURRENCY == 10


def test_max_validation_retries_constant_is_1() -> None:
    """D-11 — Pass 5 has 1 validation retry (NOT 2 like Pass 3)."""
    assert _MAX_VALIDATION_RETRIES == 1


def test_field_count_llm_threshold_is_10() -> None:
    """Pass 5 design §1.4 — only call LLM when > 10 fields."""
    assert _FIELD_COUNT_LLM_THRESHOLD == 10


def test_field_ranking_agent_singleton_constructed() -> None:
    """Module-level Agent built via ``make_agent`` is non-None."""
    assert PASS_5_FIELD_RANKING_AGENT is not None


def test_no_direct_model_construction_in_field_ranking() -> None:
    """D-01 invariant: no direct OpenAIModel / OpenAIProvider construction."""
    src = inspect.getsource(field_ranking_module)
    assert "OpenAIModel(" not in src
    assert "OpenAIProvider(" not in src
    assert "OpenRouterModel(" not in src


# ─────────────────────────── FieldRanking shape ────────────────────────────


def test_field_ranking_extra_forbid() -> None:
    """D-09 — LLM-output injection mitigation: extra keys raise."""
    with pytest.raises(ValidationError):
        FieldRanking.model_validate(
            {
                "always_include": [],
                "opt_in": [],
                "always_exclude": [],
                "unknown_key": [],
            }
        )


def test_field_ranking_default_factory_lists() -> None:
    """Empty FieldRanking() yields three empty lists."""
    fr = FieldRanking()
    assert fr.always_include == []
    assert fr.opt_in == []
    assert fr.always_exclude == []


# ─────────────────────────── Heuristic score ───────────────────────────────


def test_heuristic_score_required_field_baseline() -> None:
    """Required → +0.5 baseline."""
    score = heuristic_score("xyz", is_required=True, description=None)
    assert score == pytest.approx(0.5)


def test_heuristic_score_high_value_pattern() -> None:
    """High-value field name (e.g. created_at) → +0.3."""
    score = heuristic_score("created_at", is_required=False, description=None)
    assert score == pytest.approx(0.3)


def test_heuristic_score_high_value_id_suffix() -> None:
    """``foo_id`` matches the high-value ``.*_id`` pattern → +0.3."""
    score = heuristic_score("customer_id", is_required=False, description=None)
    assert score == pytest.approx(0.3)


def test_heuristic_score_low_value_pattern() -> None:
    """Low-value pattern (``_internal``) → -0.3."""
    score = heuristic_score("_internal", is_required=False, description=None)
    assert score == pytest.approx(-0.3)


def test_heuristic_score_low_value_raw_prefix() -> None:
    """``raw_*`` prefix → -0.3."""
    score = heuristic_score("raw_payload", is_required=False, description=None)
    assert score == pytest.approx(-0.3)


def test_heuristic_score_description_signals_high() -> None:
    """Description containing 'main'/'primary'/'key' → +0.2."""
    score = heuristic_score("xyz", is_required=False, description="The primary identifier")
    assert score == pytest.approx(0.2)


def test_heuristic_score_description_signals_low() -> None:
    """Description containing 'internal'/'deprecated'/'debug' → -0.3."""
    score = heuristic_score("xyz", is_required=False, description="Deprecated; do not use")
    assert score == pytest.approx(-0.3)


# ─────────────────────────── Deterministic ranking ─────────────────────────


def test_deterministic_ranking_above_cutoff() -> None:
    """Score >= +0.3 → always_include."""
    fields = {
        "id": {"required": True},  # +0.5 + 0.3 = 0.8
        "created_at": {},  # +0.3
    }
    ranking = deterministic_ranking(fields)
    assert "id" in ranking.always_include
    assert "created_at" in ranking.always_include


def test_deterministic_ranking_below_cutoff() -> None:
    """Score <= -0.3 → always_exclude."""
    fields: dict[str, dict[str, Any]] = {
        "_internal": {},  # -0.3
        "raw_blob": {},  # -0.3
    }
    ranking = deterministic_ranking(fields)
    assert "_internal" in ranking.always_exclude
    assert "raw_blob" in ranking.always_exclude


def test_deterministic_ranking_uncertain_to_opt_in() -> None:
    """-0.3 < score < +0.3 → opt_in (conservative bias)."""
    fields: dict[str, dict[str, Any]] = {
        "ambiguous_field": {},  # 0.0
    }
    ranking = deterministic_ranking(fields)
    assert "ambiguous_field" in ranking.opt_in
    assert "ambiguous_field" not in ranking.always_include
    assert "ambiguous_field" not in ranking.always_exclude


def test_deterministic_ranking_partitions_all_fields() -> None:
    """Every input field appears in exactly one of the 3 sets."""
    fields = {
        "id": {"required": True},
        "name": {},
        "_internal": {},
        "weird_obj": {},
    }
    ranking = deterministic_ranking(fields)
    union = set(ranking.always_include) | set(ranking.opt_in) | set(ranking.always_exclude)
    assert union == set(fields.keys())
    assert (len(ranking.always_include) + len(ranking.opt_in) + len(ranking.always_exclude)) == len(
        fields
    )


# ─────────────────────────── rank_fields_for_tool ──────────────────────────


async def test_rank_fields_for_tool_under_threshold_no_llm(
    httpx_mock: HTTPXMock,
    output_schema_spec_under_threshold: OutputSchemaSpec,
    tool1_get_thing: Tool1,
) -> None:
    """≤10 fields → deterministic-only, ZERO LLM calls."""
    sem = asyncio.Semaphore(10)
    ranking = await rank_fields_for_tool(
        tool1_get_thing,
        output_schema_spec_under_threshold,
        description=None,
        sem=sem,
    )
    assert isinstance(ranking, FieldRanking)
    assert len(httpx_mock.get_requests()) == 0


@pytest.mark.requires_openrouter
async def test_rank_fields_for_tool_over_threshold_calls_llm(
    httpx_mock_qwen: Callable[[dict[str, Any]], None],
    httpx_mock: HTTPXMock,
    output_schema_spec_over_threshold: OutputSchemaSpec,
    tool1_get_complex: Tool1,
) -> None:
    """>10 fields → 1 LLM call returns mocked FieldRanking."""
    httpx_mock_qwen(_valid_ranking_payload())
    sem = asyncio.Semaphore(10)
    ranking = await rank_fields_for_tool(
        tool1_get_complex,
        output_schema_spec_over_threshold,
        description=None,
        sem=sem,
    )
    assert isinstance(ranking, FieldRanking)
    assert "id" in ranking.always_include
    assert len(httpx_mock.get_requests()) == 1


# ─────────────────────────── Retry behaviour ───────────────────────────────


@pytest.mark.requires_openrouter
async def test_retry_on_transient_httpx_error(
    httpx_mock: HTTPXMock,
    output_schema_spec_over_threshold: OutputSchemaSpec,
    tool1_get_complex: Tool1,
) -> None:
    """Inner retry tier: transient httpx error → 2 retries → success on 3rd."""
    # First two HTTP calls fail with a transient network error.
    httpx_mock.add_exception(httpx.ConnectTimeout("timeout 1"))
    httpx_mock.add_exception(httpx.ConnectTimeout("timeout 2"))
    # Third call succeeds.
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_valid_ranking_payload()),
    )
    sem = asyncio.Semaphore(10)
    ranking = await rank_fields_for_tool(
        tool1_get_complex,
        output_schema_spec_over_threshold,
        description=None,
        sem=sem,
    )
    assert isinstance(ranking, FieldRanking)
    # 3 attempts (2 failures + 1 success).
    assert len(httpx_mock.get_requests()) == 3


@pytest.mark.requires_openrouter
async def test_retry_validation_error_falls_back_to_deterministic(
    monkeypatch: Any,
    output_schema_spec_over_threshold: OutputSchemaSpec,
    tool1_get_complex: Tool1,
) -> None:
    """D-11 — Pydantic validation error: 1 outer retry → still bad → fallback.

    Uses monkeypatch on Agent.run because PydanticAI's internal output-retry
    loop absorbs ``ValidationError`` from structured output decoding before
    our outer loop sees it (mirrors test_enrich.py pattern).
    """
    call_count = {"n": 0}

    async def fake_run(self: Any, prompt: str, **kwargs: Any) -> Any:  # noqa: ARG001
        call_count["n"] += 1
        # Always raise ValidationError to exhaust the outer retry budget.
        FieldRanking.model_validate({"always_include": [], "opt_in": [], "always_exclude": [123]})

    monkeypatch.setattr(
        PASS_5_FIELD_RANKING_AGENT,
        "run",
        fake_run.__get__(PASS_5_FIELD_RANKING_AGENT, type(PASS_5_FIELD_RANKING_AGENT)),
    )

    sem = asyncio.Semaphore(10)
    ranking = await rank_fields_for_tool(
        tool1_get_complex,
        output_schema_spec_over_threshold,
        description=None,
        sem=sem,
    )
    # Did NOT raise; deterministic fallback returned.
    assert isinstance(ranking, FieldRanking)
    # 1 initial + 1 retry = 2 outer attempts (D-11: _MAX_VALIDATION_RETRIES=1).
    assert call_count["n"] == _MAX_VALIDATION_RETRIES + 1


@pytest.mark.requires_openrouter
async def test_uses_pass_5_settings(
    monkeypatch: Any,
    output_schema_spec_over_threshold: OutputSchemaSpec,
    tool1_get_complex: Tool1,
) -> None:
    """Every Agent call uses ``model_settings=PASS_5_SETTINGS`` (Pitfall #2)."""
    captured_settings: list[ModelSettings | None] = []

    async def fake_run(self: Any, prompt: str, **kwargs: Any) -> Any:  # noqa: ARG001
        captured_settings.append(kwargs.get("model_settings"))

        class _FakeResult:
            output = FieldRanking.model_validate(_valid_ranking_payload())

        return _FakeResult()

    monkeypatch.setattr(
        PASS_5_FIELD_RANKING_AGENT,
        "run",
        fake_run.__get__(PASS_5_FIELD_RANKING_AGENT, type(PASS_5_FIELD_RANKING_AGENT)),
    )

    sem = asyncio.Semaphore(10)
    await rank_fields_for_tool(
        tool1_get_complex,
        output_schema_spec_over_threshold,
        description=None,
        sem=sem,
    )
    assert len(captured_settings) == 1
    # Object identity — must be the exact PASS_5_SETTINGS singleton.
    assert captured_settings[0] is PASS_5_SETTINGS


# ─────────────────────────── rank_all_fields orchestrator ──────────────────


async def test_rank_all_fields_empty_input() -> None:
    """Empty input → empty result, no LLM calls."""
    from mcpgen_ir.types import Pass1Output, Pass2Output, Routing1, SmartId

    pass_1 = Pass1Output(
        tools=[],
        routing=Routing1(
            smart_id=SmartId(
                format="example:{type}:{collection}:{identifier}",
                types=["object"],
                collections=[],
            ),
            rules=[],
        ),
        workflows=[],
        coverage_pct=0.0,
        coverage_proof=[],
    )
    pass_2 = Pass2Output(descriptions={})
    result = await rank_all_fields({}, pass_2, pass_1)
    assert result == {}
