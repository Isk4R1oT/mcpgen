"""Pass 3 — Phase 1: deterministic parameter extraction (no LLM, no I/O).

Walks `pass_1_output.tools`, looks each `tool.source_endpoints[i]` up in
`raw_ir.endpoints`, and emits a `dict[tool_name, list[ParameterSpec]]`
capturing the deterministic 5-dimension spec data (type/format/enum/
pattern/default + required flag) that Plan 03-06 enrich.py uses as
LLM input + Plan 03-09 validation.py validates against.

Universal tools (search/fetch/list_collections/list_objects/upsert/delete)
use a HARDCODED minimal signature here per D-21 — full standard parameter
sets land in Plan 03-08 standards.py (this module emits the bare-minimum
shape so downstream plans see a non-empty list). Universal tools NEVER
walk source_endpoints — the universal contract is fixed by name (Pitfall
#32 invariant).

Smart-ID + filter parameters are flagged here (booleans on ParameterSpec)
for specialized handling in Plans 03-07 (filter) + 03-08 (smart-ID).

Threats addressed: T-03-extract-missing (defensive log+skip; never raise),
T-03-extract-collision (kept; cross-param validation in Plan 03-09),
T-03-extract-spec-content-leak (logging emits structural metrics only —
tool_name + endpoint_id; spec strings are stored in ParameterSpec but
never logged — Plan 03-06 wraps them in <spec_excerpt> per D-25).

References:
- 03-CONTEXT.md D-04 (module layout) + D-16 (Pass 3 4-phase pipeline) +
  D-19 (entity_hint from endpoint tags[0]) + D-20 (smart-ID detection) +
  D-21 (standard parameter sets for universal tools)
- 03-PATTERNS.md `passes/pass_3/extract.py` row + Shared Patterns
  "Local intermediate Pydantic types"
- docs/mcpgen-pass-3-design.md §5 (4-phase pipeline) + Appendix A
  (universal tool standard parameter sets)
- Analog: `apps/generation-engine/src/mcpgen_engine/passes/pass_0/filter.py`
  (Final[*] constants + pure-function pattern)
"""

from __future__ import annotations

import re
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


# ──────────────────────────── ParameterSpec model ───────────────────────────


class ParameterSpec(BaseModel):
    """Deterministic per-parameter spec extracted from RawIR + Pass 1 routing.

    Internal to Pass 3; not exported in IR. Consumed by:
    - enrich.py (Plan 03-06) — LLM input for 5-component description authoring.
    - filter_design.py (Plan 03-07) — `is_filter` drives A/B/C selection.
    - naming.py (Plan 03-08) — `entity_hint` drives bare-name normalization.
    - smart_id.py (Plan 03-08) — `is_smart_id` drives pattern injection.
    - standards.py (Plan 03-08) — replaces minimal sigs with full Appendix A.
    - validation.py (Plan 03-09) — cross-parameter checks (uniqueness, etc.).
    """

    model_config = ConfigDict(extra="forbid")

    name: str
    # JSON Schema type: "string"/"integer"/"boolean"/"number"/"array"/"object"/"null".
    type: str
    format: str | None = None
    enum: list[str] | None = None
    pattern: str | None = None
    minimum: float | None = None
    maximum: float | None = None
    min_length: int | None = None
    max_length: int | None = None
    default: Any | None = None
    required: bool = False
    is_smart_id: bool = False
    is_filter: bool = False
    entity_hint: str | None = None
    source_endpoint_id: str
    # E.g., "parameters[0].id" or "request_body.properties.amount"
    # or "standards[universal.search]" for universal-tool hardcoded sigs.
    source_field: str
    # Raw spec description (may contain untrusted content; never logged here —
    # consumed by enrich.py prompt builder which wraps in <spec_excerpt>).
    description: str | None = None


# ──────────────────────────── Detection constants ──────────────────────────

# Smart-ID name detection per D-20: bare `id` (case-insensitive) OR `*_id`
# (lowercase prefix, alphanumeric+underscore). The Plan 03-08 smart_id.py
# module then injects the canonical pattern from Pass 1 routing.
_SMART_ID_NAME_REGEX: Final[re.Pattern[str]] = re.compile(
    r"^(id|[a-z][a-z0-9_]*_id)$", re.IGNORECASE
)

# Filter-name detection per D-18 / Plan 03-07: standard filter parameter
# names that trigger the A/B/C filter approach in filter_design.py.
_FILTER_NAMES: Final[frozenset[str]] = frozenset({"filter", "where", "q"})


