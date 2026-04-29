"""Pass 5 Phase 2 — deterministic outputSchema extraction.

Per CONTEXT D-05 Phase 2: walks ``RawIR.endpoints[*].responses[code]`` and
produces per-tool JSON Schema dict wrapped with the canonical Pass 5
``{id, object_type, data, metadata}`` envelope (Pass 5 design §1.1).

Per-universal-tool envelope shapes follow Pass 5 design §1.6:

- ``search``     → ``{results: array<{id, score?, preview}>, total_count?, next_cursor?}``
- ``fetch``      → single object passes through to ``data``
- ``list_objects``     → ``{items: array<...>, next_cursor?, offset?, total_count?}``
- ``list_collections`` → ``{items: array<{name, description?, schema?}>}``
- ``upsert``     → returns the upserted object (single, prefers 201 over 200)
- ``delete``     → ``{deleted_count: integer, success: boolean}``

Universal ``list_objects`` tools that subsume multiple collections (per
``Pass1Output.routing.smart_id.collections``) produce a ``oneOf`` aggregated
inner schema. Conservative-format Zod fallback (Pitfall #33) lives in plan
04-07's Stage E ``outputs.ts.j2`` template — this module emits raw JSON Schema.

Threats addressed:
- T-04-02-spec-leak: structural-only logging (``tool_count``,
  ``low_confidence_count``, ``distinct_object_types``); raw spec content
  NEVER logged.
- T-04-02-IR-mutation: pure functions; outputs are new dicts (deep-copied
  inner spec).
- T-04-02-low-confidence-silent: when spec response is
  ``additionalProperties: true`` OR has empty ``properties``, set
  ``inference_low_confidence=True`` so plan 04-05 can surface a warning
  in ``Pass5Output`` flags.

References:
- 04-CONTEXT.md D-05 Phase 2.
- docs/mcpgen-pass-5-design.md §1.1 + §1.6.
- Analog: ``apps/generation-engine/src/mcpgen_engine/passes/pass_3/extract.py``
  (deterministic per-tool extractor walking RawIR + intermediate Pydantic
  Spec type with ``extra='forbid'``).

NOTE on IR shape: ``Endpoint.responses`` is ``Dict[str, Any]`` in the
frozen IR (raw OpenAPI dicts), NOT a typed ``Response`` model. The plan's
interface block referenced ``Response.schema_`` — that type does not exist.
This module walks the raw dict and resolves the schema via the OpenAPI
3.x ``content[<json-ct>].schema`` path with a flat ``schema`` fallback for
older 2.x specs.
"""

from __future__ import annotations

import copy
from collections import Counter
from typing import Any, Final

import structlog
from mcpgen_ir.types import (
    Endpoint,
    Method,
    Pass1Output,
    RawIR,
    Tool1,
    Type,
    UniversalTool,
)
from pydantic import BaseModel, ConfigDict

_log = structlog.get_logger(__name__)


# ──────────────────────────── OutputSchemaSpec ─────────────────────────────


class OutputSchemaSpec(BaseModel):
    """Internal Pass 5 type — NOT exported in IR.

    Consumed by:
    - ``field_ranking.py`` (plan 04-03) — input for LLM importance ranking.
    - ``validation.py``    (plan 04-05) — cross-tool consistency checks.
    - ``final_assembly.py``(plan 04-05) — produces ``FinalTool.outputSchema``.
    """

    model_config = ConfigDict(extra="forbid")

    tool_name: str
    # Per-field JSON Schema (flat ``properties`` map convenience view; the
    # full data envelope lives in ``data_schema``).
    fields: dict[str, dict[str, Any]]
    # Full data-slot JSON Schema (envelope shape from Pass 5 design §1.6 for
    # universal tools, or pass-through spec response for action/workflow/
    # specialized). ``to_json_schema()`` wraps this into the canonical
    # ``{id, object_type, data, metadata}`` envelope.
    data_schema: dict[str, Any]
    source_endpoint_id: str
    wrapping_object_type: str
    # True when spec response is ``additionalProperties: true`` OR has empty
    # ``properties`` dict — surfaced as a warning by plan 04-05.
    inference_low_confidence: bool = False


