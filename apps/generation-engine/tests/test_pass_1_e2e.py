"""Pass 1 end-to-end (mocked LLM) against engine-fixtures.

VALIDATION rows: GEN-03 mocked-LLM Pass 1 against `packages/engine-fixtures` corpus.

Per-fixture parametrized test: load the canonical Pass 0 output + IR + Pass 1
output JSON, run `pass_1.run(...)` against a `pytest-httpx`-mocked OpenRouter
that returns canned `_UniversalToolsLlmOutput` payloads matching each
fixture's `pass-1-output.json` structurally (D-54).

T-2-C6 (Stripe golden 6-12 final tools) is asserted parametrically against
the Stripe fixture only.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from mcpgen_ir.types import (
    Pass0Output,
    RawIR,
    Tool1,
)
from pytest_httpx import HTTPXMock

from mcpgen_engine.passes.pass_0.filter import UserOptions
from mcpgen_engine.passes.pass_1 import run as pass_1_run

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_FIXTURE_NAMES = ["stripe", "github", "notion", "linear", "slack"]
_FIXTURES_ROOT = Path(__file__).resolve().parents[3] / "packages" / "engine-fixtures"

_SPEC_TITLES: dict[str, str] = {
    "stripe": "Stripe API",
    "github": "GitHub v3 REST API",
    "notion": "Notion API",
    "linear": "Linear API",
    "slack": "Slack API",
}


# ─────────────────────────── Helpers ───────────────────────────────────────


def _mock_openrouter_function_call(payload: dict[str, Any]) -> dict[str, Any]:
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
                        },
                    ],
                },
                "finish_reason": "tool_calls",
            },
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20},
    }


def _tool_to_canonical_dict(tool: dict[str, Any]) -> dict[str, Any]:
    """Strip `description`, `inputSchema`, `outputSchema`, `annotations`,
    `response_config` from a fixture's Tool — Pass 1 IR Tool1 has only
    `name`, `type`, `source_endpoints`."""
    return {
        "name": tool["name"],
        "type": tool["type"],
        "source_endpoints": tool["source_endpoints"],
    }


def _build_universal_payload(expected_tools: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a `_UniversalToolsLlmOutput` payload from a fixture's `tools` list.

    Maps each universal tool name to its canonical dict; any missing
    universal slot gets a stub with `source_endpoints=[]` (D-29).
    """
    by_name = {t["name"]: t for t in expected_tools if t["type"] == "universal"}
    payload: dict[str, Any] = {}
    for slot in ("search", "fetch", "list_collections", "list_objects", "upsert", "delete"):
        if slot in by_name:
            payload[slot] = _tool_to_canonical_dict(by_name[slot])
        else:
            payload[slot] = {
                "name": slot,
                "type": "universal",
                "source_endpoints": [],
            }
    return payload


def _build_extra_payload(extra: dict[str, Any]) -> dict[str, Any]:
    """Build a Tool1 payload for an action / workflow / specialized fixture tool."""
    return _tool_to_canonical_dict(extra)


# ─────────────────────────── Parametrized E2E ──────────────────────────────


