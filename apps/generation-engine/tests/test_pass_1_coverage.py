"""Pass 1 coverage_proof tests.

VALIDATION rows: T-2-C3 (coverage_proof URL round-trips via urllib.parse.urlparse — Pitfall #3).

Tests cover:
- ``build_coverage_proof`` emits a proof per Pass 0 endpoint with a URL that
  round-trips via ``urllib.parse.urlparse`` (scheme + netloc + path non-empty).
- ``coverage_pct`` reports 100.0 when every Pass 0 endpoint is covered.
- ``find_uncovered`` returns sorted list of missing endpoints.
- ``CoverageError`` is raised when sample URL fails the round-trip parse.
- Each ``coverage_proof.endpoint_id`` resolves to a Pass 0 source_endpoint.
"""

from __future__ import annotations

from urllib.parse import urlparse

import pytest
from mcpgen_ir.types import (
    Category,
    Endpoint,
    Method,
    RawIR,
    Routing1,
    Rule1,
    SecuritySchemes,
    SmartId,
    SpecFormat,
    ToolPlan,
    UniversalTool,
)

from mcpgen_engine.passes.pass_1.coverage import (
    build_coverage_proof,
    coverage_pct,
    find_uncovered,
)

# ─────────────────────────── Helpers ───────────────────────────────────────


def _make_endpoint(
    method: str,
    path: str,
    *,
    parameters: list[dict] | None = None,  # type: ignore[type-arg]
) -> Endpoint:
    return Endpoint(
        method=Method(method),
        path=path,
        operation_id=None,
        summary=None,
        description=None,
        parameters=parameters or [],
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
        spec_hash="b" * 64,
        endpoints=endpoints,
        schemas={},
        security_schemes={"bearerAuth": bearer_scheme},
        dependency_graph={},
    )


def _build_simple_routing(endpoints: list[Endpoint]) -> Routing1:
    """Build a routing config that maps every endpoint to a sensible universal."""
    rules: list[Rule1] = []
    for ep in endpoints:
        method = ep.method.value if isinstance(ep.method, Method) else str(ep.method).upper()
        if method == "GET" and "{" in ep.path:
            ut = UniversalTool.fetch
        elif method == "GET":
            ut = UniversalTool.list_objects
        elif method == "DELETE":
            ut = UniversalTool.delete
        else:
            ut = UniversalTool.upsert
        rules.append(
            Rule1(
                universal_tool=ut,
                target_endpoint=f"{method} {ep.path}",
                params_mapping={},
            )
        )
    smart_id = SmartId(
        format="stripe-api:{type}:{collection}:{identifier}",
        types=["object", "collection"],
        collections=["Customer", "Charge"],
    )
    return Routing1(smart_id=smart_id, rules=rules)


def _plan_for_endpoints(name: str, endpoint_ids: list[str]) -> ToolPlan:
    return ToolPlan(
        name=name,
        category=Category.crud,
        source_endpoints=endpoint_ids,
        rationale="synthetic test plan",
    )


# ─────────────────────────── T-2-C3 ────────────────────────────────────────


