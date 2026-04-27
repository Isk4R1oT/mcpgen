"""Pass 0 — per-endpoint auth detection.

Pure-function deterministic transform that maps each endpoint to a
``list[AuthRequirement]`` (D-21 — list, not single, because hybrid auth like
GitHub Bearer-PAT + GitHub-Apps-OAuth produces multiple entries per endpoint).

Resolution order per endpoint:

1. **Operation-level `security` override** — if the spec sets `security: []`
   on an operation, that's an explicit "no auth"; if `security: [{...}]`,
   that scheme list overrides the global default.
2. **Global `securitySchemes` + global default `security`** — the typical
   Stripe / Slack / Linear pattern (single global Bearer/apiKey applies to
   every endpoint).
3. **Vendor extensions** — additive layer:
   - ``x-github.enabledForGitHubApps == True`` → APPEND a 2nd
     ``AuthRequirement(scheme=oauth2, recommended_mode=oauth_flow)`` for the
     GitHub App installation token (Pitfall E — verified empirically: 879 of
     1117 GitHub operations carry this flag).
   - Future hooks reserved for `x-stripe-restricted-keys`, `x-twilio-*`, etc.

D-22 deterministic mapping (NO LLM):

| Spec scheme              | RecommendedMode |
|--------------------------|-----------------|
| ``apiKey`` (header/query)| ``passthrough`` |
| ``http`` ``basic``       | ``passthrough`` |
| ``http`` ``bearer``      | ``passthrough`` |
| ``oauth2``               | ``oauth_flow``  |
| ``aws_signature`` /      | ``stored``      |
| ``awsSig4`` /            |                 |
| ``http`` ``signature``   |                 |
| anything else / missing  | ``none``        |

When no entries are produced from any of the three sources, an explicit
single-element list ``[AuthRequirement(scheme=none, recommended_mode=none)]``
is emitted so consumers always see a non-empty list per endpoint.

Threats addressed:
- T-2-13 (D-52): structlog emits structural counts only — no spec text.
- Pitfall #6 (D-21): per-endpoint List allows hybrid auth.
- Pitfall E (GitHub `x-github.enabledForGitHubApps`): vendor flag is
  evaluated as boolean, never as natural-language input.

References:
- 02-CONTEXT.md D-21 (per-endpoint List) + D-22 (mode mapping table)
- 02-RESEARCH.md §"Pitfall E: GitHub uses x-github extensions" + §"GitHub Spec Analysis"
- 02-PATTERNS.md `passes/pass_0/auth_detect.py` row
- packages/engine-fixtures/github/pass-0-output.json (canonical hybrid example)
- packages/engine-fixtures/stripe/pass-0-output.json (single-scheme example)
- docs/mcpgen-pass-0-design.md §"auth subsystem detection"
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Final

import structlog
from mcpgen_ir.types import (
    AuthRequirement,
    Endpoint,
    Method,
    RecommendedMode,
    Scheme,
    SecuritySchemes,
)

# ─────────────────────────── D-22 mapping table ────────────────────────────
#
# Keys are normalized lowercase strings derived from the OpenAPI scheme. The
# IR ``SecuritySchemes`` model collapses ``http+bearer`` and ``http+basic``
# into the single ``http`` ``Type4`` enum with detail on ``scheme`` (see
# `stages/stage_a.py::_normalize_security_schemes`); this module reads both
# fields when discriminating the bearer/basic split.
#
# `_AWS_SIG_SCHEMES` enumerates the OpenAPI 3.x http-scheme strings that map
# to AWS-SigV4-style HMAC and therefore require per-tenant DEK (stored mode).

_BEARER_HTTP_SCHEMES: Final[frozenset[str]] = frozenset({"bearer"})
_BASIC_HTTP_SCHEMES: Final[frozenset[str]] = frozenset({"basic"})
_AWS_SIG_SCHEMES: Final[frozenset[str]] = frozenset(
    {"awssig4", "aws_signature", "aws-sig4", "aws-sigv4", "signature"}
)

_log = structlog.get_logger(__name__)


# ─────────────────────────────── Public API ────────────────────────────────


def detect_auth_per_endpoint(
    endpoints: list[Endpoint],
    global_security_schemes: Mapping[str, SecuritySchemes],
    global_default_security: list[dict[str, list[str]]] | None,
    operation_security_by_endpoint: Mapping[str, list[dict[str, list[str]]] | None] | None = None,
    extensions_by_endpoint: Mapping[str, Mapping[str, object]] | None = None,
) -> dict[str, list[AuthRequirement]]:
    """Resolve auth requirements for each endpoint per D-21 / D-22.

    Arguments:
    - ``global_security_schemes`` — typically ``raw_ir.security_schemes``.
    - ``global_default_security`` — top-level ``security: [{schemeName: [...]}]``
      from the OpenAPI document; ``None`` when the spec has no global default
      (the GitHub case — they put auth signals in vendor extensions instead).
    - ``operation_security_by_endpoint`` — optional map ``{endpoint_id:
      operation.security or None}``. If a key is present and the value is
      ``[]`` (empty list), that's the OpenAPI signal for "explicit no auth".
      If absent or value ``None``, the global default applies.
    - ``extensions_by_endpoint`` — optional map of vendor extensions keyed by
      endpoint_id, used for ``x-github.enabledForGitHubApps`` (Pitfall E) and
      future vendor handlers.

    Returns: ``{endpoint_id: [AuthRequirement, ...]}``. Endpoint IDs are
    ``"METHOD path"`` (matching Stage A's `_endpoint_id` shape and the
    ``coverage_proof.endpoint_id`` shape from the engine-fixtures contract).
    """
    operation_security_by_endpoint = operation_security_by_endpoint or {}
    extensions_by_endpoint = extensions_by_endpoint or {}

    has_oauth_flow = _global_has_oauth_flow(global_security_schemes)

    result: dict[str, list[AuthRequirement]] = {}
    hybrid_count = 0

    for ep in endpoints:
        endpoint_id = _endpoint_id(ep)

        op_security = operation_security_by_endpoint.get(endpoint_id, None)
        ep_extensions = extensions_by_endpoint.get(endpoint_id, {})

        requirements = _resolve_for_endpoint(
            op_security=op_security,
            global_default=global_default_security,
            schemes=global_security_schemes,
            has_oauth_flow=has_oauth_flow,
            extensions=ep_extensions,
        )
        if len(requirements) >= 2:
            hybrid_count += 1
        result[endpoint_id] = requirements

    _log.info(
        "pass_0.auth_detect.complete",
        endpoint_count=len(endpoints),
        hybrid_count=hybrid_count,
        scheme_count=len(global_security_schemes),
        global_default_present=global_default_security is not None,
    )
    return result


# ─────────────────────────── Per-endpoint logic ────────────────────────────


def _resolve_for_endpoint(
    *,
    op_security: list[dict[str, list[str]]] | None,
    global_default: list[dict[str, list[str]]] | None,
    schemes: Mapping[str, SecuritySchemes],
    has_oauth_flow: bool,
    extensions: Mapping[str, object],
) -> list[AuthRequirement]:
    """Pure resolution of auth requirements for one endpoint."""

    requirements: list[AuthRequirement] = []
    op_security_resolved = _resolve_security_list(op_security, global_default)

    # Path A: explicit no-auth signal at operation level (security: []).
    if op_security is not None and len(op_security) == 0:
        # Vendor extensions still apply — see Path C below.
        pass
    elif op_security_resolved is not None:
        for security_obj in op_security_resolved:
            for scheme_ref in security_obj:
                requirement = _scheme_to_requirement(
                    scheme_ref=scheme_ref,
                    schemes=schemes,
                    has_oauth_flow=has_oauth_flow,
                )
                if requirement is not None:
                    requirements.append(requirement)

    # Path C: additive vendor-extension hooks (Pitfall E).
    requirements.extend(_extension_requirements(extensions))

    # Final fallback: if nothing was emitted, emit an explicit "none" entry so
    # downstream callers always see a non-empty list per endpoint.
    if not requirements:
        return [
            AuthRequirement(
                scheme=Scheme.none,
                recommended_mode=RecommendedMode.passthrough,
                notes="public endpoint",
            )
        ]
    return requirements


def _resolve_security_list(
    op_security: list[dict[str, list[str]]] | None,
    global_default: list[dict[str, list[str]]] | None,
) -> list[dict[str, list[str]]] | None:
    """Resolve effective security list for one endpoint (op-level OR global)."""
    if op_security is None:
        return global_default
    if len(op_security) == 0:
        return None
    return op_security


def _scheme_to_requirement(
    scheme_ref: str,
    schemes: Mapping[str, SecuritySchemes],
    has_oauth_flow: bool,
) -> AuthRequirement | None:
    """Apply the D-22 mapping table for one scheme reference."""
    scheme = schemes.get(scheme_ref)
    if scheme is None:
        return AuthRequirement(
            scheme=Scheme.none,
            recommended_mode=RecommendedMode.passthrough,
            notes=f"unknown scheme reference '{scheme_ref}' — treated as public",
        )

    return _map_security_scheme(scheme, has_oauth_flow)


def _map_security_scheme(
    scheme: SecuritySchemes,
    has_oauth_flow: bool,
) -> AuthRequirement | None:
    """D-22 deterministic mapping table."""
    scheme_type = scheme.type.value if scheme.type is not None else None
    sub_scheme = (scheme.scheme or "").lower()

    if scheme_type == "apiKey":
        return AuthRequirement(
            scheme=Scheme.apiKey,
            recommended_mode=RecommendedMode.passthrough,
            notes="API key passed through from client request.",
        )

    if scheme_type == "http":
        if sub_scheme in _BEARER_HTTP_SCHEMES:
            mode = RecommendedMode.oauth_flow if has_oauth_flow else RecommendedMode.passthrough
            return AuthRequirement(
                scheme=Scheme.http_bearer,
                recommended_mode=mode,
                notes=(
                    "Bearer token used as OAuth access token."
                    if has_oauth_flow
                    else "Bearer token passed through from client request."
                ),
            )
        if sub_scheme in _BASIC_HTTP_SCHEMES:
            return AuthRequirement(
                scheme=Scheme.http_basic,
                recommended_mode=RecommendedMode.passthrough,
                notes="HTTP Basic credentials passed through from client request.",
            )
        if sub_scheme in _AWS_SIG_SCHEMES:
            return AuthRequirement(
                scheme=Scheme.aws_signature,
                recommended_mode=RecommendedMode.stored,
                notes="AWS SigV4 signing requires per-tenant DEK (stored mode).",
            )

    if scheme_type == "oauth2":
        return AuthRequirement(
            scheme=Scheme.oauth2,
            recommended_mode=RecommendedMode.oauth_flow,
            notes="Full OAuth 2.x authorization flow.",
        )

    # `openIdConnect`, `mutualTLS`, or any unrecognised type → none.
    return AuthRequirement(
        scheme=Scheme.none,
        recommended_mode=RecommendedMode.passthrough,
        notes=f"Unsupported security scheme type '{scheme_type}' — treated as public.",
    )


def _extension_requirements(
    extensions: Mapping[str, object],
) -> list[AuthRequirement]:
    """Extract vendor-extension auth signals (Pitfall E for GitHub Apps)."""
    out: list[AuthRequirement] = []

    # GitHub Apps (Pitfall E) — `x-github.enabledForGitHubApps: true` adds a
    # 2nd auth requirement for the App installation token.
    x_github = extensions.get("x-github")
    if isinstance(x_github, Mapping) and _is_truthy(x_github.get("enabledForGitHubApps")):
        out.append(
            AuthRequirement(
                scheme=Scheme.oauth2,
                recommended_mode=RecommendedMode.oauth_flow,
                notes="GitHub App installation token (x-github.enabledForGitHubApps=true).",
            )
        )

    return out


# ─────────────────────────────── Helpers ───────────────────────────────────


def _global_has_oauth_flow(schemes: Mapping[str, SecuritySchemes]) -> bool:
    """True iff at least one global scheme is `oauth2` (changes Bearer mapping)."""
    return any(
        scheme.type is not None and scheme.type.value == "oauth2" for scheme in schemes.values()
    )


def _endpoint_id(ep: Endpoint) -> str:
    """Stable identifier matching Stage A `_endpoint_id` shape."""
    method_str = ep.method.value if isinstance(ep.method, Method) else str(ep.method).upper()
    return f"{method_str} {ep.path}"


def _is_truthy(value: object) -> bool:
    """Strict-bool truthiness for vendor-extension flags (mirror filter.py)."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == "true"
    return False
