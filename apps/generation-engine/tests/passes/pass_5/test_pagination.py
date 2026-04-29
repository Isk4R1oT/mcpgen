"""Pass 5 — pagination detection unit tests.

Verifies CONTEXT D-08 precedence (cursor → offset → page_number → none) with
first-match-wins semantics. Per-server majority vote with cursor tie-break.
Default limits per Pass 5 design §1.6 (search 10/50; list_objects 25/100).
"""

from __future__ import annotations

from typing import Any

import pytest
from mcpgen_ir.types import (
    CoverageProofItem,
    Endpoint,
    Method,
    Pass1Output,
    RawIR,
    Routing1,
    SampleInvocation,
    SmartId,
    SpecFormat,
    Tool1,
    Type,
)
from pydantic import ValidationError

from mcpgen_engine.passes.pass_5.pagination import (
    PaginationStrategy,
    detect_pagination_for_endpoint,
    detect_pagination_strategy,
    vote_majority_strategy,
)

# ─────────────────────────────── Local helpers ──────────────────────────────


def _make_endpoint(
    *,
    method: Method = Method.GET,
    path: str = "/v1/items",
    parameters: list[dict[str, Any]] | None = None,
    response_schema: dict[str, Any] | None = None,
) -> Endpoint:
    response_obj: dict[str, Any] = {"description": "OK"}
    if response_schema is not None:
        response_obj["schema"] = response_schema
    return Endpoint(
        method=method,
        path=path,
        operation_id=None,
        summary=None,
        description=None,
        parameters=parameters or [],
        request_body=None,
        responses={"200": response_obj},
        tags=[],
        deprecated=False,
    )


def _make_raw_ir(endpoints: list[Endpoint]) -> RawIR:
    return RawIR(
        spec_format=SpecFormat.openapi_3_0,
        spec_hash="a" * 64,
        endpoints=endpoints,
        schemas={},
        security_schemes={},
        dependency_graph={},
    )


def _make_pass_1_output(
    *, tools: list[Tool1], coverage_endpoints: list[tuple[str, str]] | None = None
) -> Pass1Output:
    smart_id = SmartId(
        format="example:{type}:{collection}:{identifier}",
        types=["object"],
        collections=["Item"],
    )
    routing = Routing1(smart_id=smart_id, rules=[])
    if coverage_endpoints is None:
        coverage_endpoints = [(t.source_endpoints[0], t.name) for t in tools if t.source_endpoints]
    coverage_proof = [
        CoverageProofItem(
            endpoint_id=eid,
            mapped_to_universal_tool=mapped,
            sample_invocation=SampleInvocation(
                url="https://example.com/api",  # type: ignore[arg-type]
                method="GET",
                params={},
            ),
        )
        for eid, mapped in coverage_endpoints
    ]
    return Pass1Output(
        tools=tools,
        routing=routing,
        workflows=[],
        coverage_pct=100.0 if tools else 0.0,
        coverage_proof=coverage_proof,
    )


# ───────────────────────── detect_pagination_for_endpoint ───────────────────


def test_cursor_detection_request_param() -> None:
    """Cursor strategy when request param matches `_CURSOR_REQUEST_NAMES`."""
    endpoint = _make_endpoint(
        parameters=[{"name": "cursor", "in": "query", "schema": {"type": "string"}}],
    )
    result = detect_pagination_for_endpoint(endpoint, response_schema={})
    assert result.style == "cursor"
    assert result.cursor_param_name == "cursor"


def test_cursor_detection_response_field() -> None:
    """Cursor strategy when response schema has `next_cursor` (no request param)."""
    endpoint = _make_endpoint(
        parameters=[{"name": "limit", "in": "query", "schema": {"type": "integer"}}],
    )
    result = detect_pagination_for_endpoint(
        endpoint,
        response_schema={"properties": {"next_cursor": {"type": "string"}}},
    )
    assert result.style == "cursor"
    assert result.cursor_response_field == "next_cursor"


def test_offset_detection() -> None:
    """Offset strategy when request param ∈ `_OFFSET_REQUEST_NAMES`."""
    endpoint = _make_endpoint(
        parameters=[{"name": "offset", "in": "query", "schema": {"type": "integer"}}],
    )
    result = detect_pagination_for_endpoint(endpoint, response_schema={})
    assert result.style == "offset"
    assert result.offset_param_name == "offset"


def test_page_number_requires_both_page_and_per_page() -> None:
    """Page-number strategy requires BOTH `page` AND `per_page` (D-08)."""
    # Only `page` — should NOT match page_number, falls through to none.
    endpoint_only_page = _make_endpoint(
        parameters=[{"name": "page", "in": "query", "schema": {"type": "integer"}}],
    )
    assert detect_pagination_for_endpoint(endpoint_only_page, response_schema={}).style == "none"

    # Both `page` AND `per_page` → page_number.
    endpoint_both = _make_endpoint(
        parameters=[
            {"name": "page", "in": "query", "schema": {"type": "integer"}},
            {"name": "per_page", "in": "query", "schema": {"type": "integer"}},
        ],
    )
    result = detect_pagination_for_endpoint(endpoint_both, response_schema={})
    assert result.style == "page_number"
    assert result.page_param_name == "page"
    assert result.per_page_param_name == "per_page"


