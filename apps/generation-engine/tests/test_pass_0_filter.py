"""Pass 0 deterministic filter + validation tests.

VALIDATION rows:
- T-2-B1: drops `/v1/test_helpers/*` as INTERNAL — Pitfall G.
- T-2-B2: full DropReason enum coverage per D-23.
- T-2-B5 (subset): caps validation + MULTI_SERVER_SPLIT_REQUIRED suggestions.

Naming-regex enforcement (D-17) and tier caps (D-18) live in `validation.py`;
exercising them alongside the filter keeps the Stage 0a→0c invariants in one
test file (the filter feeds into the validator in the Plan 02-06 orchestrator).
"""

from __future__ import annotations

import pytest
from mcpgen_ir.types import (
    Category,
    DropReason,
    Endpoint,
    Method,
    Reason,
    ToolPlan,
)

from mcpgen_engine.passes.pass_0.filter import (
    UserOptions,
    deterministic_filter,
    drop_reason_for,
)
from mcpgen_engine.passes.pass_0.validation import (
    Pass0Error,
    Pass0LlmOutput,
    cluster_by_path_prefix,
    enforce_caps,
    validate_naming,
)

# ───────────────────────────── Test fixtures ───────────────────────────────


def _make_endpoint(
    *,
    method: str = "GET",
    path: str = "/v1/customers",
    deprecated: bool = False,
) -> Endpoint:
    """Construct a minimal valid Endpoint for filter tests."""
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
        deprecated=deprecated,
    )


def _no_options() -> UserOptions:
    """Default UserOptions (no overrides)."""
    return UserOptions()


# ──────────────────────── Stage 0a: drop_reason_for ────────────────────────


# T-2-B1: Pass 0 deterministic filter drops `/v1/test_helpers/*` as INTERNAL (Pitfall G)
def test_drops_test_helpers() -> None:
    """T-2-B1: deterministic filter must drop `/v1/test_helpers/*` paths as INTERNAL."""
    ep = _make_endpoint(path="/v1/test_helpers/charge")
    assert drop_reason_for(ep, _no_options(), {}) == DropReason.INTERNAL


# T-2-B2: DropReason enum coverage — DEPRECATED
def test_drops_deprecated() -> None:
    """T-2-B2: filter drops endpoints flagged `deprecated: true`."""
    ep = _make_endpoint(path="/v1/legacy/foo", deprecated=True)
    assert drop_reason_for(ep, _no_options(), {}) == DropReason.DEPRECATED


# T-2-B2: DropReason enum coverage — HEALTH_CHECK
@pytest.mark.parametrize(
    "path",
    ["/healthz", "/health", "/ping", "/status", "/_status", "/livez", "/readyz"],
)
def test_drops_healthchecks(path: str) -> None:
    """T-2-B2: filter drops common healthcheck paths (`/health`, `/ping`, `/_status`)."""
    ep = _make_endpoint(path=path)
    assert drop_reason_for(ep, _no_options(), {}) == DropReason.HEALTH_CHECK


# T-2-B2: DropReason enum coverage — WEBHOOK
def test_drops_webhooks() -> None:
    """T-2-B2: filter drops webhook receiver endpoints by substring match."""
    ep = _make_endpoint(method="POST", path="/v1/webhooks/stripe")
    assert drop_reason_for(ep, _no_options(), {}) == DropReason.WEBHOOK


# T-2-B2: DropReason enum coverage — WEBHOOK via vendor extension
def test_drops_webhook_via_extension() -> None:
    """T-2-B2: x-webhook=true vendor flag also yields WEBHOOK drop."""
    ep = _make_endpoint(method="POST", path="/v1/events/inbound")
    assert drop_reason_for(ep, _no_options(), {"x-webhook": True}) == DropReason.WEBHOOK


# T-2-B2: DropReason enum coverage — AUTH_FLOW
@pytest.mark.parametrize(
    "path",
    ["/oauth/token", "/oauth/authorize", "/login", "/logout", "/v1/authorize", "/v1/token"],
)
def test_drops_auth_flow_endpoints(path: str) -> None:
    """T-2-B2: filter drops `/oauth/*` `/login` `/logout` token-exchange endpoints (AUTH_FLOW)."""
    ep = _make_endpoint(path=path)
    assert drop_reason_for(ep, _no_options(), {}) == DropReason.AUTH_FLOW


# T-2-B2: DropReason enum coverage — METHOD_NOT_SUPPORTED
@pytest.mark.parametrize("method", ["OPTIONS", "HEAD"])
def test_drops_method_not_supported(method: str) -> None:
    """T-2-B2: OPTIONS/HEAD methods always drop with METHOD_NOT_SUPPORTED."""
    ep = _make_endpoint(method=method)
    assert drop_reason_for(ep, _no_options(), {}) == DropReason.METHOD_NOT_SUPPORTED


