"""Stage E full ``run()`` orchestrator e2e tests.

Verifies the 6-phase chain:
- Phases 1-5 produce the canonical ~25-30 file tree (CONTEXT D-17).
- Phase 6 (``run_tsc_no_emit`` + ``capture_bundle_size_kb`` +
  ``gate_bundle_size``) is exercised end-to-end against the rendered
  output via the pre-warmed ``packages/codegen-templates/node_modules``.

⚠ Note on tsc-clean: pre-existing TS compile errors in templates from
plans 04-06..04-10 (categorised in ``deferred-items.md`` 2026-04-28
section) cause Phase 6 to raise ``StageETsError`` on synthetic input
TODAY. End-to-end ``tsc --noEmit`` clean on Stripe/GitHub/Notion fixtures
is plan 04-12's responsibility per VALIDATION.md row ``04-12-*``. These
tests therefore verify the orchestrator's CONTRACT — phases 1-5 emit the
canonical tree and Phase 6 raises a properly-typed ``StageETsError`` —
NOT that the rendered TypeScript currently passes ``tsc``.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from mcpgen_ir.types import (
    FinalTool,
    Pass0Output,
    Pass1Output,
    Pass5Output,
    RawIR,
)

from mcpgen_engine.stages.stage_e import run as stage_e_run
from mcpgen_engine.stages.stage_e.auth import select_auth_mode
from mcpgen_engine.stages.stage_e.output_writer import write_files_atomically
from mcpgen_engine.stages.stage_e.runtime import render_runtime_files
from mcpgen_engine.stages.stage_e.scaffold import render_scaffold_files
from mcpgen_engine.stages.stage_e.schemas import render_schema_files
from mcpgen_engine.stages.stage_e.tools import render_all_tool_handlers
from mcpgen_engine.stages.stage_e.validate import StageETsError


def _render_phases_1_through_5(
    final_tools: list[FinalTool],
    pass_5_output: Pass5Output,
    pass_1_output: Pass1Output,
    pass_0_output: Pass0Output,
    raw_ir: RawIR,
    output_dir: Path,
) -> Path:
    """Run Phases 1-5 of Stage E directly (no Phase 6 / no tsc).

    Mirrors the orchestrator's chain so the file-tree assertions don't
    depend on Phase 6's tsc validation passing.
    """
    auth_mode = select_auth_mode(pass_0_output)
    pipeline_versions = {
        "pass_0": "1",
        "pass_1": "1",
        "pass_2": "1",
        "pass_3": "1",
        "pass_4": "1",
        "pass_5": "1",
        "stage_e": "1",
    }
    files = render_scaffold_files(
        spec_slug="stripe",
        auth_mode=auth_mode,
        pass_0_output=pass_0_output,
        pass_1_output=pass_1_output,
        raw_ir=raw_ir,
        pipeline_versions=pipeline_versions,
        engine_version="0.1.0",
        spec_url="https://example.test/spec.json",
        spec_hash=raw_ir.spec_hash,
        generated_at="2026-04-28T19:30:00Z",
        upstream_base_url="https://example.test",
        tool_count=len(final_tools),
    )
    files += render_schema_files(final_tools, pass_1_output)
    files += render_runtime_files(pass_0_output, pass_5_output, raw_ir)
    from mcpgen_engine.stages.stage_e.auth import render_auth_files

    files += render_auth_files(auth_mode, pass_0_output)
    files += render_all_tool_handlers(final_tools, pass_1_output)
    write_files_atomically(output_dir, files)
    return output_dir


def test_stage_e_phases_1_through_5_produce_canonical_file_tree(
    e2e_final_tools_minimal: list[FinalTool],
    e2e_pass_5_output: Pass5Output,
    e2e_pass_1_output: Pass1Output,
    e2e_pass_0_output: Pass0Output,
    e2e_raw_ir: RawIR,
    tmp_path: Path,
) -> None:
    """Phases 1-5 emit the canonical D-17 file tree under output_dir.

    File count: 9 scaffold + 3 schemas + 8 runtime + 2 auth + 3 per-tool +
    1 tools/index = **26 files** for the 3-tool minimal fixture.
    Bound is loose to allow plan-internal additions.
    """
    output_dir = tmp_path / "stage-e-e2e"
    _render_phases_1_through_5(
        final_tools=e2e_final_tools_minimal,
        pass_5_output=e2e_pass_5_output,
        pass_1_output=e2e_pass_1_output,
        pass_0_output=e2e_pass_0_output,
        raw_ir=e2e_raw_ir,
        output_dir=output_dir,
    )
    on_disk = sorted(
        p.relative_to(output_dir).as_posix() for p in output_dir.rglob("*") if p.is_file()
    )
    canonical = {
        "package.json",
        "wrangler.toml",
        "tsconfig.json",
        "README.md",
        ".mcpgen.yaml",
        ".gitignore",
        "src/index.ts",
        "src/server.ts",
        "src/config.ts",
        "src/schemas/inputs.ts",
        "src/schemas/outputs.ts",
        "src/schemas/routing.ts",
        "src/runtime/smart_id.ts",
        "src/runtime/pagination.ts",
        "src/runtime/truncation.ts",
        "src/runtime/upstream.ts",
        "src/runtime/response_shaping.ts",
        "src/runtime/errors.ts",
        "src/runtime/capability.ts",
        "src/runtime/sentry_redact.ts",
        "src/auth/middleware.ts",
        "src/auth/credentials.ts",
        "src/tools/search.ts",
        "src/tools/fetch.ts",
        "src/tools/list_objects.ts",
        "src/tools/index.ts",
    }
    missing = canonical - set(on_disk)
    assert not missing, f"missing canonical files: {sorted(missing)}"
    # File count in expected band.
    assert 25 <= len(on_disk) <= 32


@pytest.mark.asyncio
async def test_stage_e_run_orchestrator_invokes_phase_6_validate(
    e2e_final_tools_minimal: list[FinalTool],
    e2e_pass_5_output: Pass5Output,
    e2e_pass_1_output: Pass1Output,
    e2e_pass_0_output: Pass0Output,
    e2e_raw_ir: RawIR,
    tmp_path: Path,
) -> None:
    """Full Stage E run() reaches Phase 6 (tsc) and validates clean.

    Plan 04-12 drained the Plan 04-11 deferred template TS errors —
    ``tsc --noEmit`` now passes. The orchestrator returns a populated
    ``StageEManifest`` instead of raising ``StageETsError``.
    """
    output_dir = tmp_path / "stage-e-e2e"
    manifest = await stage_e_run(
        final_tools=e2e_final_tools_minimal,
        pass_5_output=e2e_pass_5_output,
        pass_4_output=None,
        pass_3_output=None,
        pass_2_output=None,
        pass_1_output=e2e_pass_1_output,
        pass_0_output=e2e_pass_0_output,
        raw_ir=e2e_raw_ir,
        output_dir=output_dir,
        engine_version="0.1.0",
        spec_url="https://example.test/spec.json",
        spec_slug="stripe",
        spec_servers=[],
    )
    # Files were written (Phases 1-5 ran before Phase 6 validated).
    assert (output_dir / "src" / "tools" / "search.ts").exists()
    assert (output_dir / "package.json").exists()
    # Manifest is populated with Phase-6 results.
    assert manifest.ts_compile_passed is True
    assert manifest.bundle_size_kb > 0
    assert len(manifest.files) >= 25
    # StageETsError stays available on the exception surface for
    # future retry-orchestration tests; we just don't trigger it here.
    assert StageETsError is not None


@pytest.mark.asyncio
async def test_stage_e_run_signature_accepts_optional_pass_2_3_4(
    e2e_final_tools_minimal: list[FinalTool],
    e2e_pass_5_output: Pass5Output,
    e2e_pass_1_output: Pass1Output,
    e2e_pass_0_output: Pass0Output,
    e2e_raw_ir: RawIR,
    tmp_path: Path,
) -> None:
    """Plan 04-11 truths block: pass_2/3/4 forward-compat parameters
    are accepted (None today; v1 renderers don't consume them)."""
    output_dir = tmp_path / "stage-e-e2e"
    manifest = await stage_e_run(
        final_tools=e2e_final_tools_minimal,
        pass_5_output=e2e_pass_5_output,
        pass_4_output=None,
        pass_3_output=None,
        pass_2_output=None,
        pass_1_output=e2e_pass_1_output,
        pass_0_output=e2e_pass_0_output,
        raw_ir=e2e_raw_ir,
        output_dir=output_dir,
        engine_version="0.1.0",
        spec_url="https://example.test/spec.json",
        spec_slug="stripe",
        spec_servers=[],
    )
    # Phases 1-5 wrote files; Phase 6 validated; manifest is populated.
    assert (output_dir / "src" / "tools" / "search.ts").exists()
    assert manifest.ts_compile_passed is True


@pytest.mark.asyncio
async def test_stage_e_run_uses_passthrough_auth_mode_default(
    e2e_final_tools_minimal: list[FinalTool],
    e2e_pass_5_output: Pass5Output,
    e2e_pass_1_output: Pass1Output,
    e2e_pass_0_output: Pass0Output,
    e2e_raw_ir: RawIR,
    tmp_path: Path,
) -> None:
    """select_auth_mode defaults to passthrough on http_bearer Pass 0."""
    output_dir = tmp_path / "stage-e-e2e"
    await stage_e_run(
        final_tools=e2e_final_tools_minimal,
        pass_5_output=e2e_pass_5_output,
        pass_4_output=None,
        pass_3_output=None,
        pass_2_output=None,
        pass_1_output=e2e_pass_1_output,
        pass_0_output=e2e_pass_0_output,
        raw_ir=e2e_raw_ir,
        output_dir=output_dir,
        engine_version="0.1.0",
        spec_url="https://api.stripe.com/openapi/spec3.json",
        spec_slug="stripe",
        spec_servers=[],
    )
    middleware = (output_dir / "src" / "auth" / "middleware.ts").read_text("utf-8")
    # passthrough mode uses X-Upstream-Auth header convention
    assert "X-Upstream-Auth" in middleware or "passthrough" in middleware.lower()


# ──────────────── Plan 04-14 — template content guards for D-1 + D-2 ─────────────
#
# These lighter-weight checks run in the fast CI lane (no wrangler spawn) so
# D-1 + D-2 template regressions are caught before the heavier Wave-0 test.


@pytest.mark.asyncio
async def test_stage_e_rendered_server_ts_calls_register_all_tools(
    e2e_final_tools_minimal: list[FinalTool],
    e2e_pass_5_output: Pass5Output,
    e2e_pass_1_output: Pass1Output,
    e2e_pass_0_output: Pass0Output,
    e2e_raw_ir: RawIR,
    tmp_path: Path,
) -> None:
    """Rendered src/server.ts contains 'registerAllTools(server)' (D-1 guard).

    D-1 root cause: server.ts.j2 iterated final_tools via Jinja2 for-loop but
    Stage E Phase 1 scaffold pass never received final_tools in its render
    context — the loop fell through to the empty default and no tools were
    registered.  Fix: delegate to registerAllTools(server) (Plan 04-10 helper).
    """
    output_dir = tmp_path / "stage-e-d1-guard"
    await stage_e_run(
        final_tools=e2e_final_tools_minimal,
        pass_5_output=e2e_pass_5_output,
        pass_4_output=None,
        pass_3_output=None,
        pass_2_output=None,
        pass_1_output=e2e_pass_1_output,
        pass_0_output=e2e_pass_0_output,
        raw_ir=e2e_raw_ir,
        output_dir=output_dir,
        engine_version="0.1.0",
        spec_url="https://api.stripe.com/openapi/spec3.json",
        spec_slug="stripe",
        spec_servers=[],
    )
    server_ts = (output_dir / "src" / "server.ts").read_text("utf-8")
    assert "registerAllTools(server)" in server_ts, (
        "D-1 regression: server.ts does not call registerAllTools(server). "
        "tools/list will return an empty array at runtime."
    )


@pytest.mark.asyncio
async def test_stage_e_rendered_server_ts_uses_stateless_transport(
    e2e_final_tools_minimal: list[FinalTool],
    e2e_pass_5_output: Pass5Output,
    e2e_pass_1_output: Pass1Output,
    e2e_pass_0_output: Pass0Output,
    e2e_raw_ir: RawIR,
    tmp_path: Path,
) -> None:
    """Rendered src/server.ts contains 'sessionIdGenerator: undefined' (D-2 guard).

    D-2 root cause: sessionIdGenerator: () => crypto.randomUUID() is stateful
    mode — incompatible with CF Workers per-request isolates.  Fix: set
    sessionIdGenerator: undefined (SDK stateless mode, recommended for serverless
    per webStandardStreamableHttp.d.ts:46).
    """
    output_dir = tmp_path / "stage-e-d2-guard"
    await stage_e_run(
        final_tools=e2e_final_tools_minimal,
        pass_5_output=e2e_pass_5_output,
        pass_4_output=None,
        pass_3_output=None,
        pass_2_output=None,
        pass_1_output=e2e_pass_1_output,
        pass_0_output=e2e_pass_0_output,
        raw_ir=e2e_raw_ir,
        output_dir=output_dir,
        engine_version="0.1.0",
        spec_url="https://api.stripe.com/openapi/spec3.json",
        spec_slug="stripe",
        spec_servers=[],
    )
    server_ts = (output_dir / "src" / "server.ts").read_text("utf-8")
    assert "sessionIdGenerator: undefined" in server_ts, (
        "D-2 regression: server.ts uses stateful sessionIdGenerator. "
        "Multi-turn MCP sessions will fail with 'Server not initialized' on CF Workers."
    )
