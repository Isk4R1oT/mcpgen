"""Pass 3 — Phase 1 (extract.py) deterministic parameter extraction tests.

Verifies the contract that downstream Pass 3 phases consume:

- `extract_params(raw_ir, pass_1_output) -> dict[str, list[ParameterSpec]]`
  walks `pass_1_output.tools` and emits per-tool parameter specs by combining:
    * Universal tools: hardcoded D-21 minimal signatures (full standards land
      in Plan 03-08 standards.py — extract.py only emits the bare-minimum
      shape so downstream plans see a non-empty list).
    * Action / workflow / specialized tools: walk source endpoints in RawIR,
      pulling parameters (path/query/header) AND requestBody.properties.

- `ParameterSpec` Pydantic class carries the deterministic 5-dimension data
  (type/format/enum/pattern/default + required) plus `is_smart_id`,
  `is_filter`, `entity_hint`, `source_endpoint_id`, `source_field`,
  `description` per D-16.

These are pure-function tests — no LLM, no I/O, no httpx mocks needed. The
extract.py module is Phase 1 of the Pass 3 pipeline (D-16, $0, deterministic).

References:
- 03-CONTEXT.md D-16 (4-phase Pass 3 pipeline) + D-19 (entity_hint from
  endpoint tags[0]) + D-20 (smart-ID detection) + D-21 (universal standard
  parameter sets)
- docs/mcpgen-pass-3-design.md §5 + Appendix A
"""

from __future__ import annotations

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
)

from mcpgen_engine.passes.pass_3.extract import (
    ParameterSpec,
    extract_params,
)

# ─────────────────────────── Test fixtures (synthetic) ──────────────────────


def _make_endpoint(
    method: Method,
    path: str,
    parameters: list[dict[str, Any]] | None = None,
    request_body: dict[str, Any] | None = None,
    tags: list[str] | None = None,
) -> Endpoint:
    """Build a minimal valid `Endpoint` for tests."""
    return Endpoint(
        method=method,
        path=path,
        parameters=parameters or [],
        request_body=request_body,
        responses={"200": {"description": "ok"}},
        tags=tags or [],
        deprecated=False,
    )


def _make_raw_ir(endpoints: list[Endpoint]) -> RawIR:
    """Build a minimal valid `RawIR` for tests."""
    return RawIR(
        spec_format=SpecFormat.openapi_3_0,
        spec_hash="0" * 64,
        endpoints=endpoints,
        schemas={},
        security_schemes={},
        dependency_graph={},
    )


def _empty_routing() -> Routing1:
    return Routing1(
        smart_id=SmartId(format="{server}:{type}:{collection}:{id}", types=[], collections=[]),
        rules=[],
    )


def _make_pass1_output(tools: list[Tool1], rules: list[Rule1] | None = None) -> Pass1Output:
    routing = (
        Routing1(
            smart_id=SmartId(format="{server}:{type}:{collection}:{id}", types=[], collections=[]),
            rules=rules or [],
        )
        if rules
        else _empty_routing()
    )
    return Pass1Output(
        tools=tools,
        routing=routing,
        workflows=[],
        coverage_pct=100.0,
        coverage_proof=[],
    )


# ──────────────────────── Universal tool: search ────────────────────────────


def test_extract_universal_search_returns_query_only() -> None:
    """search has exactly 1 ParameterSpec — `query: string` (OpenAI compliance)."""
    p1 = _make_pass1_output(
        [Tool1(name="search", type=Type.universal, source_endpoints=["GET /v1/items"])]
    )
    raw_ir = _make_raw_ir([])  # universal tools don't walk endpoints

    result = extract_params(raw_ir, p1)

    assert "search" in result
    specs = result["search"]
    assert len(specs) == 1
    assert specs[0].name == "query"
    assert specs[0].type == "string"
    assert specs[0].required is True


# ──────────────────────── Universal tool: fetch ─────────────────────────────


def test_extract_universal_fetch_returns_id_only_with_smart_id_flag() -> None:
    p1 = _make_pass1_output(
        [Tool1(name="fetch", type=Type.universal, source_endpoints=["GET /v1/items/{id}"])]
    )
    result = extract_params(_make_raw_ir([]), p1)

    specs = result["fetch"]
    assert len(specs) == 1
    assert specs[0].name == "id"
    assert specs[0].type == "string"
    assert specs[0].required is True
    assert specs[0].is_smart_id is True


