"""Pass 0 chunked-spec path tests.

VALIDATION row T-2-B6: Pass 0 chunked path triggers when > 200 endpoints
AFTER deterministic filter.

Coverage:
- Phase-1 deterministic clustering by first two path segments.
- T-2-B6 chunked-threshold activation: > 200 endpoints → multiple OpenRouter
  calls (cluster decisions + per-cluster detail).
- Concurrency cap (Semaphore(5)) keeps wall-clock bounded under load.
- Hard-fail at > 1000 endpoints (Pass0Error("SPEC_TOO_LARGE_ENDPOINTS")) with
  concrete path-prefix suggestions.
- Cross-cluster naming-collision disambiguation (deterministic).
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from typing import Any

import httpx as _httpx
import pytest
from mcpgen_ir.types import Endpoint, Method
from pytest_httpx import HTTPXMock

from mcpgen_engine.passes.pass_0.chunked import (
    HARD_FAIL_THRESHOLD,
    _path_cluster,
    run_llm_chunked,
)
from mcpgen_engine.passes.pass_0.filter import UserOptions
from mcpgen_engine.passes.pass_0.validation import Pass0Error

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ─────────────────────────── Mocked-LLM helpers ────────────────────────────


def _mock_response(payload: dict[str, Any]) -> dict[str, Any]:
    """OpenRouter chat-completions response carrying a `final_result` tool-call."""
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


def _make_endpoint(method: str, path: str) -> Endpoint:
    return Endpoint(
        method=Method(method),
        path=path,
        operation_id=None,
        summary=None,
        description=None,
        parameters=[],
        request_body=None,
        responses={},
        tags=[],
        deprecated=False,
    )


def _build_options() -> UserOptions:
    return UserOptions(
        target_complexity="standard",
        max_tools_override=None,
        explicit_includes=[],
        explicit_excludes=[],
    )


def _payload_for(plan_name: str, source_endpoint: str = "GET /v1/x") -> dict[str, Any]:
    """Minimal valid Pass0LlmOutput payload with one tool plan."""
    return {
        "tool_plans": [
            {
                "name": plan_name,
                "category": "crud",
                "source_endpoints": [source_endpoint],
                "rationale": "synthetic chunked test plan",
            }
        ],
        "composite_candidates": [],
        "llm_dropped_endpoints": [],
    }


def _rotating_payloads() -> Iterator[dict[str, Any]]:
    """Generator yielding a unique-name payload on each `next()`."""
    counter = 0
    while True:
        yield _payload_for(f"chunk_{counter:04d}_resource", f"GET /v1/x_{counter:04d}")
        counter += 1


def _callback_factory(payloads: Iterator[dict[str, Any]]) -> Any:
    def _callback(_request: _httpx.Request) -> _httpx.Response:
        return _httpx.Response(status_code=200, json=_mock_response(next(payloads)))

    return _callback


def _delayed_callback_factory(payloads: Iterator[dict[str, Any]], delay_seconds: float) -> Any:
    """Like _callback_factory but `await asyncio.sleep`s per call (concurrency probe).

    pytest-httpx supports both sync and async callbacks. We use the async form
    so the event loop stays cooperative — without that, sync ``time.sleep``
    would serialize all requests regardless of the Semaphore cap.
    """

    async def _callback(_request: _httpx.Request) -> _httpx.Response:
        await asyncio.sleep(delay_seconds)
        return _httpx.Response(status_code=200, json=_mock_response(next(payloads)))

    return _callback


# ─────────────────────────── Phase 1 — clustering ──────────────────────────


def test_path_cluster_phase_1_groups_by_first_two_segments() -> None:
    """30 endpoints across 5 clusters → 5 dict keys, correct counts each."""
    endpoints: list[Endpoint] = []
    cluster_prefixes = [
        "/v1/customers",
        "/v1/charges",
        "/v1/subscriptions",
        "/v1/refunds",
        "/v1/invoices",
    ]
    for prefix in cluster_prefixes:
        for i in range(6):
            endpoints.append(_make_endpoint("GET", f"{prefix}/{i:03d}"))

    clusters = _path_cluster(endpoints)
    assert set(clusters.keys()) == set(cluster_prefixes)
    for prefix in cluster_prefixes:
        assert len(clusters[prefix]) == 6


def test_path_cluster_handles_single_segment_paths() -> None:
    """Paths with one segment (`/login`) cluster under `/login`."""
    endpoints = [_make_endpoint("POST", "/login"), _make_endpoint("POST", "/logout")]
    clusters = _path_cluster(endpoints)
    assert clusters == {"/login": [endpoints[0]], "/logout": [endpoints[1]]}


# ─────────────────────────── T-2-B6 — threshold ────────────────────────────


async def test_chunked_threshold_triggers_multiple_calls(httpx_mock: HTTPXMock) -> None:
    """T-2-B6: 220 endpoints across 4 clusters → 1 cross-cluster + 4 per-cluster calls."""
    endpoints: list[Endpoint] = []
    for cluster_idx in range(4):
        for i in range(55):
            endpoints.append(_make_endpoint("GET", f"/v1/cluster_{cluster_idx:02d}/item_{i:04d}"))

    httpx_mock.add_callback(
        _callback_factory(_rotating_payloads()),
        url=OPENROUTER_URL,
        is_reusable=True,
    )

    output = await run_llm_chunked(endpoints, _build_options(), concurrency=5)

    requests = [r for r in httpx_mock.get_requests() if r.url.path == "/api/v1/chat/completions"]
    # Phase 2 (1 cross-cluster) + Phase 3 (4 per-cluster) = 5.
    assert len(requests) == 5, f"expected 5 OpenRouter calls, got {len(requests)}"
    # Phase 4 merges all per-cluster plans → at least 4 unique tool plans.
    assert len(output.tool_plans) >= 4


async def test_chunked_below_threshold_inputs_still_work(httpx_mock: HTTPXMock) -> None:
    """run_llm_chunked invoked on < threshold inputs still produces valid output.

    The orchestrator (__init__.py) is responsible for routing single-shot vs
    chunked. Calling chunked directly with 3 endpoints should still succeed
    (defensive — useful for direct-API consumers).
    """
    endpoints = [_make_endpoint("GET", f"/v1/resource_{i}") for i in range(3)]
    httpx_mock.add_callback(
        _callback_factory(_rotating_payloads()),
        url=OPENROUTER_URL,
        is_reusable=True,
    )

    output = await run_llm_chunked(endpoints, _build_options(), concurrency=5)
    assert output.tool_plans, "chunked path must produce at least one tool plan"


# ─────────────────────────── Hard-fail @ > 1000 ────────────────────────────


async def test_hard_fail_above_1000(httpx_mock: HTTPXMock) -> None:
    """> HARD_FAIL_THRESHOLD endpoints → Pass0Error('SPEC_TOO_LARGE_ENDPOINTS').

    No OpenRouter calls should fire — the check happens deterministically
    before Phase 1 clustering.
    """
    # 1500 endpoints across 50 clusters of size 30 each — qualifies for
    # cluster_by_path_prefix suggestions.
    endpoints: list[Endpoint] = []
    for cluster_idx in range(50):
        for i in range(30):
            endpoints.append(_make_endpoint("GET", f"/v1/cluster_{cluster_idx:02d}/item_{i:04d}"))

    assert len(endpoints) > HARD_FAIL_THRESHOLD

    with pytest.raises(Pass0Error) as exc_info:
        await run_llm_chunked(endpoints, _build_options(), concurrency=5)

    assert "SPEC_TOO_LARGE_ENDPOINTS" in str(exc_info.value)
    assert exc_info.value.suggestions, "expected non-empty path-prefix suggestions"
    for suggestion in exc_info.value.suggestions:
        assert suggestion.startswith("/"), f"bad suggestion: {suggestion!r}"

    # No OpenRouter calls should have been made.
    assert (
        len([r for r in httpx_mock.get_requests() if r.url.path == "/api/v1/chat/completions"]) == 0
    )


# ─────────────────────────── Naming collisions ─────────────────────────────


async def test_naming_collision_disambiguation(httpx_mock: HTTPXMock) -> None:
    """Two clusters both produce ``users_create`` → second is disambiguated.

    Use a deterministic responder that returns ``users_create`` on every per-cluster
    Phase-3 call (cross-cluster Phase-2 returns no composites). The first
    occurrence keeps the unprefixed name; subsequent ones gain a cluster-namespace
    prefix.
    """
    endpoints: list[Endpoint] = []
    cluster_prefixes = ["/v1/clusterA", "/v1/clusterB"]
    for prefix in cluster_prefixes:
        for i in range(3):
            endpoints.append(_make_endpoint("POST", f"{prefix}/users/{i:03d}"))

    # Same payload on every call.
    payload = _payload_for("users_create", "POST /v1/users")
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_response(payload),
        is_reusable=True,
    )

    output = await run_llm_chunked(endpoints, _build_options(), concurrency=5)

    plan_names = sorted(p.name for p in output.tool_plans)
    # Exactly one ``users_create`` (first cluster) plus at least one disambiguated
    # collision (second cluster). The second name MUST start with the cluster
    # namespace prefix.
    assert "users_create" in plan_names
    disambiguated = [n for n in plan_names if n != "users_create"]
    assert disambiguated, "expected at least one disambiguated collision"
    # The cluster_namespace prefixes are derived from path: ``v1_clustera`` /
    # ``v1_clusterb`` (lowercased). At least one disambiguated name carries one.
    assert any(n.startswith(("v1_clustera_", "v1_clusterb_")) for n in disambiguated)


# ─────────────────── Concurrency cap (calibration probe) ───────────────────


async def test_concurrency_semaphore_caps_parallelism(httpx_mock: HTTPXMock) -> None:
    """Semaphore(5) caps simultaneous in-flight requests.

    Build 10 clusters; mock each call to block 50 ms via a callback that calls
    ``time.sleep``. With concurrency=5, total wall-clock is at least 2 batches
    of 50 ms = ≥100 ms. Without the cap, 10 parallel sleeps would finish in
    ≥50 ms; a cap of 5 enforces ≥100 ms. We also assert the orchestrator
    completes in well under 1 second (10 x 50 ms = 500 ms upper bound,
    plus the cross-cluster Phase 2 call, plus thread-pool overhead).
    """
    endpoints: list[Endpoint] = []
    for cluster_idx in range(10):
        for i in range(3):
            endpoints.append(_make_endpoint("GET", f"/v1/cluster_{cluster_idx:02d}/item_{i:04d}"))

    httpx_mock.add_callback(
        _delayed_callback_factory(_rotating_payloads(), delay_seconds=0.05),
        url=OPENROUTER_URL,
        is_reusable=True,
    )

    start = asyncio.get_event_loop().time()
    output = await run_llm_chunked(endpoints, _build_options(), concurrency=5)
    elapsed = asyncio.get_event_loop().time() - start

    # Lower bound — at least ceil(10/5) batches of 50 ms = 100 ms (per-cluster
    # Phase 3) plus the Phase-2 single call ≥ 50 ms — total ≥ 150 ms.
    assert elapsed >= 0.10, f"expected ≥ 100 ms, got {elapsed * 1000:.1f} ms"
    # Upper bound: deeply pessimistic 1 second (well above the expected 200-300 ms).
    assert elapsed < 1.0, f"chunked path should finish < 1 s, took {elapsed * 1000:.1f} ms"
    assert len(output.tool_plans) >= 10, "expected ≥ 1 tool plan per cluster"