# ──────────────────────────── Canonical wrapper ────────────────────────────


def wrap_with_metadata(
    inner_data_schema: dict[str, Any],
    object_type: str,
) -> dict[str, Any]:
    """Canonical Pass 5 outputSchema wrapper (D-05 + Pass 5 design §1.1).

    Returns a NEW dict; the caller's ``inner_data_schema`` is deep-copied
    into the ``data`` slot so subsequent mutation cannot leak back into
    upstream IR (T-04-02-IR-mutation).
    """
    return {
        "type": "object",
        "properties": {
            "id": {"type": "string", "description": "Smart ID"},
            "object_type": {"type": "string", "const": object_type},
            "data": copy.deepcopy(inner_data_schema),
            "metadata": {
                "type": "object",
                "properties": {
                    "fetched_at": {"type": "string", "format": "date-time"},
                    "source_endpoint": {"type": "string"},
                },
                "required": ["fetched_at", "source_endpoint"],
            },
        },
        "required": ["id", "object_type", "data"],
        "additionalProperties": False,
    }


# ──────────────────────────── Per-universal envelope builders ──────────────


def _build_search_envelope(inner: dict[str, Any], collections: list[str]) -> dict[str, Any]:
    """Pass 5 design §1.6: search → ranked results envelope."""
    del inner, collections  # search ignores spec inner — uses canonical envelope
    return {
        "type": "object",
        "properties": {
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "Smart ID"},
                        "score": {"type": "number"},
                        "preview": {"type": "object", "additionalProperties": True},
                    },
                    "required": ["id"],
                },
            },
            "total_count": {"type": "integer", "minimum": 0},
            "next_cursor": {"type": "string"},
        },
        "required": ["results"],
    }


def _build_fetch_envelope(inner: dict[str, Any], collections: list[str]) -> dict[str, Any]:
    """Pass 5 design §1.6: fetch → single object passes through."""
    del collections
    if inner and inner.get("properties"):
        return inner
    return {"type": "object", "additionalProperties": True}


def _build_list_objects_envelope(inner: dict[str, Any], collections: list[str]) -> dict[str, Any]:
    """Pass 5 design §1.6: list_objects → paginated items envelope.

    Multi-collection servers get a ``oneOf`` aggregated inner schema; the
    aggregation logic itself runs in :func:`extract_output_schema_for_tool`
    (so this builder receives the already-merged inner shape).
    """
    del collections
    if inner and (inner.get("properties") or inner.get("oneOf")):
        item_schema = inner
    else:
        item_schema = {"type": "object", "additionalProperties": True}
    return {
        "type": "object",
        "properties": {
            "items": {"type": "array", "items": item_schema},
            "next_cursor": {"type": "string"},
            "offset": {"type": "integer"},
            "total_count": {"type": "integer"},
        },
        "required": ["items"],
    }


def _build_list_collections_envelope(
    inner: dict[str, Any], collections: list[str]
) -> dict[str, Any]:
    """Pass 5 design §1.6: list_collections → metadata items envelope."""
    del inner, collections  # list_collections envelope is universal
    return {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "schema": {"type": "object", "additionalProperties": True},
                    },
                    "required": ["name"],
                },
            },
        },
        "required": ["items"],
    }


def _build_upsert_envelope(inner: dict[str, Any], collections: list[str]) -> dict[str, Any]:
    """Pass 5 design §1.6: upsert → returns the upserted single object."""
    del collections
    if inner and inner.get("properties"):
        return inner
    return {"type": "object", "additionalProperties": True}


def _build_delete_envelope(inner: dict[str, Any], collections: list[str]) -> dict[str, Any]:
    """Pass 5 design §1.6: delete → confirmation envelope."""
    del inner, collections  # delete envelope is universal
    return {
        "type": "object",
        "properties": {
            "deleted_count": {"type": "integer", "minimum": 0},
            "success": {"type": "boolean"},
        },
        "required": ["deleted_count", "success"],
    }


