"""Pass 0 auth detection tests.

VALIDATION row: T-2-B3 (GitHub hybrid auth — Pitfall E + Pitfall #6).
Covers D-21 (per-endpoint List) + D-22 (deterministic mapping table).
"""

from __future__ import annotations

from mcpgen_ir.types import (
    Endpoint,
    In,
    Method,
    RecommendedMode,
    Scheme,
    SecuritySchemes,
    Type4,
)

from mcpgen_engine.passes.pass_0.auth_detect import detect_auth_per_endpoint

# ───────────────────────────── Test fixtures ───────────────────────────────


def _make_endpoint(*, method: str = "GET", path: str = "/v1/customers") -> Endpoint:
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


def _bearer_scheme() -> SecuritySchemes:
    return SecuritySchemes.model_validate({"type": "http", "scheme": "bearer", "in": None})


def _basic_scheme() -> SecuritySchemes:
    return SecuritySchemes.model_validate({"type": "http", "scheme": "basic", "in": None})


def _api_key_scheme() -> SecuritySchemes:
    return SecuritySchemes.model_validate(
        {"type": "apiKey", "scheme": None, "in": "header", "name": "X-API-Key"}
    )


def _oauth2_scheme() -> SecuritySchemes:
    return SecuritySchemes.model_validate(
        {
            "type": "oauth2",
            "scheme": None,
            "in": None,
            "flows": {
                "authorizationCode": {
                    "authorizationUrl": "https://example.com/oauth/authorize",
                    "tokenUrl": "https://example.com/oauth/token",
                    "scopes": {"read": "read scope"},
                }
            },
        }
    )


def _aws_sig_scheme() -> SecuritySchemes:
    return SecuritySchemes.model_validate({"type": "http", "scheme": "awssig4", "in": None})


# ──────────────────────── D-22 — single-scheme mappings ────────────────────


def test_stripe_global_bearer_only() -> None:
    """Stripe pattern: global bearer, zero op-level overrides → 1 entry / endpoint."""
    endpoints = [_make_endpoint(path=p) for p in ("/v1/customers", "/v1/charges", "/v1/refunds")]
    schemes = {"bearerAuth": _bearer_scheme()}
    global_default: list[dict[str, list[str]]] = [{"bearerAuth": []}]

    result = detect_auth_per_endpoint(endpoints, schemes, global_default)

    assert set(result.keys()) == {
        "GET /v1/customers",
        "GET /v1/charges",
        "GET /v1/refunds",
    }
    for endpoint_id, requirements in result.items():
        assert len(requirements) == 1, endpoint_id
        assert requirements[0].scheme == Scheme.http_bearer
        assert requirements[0].recommended_mode == RecommendedMode.passthrough


def test_oauth2_maps_to_oauth_flow() -> None:
    """D-22: oauth2 scheme → oauth_flow."""
    endpoints = [_make_endpoint()]
    schemes = {"oauthAuth": _oauth2_scheme()}
    global_default: list[dict[str, list[str]]] = [{"oauthAuth": ["read"]}]

    result = detect_auth_per_endpoint(endpoints, schemes, global_default)
    requirements = result["GET /v1/customers"]
    assert len(requirements) == 1
    assert requirements[0].scheme == Scheme.oauth2
    assert requirements[0].recommended_mode == RecommendedMode.oauth_flow


def test_aws_signature_maps_to_stored() -> None:
    """D-22: aws_signature → stored mode (per-tenant DEK)."""
    endpoints = [_make_endpoint(path="/aws/buckets")]
    schemes = {"awsSig": _aws_sig_scheme()}
    global_default: list[dict[str, list[str]]] = [{"awsSig": []}]

    result = detect_auth_per_endpoint(endpoints, schemes, global_default)
    requirements = result["GET /aws/buckets"]
    assert len(requirements) == 1
    assert requirements[0].scheme == Scheme.aws_signature
    assert requirements[0].recommended_mode == RecommendedMode.stored


def test_basic_auth_maps_to_passthrough() -> None:
    """D-22: HTTP Basic → passthrough."""
    endpoints = [_make_endpoint(path="/admin/login-required")]
    schemes = {"basicAuth": _basic_scheme()}
    global_default: list[dict[str, list[str]]] = [{"basicAuth": []}]

    result = detect_auth_per_endpoint(endpoints, schemes, global_default)
    requirements = result["GET /admin/login-required"]
    assert len(requirements) == 1
    assert requirements[0].scheme == Scheme.http_basic
    assert requirements[0].recommended_mode == RecommendedMode.passthrough


def test_api_key_maps_to_passthrough() -> None:
    """D-22: apiKey (header/query) → passthrough."""
    endpoints = [_make_endpoint(path="/v2/messages")]
    schemes = {"apiKeyAuth": _api_key_scheme()}
    global_default: list[dict[str, list[str]]] = [{"apiKeyAuth": []}]

    result = detect_auth_per_endpoint(endpoints, schemes, global_default)
    requirements = result["GET /v2/messages"]
    assert len(requirements) == 1
    assert requirements[0].scheme == Scheme.apiKey
    assert requirements[0].recommended_mode == RecommendedMode.passthrough


def test_bearer_with_oauth_scheme_present_maps_to_oauth_flow() -> None:
    """D-22: when spec has oauth2 alongside bearer, bearer→oauth_flow."""
    endpoints = [_make_endpoint(path="/v3/items")]
    schemes = {
        "bearerAuth": _bearer_scheme(),
        "oauthAuth": _oauth2_scheme(),
    }
    global_default: list[dict[str, list[str]]] = [{"bearerAuth": []}]

    result = detect_auth_per_endpoint(endpoints, schemes, global_default)
    requirements = result["GET /v3/items"]
    assert len(requirements) == 1
    assert requirements[0].scheme == Scheme.http_bearer
    assert requirements[0].recommended_mode == RecommendedMode.oauth_flow