# T-2-B2: DropReason enum coverage — INTERNAL via /admin/ and /internal/
@pytest.mark.parametrize(
    "path",
    ["/admin/users", "/internal/metrics", "/v1/sandbox/charge", "/V1/Test_Helpers/foo"],
)
def test_drops_internal_paths(path: str) -> None:
    """T-2-B2: /admin/, /internal/, /v1/test_helpers/, /v1/sandbox/ all drop as INTERNAL."""
    ep = _make_endpoint(path=path)
    assert drop_reason_for(ep, _no_options(), {}) == DropReason.INTERNAL


# T-2-B2: DropReason enum coverage — INTERNAL via x-internal vendor extension
def test_drops_x_internal_extension() -> None:
    """T-2-B2: x-internal=true vendor flag yields INTERNAL drop."""
    ep = _make_endpoint(path="/v1/customers/{id}/secret_field")
    assert drop_reason_for(ep, _no_options(), {"x-internal": True}) == DropReason.INTERNAL


# T-2-B2: drop_reason returns None for normal endpoints
def test_keeps_normal_endpoint() -> None:
    """T-2-B2: ordinary CRUD endpoints return None (kept)."""
    ep = _make_endpoint(method="GET", path="/v1/customers")
    assert drop_reason_for(ep, _no_options(), {}) is None


# D-24: User Override Flow — explicit_excludes drops everything that matches
def test_user_excluded_glob() -> None:
    """D-24: user-supplied exclude glob → USER_EXCLUDED."""
    ep = _make_endpoint(path="/v1/disputes/abc")
    options = UserOptions(explicit_excludes=["/v1/disputes/*"])
    assert drop_reason_for(ep, options, {}) == DropReason.USER_EXCLUDED


# D-24: User Override Flow — explicit_includes overrides other drop rules
def test_user_included_overrides_drop() -> None:
    """D-24: user-supplied include glob un-drops INTERNAL endpoints."""
    ep = _make_endpoint(path="/v1/test_helpers/charge")  # would be INTERNAL
    options = UserOptions(explicit_includes=["/v1/test_helpers/*"])
    assert drop_reason_for(ep, options, {}) is None


# T-2-B2: drop reason emitted as exact enum value (sanity check)
def test_drop_reason_enum_values() -> None:
    """T-2-B2: every dropped endpoint emits a `DropReason` enum value (D-23).

    This guards against accidental string returns or off-enum sentinels.
    """
    cases: list[tuple[Endpoint, DropReason]] = [
        (_make_endpoint(deprecated=True), DropReason.DEPRECATED),
        (_make_endpoint(method="OPTIONS"), DropReason.METHOD_NOT_SUPPORTED),
        (_make_endpoint(path="/admin/users"), DropReason.INTERNAL),
        (_make_endpoint(path="/healthz"), DropReason.HEALTH_CHECK),
        (_make_endpoint(path="/v1/webhooks/x"), DropReason.WEBHOOK),
        (_make_endpoint(path="/oauth/token"), DropReason.AUTH_FLOW),
    ]
    for ep, expected in cases:
        actual = drop_reason_for(ep, _no_options(), {})
        assert actual is expected
        assert isinstance(actual, DropReason)


# ─────────────────────── Stage 0a: deterministic_filter ────────────────────


def test_deterministic_filter_partition_preserves_order() -> None:
    """Filter must preserve input order in both the kept and dropped lists."""
    endpoints = [
        _make_endpoint(method="GET", path="/v1/customers"),  # keep
        _make_endpoint(method="GET", path="/v1/test_helpers/x"),  # INTERNAL
        _make_endpoint(method="POST", path="/v1/charges"),  # keep
        _make_endpoint(method="GET", path="/healthz"),  # HEALTH_CHECK
        _make_endpoint(method="POST", path="/v1/refunds"),  # keep
    ]
    kept, dropped = deterministic_filter(endpoints, _no_options())

    assert [(_.method.value, _.path) for _ in kept] == [
        ("GET", "/v1/customers"),
        ("POST", "/v1/charges"),
        ("POST", "/v1/refunds"),
    ]
    assert [(_.path, _.reason) for _ in dropped] == [
        ("/v1/test_helpers/x", Reason.INTERNAL),
        ("/healthz", Reason.HEALTH_CHECK),
    ]


def test_deterministic_filter_empty_input_returns_empty() -> None:
    """Empty input → empty (kept, dropped) tuple."""
    kept, dropped = deterministic_filter([], _no_options())
    assert kept == []
    assert dropped == []


