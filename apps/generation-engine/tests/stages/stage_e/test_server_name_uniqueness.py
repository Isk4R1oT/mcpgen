"""Stage E server-name uniqueness tests — Pitfall #30 mitigation.

CONTEXT D-25: SERVER_NAME_TEMPLATE = `{tenant_short_id}-{spec_slug}`. Phase 6
deploy substitutes `{tenant_short_id}` per tenant. This test verifies that
two synthetic tenants on the SAME spec produce non-overlapping server.name
strings after the substitution.
"""

from __future__ import annotations

from typing import Any

from mcpgen_engine.stages.stage_e.scaffold import render_scaffold_files


def _render_config_ts(context: dict[str, Any]) -> str:
    """Render only `src/config.ts` from the synthetic context."""
    files = render_scaffold_files(**context)
    return next(f.content for f in files if f.relative_path == "src/config.ts")


def test_server_name_template_present_in_config_ts(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """Generated config.ts exports SERVER_NAME_TEMPLATE."""
    config = _render_config_ts(synthetic_render_context_stripe)
    assert "SERVER_NAME_TEMPLATE" in config
    # The template form `{tenant_short_id}-stripe` MUST be in the rendered TS.
    assert "{tenant_short_id}-stripe" in config


def test_allowed_hosts_contains_tenant_placeholder(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """ALLOWED_HOSTS array carries the `{tenant_short_id}` placeholder."""
    config = _render_config_ts(synthetic_render_context_stripe)
    assert "ALLOWED_HOSTS" in config
    assert "{tenant_short_id}-stripe.mcpgen.dev" in config


def test_two_synthetic_tenants_dont_collide(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """Substitute `{tenant_short_id}` for two different tenants → distinct names.

    Phase 6 will perform this substitution at deploy time. Phase 4 emits the
    placeholder verbatim. Verify post-substitution non-overlap.
    """
    config = _render_config_ts(synthetic_render_context_stripe)
    tenant_a = config.replace("{tenant_short_id}", "acme")
    tenant_b = config.replace("{tenant_short_id}", "bigco")

    # Both renders contain their tenant prefix in SERVER_NAME_TEMPLATE
    assert "acme-stripe" in tenant_a
    assert "bigco-stripe" in tenant_b

    # Neither bleeds into the other's namespace
    assert "bigco-stripe" not in tenant_a
    assert "acme-stripe" not in tenant_b


def test_different_specs_are_distinguishable(
    synthetic_render_context_stripe: dict[str, Any],
    synthetic_render_context_oauth: dict[str, Any],
) -> None:
    """Two different spec slugs in same tenant produce distinct server names."""
    stripe_cfg = _render_config_ts(synthetic_render_context_stripe)
    github_cfg = _render_config_ts(synthetic_render_context_oauth)

    # After substituting the same `{tenant_short_id}=acme` for both:
    stripe_acme = stripe_cfg.replace("{tenant_short_id}", "acme")
    github_acme = github_cfg.replace("{tenant_short_id}", "acme")

    assert "acme-stripe" in stripe_acme
    assert "acme-github" in github_acme
    assert "acme-stripe" not in github_acme
    assert "acme-github" not in stripe_acme
