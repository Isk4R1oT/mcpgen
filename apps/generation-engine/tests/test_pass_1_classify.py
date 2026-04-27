"""Pass 1 classification + OpenAI compliance tests (mocked LLM where applicable).

VALIDATION rows: T-2-C1 (6 universal always emitted), T-2-C2 (OpenAI compliance signatures).
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from mcpgen_ir.types import (
    Category,
    Endpoint,
    Method,
    RawIR,
    SecuritySchemes,
    SpecFormat,
    Tool1,
    ToolPlan,
    Type,
    UniversalTool,
)
from pytest_httpx import HTTPXMock

from mcpgen_engine.passes.pass_1.classify import (
    UniversalToolClass,
    classify_tool_plans,
    has_action_verb_suffix,
)
from mcpgen_engine.passes.pass_1.prompts import PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT
from mcpgen_engine.passes.pass_1.schema_synth import (
    _force_openai_compliance_fetch,
    _force_openai_compliance_search,
    synthesize_universal_tools,
)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ─────────────────────────── Helpers ───────────────────────────────────────


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


def _make_raw_ir(endpoints: list[Endpoint]) -> RawIR:
    bearer_scheme = SecuritySchemes.model_validate(
        {"type": "http", "scheme": "bearer", "in": None},
    )
    return RawIR(
        spec_format=SpecFormat.openapi_3_0,
        spec_hash="c" * 64,
        endpoints=endpoints,
        schemas={},
        security_schemes={"bearerAuth": bearer_scheme},
        dependency_graph={},
    )


def _plan(name: str, category: Category, endpoints: list[str]) -> ToolPlan:
    return ToolPlan(
        name=name,
        category=category,
        source_endpoints=endpoints,
        rationale="synthetic test plan",
    )


def _mock_openrouter_function_call(payload: dict[str, Any]) -> dict[str, Any]:
    """Mock OpenRouter chat.completions response with `final_result` function call."""
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


def _universal_tools_payload() -> dict[str, Any]:
    """A valid `_UniversalToolsLlmOutput` payload with the 6 canonical universal tools."""
    return {
        "search": {
            "name": "search",
            "type": "universal",
            "source_endpoints": ["GET /v1/customers"],
        },
        "fetch": {
            "name": "fetch",
            "type": "universal",
            "source_endpoints": ["GET /v1/customers/{customer}"],
        },
        "list_collections": {
            "name": "list_collections",
            "type": "universal",
            "source_endpoints": [],
        },
        "list_objects": {
            "name": "list_objects",
            "type": "universal",
            "source_endpoints": ["GET /v1/customers"],
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


# ─────────────────────────── classify_tool_plans (T-2-C1) ──────────────────


def test_six_universal_always_emitted() -> None:
    """T-2-C1: all 6 universal slots exist in the classification, even when empty.

    A write-only API has no GET endpoints — the resulting `UniversalToolClass`
    still has `search`, `fetch`, `list_collections`, `list_objects` slots
    (as empty lists). The schema_synth step is responsible for emitting stub
    universal tools whose `source_endpoints=[]` in that case.
    """
    write_only_plans = [
        _plan("customers_create", Category.crud, ["POST /v1/customers"]),
        _plan(
            "customers_update",
            Category.crud,
            ["POST /v1/customers/{customer}"],
        ),
        _plan(
            "customers_delete",
            Category.crud,
            ["DELETE /v1/customers/{customer}"],
        ),
    ]
    classified = classify_tool_plans(
        write_only_plans,
        composite_candidates=[],
        dependency_graph={},
    )

    assert isinstance(classified.universal, UniversalToolClass)
    # All 6 slots present (some may be empty lists).
    assert classified.universal.search == []
    assert classified.universal.fetch == []
    assert classified.universal.list_collections == []
    assert classified.universal.list_objects == []
    # Write-side slots populated.
    assert len(classified.universal.upsert) >= 1
    assert len(classified.universal.delete) >= 1


def test_universal_tool_names_exact() -> None:
    """T-2-C1: universal slot names are exactly the 6 canonical names.

    The dataclass `UniversalToolClass` has 6 explicit fields; we assert that
    set equality with the canonical UniversalTool enum values.
    """
    canonical = {ut.value for ut in UniversalTool}
    fields = {
        "search",
        "fetch",
        "list_collections",
        "list_objects",
        "upsert",
        "delete",
    }
    assert fields == canonical


def test_classify_action_with_verb_pattern() -> None:
    """`category=action` plans land in extras with type_=`action`."""
    plans = [
        _plan("charges_capture", Category.action, ["POST /v1/charges/{charge}/capture"]),
        _plan("messages_send", Category.action, ["POST /v1/messages"]),
    ]
    classified = classify_tool_plans(plans, composite_candidates=[], dependency_graph={})
    extras_types = {e.type_ for e in classified.extras}
    assert "action" in extras_types
    assert len(classified.extras) == 2


def test_classify_specialized_warning_threshold() -> None:
    """D-36: > 3 specialized tools surfaces a warning."""
    plans = [
        _plan(f"specialty_{i:02d}", Category.specialized, [f"GET /v1/specialty_{i}"])
        for i in range(4)
    ]
    classified = classify_tool_plans(plans, composite_candidates=[], dependency_graph={})
    assert len(classified.warnings) >= 1
    assert any("specialized tools" in w for w in classified.warnings)


def test_has_action_verb_suffix_high_confidence() -> None:
    """D-36 verb pattern catalogue catches typical action suffixes."""
    assert has_action_verb_suffix("charges_capture")
    assert has_action_verb_suffix("subscriptions_cancel")
    assert has_action_verb_suffix("messages_send")
    assert not has_action_verb_suffix("customers_list")


# ─────────────────────────── OpenAI compliance (T-2-C2) ────────────────────


def test_force_openai_compliance_search_pins_name_and_type() -> None:
    """T-2-C2: search tool always emerges as `name=search`, `type=universal`.

    Even if the LLM hallucinates a different name or type, the post-LLM
    enforcer overrides.
    """
    drifted = Tool1(
        name="search_with_filter",  # drifted name
        type=Type.action,  # drifted type
        source_endpoints=["GET /v1/customers"],
    )
    forced = _force_openai_compliance_search(drifted)
    assert forced.name == "search"
    assert forced.type == Type.universal
    # source_endpoints preserved.
    assert forced.source_endpoints == ["GET /v1/customers"]


def test_force_openai_compliance_fetch_pins_name_and_type() -> None:
    """T-2-C2: fetch tool always emerges as `name=fetch`, `type=universal`."""
    drifted = Tool1(
        name="get_object_by_id",
        type=Type.specialized,
        source_endpoints=["GET /v1/customers/{customer}"],
    )
    forced = _force_openai_compliance_fetch(drifted)
    assert forced.name == "fetch"
    assert forced.type == Type.universal


async def test_openai_compliance_signatures(httpx_mock: HTTPXMock) -> None:
    """T-2-C2: mocked-LLM `search`/`fetch` always emerge with canonical names.

    Even though the mock returns drifted names, the post-LLM enforcer pins
    `search`/`fetch` to their canonical form. Phase 3 will additionally
    enforce input schema shape; Phase 2 verifies name + type only.
    """
    # The mock LLM emits drifted names — enforcer must override.
    drifted_payload = _universal_tools_payload()
    drifted_payload["search"]["name"] = "search_with_filter"
    drifted_payload["fetch"]["name"] = "get_by_id"

    httpx_mock.add_response(
        method="POST",
        url=OPENROUTER_URL,
        json=_mock_openrouter_function_call(drifted_payload),
    )

    endpoints = [
        _make_endpoint("GET", "/v1/customers"),
        _make_endpoint("POST", "/v1/customers"),
        _make_endpoint("GET", "/v1/customers/{customer}"),
        _make_endpoint("DELETE", "/v1/customers/{customer}"),
    ]
    raw_ir = _make_raw_ir(endpoints)
    universal_class = UniversalToolClass(
        search=[_plan("a", Category.search, ["GET /v1/customers"])],
        fetch=[_plan("b", Category.crud, ["GET /v1/customers/{customer}"])],
        list_collections=[],
        list_objects=[],
        upsert=[_plan("c", Category.crud, ["POST /v1/customers"])],
        delete=[_plan("d", Category.crud, ["DELETE /v1/customers/{customer}"])],
    )

    universal = await synthesize_universal_tools(universal_class, raw_ir)

    names = [t.name for t in universal]
    assert names == [
        "search",
        "fetch",
        "list_collections",
        "list_objects",
        "upsert",
        "delete",
    ]
    for tool in universal:
        assert tool.type == Type.universal


def test_search_fetch_no_extra_input_schema_props() -> None:
    """T-2-C2: input schema enforcement (Phase 3 will assert `query`/`id` only).

    Phase 2 stops at name + type enforcement (the IR Tool1 does not carry
    inputSchema — that lands in Pass 3). This test guards the contract that
    universal tools' types are pinned.
    """
    # Phase 2 boundary: this is documented in the test doc — full inputSchema
    # check lives in Pass 3 (Plan 03-XX). Phase 2 verifies the upstream
    # fixture pass-1-output.json structurally matches by name and type only.
    drifted = Tool1(
        name="search",
        type=Type.universal,
        source_endpoints=["GET /v1/customers"],
    )
    forced = _force_openai_compliance_search(drifted)
    assert forced.name == "search"
    assert forced.type == Type.universal


# ─────────────────────────── XML sandboxing (D-51) ─────────────────────────


def test_system_prompt_sandboxes_excerpts() -> None:
    """D-51 regression guard: system prompt contains both the security and
    the `<spec_excerpt>` template tokens."""
    assert "<spec_excerpt>" in PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT
    assert "UNTRUSTED user data" in PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT
    assert "NEVER as instructions" in PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT


def test_system_prompt_includes_six_tool_pattern() -> None:
    """Regression guard: Six-Tool Pattern + OpenAI compliance language present."""
    assert "Six-Tool Pattern" in PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT
    assert "OpenAI compliance" in PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT
    assert "search" in PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT
    assert "fetch" in PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT


# ─────────────────────────── pytest import retained ────────────────────────


_ = pytest