def test_no_pagination_default() -> None:
    """No pagination signals → style='none'."""
    endpoint = _make_endpoint(
        parameters=[{"name": "id", "in": "path", "schema": {"type": "string"}}],
    )
    result = detect_pagination_for_endpoint(endpoint, response_schema={})
    assert result.style == "none"


def test_precedence_cursor_beats_offset() -> None:
    """When endpoint has BOTH `cursor` AND `offset`, cursor wins (D-08 #1)."""
    endpoint = _make_endpoint(
        parameters=[
            {"name": "cursor", "in": "query", "schema": {"type": "string"}},
            {"name": "offset", "in": "query", "schema": {"type": "integer"}},
        ],
    )
    result = detect_pagination_for_endpoint(endpoint, response_schema={})
    assert result.style == "cursor"


def test_precedence_offset_beats_page_number() -> None:
    """When endpoint has BOTH `offset` AND (`page`+`per_page`), offset wins (D-08 #2)."""
    endpoint = _make_endpoint(
        parameters=[
            {"name": "offset", "in": "query", "schema": {"type": "integer"}},
            {"name": "page", "in": "query", "schema": {"type": "integer"}},
            {"name": "per_page", "in": "query", "schema": {"type": "integer"}},
        ],
    )
    result = detect_pagination_for_endpoint(endpoint, response_schema={})
    assert result.style == "offset"


def test_case_insensitive_param_match() -> None:
    """Param name matching is case-insensitive (D-08 explicit rule)."""
    endpoint_cursor = _make_endpoint(
        parameters=[{"name": "Cursor", "in": "query", "schema": {"type": "string"}}],
    )
    assert detect_pagination_for_endpoint(endpoint_cursor, response_schema={}).style == "cursor"

    endpoint_offset = _make_endpoint(
        parameters=[{"name": "OFFSET", "in": "query", "schema": {"type": "integer"}}],
    )
    assert detect_pagination_for_endpoint(endpoint_offset, response_schema={}).style == "offset"


def test_search_default_limits_10_50() -> None:
    """`search` tool defaults: default_limit=10, max_limit=50 (D-05 + design §1.6)."""
    endpoint = _make_endpoint(
        parameters=[{"name": "cursor", "in": "query", "schema": {"type": "string"}}],
    )
    result = detect_pagination_for_endpoint(
        endpoint, response_schema={}, universal_tool_name="search"
    )
    assert result.default_limit == 10
    assert result.max_limit == 50


def test_list_objects_default_limits_25_100() -> None:
    """`list_objects` defaults: default_limit=25, max_limit=100."""
    endpoint = _make_endpoint(
        parameters=[{"name": "cursor", "in": "query", "schema": {"type": "string"}}],
    )
    result = detect_pagination_for_endpoint(
        endpoint, response_schema={}, universal_tool_name="list_objects"
    )
    assert result.default_limit == 25
    assert result.max_limit == 100


# ───────────────────────────── vote_majority_strategy ───────────────────────


def test_majority_vote_cursor_wins() -> None:
    """3 cursor tools + 1 offset tool → server-wide cursor."""
    per_tool: dict[str, PaginationStrategy] = {
        "list_a": PaginationStrategy(style="cursor", cursor_param_name="cursor"),
        "list_b": PaginationStrategy(style="cursor", cursor_param_name="cursor"),
        "list_c": PaginationStrategy(style="cursor", cursor_param_name="cursor"),
        "list_d": PaginationStrategy(style="offset", offset_param_name="offset"),
    }
    result = vote_majority_strategy(per_tool)
    assert result.style == "cursor"


def test_majority_vote_cursor_tie_break_over_offset() -> None:
    """2 cursor + 2 offset → cursor wins (tie-break per D-08)."""
    per_tool: dict[str, PaginationStrategy] = {
        "list_a": PaginationStrategy(style="cursor", cursor_param_name="cursor"),
        "list_b": PaginationStrategy(style="cursor", cursor_param_name="cursor"),
        "list_c": PaginationStrategy(style="offset", offset_param_name="offset"),
        "list_d": PaginationStrategy(style="offset", offset_param_name="offset"),
    }
    result = vote_majority_strategy(per_tool)
    assert result.style == "cursor"


