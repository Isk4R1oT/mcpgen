"""Stage E DNS-rebinding mitigation tests (Pitfall #15).

Re-asserts plan 04-06 work (`server.ts.j2` configures
`StreamableHTTPServerTransport({ enableDnsRebindingProtection: true,
allowedHosts: ALLOWED_HOSTS })`) AND verifies plan 04-09's
`auth_middleware.ts.j2` references `ALLOWED_HOSTS` as a belt-and-suspenders
layer.

Source-of-truth references:
- `04-CONTEXT.md` D-22 (DNS-rebinding mitigation rides on SDK transport)
- `04-RESEARCH.md` Pattern 4 (StreamableHTTPServerTransport native option)
- `04-RESEARCH.md` Open Q4 + §"Standard Stack" (`@modelcontextprotocol/sdk` 1.24+
  ships `enableDnsRebindingProtection`; we pin `^1.29`).
- `04-09-PLAN.md` `<threat_model>` row T-04-09-dns-rebinding.
"""

from __future__ import annotations

from typing import Any

from mcpgen_ir.types import Pass0Output

from mcpgen_engine.stages.stage_e.auth import render_auth_files
from mcpgen_engine.stages.stage_e.scaffold import render_scaffold_files


def _pass_0() -> Pass0Output:
    return Pass0Output.model_validate(
        {
            "tool_plans": [
                {
                    "name": "search",
                    "category": "search",
                    "source_endpoints": ["GET /v1/charges"],
                    "rationale": "Search.",
                }
            ],
            "dropped_endpoints": [],
            "composite_candidates": [],
            "auth_requirements": {
                "GET /v1/charges": [
                    {
                        "scheme": "http_bearer",
                        "recommended_mode": "passthrough",
                        "notes": None,
                    }
                ]
            },
            "target_complexity": "standard",
            "prompt_injection_warnings": [],
        }
    )


def test_server_ts_enables_dns_rebinding_protection(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """`enableDnsRebindingProtection: true` MUST be in rendered server.ts."""
    files = render_scaffold_files(**synthetic_render_context_stripe)
    server = next(f for f in files if f.relative_path == "src/server.ts")
    assert "enableDnsRebindingProtection: true" in server.content, (
        "DNS-rebinding mitigation MUST ride on StreamableHTTPServerTransport "
        "(CONTEXT D-22 + Pattern 4)."
    )


def test_server_ts_passes_allowed_hosts_to_transport(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """`allowedHosts: ALLOWED_HOSTS` MUST be passed to the transport ctor."""
    files = render_scaffold_files(**synthetic_render_context_stripe)
    server = next(f for f in files if f.relative_path == "src/server.ts")
    assert "allowedHosts: ALLOWED_HOSTS" in server.content


def test_config_ts_exports_allowed_hosts(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """ALLOWED_HOSTS MUST be exported from src/config.ts."""
    files = render_scaffold_files(**synthetic_render_context_stripe)
    config = next(f for f in files if f.relative_path == "src/config.ts")
    assert "export const ALLOWED_HOSTS" in config.content
    # Default allowlist carries the tenant placeholder for Phase 6 substitution.
    assert "{tenant_short_id}-stripe.mcpgen.dev" in config.content


def test_passthrough_middleware_references_allowed_hosts_belt_and_suspenders() -> None:
    """auth_middleware.ts (passthrough) imports ALLOWED_HOSTS for defense-in-depth."""
    files = render_auth_files(auth_mode="passthrough", pass_0_output=_pass_0())
    middleware = next(f for f in files if f.relative_path == "src/auth/middleware.ts")
    assert "ALLOWED_HOSTS" in middleware.content


def test_stored_middleware_references_allowed_hosts_belt_and_suspenders() -> None:
    """auth_middleware.ts (stored) imports ALLOWED_HOSTS for defense-in-depth."""
    p0 = Pass0Output.model_validate(
        {
            "tool_plans": [
                {
                    "name": "search",
                    "category": "search",
                    "source_endpoints": ["GET /v1/charges"],
                    "rationale": "AWS-signed.",
                }
            ],
            "dropped_endpoints": [],
            "composite_candidates": [],
            "auth_requirements": {
                "GET /v1/charges": [
                    {
                        "scheme": "aws_signature",
                        "recommended_mode": "stored",
                        "notes": None,
                    }
                ]
            },
            "target_complexity": "standard",
            "prompt_injection_warnings": [],
        }
    )
    files = render_auth_files(auth_mode="stored", pass_0_output=p0)
    middleware = next(f for f in files if f.relative_path == "src/auth/middleware.ts")
    assert "ALLOWED_HOSTS" in middleware.content


def test_oauth_middleware_references_allowed_hosts_belt_and_suspenders() -> None:
    """auth_middleware.ts (oauth) imports ALLOWED_HOSTS for defense-in-depth."""
    p0 = Pass0Output.model_validate(
        {
            "tool_plans": [
                {
                    "name": "search",
                    "category": "search",
                    "source_endpoints": ["GET /v1/charges"],
                    "rationale": "OAuth.",
                }
            ],
            "dropped_endpoints": [],
            "composite_candidates": [],
            "auth_requirements": {
                "GET /v1/charges": [
                    {
                        "scheme": "oauth2",
                        "recommended_mode": "oauth_flow",
                        "notes": None,
                    }
                ]
            },
            "target_complexity": "standard",
            "prompt_injection_warnings": [],
        }
    )
    files = render_auth_files(auth_mode="oauth", pass_0_output=p0)
    middleware = next(f for f in files if f.relative_path == "src/auth/middleware.ts")
    assert "ALLOWED_HOSTS" in middleware.content