# ──────────────────────── Universal tool: list_objects ──────────────────────


def test_extract_universal_list_objects_returns_8_params() -> None:
    """list_objects has 8 params per D-21.

    Names: collection / properties / filter / sort_by / sort_order /
    limit / offset / cursor.
    """
    p1 = _make_pass1_output(
        [Tool1(name="list_objects", type=Type.universal, source_endpoints=["GET /v1/items"])]
    )
    result = extract_params(_make_raw_ir([]), p1)

    specs = result["list_objects"]
    assert len(specs) == 8
    names = [s.name for s in specs]
    assert set(names) == {
        "collection",
        "properties",
        "filter",
        "sort_by",
        "sort_order",
        "limit",
        "offset",
        "cursor",
    }


def test_extract_universal_list_objects_filter_param_has_is_filter_flag() -> None:
    p1 = _make_pass1_output(
        [Tool1(name="list_objects", type=Type.universal, source_endpoints=["GET /v1/items"])]
    )
    result = extract_params(_make_raw_ir([]), p1)
    filter_spec = next(s for s in result["list_objects"] if s.name == "filter")
    assert filter_spec.is_filter is True


def test_extract_universal_list_objects_sort_order_has_enum_asc_desc() -> None:
    p1 = _make_pass1_output(
        [Tool1(name="list_objects", type=Type.universal, source_endpoints=["GET /v1/items"])]
    )
    result = extract_params(_make_raw_ir([]), p1)
    sort_order = next(s for s in result["list_objects"] if s.name == "sort_order")
    assert sort_order.enum == ["asc", "desc"]
    assert sort_order.default == "desc"


def test_extract_universal_list_objects_limit_has_default_25() -> None:
    p1 = _make_pass1_output(
        [Tool1(name="list_objects", type=Type.universal, source_endpoints=["GET /v1/items"])]
    )
    result = extract_params(_make_raw_ir([]), p1)
    limit = next(s for s in result["list_objects"] if s.name == "limit")
    assert limit.default == 25


# ──────────────────────── Universal tool: delete ────────────────────────────


def test_extract_universal_delete_has_5_params_with_confirm_default_false() -> None:
    p1 = _make_pass1_output(
        [Tool1(name="delete", type=Type.universal, source_endpoints=["DELETE /v1/items/{id}"])]
    )
    result = extract_params(_make_raw_ir([]), p1)

    specs = result["delete"]
    assert len(specs) == 5
    names = {s.name for s in specs}
    assert names == {"type", "id", "ids", "collection", "confirm"}
    confirm = next(s for s in specs if s.name == "confirm")
    assert confirm.default is False
    assert confirm.required is True


# ──────────────────────── Universal tool: list_collections + upsert ─────────


def test_extract_universal_list_collections_has_4_params() -> None:
    p1 = _make_pass1_output(
        [Tool1(name="list_collections", type=Type.universal, source_endpoints=["GET /v1/types"])]
    )
    specs = extract_params(_make_raw_ir([]), p1)["list_collections"]
    names = {s.name for s in specs}
    assert names == {"pattern", "include_schema", "limit", "offset"}


def test_extract_universal_upsert_has_data_required() -> None:
    p1 = _make_pass1_output(
        [Tool1(name="upsert", type=Type.universal, source_endpoints=["POST /v1/items"])]
    )
    specs = extract_params(_make_raw_ir([]), p1)["upsert"]
    data = next(s for s in specs if s.name == "data")
    assert data.required is True
    assert data.type == "object"


# ──────────────────────── Action: walks endpoint params ─────────────────────