# ──────────────────────────── Universal minimal signatures (D-21) ───────────

# Minimal hardcoded signatures for the 6 universal tools per D-21. Plan 03-08
# standards.py replaces these with full Appendix A descriptions + per-tool
# rich docs. extract.py emits the bare-minimum shape so downstream plans see
# a non-empty list and can feed it through enrich/validation/quality_gate
# without special-casing universal tools.
_UNIVERSAL_MIN_SIG: Final[dict[UniversalTool, tuple[dict[str, Any], ...]]] = {
    UniversalTool.search: (
        {
            "name": "query",
            "type": "string",
            "required": True,
            "source_field": "standards[universal.search]",
        },
    ),
    UniversalTool.fetch: (
        {
            "name": "id",
            "type": "string",
            "required": True,
            "is_smart_id": True,
            "source_field": "standards[universal.fetch]",
        },
    ),
    UniversalTool.list_collections: (
        {
            "name": "pattern",
            "type": "string",
            "required": False,
            "source_field": "standards[universal.list_collections]",
        },
        {
            "name": "include_schema",
            "type": "boolean",
            "required": False,
            "default": False,
            "source_field": "standards[universal.list_collections]",
        },
        {
            "name": "limit",
            "type": "integer",
            "required": False,
            "default": 50,
            "source_field": "standards[universal.list_collections]",
        },
        {
            "name": "offset",
            "type": "integer",
            "required": False,
            "default": 0,
            "source_field": "standards[universal.list_collections]",
        },
    ),
    UniversalTool.list_objects: (
        {
            "name": "collection",
            "type": "string",
            "required": True,
            "source_field": "standards[universal.list_objects]",
        },
        {
            "name": "properties",
            "type": "array",
            "required": False,
            "source_field": "standards[universal.list_objects]",
        },
        {
            "name": "filter",
            "type": "object",
            "required": False,
            "is_filter": True,
            "source_field": "standards[universal.list_objects]",
        },
        {
            "name": "sort_by",
            "type": "string",
            "required": False,
            "source_field": "standards[universal.list_objects]",
        },
        {
            "name": "sort_order",
            "type": "string",
            "required": False,
            "default": "desc",
            "enum": ["asc", "desc"],
            "source_field": "standards[universal.list_objects]",
        },
        {
            "name": "limit",
            "type": "integer",
            "required": False,
            "default": 25,
            "source_field": "standards[universal.list_objects]",
        },
        {
            "name": "offset",
            "type": "integer",
            "required": False,
            "default": 0,
            "source_field": "standards[universal.list_objects]",
        },
        {
            "name": "cursor",
            "type": "string",
            "required": False,
            "source_field": "standards[universal.list_objects]",
        },
    ),
    UniversalTool.upsert: (
        {
            "name": "collection",
            "type": "string",
            "required": True,
            "source_field": "standards[universal.upsert]",
        },
        {
            "name": "data",
            "type": "object",
            "required": True,
            "source_field": "standards[universal.upsert]",
        },
        {
            "name": "id",
            "type": "string",
            "required": False,
            "is_smart_id": True,
            "source_field": "standards[universal.upsert]",
        },
        {
            "name": "ids",
            "type": "array",
            "required": False,
            "source_field": "standards[universal.upsert]",
        },
    ),
    UniversalTool.delete: (
        {
            "name": "type",
            "type": "string",
            "required": True,
            "enum": ["object", "objects", "collection"],
            "source_field": "standards[universal.delete]",
        },
        {
            "name": "id",
            "type": "string",
            "required": False,
            "is_smart_id": True,
            "source_field": "standards[universal.delete]",
        },
        {
            "name": "ids",
            "type": "array",
            "required": False,
            "source_field": "standards[universal.delete]",
        },
        {
            "name": "collection",
            "type": "string",
            "required": False,
            "source_field": "standards[universal.delete]",
        },
        {
            "name": "confirm",
            "type": "boolean",
            "required": True,
            "default": False,
            "source_field": "standards[universal.delete]",
        },
    ),
}


# Map a universal tool's `Tool1.name` to the `UniversalTool` enum. The Pass 1
# IR carries `Tool1.type == Type.universal` plus `Tool1.name` ∈ the 6
# universal names; the IR does NOT carry a separate `universal_tool` field.
_NAME_TO_UNIVERSAL: Final[dict[str, UniversalTool]] = {
    member.value: member for member in UniversalTool
}


