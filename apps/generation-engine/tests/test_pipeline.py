"""Full pipeline (Stage A → Pass 0 → Pass 1) integration tests.

VALIDATION rows:
- T-2-C6: Stripe E2E final tool count 6-12 (asserted indirectly via the
  Stripe fixture in `test_pass_1_e2e.py`; this module covers full pipeline
  including Stage A + Pass 0 with a synthetic OpenAPI spec).
- T-2-D1 / GEN-12 / D-41: second pipeline run on identical spec produces
  ZERO LLM calls (L1 cache hit returns the architect output without
  re-running Pass 0 or Pass 1).

The pipeline tests use a small synthetic OpenAPI 3.0 spec (3 endpoints) so
Stage A parses in <1s. OpenRouter is mocked via ``pytest-httpx``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pytest_httpx import HTTPXMock

from mcpgen_engine.cache import clear_l1, clear_l2
from mcpgen_engine.passes.pass_0.filter import UserOptions
from mcpgen_engine.pipeline import (
    GenerationSseEvent,
    reconstruct_from_l1,
    run_pipeline,
)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ─────────────────────────────── Fixtures ──────────────────────────────────


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Per-test cache isolation."""
    monkeypatch.setenv("MCPGEN_CACHE_DIR", str(tmp_path / "mcpgen-cache"))
    from mcpgen_engine.settings import get_settings

    get_settings.cache_clear()
    clear_l1()
    clear_l2()


# ────────────────────────── Mocked-LLM helpers ─────────────────────────────


def _mock_openrouter_function_call(payload: dict[str, Any]) -> dict[str, Any]:
    """Build a minimal OpenRouter chat-completions response with `final_result` tool call."""
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


def _synthetic_openapi_spec() -> str:
    """Tiny OpenAPI 3.0 spec — 3 endpoints, parses in <100ms."""
    return json.dumps(
        {
            "openapi": "3.0.0",
            "info": {"title": "Test API", "version": "1.0.0"},
            "servers": [{"url": "https://api.test.example"}],
            "paths": {
                "/v1/widgets": {
                    "get": {
                        "operationId": "list_widgets",
                        "summary": "List widgets",
                        "responses": {"200": {"description": "OK"}},
                    },
                    "post": {
                        "operationId": "create_widget",
                        "summary": "Create a widget",
                        "responses": {"201": {"description": "Created"}},
                    },
                },
                "/v1/widgets/{widget_id}": {
                    "get": {
                        "operationId": "get_widget",
                        "summary": "Get a widget by id",
                        "parameters": [
                            {
                                "name": "widget_id",
                                "in": "path",
                                "required": True,
                                "schema": {"type": "string"},
                            }
                        ],
                        "responses": {"200": {"description": "OK"}},
                    },
                },
            },
            "components": {
                "securitySchemes": {
                    "bearerAuth": {"type": "http", "scheme": "bearer"},
                }
            },
        }
    )


def _pass_0_payload() -> dict[str, Any]:
    """Pass-0 LLM output covering the synthetic 3 endpoints."""
    return {
        "tool_plans": [
            {
                "name": "widgets_list",
                "category": "crud",
                "source_endpoints": ["GET /v1/widgets"],
                "rationale": "list widgets",
            },
            {
                "name": "widgets_create",
                "category": "crud",
                "source_endpoints": ["POST /v1/widgets"],
                "rationale": "create widget",
            },
            {
                "name": "widgets_get",
                "category": "crud",
                "source_endpoints": ["GET /v1/widgets/{widget_id}"],
                "rationale": "fetch widget",
            },
        ],
        "composite_candidates": [],
        "llm_dropped_endpoints": [],
    }


def _pass_1_universal_payload() -> dict[str, Any]:
    """Pass-1 universal-tools payload covering all 3 endpoints via universal slots."""
    return {
        "search": {
            "name": "search",
            "type": "universal",
            "source_endpoints": [],
        },
        "fetch": {
            "name": "fetch",
            "type": "universal",
            "source_endpoints": ["GET /v1/widgets/{widget_id}"],
        },
        "list_collections": {
            "name": "list_collections",
            "type": "universal",
            "source_endpoints": [],
        },
        "list_objects": {
            "name": "list_objects",
            "type": "universal",
            "source_endpoints": ["GET /v1/widgets"],
        },
        "upsert": {
            "name": "upsert",
            "type": "universal",
            "source_endpoints": ["POST /v1/widgets"],
        },
        "delete": {
            "name": "delete",
            "type": "universal",
            "source_endpoints": [],
        },
    }


def _build_options() -> UserOptions:
    return UserOptions(
        target_complexity="standard",
        max_tools_override=None,
        explicit_includes=[],
        explicit_excludes=[],
    )


def _job_id(suffix: str) -> str:
    """26-char ULID stub for test job IDs (Crockford alphabet)."""
    return f"gen_01HZW3J6V7XAEMP9N0DZTA8FB{suffix}"


# ───────────────────────────── Pipeline tests ──────────────────────────────