def test_extract_action_walks_endpoint_parameters() -> None:
    """Action tool extracts both path params AND requestBody.properties."""
    endpoint = _make_endpoint(
        Method.POST,
        "/v1/charges/{id}/capture",
        parameters=[
            {
                "name": "id",
                "in": "path",
                "required": True,
                "schema": {"type": "string"},
            }
        ],
        request_body={
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {"amount": {"type": "integer", "minimum": 1}},
                        "required": ["amount"],
                    }
                }
            }
        },
        tags=["charges"],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output(
        [
            Tool1(
                name="charges_capture",
                type=Type.action,
                source_endpoints=["POST /v1/charges/{id}/capture"],
            )
        ]
    )

    result = extract_params(raw_ir, p1)
    specs = result["charges_capture"]
    names = [s.name for s in specs]
    assert "id" in names
    assert "amount" in names
    assert len(specs) == 2

    id_spec = next(s for s in specs if s.name == "id")
    assert id_spec.is_smart_id is True
    assert id_spec.required is True
    assert id_spec.source_field.startswith("parameters[")

    amount_spec = next(s for s in specs if s.name == "amount")
    assert amount_spec.type == "integer"
    assert amount_spec.minimum == 1.0
    assert amount_spec.required is True
    assert amount_spec.source_field == "request_body.properties.amount"


def test_extract_action_uses_tags_first_as_entity_hint() -> None:
    """entity_hint sourced from endpoint.tags[0] per D-19."""
    endpoint = _make_endpoint(
        Method.POST,
        "/v1/charges",
        parameters=[
            {"name": "amount", "in": "query", "schema": {"type": "integer"}},
        ],
        tags=["charges", "billing"],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output(
        [
            Tool1(
                name="charges_create",
                type=Type.action,
                source_endpoints=["POST /v1/charges"],
            )
        ]
    )
    specs = extract_params(raw_ir, p1)["charges_create"]
    assert all(s.entity_hint == "charges" for s in specs)


def test_extract_action_no_tags_entity_hint_none() -> None:
    """No tags → entity_hint is None."""
    endpoint = _make_endpoint(
        Method.POST,
        "/v1/charges",
        parameters=[{"name": "amount", "in": "query", "schema": {"type": "integer"}}],
        tags=[],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output(
        [
            Tool1(
                name="charges_create",
                type=Type.action,
                source_endpoints=["POST /v1/charges"],
            )
        ]
    )
    specs = extract_params(raw_ir, p1)["charges_create"]
    assert all(s.entity_hint is None for s in specs)


# ──────────────────────── Workflow: collects across steps ───────────────────


def test_extract_workflow_collects_params_across_steps() -> None:
    ep1 = _make_endpoint(
        Method.GET,
        "/v1/slots",
        parameters=[{"name": "date", "in": "query", "schema": {"type": "string"}}],
        tags=["calendar"],
    )
    ep2 = _make_endpoint(
        Method.POST,
        "/v1/events",
        parameters=[],
        request_body={
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {"title": {"type": "string"}},
                        "required": ["title"],
                    }
                }
            }
        },
        tags=["calendar"],
    )
    raw_ir = _make_raw_ir([ep1, ep2])
    p1 = _make_pass1_output(
        [
            Tool1(
                name="schedule_event",
                type=Type.workflow,
                source_endpoints=["GET /v1/slots", "POST /v1/events"],
            )
        ]
    )
    specs = extract_params(raw_ir, p1)["schedule_event"]
    names = [s.name for s in specs]
    assert names == ["date", "title"]


# ──────────────────────── Specialized: walks like action ────────────────────