_UNIVERSAL_ENVELOPE_BUILDERS: Final[dict[UniversalTool, Any]] = {
    UniversalTool.search: _build_search_envelope,
    UniversalTool.fetch: _build_fetch_envelope,
    UniversalTool.list_objects: _build_list_objects_envelope,
    UniversalTool.list_collections: _build_list_collections_envelope,
    UniversalTool.upsert: _build_upsert_envelope,
    UniversalTool.delete: _build_delete_envelope,
}


# Map a universal tool's ``Tool1.name`` to the ``UniversalTool`` enum. The
# Pass 1 IR carries ``Tool1.type == Type.universal`` plus ``Tool1.name`` ∈
# the 6 canonical universal names; the IR does NOT carry a separate
# ``universal_tool`` field.
_NAME_TO_UNIVERSAL: Final[dict[str, UniversalTool]] = {
    member.value: member for member in UniversalTool
}


# ──────────────────────────── Helpers ──────────────────────────────────────


def _endpoint_id(ep: Endpoint) -> str:
    """Stable identifier matching Phase 2 ``_endpoint_id`` shape (``"METHOD path"``)."""
    method = ep.method.value if isinstance(ep.method, Method) else str(ep.method).upper()
    return f"{method} {ep.path}"


def _extract_schema_from_response(response_obj: Any) -> dict[str, Any]:
    """Pull the JSON-schema dict from a raw OpenAPI response object.

    Tries OpenAPI 3.x ``content["application/json"].schema`` first, then any
    other ``application/*+json`` variant, then falls back to OpenAPI 2.x
    flat ``schema`` (Stripe specs sometimes use ``application/x-www-form-
    urlencoded`` for responses too — accept any content type with an inline
    properties-bearing schema).

    Returns ``{}`` when nothing inline is found ($ref-only bodies are handled
    upstream by Stage A inlining; if a $ref slips through we don't hallucinate).
    """
    if not isinstance(response_obj, dict):
        return {}

    # OpenAPI 3.x — content map.
    content = response_obj.get("content")
    if isinstance(content, dict):
        # Prefer application/json.
        json_entry = content.get("application/json")
        if isinstance(json_entry, dict):
            schema = json_entry.get("schema")
            if isinstance(schema, dict):
                return schema
        # Then any *+json or other content type with a properties-bearing schema.
        for ct, entry in content.items():
            if ct == "application/json":
                continue
            if isinstance(entry, dict):
                schema = entry.get("schema")
                if isinstance(schema, dict):
                    return schema

    # OpenAPI 2.x — flat schema sibling.
    schema_flat = response_obj.get("schema")
    if isinstance(schema_flat, dict):
        return schema_flat

    return {}


def _resolve_response_schema(
    endpoint: Endpoint, preferred_codes: tuple[str, ...]
) -> dict[str, Any]:
    """Pull response schema with explicit code preference + 2xx fallback."""
    for code in preferred_codes:
        response = endpoint.responses.get(code)
        schema = _extract_schema_from_response(response)
        if schema:
            return schema

    # Try any 2xx as last resort (preserves deterministic dict order).
    for code, response in endpoint.responses.items():
        if code.startswith("2"):
            schema = _extract_schema_from_response(response)
            if schema:
                return schema

    return {}


def _detect_low_confidence(raw_schema: dict[str, Any]) -> bool:
    """Spec is low-confidence when ``additionalProperties: true`` OR no ``properties``."""
    if not raw_schema:
        return True
    if raw_schema.get("additionalProperties") is True:
        return True
    properties = raw_schema.get("properties")
    return not isinstance(properties, dict) or not properties