async def test_full_pipeline_emits_phase_2_sse_sequence(httpx_mock: HTTPXMock) -> None:
    """Cold pipeline emits the D-47 SSE sequence end-to-end.

    Sequence:
      A:started → A:completed
      B:started (pass_0) → B:completed (pass_0)
      B:started (pass_1) → B:completed (pass_1)
      completed:completed
    """
    # Pass 0 mock (1 LLM call), Pass 1 mock (1 universal-synth call). No
    # extras in this synthetic spec → no per-extra calls.
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_0_payload()),
    )
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_1_universal_payload()),
    )

    events: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url=None,
        spec_content=_synthetic_openapi_spec(),
        options=_build_options(),
        job_id=_job_id("1"),
    ):
        events.append(event)

    # SSE sequence per D-47.
    seq = [(e.stage, e.status) for e in events]
    assert seq[0] == ("A", "started")
    assert ("A", "completed") in seq
    assert seq[-1] == ("completed", "completed")

    # Stage B fires twice (pass_0 + pass_1), once started + once completed each.
    b_completed = [e for e in events if e.stage == "B" and e.status == "completed"]
    assert len(b_completed) == 2

    pass_0_done = next(
        e for e in b_completed if e.partial_result and e.partial_result.get("phase") == "pass_0"
    )
    pass_1_done = next(
        e for e in b_completed if e.partial_result and e.partial_result.get("phase") == "pass_1"
    )

    assert pass_0_done.partial_result is not None
    tool_plan_count = pass_0_done.partial_result["tool_plan_count"]
    assert isinstance(tool_plan_count, int)
    assert tool_plan_count == 3

    assert pass_1_done.partial_result is not None
    final_tool_count = pass_1_done.partial_result["final_tool_count"]
    assert isinstance(final_tool_count, int)
    assert final_tool_count == 6  # 6 universal slots
    coverage_pct = pass_1_done.partial_result["coverage_pct"]
    assert isinstance(coverage_pct, int | float)
    assert float(coverage_pct) == 100.0


async def test_second_run_zero_llm_calls(httpx_mock: HTTPXMock) -> None:
    """T-2-D1 / GEN-12 / D-41: second run hits L1 → zero Qwen calls.

    Run pipeline twice with identical spec. First run mocks 2 LLM calls
    (Pass 0 + Pass 1). Second run is mocked with NO responses; if any LLM
    call fires it raises HTTPXMock-not-registered and the test fails.
    """
    spec = _synthetic_openapi_spec()

    # First run — primes the L1 cache.
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_0_payload()),
    )
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_1_universal_payload()),
    )

    events_1: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url=None,
        spec_content=spec,
        options=_build_options(),
        job_id=_job_id("1"),
    ):
        events_1.append(event)

    first_run_calls = len(httpx_mock.get_requests(url=OPENROUTER_URL))
    assert (
        first_run_calls >= 2
    ), f"first run should have triggered ≥2 Qwen calls, got {first_run_calls}"

    # Second run — every additional response would have to be registered;
    # if the pipeline calls OpenRouter again, pytest-httpx raises a
    # `pytest_httpx.IncompatibleResponses` since none are registered.
    events_2: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url=None,
        spec_content=spec,
        options=_build_options(),
        job_id=_job_id("2"),
    ):
        events_2.append(event)

    total_calls = len(httpx_mock.get_requests(url=OPENROUTER_URL))
    second_run_calls = total_calls - first_run_calls
    assert second_run_calls == 0, (
        f"GEN-12 violation: second run made {second_run_calls} LLM calls "
        "(expected 0 — L1 cache hit)"
    )

    # Second-run terminal event must signal cache=l1_hit.
    final = events_2[-1]
    assert final.stage == "completed"
    assert final.partial_result is not None
    assert final.partial_result.get("cache") == "l1_hit"


async def test_pipeline_persists_full_architect_output_to_l1(httpx_mock: HTTPXMock) -> None:
    """L1 stores ``{raw_ir, pass_0_output, pass_1_output}`` so reconstruction is lossless."""
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_0_payload()),
    )
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(_pass_1_universal_payload()),
    )

    async for _event in run_pipeline(
        spec_url=None,
        spec_content=_synthetic_openapi_spec(),
        options=_build_options(),
        job_id=_job_id("X"),
    ):
        pass

    # Walk the cache layer for the single entry just written.
    from mcpgen_engine.cache import get_l1, l1_key
    from mcpgen_engine.stages import stage_a

    raw_ir = await stage_a.run(spec_url=None, spec_content=_synthetic_openapi_spec())
    cached = get_l1(l1_key(raw_ir.spec_hash))
    assert cached is not None

    # Round-trip through `reconstruct_from_l1`.
    raw_ir_2, pass_0_output, pass_1_output = reconstruct_from_l1(cached)
    assert raw_ir_2.spec_hash == raw_ir.spec_hash
    assert len(pass_0_output.tool_plans) == 3
    assert len(pass_1_output.tools) == 6
    assert pass_1_output.coverage_pct == 100.0


async def test_pipeline_emits_failed_event_on_stage_a_error() -> None:
    """Stage A failure → ``stage='failed' status='error'`` with stable code."""
    events: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url=None,
        spec_content="{not-valid-json-or-yaml: [",  # malformed
        options=_build_options(),
        job_id=_job_id("3"),
    ):
        events.append(event)

    assert events[-1].stage == "failed"
    assert events[-1].status == "error"
    assert events[-1].error is not None
    assert events[-1].error.code == "STAGE_A_FAILED"


async def test_pipeline_invalid_input_both_url_and_content() -> None:
    """Stage A rejects both spec_url AND spec_content set → failed event."""
    events: list[GenerationSseEvent] = []
    async for event in run_pipeline(
        spec_url="https://example.com/spec.json",
        spec_content="{}",
        options=_build_options(),
        job_id=_job_id("4"),
    ):
        events.append(event)

    assert events[-1].stage == "failed"
    assert events[-1].error is not None
    assert events[-1].error.code == "STAGE_A_FAILED"
    assert "INVALID_INPUT" in events[-1].error.message