# ──────────────────────────── Helpers ──────────────────────────────────────


def _is_smart_id_name(name: str) -> bool:
    """`True` iff `name` matches `^id$` or `^[a-z][a-z0-9_]*_id$` (case-insensitive)."""
    return bool(_SMART_ID_NAME_REGEX.match(name))


def _is_filter_name(name: str) -> bool:
    """`True` iff `name` (case-insensitive) is a standard filter param name."""
    return name.lower() in _FILTER_NAMES


def _endpoint_id(ep: Endpoint) -> str:
    """Stable identifier matching Phase 2 `_endpoint_id` shape (`"METHOD path"`)."""
    method = ep.method.value if isinstance(ep.method, Method) else str(ep.method).upper()
    return f"{method} {ep.path}"


def _make_universal_param_specs(tool: Tool1) -> list[ParameterSpec]:
    """Return D-21 minimal signature for universal tools.

    Looks up `tool.name` in `_NAME_TO_UNIVERSAL`; unknown names (defensive —
    Pass 1 should never emit a `Type.universal` tool with a non-canonical
    name) yield an empty list with a warning.
    """
    universal = _NAME_TO_UNIVERSAL.get(tool.name)
    if universal is None:
        _log.warning(
            "pass_3.extract.unknown_universal_name",
            tool_name=tool.name,
        )
        return []

    template = _UNIVERSAL_MIN_SIG.get(universal, ())
    return [ParameterSpec(source_endpoint_id="standards", **tpl) for tpl in template]


def _extract_param_dict(
    param: dict[str, Any], idx: int, endpoint_id: str, entity_hint: str | None
) -> ParameterSpec:
    """Convert one OpenAPI parameter dict into a `ParameterSpec`.

    `Endpoint.parameters` is `List[Dict[str, Any]]` in the frozen IR — these
    are raw OpenAPI parameter objects with `name`/`in`/`schema`/`required`/
    `description` keys.
    """
    name = str(param.get("name", ""))
    schema = param.get("schema") or {}
    return ParameterSpec(
        name=name,
        type=str(schema.get("type", "string")),
        format=schema.get("format"),
        enum=schema.get("enum"),
        pattern=schema.get("pattern"),
        minimum=schema.get("minimum"),
        maximum=schema.get("maximum"),
        min_length=schema.get("minLength"),
        max_length=schema.get("maxLength"),
        default=schema.get("default"),
        required=bool(param.get("required", False)),
        is_smart_id=_is_smart_id_name(name),
        is_filter=_is_filter_name(name),
        entity_hint=entity_hint,
        source_endpoint_id=endpoint_id,
        source_field=f"parameters[{idx}].{name}",
        description=param.get("description"),
    )


def _extract_request_body_property(
    prop_name: str,
    prop_schema: dict[str, Any],
    required_set: set[str],
    endpoint_id: str,
    entity_hint: str | None,
) -> ParameterSpec:
    """Convert one requestBody.properties[<prop_name>] entry into a `ParameterSpec`."""
    return ParameterSpec(
        name=prop_name,
        type=str(prop_schema.get("type", "string")),
        format=prop_schema.get("format"),
        enum=prop_schema.get("enum"),
        pattern=prop_schema.get("pattern"),
        minimum=prop_schema.get("minimum"),
        maximum=prop_schema.get("maximum"),
        min_length=prop_schema.get("minLength"),
        max_length=prop_schema.get("maxLength"),
        default=prop_schema.get("default"),
        required=prop_name in required_set,
        is_smart_id=_is_smart_id_name(prop_name),
        is_filter=_is_filter_name(prop_name),
        entity_hint=entity_hint,
        source_endpoint_id=endpoint_id,
        source_field=f"request_body.properties.{prop_name}",
        description=prop_schema.get("description"),
    )


def _request_body_json_schema(request_body: dict[str, Any]) -> dict[str, Any] | None:
    """Pull the JSON-schema shape out of `request_body.content[<json-ct>]`.

    Tries `application/json` first, then falls back to any `application/*+json`
    or form-encoded variant whose schema has `properties` (e.g. Stripe uses
    `application/x-www-form-urlencoded` everywhere). Returns `None` if no
    inline schema with `properties` is found — handles `$ref`-only bodies
    gracefully (Stage A would normally inline; if a $ref slips through we
    skip rather than hallucinate).
    """
    content = request_body.get("content")
    if not isinstance(content, dict):
        return None

    # Prefer application/json; otherwise scan for any content type with
    # an inline `properties`-bearing schema.
    candidates: list[dict[str, Any]] = []
    json_entry = content.get("application/json")
    if isinstance(json_entry, dict):
        candidates.append(json_entry)
    for ct, entry in content.items():
        if ct == "application/json":
            continue
        if isinstance(entry, dict):
            candidates.append(entry)

    for entry in candidates:
        schema = entry.get("schema")
        if isinstance(schema, dict) and isinstance(schema.get("properties"), dict):
            return schema
    return None