def _extract_inner_data(raw_schema: dict[str, Any]) -> dict[str, Any]:
    """Resolve the actual data shape from a possibly-wrapped list response.

    Many list endpoints ship a ``{data: array<Object>, has_more, ...}`` wrapper
    (Stripe-style). When we're authoring the inner item schema for a list
    envelope, prefer the items shape when the spec wraps an array.
    """
    properties = raw_schema.get("properties")
    if isinstance(properties, dict):
        # Detect Stripe-style ``data: {type: array, items: {...}}`` wrapper.
        data_field = properties.get("data")
        if isinstance(data_field, dict) and data_field.get("type") == "array":
            items = data_field.get("items")
            if isinstance(items, dict):
                return items
    return raw_schema


def _build_oneof_inner(collections: list[str]) -> dict[str, Any]:
    """Conservative ``oneOf`` aggregation across multiple collections.

    Without per-collection schemas in the IR (the frozen ``RawIR.schemas``
    dict is keyed by raw spec component names, not by Pass 1 ``collections``
    enum values), we emit an open ``oneOf`` of bare object schemas. Plan
    04-05 final assembly may further refine this once per-collection IR
    schema lookup lands.
    """
    return {
        "oneOf": [{"type": "object", "additionalProperties": True} for _ in collections],
        "additionalProperties": True,
    }


# ──────────────────────────── Public API ───────────────────────────────────


def extract_output_schema_for_tool(
    tool: Tool1,
    pass_1_output: Pass1Output,
    raw_ir: RawIR,
) -> OutputSchemaSpec:
    """Per-tool deterministic outputSchema spec extractor.

    Walks ``tool.source_endpoints`` (first endpoint), looks it up in
    ``raw_ir.endpoints``, resolves the response schema, applies the per-
    universal-tool envelope shape (Pass 5 design §1.6), and returns an
    ``OutputSchemaSpec``. Multi-collection ``list_objects`` tools get a
    ``oneOf`` aggregated inner item schema.

    ``pass_1_output`` is consumed read-only for ``routing.smart_id.collections``
    — the collection list is required to determine ``wrapping_object_type``
    and trigger ``oneOf`` aggregation.

    Pure: no I/O, no LLM calls, no global mutation. Returns a new
    ``OutputSchemaSpec`` (Pydantic ``extra='forbid'``); inner JSON-Schema
    dicts are deep-copied at ``to_json_schema()`` time.
    """
    # Index endpoints by stable id (matches Phase 2 source_endpoint_id format).
    endpoints_by_id: dict[str, Endpoint] = {_endpoint_id(ep): ep for ep in raw_ir.endpoints}

    collections: list[str] = list(pass_1_output.routing.smart_id.collections)

    # Defensive — Pass 1 should never emit a tool with no source endpoints.
    if not tool.source_endpoints:
        return OutputSchemaSpec(
            tool_name=tool.name,
            fields={},
            data_schema={"type": "object", "additionalProperties": True},
            source_endpoint_id="",
            wrapping_object_type=tool.name,
            inference_low_confidence=True,
        )

    first_endpoint_id = tool.source_endpoints[0]
    endpoint = endpoints_by_id.get(first_endpoint_id)
    if endpoint is None:
        return OutputSchemaSpec(
            tool_name=tool.name,
            fields={},
            data_schema={"type": "object", "additionalProperties": True},
            source_endpoint_id=first_endpoint_id,
            wrapping_object_type=collections[0] if collections else tool.name,
            inference_low_confidence=True,
        )

    # Determine universal-tool flavour (None for action/workflow/specialized).
    universal: UniversalTool | None = None
    if tool.type == Type.universal:
        universal = _NAME_TO_UNIVERSAL.get(tool.name)
        if universal is None:
            _log.warning(
                "pass_5.output_schema.unknown_universal_name",
                tool_name=tool.name,
            )

    # Universal upsert prefers 201 Created → 200 OK → 202 Accepted; everything
    # else prefers 200 → 201 → 202 → 204.
    preferred_codes: tuple[str, ...]
    if universal == UniversalTool.upsert:
        preferred_codes = ("201", "200", "202")
    else:
        preferred_codes = ("200", "201", "202", "204")

    raw_schema = _resolve_response_schema(endpoint, preferred_codes)
    low_confidence = _detect_low_confidence(raw_schema)

    # For list_objects unwrap Stripe-style {data: [Item]} wrappers so the
    # envelope's items.* slot carries the actual item shape.
    if universal == UniversalTool.list_objects:
        inner_for_envelope = _extract_inner_data(raw_schema)
        # oneOf aggregation when multiple collections subsumed.
        if len(collections) > 1:
            inner_for_envelope = _build_oneof_inner(collections)
    else:
        inner_for_envelope = raw_schema

    # Build envelope per universal-tool branch; non-universal tools (action /
    # workflow / specialized) pass through the spec response unchanged.
    if universal is not None and universal in _UNIVERSAL_ENVELOPE_BUILDERS:
        builder = _UNIVERSAL_ENVELOPE_BUILDERS[universal]
        data_schema: dict[str, Any] = builder(inner_for_envelope, collections)
    elif raw_schema and raw_schema.get("properties"):
        data_schema = raw_schema
    else:
        data_schema = {"type": "object", "additionalProperties": True}

    # Determine wrapping object_type.
    if len(collections) == 1:
        object_type = collections[0]
    elif universal is not None:
        object_type = universal.value
    else:
        object_type = tool.name

    # Convert data_schema into per-field properties dict for OutputSchemaSpec.
    data_properties = data_schema.get("properties")
    if isinstance(data_properties, dict):
        fields: dict[str, dict[str, Any]] = {
            str(k): copy.deepcopy(v) for k, v in data_properties.items() if isinstance(v, dict)
        }
    else:
        fields = {}

    return OutputSchemaSpec(
        tool_name=tool.name,
        fields=fields,
        data_schema=copy.deepcopy(data_schema),
        source_endpoint_id=first_endpoint_id,
        wrapping_object_type=str(object_type),
        inference_low_confidence=bool(low_confidence),
    )