def test_majority_vote_all_none_returns_none() -> None:
    """All tools have style='none' → server returns 'none'."""
    per_tool: dict[str, PaginationStrategy] = {
        "fetch_one": PaginationStrategy(style="none"),
        "fetch_two": PaginationStrategy(style="none"),
    }
    result = vote_majority_strategy(per_tool)
    assert result.style == "none"


def test_majority_vote_offset_beats_page_number_on_tie() -> None:
    """1 offset + 1 page_number → offset wins (cursor absent, offset preferred)."""
    per_tool: dict[str, PaginationStrategy] = {
        "list_a": PaginationStrategy(style="offset", offset_param_name="offset"),
        "list_b": PaginationStrategy(
            style="page_number", page_param_name="page", per_page_param_name="per_page"
        ),
    }
    result = vote_majority_strategy(per_tool)
    assert result.style == "offset"


# ───────────────────────────── PaginationStrategy ───────────────────────────


def test_extra_forbid_rejects_unknown_field() -> None:
    """`PaginationStrategy(extra='forbid')` rejects unknown fields."""
    with pytest.raises(ValidationError):
        PaginationStrategy(  # type: ignore[call-arg]
            style="cursor",
            unknown_field="x",
        )


# ──────────────────────────── detect_pagination_strategy ────────────────────


def test_detect_pagination_strategy_cursor_fixture(
    spec_with_cursor_pagination: tuple[Pass1Output, RawIR],
) -> None:
    pass_1_output, raw_ir = spec_with_cursor_pagination
    strategy, warnings = detect_pagination_strategy(pass_1_output, raw_ir)
    assert strategy.style == "cursor"
    assert warnings == []


def test_detect_pagination_strategy_offset_fixture(
    spec_with_offset_pagination: tuple[Pass1Output, RawIR],
) -> None:
    pass_1_output, raw_ir = spec_with_offset_pagination
    strategy, warnings = detect_pagination_strategy(pass_1_output, raw_ir)
    assert strategy.style == "offset"
    assert warnings == []


def test_detect_pagination_strategy_page_number_fixture(
    spec_with_page_number_pagination: tuple[Pass1Output, RawIR],
) -> None:
    pass_1_output, raw_ir = spec_with_page_number_pagination
    strategy, warnings = detect_pagination_strategy(pass_1_output, raw_ir)
    assert strategy.style == "page_number"
    assert warnings == []


def test_detect_pagination_strategy_no_pagination_fixture(
    spec_no_pagination: tuple[Pass1Output, RawIR],
) -> None:
    """Server has only fetch tools (not list-shaped) → strategy 'none', no warnings."""
    pass_1_output, raw_ir = spec_no_pagination
    strategy, warnings = detect_pagination_strategy(pass_1_output, raw_ir)
    assert strategy.style == "none"
    assert warnings == []


def test_detect_pagination_strategy_emits_override_warning() -> None:
    """When a list_* tool's local style differs from server-wide, warning emitted."""
    cursor_endpoint = _make_endpoint(
        path="/v1/cursor_things",
        parameters=[{"name": "cursor", "in": "query", "schema": {"type": "string"}}],
    )
    offset_endpoint = _make_endpoint(
        path="/v1/offset_things",
        parameters=[{"name": "offset", "in": "query", "schema": {"type": "integer"}}],
    )
    raw_ir = _make_raw_ir([cursor_endpoint, offset_endpoint])
    pass_1_output = _make_pass_1_output(
        tools=[
            Tool1(
                name="list_objects",
                type=Type.universal,
                source_endpoints=["GET /v1/cursor_things"],
            ),
            Tool1(
                name="list_collections",
                type=Type.universal,
                source_endpoints=["GET /v1/offset_things"],
            ),
        ],
        coverage_endpoints=[
            ("GET /v1/cursor_things", "list_objects"),
            ("GET /v1/offset_things", "list_collections"),
        ],
    )
    strategy, warnings = detect_pagination_strategy(pass_1_output, raw_ir)
    assert strategy.style == "cursor"
    # The offset-strategy tool overridden by the cursor-strategy server.
    assert len(warnings) == 1
    assert "list_collections" in warnings[0]
    assert "offset" in warnings[0]
    assert "cursor" in warnings[0]


def test_detect_pagination_strategy_endpoint_id_uses_method_value() -> None:
    """Endpoint key building uses `method.value` (e.g. 'GET ...'), not enum repr."""
    endpoint = _make_endpoint(
        method=Method.GET,
        path="/v1/things",
        parameters=[{"name": "cursor", "in": "query", "schema": {"type": "string"}}],
    )
    raw_ir = _make_raw_ir([endpoint])
    pass_1_output = _make_pass_1_output(
        tools=[
            Tool1(
                name="list_objects",
                type=Type.universal,
                source_endpoints=["GET /v1/things"],
            ),
        ],
    )
    strategy, _ = detect_pagination_strategy(pass_1_output, raw_ir)
    assert strategy.style == "cursor"