def test_deterministic_filter_can_user_override_flag() -> None:
    """`can_user_override` is True for soft drops (DEPRECATED) and False for hard
    drops (INTERNAL, AUTH_FLOW, WEBHOOK).
    """
    endpoints = [
        _make_endpoint(path="/v1/legacy/foo", deprecated=True),  # DEPRECATED → True
        _make_endpoint(path="/admin/users"),  # INTERNAL → False
    ]
    _, dropped = deterministic_filter(endpoints, _no_options())
    overridable = {(d.path, d.can_user_override) for d in dropped}
    assert overridable == {("/v1/legacy/foo", True), ("/admin/users", False)}


def test_deterministic_filter_extensions_keyed_by_endpoint_id() -> None:
    """Vendor extensions are keyed `{METHOD path}` matching Stage A's _endpoint_id."""
    ep = _make_endpoint(method="POST", path="/v1/events/inbound")
    extensions = {"POST /v1/events/inbound": {"x-webhook": True}}
    kept, dropped = deterministic_filter([ep], _no_options(), extensions_by_endpoint=extensions)
    assert kept == []
    assert len(dropped) == 1
    assert dropped[0].reason == Reason.WEBHOOK


# ──────────────────────── Stage 0c: validate_naming ────────────────────────


def _plan(name: str, *, source_endpoints: list[str] | None = None) -> ToolPlan:
    """Build a minimal valid ToolPlan."""
    return ToolPlan(
        name=name,
        category=Category.crud,
        source_endpoints=source_endpoints or ["GET /v1/customers"],
        rationale="Test plan for naming validation.",
    )


def test_validate_naming_valid_passes() -> None:
    """Valid `{resource}_{action}` snake_case names pass without raising."""
    plans = [_plan("charges_create"), _plan("customers_search"), _plan("subscriptions_cancel")]
    validate_naming(plans)  # must not raise


def test_validate_naming_regex_violation_camelcase() -> None:
    """CamelCase names violate D-17 regex `^[a-z][a-z0-9_]{0,63}$`.

    The IR ``ToolPlan`` regex constraint catches this at construction time —
    ``validate_naming`` exists as the explicit, user-facing error code with a
    suggested correction. We construct a valid plan then mutate ``name``
    post-validation to bypass IR's pattern constraint and exercise our
    validator's failure path.
    """
    plan = _plan("valid_name")
    object.__setattr__(plan, "name", "DoThing")
    with pytest.raises(Pass0Error) as exc_info:
        validate_naming([plan])
    assert "INVALID_NAMING" in str(exc_info.value)
    assert exc_info.value.suggestions  # suggestion provided
    # Suggestion should be the lower-cased / underscored form.
    assert exc_info.value.suggestions[0] == "dothing"


def test_validate_naming_duplicate_raises() -> None:
    """Duplicate names across plans → DUPLICATE_NAMING."""
    plans = [
        _plan("customers_search", source_endpoints=["GET /v1/customers"]),
        _plan("customers_search", source_endpoints=["GET /v2/customers"]),
    ]
    with pytest.raises(Pass0Error) as exc_info:
        validate_naming(plans)
    assert "DUPLICATE_NAMING" in str(exc_info.value)


def test_validate_naming_empty_list_passes() -> None:
    """Empty plan list is a no-op — must not raise."""
    validate_naming([])


# ──────────────────────── Stage 0c: enforce_caps ───────────────────────────


def _llm_output(plan_count: int, *, prefix: str = "/v1/resource") -> Pass0LlmOutput:
    """Build a Pass0LlmOutput with N synthetic single-endpoint plans."""
    plans = [
        _plan(
            f"resource{i:03d}_get",
            source_endpoints=[f"GET {prefix}_{i:03d}"],
        )
        for i in range(plan_count)
    ]
    return Pass0LlmOutput(tool_plans=plans)


def test_enforce_caps_under_cap_passthrough() -> None:
    """30 plans, target=standard (cap 50) → unchanged."""
    out = _llm_output(30)
    result = enforce_caps(out, target_complexity="standard", max_tools_override=None)
    assert len(result.tool_plans) == 30
    assert result.cap_dropped == []


def test_enforce_caps_trims_to_cap() -> None:
    """60 plans, target=standard (cap 50) → 50 kept + 10 in cap_dropped."""
    out = _llm_output(60)
    result = enforce_caps(out, target_complexity="standard", max_tools_override=None)
    assert len(result.tool_plans) == 50
    assert len(result.cap_dropped) == 10
    assert all(d.reason == Reason.EXCEEDS_CAP for d in result.cap_dropped)
    assert all(d.can_user_override for d in result.cap_dropped)


