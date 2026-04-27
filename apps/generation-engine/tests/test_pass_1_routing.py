"""Pass 1 routing rule + smart-ID format tests.

VALIDATION rows: T-2-C4 (smart_id schema-level format).

Tests cover:
- ``derive_spec_slug`` deterministic transform (D-32).
- ``build_smart_id_format`` schema-level format (D-31) — NO tenant prefix.
- ``build_smart_id_regex`` round-trip per fixture.
- ``build_routing_config`` rule completeness — every universal tool has a
  routing entry mapping to ≥1 upstream endpoint.
- Pitfall F (deepObject filter encoding) — ``params_mapping`` derives
  ``{name}[*]`` for ``style=deepObject + explode=True``.
"""

from __future__ import annotations

import re

from mcpgen_ir.types import (
    Endpoint,
    Method,
    RawIR,
    SecuritySchemes,
    SpecFormat,
    Tool1,
    Type,
    UniversalTool,
)

from mcpgen_engine.passes.pass_1.routing import (
    build_routing_config,
    build_smart_id_format,
    build_smart_id_regex,
    derive_spec_slug,
)

# ─────────────────────────── Helpers ───────────────────────────────────────


def _make_endpoint(
    method: str,
    path: str,
    *,
    parameters: list[dict] | None = None,  # type: ignore[type-arg]
    request_body: dict | None = None,  # type: ignore[type-arg]
) -> Endpoint:
    return Endpoint(
        method=Method(method),
        path=path,
        operation_id=None,
        summary=None,
        description=None,
        parameters=parameters or [],
        request_body=request_body,
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
        spec_hash="a" * 64,
        endpoints=endpoints,
        schemas={},
        security_schemes={"bearerAuth": bearer_scheme},
        dependency_graph={},
    )


# ─────────────────────────── derive_spec_slug ──────────────────────────────


def test_derive_spec_slug_stripe() -> None:
    assert derive_spec_slug("Stripe API") == "stripe-api"


def test_derive_spec_slug_github() -> None:
    assert derive_spec_slug("GitHub v3 REST API") == "github-v3-rest-api"


def test_derive_spec_slug_collapses_repeats() -> None:
    assert derive_spec_slug("  Notion-API!  ") == "notion-api"


def test_derive_spec_slug_truncates_to_32() -> None:
    long_title = "X" * 100
    assert len(derive_spec_slug(long_title)) <= 32


def test_derive_spec_slug_empty_falls_back() -> None:
    assert derive_spec_slug("") == "unnamed-spec"


def test_derive_spec_slug_punctuation_only() -> None:
    assert derive_spec_slug("!!!") == "unnamed-spec"


# ─────────────────────────── build_smart_id_format ─────────────────────────


def test_smart_id_format() -> None:
    """T-2-C4: schema-level format `{spec_slug}:{type}:{collection}:{identifier}`.

    Phase 2 emits the slug substituted; type/collection/identifier remain as
    Python format placeholders so Stage E (Phase 4) can `str.format()` at
    runtime.
    """
    fmt = build_smart_id_format("stripe-api")
    assert fmt == "stripe-api:{type}:{collection}:{identifier}"


def test_smart_id_no_tenant_prefix() -> None:
    """T-2-C4: smart_id.format must NOT carry any per-tenant identifier.

    D-31: Phase 6 dispatch worker prepends the per-tenant short-id prefix
    at deploy time. Phase 2's emission contains only the spec slug.
    """
    fmt = build_smart_id_format("stripe-api")
    # Only one literal segment before the first colon, and it equals the slug.
    head = fmt.split(":", 1)[0]
    assert head == "stripe-api"
    # No "tenant" placeholder anywhere in the format string.
    assert "tenant" not in fmt.lower()


def test_smart_id_regex_matches_concrete_id() -> None:
    spec_slug = "stripe-api"
    regex = re.compile(
        build_smart_id_regex(
            spec_slug,
            types=["object", "collection"],
            collections=["Charge", "Customer", "Subscription"],
        )
    )
    sid = "acme-stripe-api:object:Charge:ch_3O5jJ2"
    assert regex.fullmatch(sid) is not None


# ─────────────────────────── build_routing_config ──────────────────────────