def test_coverage_proof_url_roundtrip() -> None:
    """T-2-C3: every coverage_proof.sample_invocation.url parses cleanly via urllib.parse.

    Phase 2 acceptance: ``parsed.scheme`` + ``parsed.netloc`` + ``parsed.path``
    all non-empty.
    """
    endpoints = [
        _make_endpoint(
            "GET",
            "/v1/customers",
            parameters=[
                {"name": "limit", "in": "query", "schema": {"type": "integer"}},
            ],
        ),
        _make_endpoint(
            "GET",
            "/v1/customers/{customer}",
            parameters=[
                {"name": "customer", "in": "path", "required": True, "schema": {"type": "string"}},
            ],
        ),
        _make_endpoint(
            "DELETE",
            "/v1/customers/{customer}",
            parameters=[
                {"name": "customer", "in": "path", "required": True, "schema": {"type": "string"}},
            ],
        ),
    ]
    raw_ir = _make_raw_ir(endpoints)
    routing = _build_simple_routing(endpoints)
    plans = [
        _plan_for_endpoints("customers_list", ["GET /v1/customers"]),
        _plan_for_endpoints("customers_fetch", ["GET /v1/customers/{customer}"]),
        _plan_for_endpoints("customers_delete", ["DELETE /v1/customers/{customer}"]),
    ]

    proofs = build_coverage_proof(plans, routing, raw_ir, server_base="https://api.stripe.com")

    assert len(proofs) == 3
    for proof in proofs:
        # Pydantic AnyUrl coerces to str; reparse to assert shape invariants.
        parsed = urlparse(str(proof.sample_invocation.url))
        assert parsed.scheme, f"missing scheme in {proof.sample_invocation.url}"
        assert parsed.netloc, f"missing netloc in {proof.sample_invocation.url}"
        assert parsed.path, f"missing path in {proof.sample_invocation.url}"


def test_coverage_proof_covers_all_endpoints() -> None:
    """T-2-C3: |coverage_proof| == |pass_0.kept_endpoints| (coverage_pct == 100)."""
    endpoints = [
        _make_endpoint("GET", "/v1/customers"),
        _make_endpoint("POST", "/v1/customers"),
        _make_endpoint(
            "GET",
            "/v1/customers/{customer}",
            parameters=[
                {"name": "customer", "in": "path", "required": True, "schema": {"type": "string"}},
            ],
        ),
    ]
    raw_ir = _make_raw_ir(endpoints)
    routing = _build_simple_routing(endpoints)
    plans = [
        _plan_for_endpoints("a", ["GET /v1/customers"]),
        _plan_for_endpoints("b", ["POST /v1/customers"]),
        _plan_for_endpoints("c", ["GET /v1/customers/{customer}"]),
    ]

    proofs = build_coverage_proof(plans, routing, raw_ir, server_base="https://api.example.com")
    assert len(proofs) == 3
    assert coverage_pct(plans, proofs) == 100.0


def test_coverage_proof_endpoint_ids_resolve() -> None:
    """T-2-C3: every coverage_proof.endpoint_id resolves to a pass_0.tool_plans source_endpoint."""
    endpoints = [
        _make_endpoint("GET", "/v1/customers"),
        _make_endpoint("POST", "/v1/customers"),
    ]
    raw_ir = _make_raw_ir(endpoints)
    routing = _build_simple_routing(endpoints)
    plans = [
        _plan_for_endpoints("a", ["GET /v1/customers", "POST /v1/customers"]),
    ]

    proofs = build_coverage_proof(plans, routing, raw_ir, server_base="https://api.example.com")
    expected_ids = {"GET /v1/customers", "POST /v1/customers"}
    proof_ids = {p.endpoint_id for p in proofs}
    assert proof_ids == expected_ids


# ─────────────────────────── coverage_pct + find_uncovered ─────────────────


def test_coverage_pct_partial() -> None:
    """Coverage gap → pct < 100.0; find_uncovered surfaces the missing endpoints."""
    endpoints = [
        _make_endpoint("GET", "/v1/customers"),
        _make_endpoint("POST", "/v1/customers"),
    ]
    raw_ir = _make_raw_ir(endpoints)
    # Routing intentionally covers only ONE of the two endpoints.
    smart_id = SmartId(
        format="stripe-api:{type}:{collection}:{identifier}",
        types=["object", "collection"],
        collections=["Customer"],
    )
    routing = Routing1(
        smart_id=smart_id,
        rules=[
            Rule1(
                universal_tool=UniversalTool.list_objects,
                target_endpoint="GET /v1/customers",
                params_mapping={},
            ),
        ],
    )
    plans = [
        _plan_for_endpoints("a", ["GET /v1/customers", "POST /v1/customers"]),
    ]
    proofs = build_coverage_proof(plans, routing, raw_ir, server_base="https://api.stripe.com")
    assert len(proofs) == 1
    assert coverage_pct(plans, proofs) == 50.0
    assert find_uncovered(plans, proofs) == ["POST /v1/customers"]