@pytest.mark.parametrize("fixture_name", _FIXTURE_NAMES)
async def test_pass_1_e2e_against_fixture(
    fixture_name: str,
    httpx_mock: HTTPXMock,
) -> None:
    """Pass 1 E2E: produces `Pass1Output` matching engine-fixtures `<name>/pass-1-output.json`.

    Structural equivalence per D-54 — same tool names, same routing rules,
    same smart-ID format. Description text content does NOT need to match
    (Phase 3 owns descriptions).
    """
    fx_dir = _FIXTURES_ROOT / fixture_name
    pass_0_data = json.loads((fx_dir / "pass-0-output.json").read_text())
    raw_ir_data = json.loads((fx_dir / "ir.json").read_text())
    expected = json.loads((fx_dir / "pass-1-output.json").read_text())

    pass_0_output = Pass0Output.model_validate(pass_0_data)
    raw_ir = RawIR.model_validate(raw_ir_data)

    expected_tools: list[dict[str, Any]] = expected["tools"]
    universal_payload = _build_universal_payload(expected_tools)
    extras = [t for t in expected_tools if t["type"] != "universal"]
    extra_payloads = [_build_extra_payload(e) for e in extras]

    # First call: universal synthesis. Subsequent calls: one per extra.
    # `pytest-httpx` matches in registration order.
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(universal_payload),
    )
    for payload in extra_payloads:
        httpx_mock.add_response(
            method="POST",
            url=OPENROUTER_URL,
            json=_mock_openrouter_function_call(payload),
        )

    options = UserOptions(
        target_complexity="standard",
        max_tools_override=None,
        explicit_includes=[],
        explicit_excludes=[],
    )

    spec_title = _SPEC_TITLES[fixture_name]
    result = await pass_1_run(pass_0_output, raw_ir, spec_title, options)

    # Structural equivalence — same tool names.
    expected_names = {t["name"] for t in expected_tools}
    result_names = {t.name for t in result.tools}
    assert (
        expected_names <= result_names
    ), f"missing tool names: expected {expected_names - result_names}"

    # smart_id format matches expected (slug derivation + schema-level format).
    assert result.routing.smart_id.format == expected["routing"]["smart_id"]["format"]

    # Coverage 100% on all 5 fixtures (D-54 acceptance + T-2-C3).
    assert result.coverage_pct == 100.0

    # Coverage proof has one entry per Pass 0 source_endpoint that exists in
    # raw_ir. (Some Phase-1 fixtures contain Pass 0 source_endpoints that are
    # not in raw_ir.endpoints — a fixture-author drift Pass 1 cannot fix; the
    # coverage_pct excludes them per `coverage_pct(raw_ir=...)` contract.)
    raw_ir_endpoint_ids = {f"{ep.method.value} {ep.path}" for ep in raw_ir.endpoints}
    expected_distinct = {
        ep
        for plan in pass_0_output.tool_plans
        for ep in plan.source_endpoints
        if ep in raw_ir_endpoint_ids
    }
    assert len(result.coverage_proof) == len(expected_distinct), (
        f"expected {len(expected_distinct)} coverage_proof entries "
        f"(distinct in-IR endpoints), got {len(result.coverage_proof)}"
    )

    # Workflows list is empty in Phase 2 (Phase 4 emits handler bodies).
    assert result.workflows == []


async def test_pass_1_e2e_stripe_tool_count_in_target_band(
    httpx_mock: HTTPXMock,
) -> None:
    """T-2-C6: Stripe fixture yields 6-12 final tools (D-35 target band)."""
    fx_dir = _FIXTURES_ROOT / "stripe"
    pass_0_data = json.loads((fx_dir / "pass-0-output.json").read_text())
    raw_ir_data = json.loads((fx_dir / "ir.json").read_text())
    expected = json.loads((fx_dir / "pass-1-output.json").read_text())

    pass_0_output = Pass0Output.model_validate(pass_0_data)
    raw_ir = RawIR.model_validate(raw_ir_data)

    expected_tools: list[dict[str, Any]] = expected["tools"]
    universal_payload = _build_universal_payload(expected_tools)
    extra_payloads = [_build_extra_payload(e) for e in expected_tools if e["type"] != "universal"]

    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(universal_payload),
    )
    for payload in extra_payloads:
        httpx_mock.add_response(
            method="POST",
            url=OPENROUTER_URL,
            json=_mock_openrouter_function_call(payload),
        )

    options = UserOptions(
        target_complexity="standard",
        max_tools_override=None,
        explicit_includes=[],
        explicit_excludes=[],
    )
    result = await pass_1_run(pass_0_output, raw_ir, "Stripe API", options)

    # 6 universal + 0..N extras; D-35 target 6-12.
    assert (
        6 <= len(result.tools) <= 12
    ), f"Stripe fixture must yield 6-12 final tools (got {len(result.tools)})"


# ─────────────────────────── Coverage retry path ───────────────────────────


