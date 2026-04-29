"""Pass 5 — outputSchema extraction unit tests.

Verifies CONTEXT D-05 Phase 2 verbatim (`output_schema.py`):

- Per-universal-tool envelope shapes (search/fetch/list_objects/
  list_collections/upsert/delete) per Pass 5 design §1.6.
- `oneOf` aggregation across collections (list_objects subsuming
  multiple types).
- Canonical metadata wrapper shape: `{id, object_type, data, metadata}`
  with `additionalProperties: false`.
- Low-confidence flag when the spec response schema is
  `additionalProperties: true` OR has empty `properties`.
- `OutputSchemaSpec` Pydantic model with `extra='forbid'`.

These are pure-function tests — no LLM, no I/O, no httpx mocks. The
`output_schema.py` module is Phase 2 of the Pass 5 pipeline (D-05,
$0, deterministic).

References:
- 04-CONTEXT.md D-05 (Phase 2 outputSchema extraction) + D-26 (Zod
  conservative-format fallback — implemented in plan 04-07's Stage E
  template, NOT here).
- docs/mcpgen-pass-5-design.md §1.1 (outputSchema generation) +
  §1.6 (per-universal-tool envelope shapes).
- Analog: apps/generation-engine/tests/passes/pass_3/test_extract.py.
"""

from __future__ import annotations

import json
from pathlib import Path
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
from pydantic import ValidationError

from mcpgen_engine.passes.pass_5.output_schema import (
    OutputSchemaSpec,
    extract_all_output_schemas,
    extract_output_schema_for_tool,
    to_json_schema,
    wrap_with_metadata,
)

# ─────────────────────────── Fixture loader ────────────────────────────────

_SAMPLE_SCHEMAS_PATH = (
    Path(__file__).resolve().parents[5]
    / "packages"
    / "engine-fixtures"
    / "stripe"
    / "sample_response_schemas.json"
)


def _load_sample_schemas() -> dict[str, dict[str, Any]]:
    raw = json.loads(_SAMPLE_SCHEMAS_PATH.read_text(encoding="utf-8"))
    # Drop the leading `_comment` documentation key.
    return {k: v for k, v in raw.items() if not k.startswith("_")}


# ─────────────────────────── Test helpers ──────────────────────────────────


def _make_endpoint(
    method: Method,
    path: str,
    response_schema: dict[str, Any] | None = None,
    response_code: str = "200",
) -> Endpoint:
    """Build a minimal valid `Endpoint` with an OpenAPI 3.x response shape."""
    if response_schema is None:
        responses: dict[str, Any] = {response_code: {"description": "ok"}}
    else:
        responses = {
            response_code: {
                "description": "ok",
                "content": {
                    "application/json": {"schema": response_schema},
                },
            },
        }
    return Endpoint(
        method=method,
        path=path,
        parameters=[],
        request_body=None,
        responses=responses,
        tags=[],
        deprecated=False,
    )


def _make_endpoint_multi(
    method: Method,
    path: str,
    responses: dict[str, dict[str, Any]],
) -> Endpoint:
    """Build an `Endpoint` with multiple status-code responses."""
    return Endpoint(
        method=method,
        path=path,
        parameters=[],
        request_body=None,
        responses=responses,
        tags=[],
        deprecated=False,
    )


def _make_raw_ir(endpoints: list[Endpoint]) -> RawIR:
    return RawIR(
        spec_format=SpecFormat.openapi_3_0,
        spec_hash="0" * 64,
        endpoints=endpoints,
        schemas={},
        security_schemes={},
        dependency_graph={},
    )


def _make_pass1(
    tools: list[Tool1],
    collections: list[str] | None = None,
    rules: list[Rule1] | None = None,
) -> Pass1Output:
    routing = Routing1(
        smart_id=SmartId(
            format="stripe-api:{type}:{collection}:{identifier}",
            types=["object", "collection"],
            collections=collections or [],
        ),
        rules=rules or [],
    )
    return Pass1Output(
        tools=tools,
        routing=routing,
        workflows=[],
        coverage_pct=100.0,
        coverage_proof=[],
    )


# ─────────────────────────── 1. fetch envelope ─────────────────────────────