def test_enforce_caps_max_tools_override_grants_headroom() -> None:
    """70 plans, max_tools_override=100 → unchanged (Pro override grants headroom)."""
    out = _llm_output(70)
    result = enforce_caps(out, target_complexity="standard", max_tools_override=100)
    assert len(result.tool_plans) == 70
    assert result.cap_dropped == []


def test_enforce_caps_minimal_complexity_caps_at_15() -> None:
    """target=minimal → cap 15."""
    out = _llm_output(20)
    result = enforce_caps(out, target_complexity="minimal", max_tools_override=None)
    assert len(result.tool_plans) == 15
    assert len(result.cap_dropped) == 5


def test_enforce_caps_invalid_target_raises() -> None:
    """Unknown target_complexity → INVALID_TARGET_COMPLEXITY."""
    out = _llm_output(5)
    with pytest.raises(Pass0Error) as exc_info:
        enforce_caps(out, target_complexity="aggressive", max_tools_override=None)
    assert "INVALID_TARGET_COMPLEXITY" in str(exc_info.value)


def test_enforce_caps_multi_server_split_required() -> None:
    """T-2-B5: 85 plans → MULTI_SERVER_SPLIT_REQUIRED with concrete suggestions."""
    plans = [
        _plan(
            f"treasury{i:03d}_get",
            source_endpoints=[f"GET /v1/treasury/resource_{i:03d}"],
        )
        for i in range(35)
    ] + [
        _plan(
            f"customers{i:03d}_get",
            source_endpoints=[f"GET /v1/customers/resource_{i:03d}"],
        )
        for i in range(50)
    ]
    out = Pass0LlmOutput(tool_plans=plans)

    with pytest.raises(Pass0Error) as exc_info:
        enforce_caps(out, target_complexity="standard", max_tools_override=None)

    assert "MULTI_SERVER_SPLIT_REQUIRED" in str(exc_info.value)
    assert exc_info.value.suggestions  # non-empty suggestion list
    # Both clusters ≥30 endpoints → both should be suggested, alphabetic order.
    assert exc_info.value.suggestions == ["/v1/customers", "/v1/treasury"]


def test_enforce_caps_priority_keeps_multi_endpoint_plans() -> None:
    """Cap-trim heuristic prefers multi-endpoint plans over single-endpoint plans."""
    multi = ToolPlan(
        name="objects_search",
        category=Category.search,
        source_endpoints=[
            "GET /v1/issues",
            "GET /v1/pulls",
            "GET /v1/releases",
        ],
        rationale="Multi-collection search.",
    )
    singles = [
        _plan(f"single{i:03d}_get", source_endpoints=[f"GET /v1/single_{i:03d}"]) for i in range(50)
    ]
    out = Pass0LlmOutput(tool_plans=[*singles, multi])

    result = enforce_caps(out, target_complexity="standard", max_tools_override=None)

    kept_names = {p.name for p in result.tool_plans}
    assert "objects_search" in kept_names  # multi-endpoint plan must survive trim


# ──────────────────────── Stage 0c: cluster_by_path_prefix ─────────────────


def test_cluster_by_path_prefix_returns_sorted_list() -> None:
    """Cluster by first 2 path segments; threshold filters small clusters."""
    endpoints = (
        [_make_endpoint(path=f"/v1/treasury/resource_{i}") for i in range(35)]
        + [_make_endpoint(path=f"/v1/customers/resource_{i}") for i in range(25)]
        + [_make_endpoint(path=f"/v1/issuing/resource_{i}") for i in range(15)]
    )

    # min_cluster_size=30 → only treasury qualifies.
    assert cluster_by_path_prefix(endpoints, min_cluster_size=30) == ["/v1/treasury"]

    # min_cluster_size=20 → treasury + customers, alphabetically sorted.
    assert cluster_by_path_prefix(endpoints, min_cluster_size=20) == [
        "/v1/customers",
        "/v1/treasury",
    ]


def test_cluster_by_path_prefix_handles_short_paths() -> None:
    """Single-segment paths cluster on themselves; root paths are skipped."""
    endpoints = [_make_endpoint(path="/users") for _ in range(40)] + [
        _make_endpoint(path="/") for _ in range(5)
    ]
    # `/users` cluster (40 ≥ 30); root `/` is too short to cluster meaningfully.
    assert cluster_by_path_prefix(endpoints, min_cluster_size=30) == ["/users"]


def test_cluster_by_path_prefix_default_threshold() -> None:
    """Default min_cluster_size is 30 — empty result when no cluster meets it."""
    endpoints = [_make_endpoint(path=f"/v1/foo/{i}") for i in range(10)]
    assert cluster_by_path_prefix(endpoints) == []