def _extract_from_endpoint(
    endpoint: Endpoint, endpoint_id: str, entity_hint: str | None
) -> list[ParameterSpec]:
    """Extract path/query/header params + requestBody.properties from one endpoint."""
    specs: list[ParameterSpec] = []

    # Path / query / header parameters (frozen IR: List[Dict[str, Any]]).
    for idx, param in enumerate(endpoint.parameters):
        if not isinstance(param, dict):
            continue  # defensive — IR enforces dicts but be safe
        specs.append(_extract_param_dict(param, idx, endpoint_id, entity_hint))

    # requestBody.properties — gracefully skip $ref-only bodies.
    request_body = endpoint.request_body
    if isinstance(request_body, dict):
        schema = _request_body_json_schema(request_body)
        if schema is not None:
            properties = schema.get("properties")
            required_list = schema.get("required") or []
            required_set: set[str] = {str(name) for name in required_list if isinstance(name, str)}
            if isinstance(properties, dict):
                for prop_name, prop_schema in properties.items():
                    if not isinstance(prop_schema, dict):
                        continue
                    specs.append(
                        _extract_request_body_property(
                            str(prop_name),
                            prop_schema,
                            required_set,
                            endpoint_id,
                            entity_hint,
                        )
                    )

    return specs


# ──────────────────────────── Public API ───────────────────────────────────


def extract_params(raw_ir: RawIR, pass_1_output: Pass1Output) -> dict[str, list[ParameterSpec]]:
    """Walk Pass 1 tools + RawIR endpoints; emit per-tool `ParameterSpec` lists.

    For each `tool` in `pass_1_output.tools`:
      - If `tool.type == Type.universal`: return the D-21 minimal signature
        for `tool.name` (universal tools NEVER walk source endpoints).
      - Else (action / workflow / specialized): walk `tool.source_endpoints`,
        looking each `endpoint_id` up in `raw_ir.endpoints` (indexed by
        `f"{method.value} {path}"`), and concatenate per-endpoint specs in
        the order the endpoints appear in `tool.source_endpoints`.

    Missing endpoints (a `source_endpoint_id` that doesn't appear in
    `raw_ir.endpoints`) are LOGGED at WARNING level with `tool_name` +
    `endpoint_id` (both structural metadata, no spec content per
    T-03-extract-spec-content-leak) and SKIPPED. We do NOT raise — the
    Pass 1 coverage validator should have caught this upstream; surfacing
    silent drift here is defensive (T-03-extract-missing).

    Pure: no I/O, no LLM calls, no global mutation. Deterministic ordering
    preserved — iteration follows `pass_1_output.tools` order and
    `tool.source_endpoints` order as authored by Pass 1.
    """
    # Index endpoints by stable id (matches Phase 2 source_endpoint_id format).
    endpoints_by_id: dict[str, Endpoint] = {_endpoint_id(ep): ep for ep in raw_ir.endpoints}

    out: dict[str, list[ParameterSpec]] = {}
    for tool in pass_1_output.tools:
        if tool.type == Type.universal:
            out[tool.name] = _make_universal_param_specs(tool)
            continue

        # Action / workflow / specialized — walk source endpoints in order.
        specs: list[ParameterSpec] = []
        for endpoint_id in tool.source_endpoints:
            endpoint = endpoints_by_id.get(endpoint_id)
            if endpoint is None:
                _log.warning(
                    "pass_3.extract.endpoint_not_found",
                    tool_name=tool.name,
                    endpoint_id=endpoint_id,
                )
                continue
            entity_hint = endpoint.tags[0] if endpoint.tags else None
            specs.extend(_extract_from_endpoint(endpoint, endpoint_id, entity_hint))
        out[tool.name] = specs

    _log.info(
        "pass_3.extract.complete",
        tool_count=len(out),
        total_param_count=sum(len(s) for s in out.values()),
    )
    return out