# ──────────────────── D-21 — per-endpoint LIST (T-2-B3) ────────────────────


def test_github_hybrid_auth() -> None:
    """T-2-B3: GitHub endpoint with `x-github.enabledForGitHubApps=true`
    emits 2 AuthRequirement entries (PAT Bearer + GitHub App OAuth).
    """
    endpoint = _make_endpoint(method="POST", path="/repos/{owner}/{repo}/issues")
    schemes = {"bearerAuth": _bearer_scheme()}
    global_default: list[dict[str, list[str]]] = [{"bearerAuth": []}]
    extensions = {"POST /repos/{owner}/{repo}/issues": {"x-github": {"enabledForGitHubApps": True}}}

    result = detect_auth_per_endpoint(
        [endpoint],
        schemes,
        global_default,
        extensions_by_endpoint=extensions,
    )
    requirements = result["POST /repos/{owner}/{repo}/issues"]

    assert len(requirements) == 2
    schemes_seen = [r.scheme for r in requirements]
    modes_seen = [r.recommended_mode for r in requirements]
    assert schemes_seen == [Scheme.http_bearer, Scheme.oauth2]
    assert modes_seen == [RecommendedMode.passthrough, RecommendedMode.oauth_flow]
    # The GitHub App entry includes a notes field referencing the vendor flag.
    github_app_entry = requirements[1]
    assert github_app_entry.notes is not None
    assert "GitHub App" in github_app_entry.notes


def test_github_hybrid_with_no_global_default() -> None:
    """GitHub spec has empty `securitySchemes` and no global default; vendor
    extension still emits the App installation token entry.
    """
    endpoint = _make_endpoint(method="GET", path="/repos/{owner}/{repo}")
    extensions = {"GET /repos/{owner}/{repo}": {"x-github": {"enabledForGitHubApps": True}}}

    result = detect_auth_per_endpoint(
        [endpoint],
        global_security_schemes={},
        global_default_security=None,
        extensions_by_endpoint=extensions,
    )
    requirements = result["GET /repos/{owner}/{repo}"]

    # No global default + no operation-level → only the vendor-extension entry.
    assert len(requirements) == 1
    assert requirements[0].scheme == Scheme.oauth2
    assert requirements[0].recommended_mode == RecommendedMode.oauth_flow


# ──────────────────────── No-auth & override tests ─────────────────────────


def test_no_auth_returns_explicit_none_entry() -> None:
    """Empty security_schemes + no global default + no extensions
    → single explicit `none` entry per endpoint (so the dict value is never empty).
    """
    endpoints = [_make_endpoint(path="/public/health")]
    result = detect_auth_per_endpoint(
        endpoints, global_security_schemes={}, global_default_security=None
    )
    requirements = result["GET /public/health"]
    assert len(requirements) == 1
    assert requirements[0].scheme == Scheme.none


def test_operation_level_empty_overrides_global_to_none() -> None:
    """OpenAPI: operation `security: []` is explicit "no auth" — overrides global."""
    endpoints = [_make_endpoint(path="/public/version")]
    schemes = {"bearerAuth": _bearer_scheme()}
    global_default: list[dict[str, list[str]]] = [{"bearerAuth": []}]
    op_security: dict[str, list[dict[str, list[str]]] | None] = {"GET /public/version": []}

    result = detect_auth_per_endpoint(
        endpoints, schemes, global_default, operation_security_by_endpoint=op_security
    )
    requirements = result["GET /public/version"]
    assert len(requirements) == 1
    assert requirements[0].scheme == Scheme.none


def test_operation_level_alternative_security_overrides_global() -> None:
    """Operation-level non-empty security list overrides the global default."""
    endpoints = [_make_endpoint(path="/admin/users")]
    schemes = {
        "bearerAuth": _bearer_scheme(),
        "basicAuth": _basic_scheme(),
    }
    global_default: list[dict[str, list[str]]] = [{"bearerAuth": []}]
    op_security: dict[str, list[dict[str, list[str]]] | None] = {
        "GET /admin/users": [{"basicAuth": []}]
    }

    result = detect_auth_per_endpoint(
        endpoints, schemes, global_default, operation_security_by_endpoint=op_security
    )
    requirements = result["GET /admin/users"]
    assert len(requirements) == 1
    assert requirements[0].scheme == Scheme.http_basic


# ────────────────── D-21 shape sanity — Dict[str, List[...]] ───────────────


def test_per_endpoint_list_shape_d21() -> None:
    """D-21: output value is always List[AuthRequirement], NEVER a single object."""
    endpoints = [
        _make_endpoint(path="/v1/customers"),
        _make_endpoint(path="/v1/charges"),
        _make_endpoint(path="/v1/refunds"),
    ]
    schemes = {"bearerAuth": _bearer_scheme()}
    global_default: list[dict[str, list[str]]] = [{"bearerAuth": []}]

    result = detect_auth_per_endpoint(endpoints, schemes, global_default)

    assert isinstance(result, dict)
    for endpoint_id, value in result.items():
        assert isinstance(value, list), f"{endpoint_id}: value is {type(value)}, expected list"
        assert len(value) >= 1, f"{endpoint_id}: empty list (D-21 forbids)"


# ───────────────────────────── Sanity / In enum ────────────────────────────


def test_in_enum_imported() -> None:
    """Sanity: confirm `In` enum imports — guards against IR codegen drift."""
    assert In.header.value == "header"
    assert Type4.apiKey.value == "apiKey"