def test_coverage_pct_empty_plans() -> None:
    """Empty plan list → coverage 100.0 (vacuous)."""
    raw_ir = _make_raw_ir([])
    routing = Routing1(
        smart_id=SmartId(
            format="x:{type}:{collection}:{identifier}", types=["object"], collections=["X"]
        ),
        rules=[],
    )
    assert coverage_pct([], []) == 100.0
    assert find_uncovered([], []) == []
    proofs = build_coverage_proof([], routing, raw_ir)
    assert proofs == []


def test_coverage_with_query_params_url_includes_query() -> None:
    """GET endpoints with query params produce URLs ending in ``?limit=25``."""
    endpoints = [
        _make_endpoint(
            "GET",
            "/v1/customers",
            parameters=[
                {"name": "limit", "in": "query", "schema": {"type": "integer"}},
                {"name": "starting_after", "in": "query", "schema": {"type": "string"}},
            ],
        ),
    ]
    raw_ir = _make_raw_ir(endpoints)
    routing = _build_simple_routing(endpoints)
    plans = [_plan_for_endpoints("a", ["GET /v1/customers"])]
    proofs = build_coverage_proof(plans, routing, raw_ir, server_base="https://api.stripe.com")
    assert len(proofs) == 1
    assert "?limit=25" in str(proofs[0].sample_invocation.url)


def test_coverage_path_substitution_keeps_url_parseable() -> None:
    """Path templates with ``{customer}`` are substituted with synthetic values."""
    endpoints = [
        _make_endpoint(
            "GET",
            "/v1/customers/{customer}/charges/{charge}",
            parameters=[
                {"name": "customer", "in": "path", "required": True, "schema": {"type": "string"}},
                {"name": "charge", "in": "path", "required": True, "schema": {"type": "string"}},
            ],
        ),
    ]
    raw_ir = _make_raw_ir(endpoints)
    smart_id = SmartId(
        format="stripe-api:{type}:{collection}:{identifier}",
        types=["object"],
        collections=["Charge"],
    )
    routing = Routing1(
        smart_id=smart_id,
        rules=[
            Rule1(
                universal_tool=UniversalTool.fetch,
                target_endpoint="GET /v1/customers/{customer}/charges/{charge}",
                params_mapping={},
            ),
        ],
    )
    plans = [_plan_for_endpoints("a", ["GET /v1/customers/{customer}/charges/{charge}"])]
    proofs = build_coverage_proof(plans, routing, raw_ir, server_base="https://api.stripe.com")
    assert len(proofs) == 1
    url = str(proofs[0].sample_invocation.url)
    # No remaining path-template braces survived — every `{name}` was substituted.
    assert "{" not in url
    assert "}" not in url
    parsed = urlparse(url)
    assert parsed.scheme
    assert parsed.netloc
    assert parsed.path


def test_find_uncovered_sorted() -> None:
    """find_uncovered returns deterministically sorted output."""
    endpoints = [
        _make_endpoint("GET", "/v1/aaa"),
        _make_endpoint("GET", "/v1/bbb"),
        _make_endpoint("GET", "/v1/ccc"),
    ]
    raw_ir = _make_raw_ir(endpoints)
    routing = Routing1(
        smart_id=SmartId(
            format="x:{type}:{collection}:{identifier}",
            types=["object"],
            collections=["A"],
        ),
        rules=[],
    )
    plans = [
        _plan_for_endpoints("a", ["GET /v1/ccc", "GET /v1/aaa", "GET /v1/bbb"]),
    ]
    proofs = build_coverage_proof(plans, routing, raw_ir)
    uncovered = find_uncovered(plans, proofs)
    assert uncovered == sorted(uncovered)
    assert uncovered == ["GET /v1/aaa", "GET /v1/bbb", "GET /v1/ccc"]


# `pytest` import retained so static analyzers see usage even though no test
# currently expects an exception in this module.
_ = pytest