def extract_all_output_schemas(
    pass_1_output: Pass1Output,
    raw_ir: RawIR,
) -> dict[str, OutputSchemaSpec]:
    """Walk every tool in ``pass_1_output.tools`` and extract its outputSchema spec.

    Returns a dict keyed by tool name. Universal ``list_*`` tools that
    subsume multiple collections produce a ``oneOf`` aggregated inner
    schema (handled inside :func:`extract_output_schema_for_tool`).

    Logs structural metrics only — never spec content
    (T-04-02-spec-leak mitigation).
    """
    result: dict[str, OutputSchemaSpec] = {}
    for tool in pass_1_output.tools:
        result[tool.name] = extract_output_schema_for_tool(tool, pass_1_output, raw_ir)

    object_type_counter: Counter[str] = Counter(s.wrapping_object_type for s in result.values())
    low_confidence_count = sum(1 for s in result.values() if s.inference_low_confidence)
    _log.info(
        "pass_5.output_schema.extract_complete",
        tool_count=len(result),
        low_confidence_count=low_confidence_count,
        distinct_object_types=len(object_type_counter),
    )
    return result


def to_json_schema(spec: OutputSchemaSpec) -> dict[str, Any]:
    """Convert ``OutputSchemaSpec`` → wrapped JSON Schema (FinalTool.outputSchema).

    Wraps ``spec.data_schema`` (the per-universal envelope shape, or pass-
    through spec response for non-universal tools) with the canonical
    ``{id, object_type, data, metadata}`` envelope via :func:`wrap_with_metadata`.

    For specs constructed without a ``data_schema`` payload (degenerate cases
    or external callers building specs from ``fields`` only), reconstructs
    a minimal ``{type: object, properties: <fields>}`` data slot.
    """
    if spec.data_schema:
        inner_data_schema = copy.deepcopy(spec.data_schema)
    elif spec.fields:
        inner_data_schema = {
            "type": "object",
            "properties": copy.deepcopy(spec.fields),
        }
    else:
        inner_data_schema = {"type": "object", "additionalProperties": True}
    return wrap_with_metadata(inner_data_schema, spec.wrapping_object_type)