def test_fetch_envelope_shape() -> None:
    """`fetch` → single-object data field, wrapped with `{id, object_type, data, metadata}`."""
    samples = _load_sample_schemas()
    charge = samples["Charge"]
    endpoint = _make_endpoint(Method.GET, "/v1/charges/{id}", response_schema=charge)
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [Tool1(name="fetch", type=Type.universal, source_endpoints=["GET /v1/charges/{id}"])],
        collections=["Charge"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    assert spec.tool_name == "fetch"
    # The inner data fields should match Charge.properties.
    assert "amount" in spec.fields
    assert "currency" in spec.fields
    # wrapping_object_type is the single collection from routing.
    assert spec.wrapping_object_type == "Charge"

    wrapped = to_json_schema(spec)
    assert wrapped["type"] == "object"
    assert set(wrapped["required"]) == {"id", "object_type", "data"}
    assert wrapped["additionalProperties"] is False
    assert wrapped["properties"]["object_type"]["const"] == "Charge"
    assert "data" in wrapped["properties"]
    assert "metadata" in wrapped["properties"]


# ─────────────────────────── 2. search envelope ────────────────────────────


def test_search_envelope_shape() -> None:
    """`search` → `{results: array<{id, score?, preview}>, total_count?, next_cursor?}`."""
    endpoint = _make_endpoint(
        Method.GET,
        "/v1/customers",
        response_schema={"type": "object", "additionalProperties": True},
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [Tool1(name="search", type=Type.universal, source_endpoints=["GET /v1/customers"])],
        collections=["Customer"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    wrapped = to_json_schema(spec)
    data = wrapped["properties"]["data"]
    assert data["type"] == "object"
    assert "results" in data["properties"]
    results = data["properties"]["results"]
    assert results["type"] == "array"
    item_props = results["items"]["properties"]
    assert {"id", "score", "preview"} <= set(item_props.keys())
    assert "total_count" in data["properties"]
    assert "next_cursor" in data["properties"]


# ─────────────────────────── 3. list_objects envelope ──────────────────────


def test_list_objects_envelope_shape() -> None:
    """`list_objects` → `{items: array<...>, next_cursor?, offset?, total_count?}`."""
    samples = _load_sample_schemas()
    charge_list = samples["ChargeList"]
    endpoint = _make_endpoint(Method.GET, "/v1/charges", response_schema=charge_list)
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [Tool1(name="list_objects", type=Type.universal, source_endpoints=["GET /v1/charges"])],
        collections=["Charge"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    wrapped = to_json_schema(spec)
    data = wrapped["properties"]["data"]
    assert "items" in data["properties"]
    assert data["properties"]["items"]["type"] == "array"
    assert "next_cursor" in data["properties"]
    assert "offset" in data["properties"]
    assert "total_count" in data["properties"]


# ─────────────────────────── 4. list_collections envelope ──────────────────


def test_list_collections_envelope_shape() -> None:
    """`list_collections` → `{items: array<{name, schema?}>}`."""
    endpoint = _make_endpoint(
        Method.GET,
        "/v1/collections",
        response_schema={"type": "object", "additionalProperties": True},
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [
            Tool1(
                name="list_collections",
                type=Type.universal,
                source_endpoints=["GET /v1/collections"],
            )
        ],
        collections=["Charge", "Customer"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    wrapped = to_json_schema(spec)
    data = wrapped["properties"]["data"]
    assert "items" in data["properties"]
    items = data["properties"]["items"]
    assert items["type"] == "array"
    item_props = items["items"]["properties"]
    assert "name" in item_props
    # Schema field is optional but documented.
    assert "schema" in item_props


# ─────────────────────────── 5. upsert envelope (201 preferred) ───────────


def test_upsert_envelope_prefers_201_over_200() -> None:
    """`upsert` prefers 201 Created over 200 OK when both are present."""
    samples = _load_sample_schemas()
    charge = samples["Charge"]
    customer = samples["Customer"]
    endpoint = _make_endpoint_multi(
        Method.POST,
        "/v1/charges",
        responses={
            "200": {
                "description": "ok",
                "content": {"application/json": {"schema": customer}},
            },
            "201": {
                "description": "created",
                "content": {"application/json": {"schema": charge}},
            },
        },
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [Tool1(name="upsert", type=Type.universal, source_endpoints=["POST /v1/charges"])],
        collections=["Charge"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    # 201 schema is `Charge` → has `amount`/`currency`; 200 schema is `Customer`
    # → has `email`. We expect Charge fields, not Customer fields.
    assert "amount" in spec.fields
    assert "currency" in spec.fields
    assert "email" not in spec.fields


def test_upsert_falls_back_to_200_when_201_missing() -> None:
    """`upsert` falls back to 200 if 201 absent."""
    samples = _load_sample_schemas()
    charge = samples["Charge"]
    endpoint = _make_endpoint(Method.POST, "/v1/charges", response_schema=charge)
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [Tool1(name="upsert", type=Type.universal, source_endpoints=["POST /v1/charges"])],
        collections=["Charge"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    assert "amount" in spec.fields


# ─────────────────────────── 6. delete envelope ────────────────────────────


def test_delete_envelope_shape() -> None:
    """`delete` → `{deleted_count: integer, success: boolean}` confirmation envelope."""
    samples = _load_sample_schemas()
    delete_resp = samples["DeleteResponse"]
    endpoint = _make_endpoint(Method.DELETE, "/v1/charges/{id}", response_schema=delete_resp)
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [
            Tool1(
                name="delete",
                type=Type.universal,
                source_endpoints=["DELETE /v1/charges/{id}"],
            )
        ],
        collections=["Charge"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    wrapped = to_json_schema(spec)
    data = wrapped["properties"]["data"]
    assert "deleted_count" in data["properties"]
    assert data["properties"]["deleted_count"]["type"] == "integer"
    assert "success" in data["properties"]
    assert data["properties"]["success"]["type"] == "boolean"
    assert set(data["required"]) == {"deleted_count", "success"}


# ─────────────────────────── 7. action pass-through ────────────────────────


def test_action_pass_through_wraps_spec_response() -> None:
    """Action tools pass through the spec response with metadata wrapper."""
    samples = _load_sample_schemas()
    charge = samples["Charge"]
    endpoint = _make_endpoint(Method.POST, "/v1/charges/{id}/capture", response_schema=charge)
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [
            Tool1(
                name="charges_capture",
                type=Type.action,
                source_endpoints=["POST /v1/charges/{id}/capture"],
            )
        ],
        collections=[],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    # Action: pass-through inner data — Charge fields preserved.
    assert "amount" in spec.fields
    assert "currency" in spec.fields
    wrapped = to_json_schema(spec)
    assert "metadata" in wrapped["properties"]
    assert wrapped["additionalProperties"] is False


# ─────────────────────────── 8. low-confidence: additionalProperties: true ─


def test_low_confidence_when_additional_properties_true() -> None:
    """`additionalProperties: true` → `inference_low_confidence=True`."""
    samples = _load_sample_schemas()
    empty_additional = samples["EmptyAdditional"]
    endpoint = _make_endpoint(Method.GET, "/v1/opaque", response_schema=empty_additional)
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [
            Tool1(
                name="fetch",
                type=Type.universal,
                source_endpoints=["GET /v1/opaque"],
            )
        ],
        collections=["Opaque"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    assert spec.inference_low_confidence is True


# ─────────────────────────── 9. low-confidence: empty properties ───────────


def test_low_confidence_when_empty_properties() -> None:
    """Empty `properties` dict → `inference_low_confidence=True`."""
    endpoint = _make_endpoint(
        Method.GET, "/v1/empty", response_schema={"type": "object", "properties": {}}
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [
            Tool1(
                name="fetch",
                type=Type.universal,
                source_endpoints=["GET /v1/empty"],
            )
        ],
        collections=["Empty"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    assert spec.inference_low_confidence is True


# ─────────────────────────── 10. oneOf aggregation ─────────────────────────


def test_oneof_aggregation_multiple_collections() -> None:
    """`list_objects` subsuming multiple collections → `oneOf` aggregated inner schema."""
    samples = _load_sample_schemas()
    charge_list = samples["ChargeList"]
    endpoint = _make_endpoint(Method.GET, "/v1/charges", response_schema=charge_list)
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [
            Tool1(
                name="list_objects",
                type=Type.universal,
                source_endpoints=["GET /v1/charges"],
            )
        ],
        collections=["Charge", "Customer", "Subscription"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    wrapped = to_json_schema(spec)
    data = wrapped["properties"]["data"]
    items = data["properties"]["items"]
    # Items is the aggregated oneOf shape — inner schema marker.
    inner = items["items"]
    assert "oneOf" in inner or inner.get("additionalProperties") is True


# ─────────────────────────── 11. canonical wrapper ─────────────────────────


def test_wrap_with_metadata_canonical_shape() -> None:
    """`wrap_with_metadata` returns canonical `{id, object_type, data, metadata}` shape."""
    inner = {"type": "object", "properties": {"foo": {"type": "string"}}}
    wrapped = wrap_with_metadata(inner, "Charge")
    assert wrapped["type"] == "object"
    assert wrapped["additionalProperties"] is False
    assert set(wrapped["required"]) == {"id", "object_type", "data"}
    assert set(wrapped["properties"].keys()) == {"id", "object_type", "data", "metadata"}
    assert wrapped["properties"]["id"]["type"] == "string"
    assert wrapped["properties"]["object_type"]["const"] == "Charge"


# ─────────────────────────── 12. metadata required fields ──────────────────


def test_metadata_has_fetched_at_and_source_endpoint() -> None:
    """Metadata block requires `fetched_at` (date-time) and `source_endpoint`."""
    inner = {"type": "object", "properties": {}}
    wrapped = wrap_with_metadata(inner, "X")
    metadata = wrapped["properties"]["metadata"]
    assert metadata["type"] == "object"
    assert "fetched_at" in metadata["properties"]
    assert metadata["properties"]["fetched_at"]["format"] == "date-time"
    assert "source_endpoint" in metadata["properties"]
    assert set(metadata["required"]) == {"fetched_at", "source_endpoint"}


# ─────────────────────────── 13. extra='forbid' ────────────────────────────


def test_output_schema_spec_extra_forbid_rejects_unknown_field() -> None:
    """`OutputSchemaSpec` has `extra='forbid'` — unknown fields raise ValidationError."""
    with pytest.raises(ValidationError):
        OutputSchemaSpec(  # type: ignore[call-arg]
            tool_name="fetch",
            fields={},
            data_schema={"type": "object"},
            source_endpoint_id="GET /v1/x",
            wrapping_object_type="X",
            inference_low_confidence=False,
            unknown_field="should-fail",
        )


# ─────────────────────────── 14. additionalProperties: false ──────────────


def test_to_json_schema_additional_properties_false() -> None:
    """Top-level wrapper has `additionalProperties: false` (canonical)."""
    spec = OutputSchemaSpec(
        tool_name="fetch",
        fields={"id": {"type": "string"}},
        data_schema={"type": "object", "properties": {"id": {"type": "string"}}},
        source_endpoint_id="GET /v1/x",
        wrapping_object_type="X",
        inference_low_confidence=False,
    )
    wrapped = to_json_schema(spec)
    assert wrapped["additionalProperties"] is False


# ─────────────────────────── 15. missing source endpoint ───────────────────


def test_missing_source_endpoint_yields_low_confidence() -> None:
    """Tool whose source endpoint isn't in RawIR → low-confidence + empty fields."""
    raw_ir = _make_raw_ir([])  # empty
    p1 = _make_pass1(
        [
            Tool1(
                name="fetch",
                type=Type.universal,
                source_endpoints=["GET /v1/missing"],
            )
        ],
        collections=["X"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    assert spec.inference_low_confidence is True
    assert spec.fields == {}


# ─────────────────────────── 16. extract_all_output_schemas orchestrator ──


def test_extract_all_returns_dict_keyed_by_tool_name() -> None:
    """`extract_all_output_schemas` returns dict keyed by tool name."""
    samples = _load_sample_schemas()
    charge = samples["Charge"]
    customer = samples["Customer"]
    endpoints = [
        _make_endpoint(Method.GET, "/v1/charges/{id}", response_schema=charge),
        _make_endpoint(Method.GET, "/v1/customers/{id}", response_schema=customer),
    ]
    raw_ir = _make_raw_ir(endpoints)
    p1 = _make_pass1(
        [
            Tool1(
                name="fetch",
                type=Type.universal,
                source_endpoints=["GET /v1/charges/{id}"],
            ),
            Tool1(
                name="search",
                type=Type.universal,
                source_endpoints=["GET /v1/customers/{id}"],
            ),
        ],
        collections=["Charge", "Customer"],
    )

    result = extract_all_output_schemas(p1, raw_ir)
    assert set(result.keys()) == {"fetch", "search"}
    assert isinstance(result["fetch"], OutputSchemaSpec)
    assert isinstance(result["search"], OutputSchemaSpec)


# ─────────────────────────── 17. universal-tool builder coverage ──────────


@pytest.mark.parametrize(
    "tool_name",
    [
        UniversalTool.search.value,
        UniversalTool.fetch.value,
        UniversalTool.list_objects.value,
        UniversalTool.list_collections.value,
        UniversalTool.upsert.value,
        UniversalTool.delete.value,
    ],
)
def test_every_universal_tool_produces_wrapped_schema(tool_name: str) -> None:
    """Every universal tool produces a wrapped JSON Schema dict."""
    endpoint = _make_endpoint(
        Method.GET,
        "/v1/x",
        response_schema={"type": "object", "properties": {"id": {"type": "string"}}},
    )
    raw_ir = _make_raw_ir([endpoint])
    p1 = _make_pass1(
        [Tool1(name=tool_name, type=Type.universal, source_endpoints=["GET /v1/x"])],
        collections=["X"],
    )

    spec = extract_output_schema_for_tool(p1.tools[0], p1, raw_ir)
    wrapped = to_json_schema(spec)
    assert wrapped["type"] == "object"
    assert "data" in wrapped["properties"]
    assert "metadata" in wrapped["properties"]