def test_extract_specialized_walks_endpoint_parameters() -> None:
    endpoint = _make_endpoint(
        Method.GET,
        "/v1/balance/summary",
        parameters=[
            {"name": "currency", "in": "query", "schema": {"type": "string"}},
        ],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output(
        [
            Tool1(
                name="account_balance_summary",
                type=Type.specialized,
                source_endpoints=["GET /v1/balance/summary"],
            )
        ]
    )
    specs = extract_params(raw_ir, p1)["account_balance_summary"]
    assert [s.name for s in specs] == ["currency"]


# ──────────────────────── Missing-endpoint resilience ───────────────────────


def test_extract_skips_missing_endpoint_with_warning(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Missing endpoint → log warning + skip; DO NOT raise (T-03-extract-missing).

    structlog default config writes key=value pairs to stdout (matches
    Pass 2 test_run convention via `capsys`, not `caplog`).
    """
    raw_ir = _make_raw_ir([])  # empty — no endpoints
    p1 = _make_pass1_output(
        [
            Tool1(
                name="ghost_action",
                type=Type.action,
                source_endpoints=["POST /v1/missing"],
            )
        ]
    )

    result = extract_params(raw_ir, p1)
    captured = capsys.readouterr()
    log_text = captured.out + captured.err

    # Tool present in result with empty list (not raised, not missing).
    assert "ghost_action" in result
    assert result["ghost_action"] == []
    # Warning logged with structural fields (T-03-extract-spec-content-leak — no spec content).
    assert "pass_3.extract.endpoint_not_found" in log_text
    assert "tool_name=ghost_action" in log_text
    # Defensive: no spec text leaked (only structural metadata).
    assert "endpoint_id=POST /v1/missing" in log_text


# ──────────────────────── Smart-ID detection ────────────────────────────────


def test_extract_smart_id_detection_user_id() -> None:
    endpoint = _make_endpoint(
        Method.GET,
        "/v1/x",
        parameters=[{"name": "user_id", "in": "query", "schema": {"type": "string"}}],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output([Tool1(name="x_get", type=Type.action, source_endpoints=["GET /v1/x"])])
    spec = extract_params(raw_ir, p1)["x_get"][0]
    assert spec.is_smart_id is True


def test_extract_smart_id_detection_charge_id() -> None:
    endpoint = _make_endpoint(
        Method.GET,
        "/v1/x",
        parameters=[{"name": "charge_id", "in": "query", "schema": {"type": "string"}}],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output([Tool1(name="x_get", type=Type.action, source_endpoints=["GET /v1/x"])])
    spec = extract_params(raw_ir, p1)["x_get"][0]
    assert spec.is_smart_id is True


def test_extract_smart_id_detection_bare_id_case_insensitive() -> None:
    endpoint = _make_endpoint(
        Method.GET,
        "/v1/x",
        parameters=[{"name": "ID", "in": "query", "schema": {"type": "string"}}],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output([Tool1(name="x_get", type=Type.action, source_endpoints=["GET /v1/x"])])
    spec = extract_params(raw_ir, p1)["x_get"][0]
    assert spec.is_smart_id is True


def test_extract_smart_id_detection_amount_is_not_smart_id() -> None:
    endpoint = _make_endpoint(
        Method.GET,
        "/v1/x",
        parameters=[{"name": "amount", "in": "query", "schema": {"type": "integer"}}],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output([Tool1(name="x_get", type=Type.action, source_endpoints=["GET /v1/x"])])
    spec = extract_params(raw_ir, p1)["x_get"][0]
    assert spec.is_smart_id is False


# ──────────────────────── Filter detection ──────────────────────────────────


def test_extract_filter_name_detection() -> None:
    endpoint = _make_endpoint(
        Method.GET,
        "/v1/x",
        parameters=[
            {"name": "filter", "in": "query", "schema": {"type": "string"}},
            {"name": "where", "in": "query", "schema": {"type": "string"}},
            {"name": "q", "in": "query", "schema": {"type": "string"}},
            {"name": "amount", "in": "query", "schema": {"type": "integer"}},
        ],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output([Tool1(name="x_get", type=Type.action, source_endpoints=["GET /v1/x"])])
    by_name = {s.name: s for s in extract_params(raw_ir, p1)["x_get"]}
    assert by_name["filter"].is_filter is True
    assert by_name["where"].is_filter is True
    assert by_name["q"].is_filter is True
    assert by_name["amount"].is_filter is False


# ──────────────────────── Determinism + edge cases ──────────────────────────


def test_extract_pure_function_no_io() -> None:
    """Calling extract_params twice with same args must produce equal results."""
    endpoint = _make_endpoint(
        Method.POST,
        "/v1/charges",
        parameters=[{"name": "amount", "in": "query", "schema": {"type": "integer"}}],
        tags=["charges"],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output(
        [Tool1(name="charges_create", type=Type.action, source_endpoints=["POST /v1/charges"])]
    )
    a = extract_params(raw_ir, p1)
    b = extract_params(raw_ir, p1)
    assert a == b


def test_extract_returns_empty_for_empty_tools_list() -> None:
    p1 = _make_pass1_output([])
    assert extract_params(_make_raw_ir([]), p1) == {}


def test_extract_action_path_query_header_all_extracted() -> None:
    endpoint = _make_endpoint(
        Method.POST,
        "/v1/users/{user_id}/items",
        parameters=[
            {"name": "user_id", "in": "path", "required": True, "schema": {"type": "string"}},
            {"name": "limit", "in": "query", "schema": {"type": "integer", "default": 10}},
            {"name": "X-Trace-Id", "in": "header", "schema": {"type": "string"}},
        ],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output(
        [
            Tool1(
                name="users_create_item",
                type=Type.action,
                source_endpoints=["POST /v1/users/{user_id}/items"],
            )
        ]
    )
    specs = extract_params(raw_ir, p1)["users_create_item"]
    names = {s.name for s in specs}
    assert names == {"user_id", "limit", "X-Trace-Id"}


def test_extract_request_body_required_list_marks_required_correctly() -> None:
    endpoint = _make_endpoint(
        Method.POST,
        "/v1/charges",
        request_body={
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "amount": {"type": "integer"},
                            "currency": {"type": "string"},
                            "description": {"type": "string"},
                        },
                        "required": ["amount", "currency"],
                    }
                }
            }
        },
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output(
        [Tool1(name="charges_create", type=Type.action, source_endpoints=["POST /v1/charges"])]
    )
    by_name = {s.name: s for s in extract_params(raw_ir, p1)["charges_create"]}
    assert by_name["amount"].required is True
    assert by_name["currency"].required is True
    assert by_name["description"].required is False


def test_extract_request_body_extracts_format_enum_pattern() -> None:
    endpoint = _make_endpoint(
        Method.POST,
        "/v1/things",
        request_body={
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "email": {"type": "string", "format": "email"},
                            "status": {"type": "string", "enum": ["active", "inactive"]},
                            "code": {"type": "string", "pattern": "^[A-Z]{3}$"},
                        },
                        "required": [],
                    }
                }
            }
        },
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output(
        [Tool1(name="thing_create", type=Type.action, source_endpoints=["POST /v1/things"])]
    )
    by_name = {s.name: s for s in extract_params(raw_ir, p1)["thing_create"]}
    assert by_name["email"].format == "email"
    assert by_name["status"].enum == ["active", "inactive"]
    assert by_name["code"].pattern == "^[A-Z]{3}$"


def test_parameter_spec_forbids_extras() -> None:
    """ParameterSpec uses ConfigDict(extra='forbid') per project convention."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ParameterSpec(
            name="x",
            type="string",
            source_endpoint_id="standards",
            source_field="standards[universal.search]",
            unknown_field="oops",  # type: ignore[call-arg]
        )


def test_extract_module_does_not_import_llm() -> None:
    """extract.py is pure — must NOT import mcpgen_engine.llm.* per Plan 03-05 contract."""
    from mcpgen_engine.passes.pass_3 import extract

    src = extract.__file__
    assert src is not None
    with open(src, encoding="utf-8") as f:
        body = f.read()
    assert "from mcpgen_engine.llm" not in body
    assert "import mcpgen_engine.llm" not in body


def test_extract_request_body_handles_ref_schema_gracefully() -> None:
    """If requestBody.content.<ct>.schema is a $ref (no inline properties),
    we skip it gracefully (no crash, no hallucinated params)."""
    endpoint = _make_endpoint(
        Method.POST,
        "/v1/things",
        request_body={
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Thing"}}}
        },
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output(
        [Tool1(name="thing_create", type=Type.action, source_endpoints=["POST /v1/things"])]
    )
    specs = extract_params(raw_ir, p1)["thing_create"]
    # No params extracted from $ref body — Stage A would have inlined real refs;
    # if a $ref slips through, we just skip it.
    assert specs == []


def test_extract_universal_uses_only_minimal_signature_ignoring_endpoints() -> None:
    """Universal tools NEVER walk source_endpoints — the hardcoded minimal
    signature wins regardless of whatever endpoints are listed."""
    # An endpoint with rich parameters that would be picked up if universal
    # tools walked source_endpoints (they should NOT).
    endpoint = _make_endpoint(
        Method.GET,
        "/v1/items",
        parameters=[{"name": "totally_made_up_param", "in": "query", "schema": {"type": "string"}}],
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1_output(
        [Tool1(name="search", type=Type.universal, source_endpoints=["GET /v1/items"])]
    )
    specs = extract_params(raw_ir, p1)["search"]
    names = {s.name for s in specs}
    assert names == {"query"}  # from minimal signature, not from endpoint
    assert "totally_made_up_param" not in names
