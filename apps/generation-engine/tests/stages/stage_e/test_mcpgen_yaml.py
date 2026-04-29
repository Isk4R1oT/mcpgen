"""Stage E .mcpgen.yaml tests — CONTEXT D-29 required-fields gate."""

from __future__ import annotations

from typing import Any

import pytest
import yaml

from mcpgen_engine.stages.stage_e.scaffold import render_scaffold_files


def _render_mcpgen_yaml(context: dict[str, Any]) -> str:
    """Render only `.mcpgen.yaml` from the synthetic context."""
    files = render_scaffold_files(**context)
    return next(f.content for f in files if f.relative_path == ".mcpgen.yaml")


def _parse_mcpgen_yaml(context: dict[str, Any]) -> dict[str, Any]:
    """Render + YAML-parse `.mcpgen.yaml` for assertion ergonomics."""
    rendered = _render_mcpgen_yaml(context)
    parsed = yaml.safe_load(rendered)
    assert isinstance(parsed, dict), "rendered .mcpgen.yaml must parse as a YAML mapping"
    return parsed


# Required fields per CONTEXT D-29.
_REQUIRED_TOP_LEVEL: tuple[str, ...] = (
    "spec_url",
    "spec_hash",
    "generated_at",
    "engine_version",
    "pipeline_versions",
    "server_name_template",
    "spec_slug",
    "auth_mode",
    "mcp_protocol_version",
    "bundle_size_kb",
    "tool_count",
)
_REQUIRED_PIPELINE_VERSION_KEYS: tuple[str, ...] = (
    "pass_0",
    "pass_1",
    "pass_2",
    "pass_3",
    "pass_4",
    "pass_5",
    "stage_e",
)


@pytest.mark.parametrize("field", _REQUIRED_TOP_LEVEL)
def test_every_required_top_level_field_is_present(
    synthetic_render_context_stripe: dict[str, Any],
    field: str,
) -> None:
    """Every CONTEXT D-29 top-level field is emitted in the rendered yaml."""
    parsed = _parse_mcpgen_yaml(synthetic_render_context_stripe)
    assert field in parsed, f"missing required field {field!r}"


def test_pipeline_versions_has_all_seven_keys(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """pipeline_versions carries pass_0..pass_5 + stage_e."""
    parsed = _parse_mcpgen_yaml(synthetic_render_context_stripe)
    pv = parsed["pipeline_versions"]
    assert isinstance(pv, dict)
    assert set(pv.keys()) == set(_REQUIRED_PIPELINE_VERSION_KEYS)
    for key in _REQUIRED_PIPELINE_VERSION_KEYS:
        assert pv[key], f"pipeline_versions.{key} must be non-empty"


def test_mcp_protocol_version_is_2025_06_18(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """mcp_protocol_version is hardcoded to 2025-06-18 (CONTEXT D-25)."""
    parsed = _parse_mcpgen_yaml(synthetic_render_context_stripe)
    assert parsed["mcp_protocol_version"] == "2025-06-18"


def test_engine_version_is_non_empty(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """engine_version surfaces from the render context (Phase 8 Drift Watcher)."""
    parsed = _parse_mcpgen_yaml(synthetic_render_context_stripe)
    assert parsed["engine_version"] == "0.1.0"


def test_auth_mode_round_trips(
    synthetic_render_context_oauth: dict[str, Any],
) -> None:
    """auth_mode field reflects the render context (parameterized)."""
    parsed = _parse_mcpgen_yaml(synthetic_render_context_oauth)
    assert parsed["auth_mode"] == "oauth"


def test_server_name_template_carries_placeholder(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """server_name_template emits the literal `{tenant_short_id}` placeholder."""
    parsed = _parse_mcpgen_yaml(synthetic_render_context_stripe)
    assert parsed["server_name_template"] == "{tenant_short_id}-stripe"


def test_spec_hash_is_sha256_shape(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """spec_hash is a 64-char hex string (sha256 from Stage A)."""
    import re

    parsed = _parse_mcpgen_yaml(synthetic_render_context_stripe)
    assert re.fullmatch(r"[a-f0-9]{64}", parsed["spec_hash"])


def test_bundle_size_kb_is_zero_placeholder(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """bundle_size_kb=0 placeholder — Plan 04-11 fills after wrangler dry-run."""
    parsed = _parse_mcpgen_yaml(synthetic_render_context_stripe)
    assert parsed["bundle_size_kb"] == 0


def test_tool_count_is_int(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """tool_count is an integer (synthetic context says 1)."""
    parsed = _parse_mcpgen_yaml(synthetic_render_context_stripe)
    assert isinstance(parsed["tool_count"], int)
    assert parsed["tool_count"] == 1