def test_routing_rule_completeness() -> None:
    """T-2-C4: every universal tool with subsumed endpoints has a routing entry."""
    endpoints = [
        _make_endpoint(
            "GET",
            "/v1/customers",
            parameters=[
                {"name": "email", "in": "query", "schema": {"type": "string"}},
            ],
        ),
        _make_endpoint(
            "GET",
            "/v1/customers/{customer}",
            parameters=[
                {"name": "customer", "in": "path", "required": True, "schema": {"type": "string"}},
            ],
        ),
        _make_endpoint("POST", "/v1/customers", request_body={"content": {}}),
        _make_endpoint(
            "DELETE",
            "/v1/customers/{customer}",
            parameters=[
                {"name": "customer", "in": "path", "required": True, "schema": {"type": "string"}},
            ],
        ),
    ]
    raw_ir = _make_raw_ir(endpoints)

    universal_tools = [
        Tool1(name="search", type=Type.universal, source_endpoints=["GET /v1/customers"]),
        Tool1(name="fetch", type=Type.universal, source_endpoints=["GET /v1/customers/{customer}"]),
        Tool1(name="list_collections", type=Type.universal, source_endpoints=[]),
        Tool1(name="list_objects", type=Type.universal, source_endpoints=["GET /v1/customers"]),
        Tool1(name="upsert", type=Type.universal, source_endpoints=["POST /v1/customers"]),
        Tool1(
            name="delete",
            type=Type.universal,
            source_endpoints=["DELETE /v1/customers/{customer}"],
        ),
    ]

    routing = build_routing_config(universal_tools, [], "stripe-api", raw_ir)

    # smart_id integrity
    assert routing.smart_id.format == "stripe-api:{type}:{collection}:{identifier}"
    assert "Customer" in routing.smart_id.collections

    # rule completeness
    rules_by_universal: dict[UniversalTool, list[str]] = {}
    for rule in routing.rules:
        rules_by_universal.setdefault(rule.universal_tool, []).append(rule.target_endpoint)
    # 5 universals (excluding list_collections which has no source_endpoints) must
    # each appear in routing rules.
    assert UniversalTool.search in rules_by_universal
    assert UniversalTool.fetch in rules_by_universal
    assert UniversalTool.list_objects in rules_by_universal
    assert UniversalTool.upsert in rules_by_universal
    assert UniversalTool.delete in rules_by_universal


def test_routing_deepobject_param_mapping() -> None:
    """Pitfall F — Stripe ``created`` deepObject + explode=True wires through.

    The universal `list_objects.filter.created` should produce upstream wire
    key `created[*]` (Stage E expands `[*]` per inner key at runtime).
    """
    endpoints = [
        _make_endpoint(
            "GET",
            "/v1/charges",
            parameters=[
                {
                    "name": "created",
                    "in": "query",
                    "style": "deepObject",
                    "explode": True,
                    "schema": {"type": "object"},
                },
                {"name": "limit", "in": "query", "schema": {"type": "integer"}},
            ],
        ),
    ]
    raw_ir = _make_raw_ir(endpoints)

    universal_tools = [
        Tool1(name="search", type=Type.universal, source_endpoints=[]),
        Tool1(name="fetch", type=Type.universal, source_endpoints=[]),
        Tool1(name="list_collections", type=Type.universal, source_endpoints=[]),
        Tool1(
            name="list_objects",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
        Tool1(name="upsert", type=Type.universal, source_endpoints=[]),
        Tool1(name="delete", type=Type.universal, source_endpoints=[]),
    ]

    routing = build_routing_config(universal_tools, [], "stripe-api", raw_ir)

    list_objects_rule = next(
        r for r in routing.rules if r.universal_tool == UniversalTool.list_objects
    )
    # Universal-side key is `filter.created`; upstream wire key is `created[*]`.
    assert "filter.created" in list_objects_rule.params_mapping
    assert list_objects_rule.params_mapping["filter.created"] == "created[*]"
    # `limit` (form-style query) preserved 1:1.
    assert list_objects_rule.params_mapping.get("filter.limit") == "limit"


def test_routing_collections_extraction() -> None:
    """``SmartId.collections`` is derived from raw_ir endpoints' resource names."""
    endpoints = [
        _make_endpoint("GET", "/v1/customers"),
        _make_endpoint("GET", "/v1/charges"),
        _make_endpoint("GET", "/v1/subscriptions"),
    ]
    raw_ir = _make_raw_ir(endpoints)
    universal_tools = [
        Tool1(name=name, type=Type.universal, source_endpoints=[])
        for name in (
            "search",
            "fetch",
            "list_collections",
            "list_objects",
            "upsert",
            "delete",
        )
    ]
    routing = build_routing_config(universal_tools, [], "stripe-api", raw_ir)
    assert routing.smart_id.collections == sorted(["Customer", "Charge", "Subscription"])


def test_routing_skips_unknown_endpoint_silently() -> None:
    """Defensive: if a Tool1 references an endpoint not in raw_ir, the rule is skipped."""
    endpoints = [_make_endpoint("GET", "/v1/customers")]
    raw_ir = _make_raw_ir(endpoints)
    universal_tools = [
        Tool1(
            name="search",
            type=Type.universal,
            source_endpoints=[
                "GET /v1/customers",
                "GET /v1/widgets",  # unknown — not in raw_ir
            ],
        ),
        *[
            Tool1(name=name, type=Type.universal, source_endpoints=[])
            for name in ("fetch", "list_collections", "list_objects", "upsert", "delete")
        ],
    ]
    routing = build_routing_config(universal_tools, [], "stripe-api", raw_ir)
    targets = {r.target_endpoint for r in routing.rules}
    assert "GET /v1/customers" in targets
    assert "GET /v1/widgets" not in targets
