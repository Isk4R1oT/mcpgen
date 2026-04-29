"""Stage E scaffold tests — render_scaffold_files emits 9 project files."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from mcpgen_engine.stages.stage_e import StageEError
from mcpgen_engine.stages.stage_e.output_writer import write_files_atomically
from mcpgen_engine.stages.stage_e.scaffold import (
    GeneratedFile,
    render_scaffold_files,
)


def _render(context: dict[str, Any]) -> list[GeneratedFile]:
    """Helper: call render_scaffold_files unpacking the synthetic context."""
    return render_scaffold_files(**context)


def test_render_scaffold_files_returns_nine_files(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """All 9 project-level templates render to a GeneratedFile each."""
    files = _render(synthetic_render_context_stripe)
    assert len(files) == 9
    expected_paths = {
        "package.json",
        "wrangler.toml",
        "tsconfig.json",
        "README.md",
        ".mcpgen.yaml",
        ".gitignore",
        "src/index.ts",
        "src/server.ts",
        "src/config.ts",
    }
    actual_paths = {f.relative_path for f in files}
    assert actual_paths == expected_paths


def test_every_file_has_non_empty_content(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """No template renders an empty string."""
    files = _render(synthetic_render_context_stripe)
    for f in files:
        assert f.content.strip(), f"empty render for {f.relative_path}"


def test_no_unsubstituted_jinja_markers(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """Rendered output never contains `{{` or `{%` (placeholder leak guard).

    Note: the `{tenant_short_id}` literal placeholder is INTENTIONAL (Phase 6
    deploy substitutes it). The test guards against `{{ ... }}` Jinja2
    delimiters NOT being substituted.
    """
    files = _render(synthetic_render_context_stripe)
    for f in files:
        assert "{{" not in f.content, f"unsubstituted Jinja2 var in {f.relative_path}"
        assert "{%" not in f.content, f"unsubstituted Jinja2 block in {f.relative_path}"


def test_passthrough_mode_skips_oauth_dependency(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """auth_mode=passthrough → package.json has no @cloudflare/workers-oauth-provider."""
    files = _render(synthetic_render_context_stripe)
    pkg = next(f for f in files if f.relative_path == "package.json")
    assert "@cloudflare/workers-oauth-provider" not in pkg.content


def test_oauth_mode_includes_oauth_dependency(
    synthetic_render_context_oauth: dict[str, Any],
) -> None:
    """auth_mode=oauth → package.json includes the OAuth provider dep."""
    files = _render(synthetic_render_context_oauth)
    pkg = next(f for f in files if f.relative_path == "package.json")
    assert "@cloudflare/workers-oauth-provider" in pkg.content
    assert "^0.2.2" in pkg.content


def test_oauth_mode_emits_oauth_kv_binding(
    synthetic_render_context_oauth: dict[str, Any],
) -> None:
    """wrangler.toml gets [[kv_namespaces]] for OAUTH_KV under oauth mode."""
    files = _render(synthetic_render_context_oauth)
    wrangler = next(f for f in files if f.relative_path == "wrangler.toml")
    assert 'binding = "OAUTH_KV"' in wrangler.content


def test_passthrough_mode_skips_kv_binding(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """passthrough mode → wrangler.toml has no KV bindings."""
    files = _render(synthetic_render_context_stripe)
    wrangler = next(f for f in files if f.relative_path == "wrangler.toml")
    assert "OAUTH_KV" not in wrangler.content
    assert "TENANT_DEK_KV" not in wrangler.content


def test_generated_file_extra_forbid() -> None:
    """GeneratedFile rejects unknown fields (CLAUDE.md strict-typing rule)."""
    with pytest.raises(ValidationError):
        GeneratedFile.model_validate(
            {
                "relative_path": "x.ts",
                "content": "x",
                "render_template": "x.j2",
                "render_inputs_hash": "a" * 64,
                "unexpected_field": "boom",
            }
        )


def test_render_inputs_hash_deterministic(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """Two cold renders produce identical render_inputs_hash per file."""
    a = _render(synthetic_render_context_stripe)
    b = _render(synthetic_render_context_stripe)
    a_map = {f.relative_path: f.render_inputs_hash for f in a}
    b_map = {f.relative_path: f.render_inputs_hash for f in b}
    assert a_map == b_map
    # And every render_inputs_hash matches sha256 shape.
    for h in a_map.values():
        assert re.fullmatch(r"[a-f0-9]{64}", h)


def test_render_content_deterministic(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """Two cold renders produce identical content (GEN-12 cold/warm contract)."""
    a = _render(synthetic_render_context_stripe)
    b = _render(synthetic_render_context_stripe)
    a_content = {f.relative_path: f.content for f in a}
    b_content = {f.relative_path: f.content for f in b}
    assert a_content == b_content


def test_invalid_auth_mode_raises_stage_e_error(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """Unknown auth_mode → STAGE_E_TEMPLATE_ERROR with stable code."""
    bad = dict(synthetic_render_context_stripe)
    bad["auth_mode"] = "invalid"
    with pytest.raises(StageEError, match="STAGE_E_TEMPLATE_ERROR"):
        _render(bad)


def test_missing_pipeline_version_key_raises(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """pipeline_versions missing required key → STAGE_E_TEMPLATE_ERROR."""
    bad = dict(synthetic_render_context_stripe)
    bad["pipeline_versions"] = {"pass_0": "1"}  # missing pass_1..pass_5 + stage_e
    with pytest.raises(StageEError, match="pipeline_versions"):
        _render(bad)


def test_write_files_atomically_emits_manifest(
    synthetic_render_context_stripe: dict[str, Any],
    temp_output_dir: Path,
) -> None:
    """write_files_atomically writes 9 files + emits placeholder manifest."""
    files = _render(synthetic_render_context_stripe)
    manifest = write_files_atomically(temp_output_dir, files)
    # All 9 files written
    assert len(manifest.files) == 9
    # Each on disk + sha256 matches manifest
    for entry in manifest.files:
        on_disk = (temp_output_dir / entry.relative_path).read_text("utf-8")
        import hashlib

        assert hashlib.sha256(on_disk.encode("utf-8")).hexdigest() == entry.sha256_content_hash
    # Phase 1 placeholder values
    assert manifest.bundle_size_kb == 0.0
    assert manifest.ts_compile_passed is False
    assert manifest.ts_compile_warning_count == 0
    assert manifest.template_version == "1"


# ──────────────────── Plan 04-14 — dev_local build mode (D-3) ─────────────────


def test_render_scaffold_files_dev_local_substitutes_placeholder(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """dev_local=True substitutes {tenant_short_id} with 'local' in config.ts.

    Closes D-3: standalone wrangler dev hit 'Invalid Host header' because no
    substitution path existed.  dev_local=True renders 'local-stripe.mcpgen.dev'
    instead of the literal placeholder.
    """
    files = render_scaffold_files(**synthetic_render_context_stripe, dev_local=True)
    config = next(f for f in files if f.relative_path == "src/config.ts")
    assert (
        "local-stripe.mcpgen.dev" in config.content
    ), "dev_local=True must substitute {tenant_short_id} → 'local' in config.ts"
    # The SERVER_NAME_TEMPLATE and ALLOWED_HOSTS *values* must not contain the
    # placeholder; comments referencing the placeholder by name are expected.
    # We check the TS string literal context specifically.
    assert (
        '"local-stripe.mcpgen.dev"' in config.content
    ), "dev_local=True must render the TS string literal 'local-stripe.mcpgen.dev'"
    assert (
        '"{tenant_short_id}-stripe.mcpgen.dev"' not in config.content
    ), "dev_local=True must NOT retain the placeholder in TS string literals"
    assert (
        "localhost:8787" in config.content
    ), "dev_local=True must include localhost:8787 in ALLOWED_HOSTS"
    assert (
        "127.0.0.1:8787" in config.content
    ), "dev_local=True must include 127.0.0.1:8787 in ALLOWED_HOSTS"


def test_render_scaffold_files_production_keeps_placeholder(
    synthetic_render_context_stripe: dict[str, Any],
) -> None:
    """dev_local=False (default) keeps {tenant_short_id} literal (Pitfall #30).

    Phase 6 dispatch Worker substitutes the real tenant prefix at deploy time.
    We MUST NOT remove the placeholder from production builds.
    """
    files = render_scaffold_files(**synthetic_render_context_stripe)
    config = next(f for f in files if f.relative_path == "src/config.ts")
    assert '"{tenant_short_id}-stripe.mcpgen.dev"' in config.content, (
        "Production build must retain {tenant_short_id} placeholder"
        " as a TS string literal (Pitfall #30)"
    )
    # The ALLOWED_HOSTS array must not contain localhost entries in production.
    assert (
        '"localhost:8787"' not in config.content
    ), "Production build must NOT contain localhost:8787 in ALLOWED_HOSTS"


def test_render_scaffold_files_dev_local_emits_warning_log(
    synthetic_render_context_stripe: dict[str, Any],
    capsys: pytest.CaptureFixture[str],
) -> None:
    """dev_local=True emits a WARNING log so operators see the footgun alert.

    structlog uses a JSON/console renderer that writes to stdout/stderr, not
    the stdlib logging propagation chain that caplog captures.  We assert on
    the console output (capsys) instead.
    """
    render_scaffold_files(**synthetic_render_context_stripe, dev_local=True)

    captured = capsys.readouterr()
    combined = captured.out + captured.err
    assert "dev_local" in combined or "stage_e.scaffold" in combined, (
        f"Expected a dev_local warning log in stdout/stderr "
        f"(T-04-14-dev-local-leak mitigation). "
        f"stdout={captured.out!r} stderr={captured.err!r}"
    )