async def test_pass_1_coverage_retry_eventually_recovers(httpx_mock: HTTPXMock) -> None:
    """D-34: when initial synthesis misses an endpoint, retry with uncovered list.

    First mocked LLM response omits `POST /v1/customers` from upsert; retry
    response includes it. After retry, coverage rises to 100%.
    """
    fx_dir = _FIXTURES_ROOT / "stripe"
    pass_0_data = json.loads((fx_dir / "pass-0-output.json").read_text())
    raw_ir_data = json.loads((fx_dir / "ir.json").read_text())
    expected = json.loads((fx_dir / "pass-1-output.json").read_text())

    pass_0_output = Pass0Output.model_validate(pass_0_data)
    raw_ir = RawIR.model_validate(raw_ir_data)

    expected_tools: list[dict[str, Any]] = expected["tools"]
    full_payload = _build_universal_payload(expected_tools)
    # Drift the upsert slot — drop POST /v1/customers so first attempt has
    # a coverage gap.
    drifted_payload = json.loads(json.dumps(full_payload))
    drifted_payload["upsert"]["source_endpoints"] = [
        ep for ep in drifted_payload["upsert"]["source_endpoints"] if ep != "POST /v1/customers"
    ]

    extra_payloads = [_build_extra_payload(e) for e in expected_tools if e["type"] != "universal"]

    # Sequence of OpenRouter calls:
    # 1. First universal call (returns drifted) — coverage gap.
    # 2. N extra calls (always return canonical extras).
    # 3. Retry universal call (returns full payload — coverage 100%).
    # 4. (Retries reuse extras already produced — orchestrator does NOT re-call
    #    extras during the universal-only retry loop.)
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(drifted_payload),
    )
    for payload in extra_payloads:
        httpx_mock.add_response(
            method="POST",
            url=OPENROUTER_URL,
            json=_mock_openrouter_function_call(payload),
        )
    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(full_payload),
        is_reusable=True,  # retry might fire multiple times before recovery
    )

    options = UserOptions(
        target_complexity="standard",
        max_tools_override=None,
        explicit_includes=[],
        explicit_excludes=[],
    )
    result = await pass_1_run(pass_0_output, raw_ir, "Stripe API", options)

    assert result.coverage_pct == 100.0


# ─────────────────────────── Universal stub path ───────────────────────────


async def test_pass_1_emits_stub_universal_for_write_only_api(
    httpx_mock: HTTPXMock,
) -> None:
    """D-29: a write-only API still gets all 6 universal tools.

    Empty slots emerge with `source_endpoints=[]`. Full Tool1 entries are
    present so the agent has a consistent surface across servers.
    """
    fx_dir = _FIXTURES_ROOT / "stripe"
    raw_ir_data = json.loads((fx_dir / "ir.json").read_text())
    raw_ir = RawIR.model_validate(raw_ir_data)

    # Construct a write-only Pass 0 output: only POST/DELETE plans.
    pass_0_output = Pass0Output.model_validate(
        {
            "tool_plans": [
                {
                    "name": "customers_create",
                    "category": "crud",
                    "source_endpoints": ["POST /v1/customers"],
                    "rationale": "create customer",
                },
                {
                    "name": "customers_delete",
                    "category": "crud",
                    "source_endpoints": ["DELETE /v1/customers/{customer}"],
                    "rationale": "delete customer",
                },
            ],
            "dropped_endpoints": [],
            "composite_candidates": [],
            "auth_requirements": {},
            "target_complexity": "standard",
            "prompt_injection_warnings": [],
        }
    )

    # All 6 universal slots must be emitted by the LLM, even when empty.
    universal_payload = {
        "search": {"name": "search", "type": "universal", "source_endpoints": []},
        "fetch": {"name": "fetch", "type": "universal", "source_endpoints": []},
        "list_collections": {
            "name": "list_collections",
            "type": "universal",
            "source_endpoints": [],
        },
        "list_objects": {
            "name": "list_objects",
            "type": "universal",
            "source_endpoints": [],
        },
        "upsert": {
            "name": "upsert",
            "type": "universal",
            "source_endpoints": ["POST /v1/customers"],
        },
        "delete": {
            "name": "delete",
            "type": "universal",
            "source_endpoints": ["DELETE /v1/customers/{customer}"],
        },
    }

    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(universal_payload),
        is_reusable=True,
    )

    options = UserOptions(
        target_complexity="standard",
        max_tools_override=None,
        explicit_includes=[],
        explicit_excludes=[],
    )
    result = await pass_1_run(pass_0_output, raw_ir, "Stripe API", options)

    universal_names = [t.name for t in result.tools if t.type.value == "universal"]
    assert universal_names == [
        "search",
        "fetch",
        "list_collections",
        "list_objects",
        "upsert",
        "delete",
    ]
    # Stub slots have empty source_endpoints.
    by_name = {t.name: t for t in result.tools}
    assert by_name["search"].source_endpoints == []
    assert by_name["fetch"].source_endpoints == []


# Keep the Tool1 import alive for static analyzers.
_ = Tool1
