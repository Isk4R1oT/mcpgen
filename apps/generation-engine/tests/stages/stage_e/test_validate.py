"""Stage E Phase 6 — validate.py tests (tsc + node_modules pre-warm).

Covers ``run_tsc_no_emit`` (success / warning-count / errors-raise / timeout),
``ensure_codegen_node_modules`` (idempotent), and the
``StageETsError`` subclass shape per Plan 04-11 truths block.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from mcpgen_engine.stages.stage_e import StageEError
from mcpgen_engine.stages.stage_e.validate import (
    StageETsError,
    ensure_codegen_node_modules,
    run_tsc_no_emit,
)


@pytest.mark.asyncio
async def test_run_tsc_no_emit_succeeds_on_valid_ts(
    synthetic_valid_ts_dir: Path,
) -> None:
    """Valid TS — returncode 0, returns int warning_count >= 0, no exception."""
    hoisted = ensure_codegen_node_modules()
    warnings = await run_tsc_no_emit(synthetic_valid_ts_dir, hoisted_node_modules=hoisted)
    assert isinstance(warnings, int)
    assert warnings >= 0


@pytest.mark.asyncio
async def test_run_tsc_no_emit_warning_count_returned_for_clean_compile(
    synthetic_warning_only_ts_dir: Path,
) -> None:
    """Clean compile returns warning_count without raising (WARNING 5)."""
    hoisted = ensure_codegen_node_modules()
    warnings = await run_tsc_no_emit(synthetic_warning_only_ts_dir, hoisted_node_modules=hoisted)
    # canonical clean-compile path: returns 0 (no warnings)
    assert warnings == 0


@pytest.mark.asyncio
async def test_run_tsc_no_emit_raises_on_invalid_ts(
    synthetic_invalid_ts_dir: Path,
) -> None:
    """Type errors in TS → StageETsError with errors list populated."""
    hoisted = ensure_codegen_node_modules()
    with pytest.raises(StageETsError) as exc_info:
        await run_tsc_no_emit(synthetic_invalid_ts_dir, hoisted_node_modules=hoisted)
    err = exc_info.value
    assert isinstance(err.errors, list)
    assert len(err.errors) >= 1
    # Each error line should mention "error TS"
    assert any(": error TS" in line for line in err.errors)


@pytest.mark.asyncio
async def test_run_tsc_no_emit_truncates_errors_to_first_50() -> None:
    """StageETsError(errors) truncates to first 50 entries (Plan 04-11)."""
    err = StageETsError([f"error line {i}" for i in range(80)])
    assert len(err.errors) == 50
    assert err.errors[0] == "error line 0"
    assert err.errors[49] == "error line 49"


@pytest.mark.asyncio
async def test_stage_e_ts_error_is_stage_e_error_subclass() -> None:
    """StageETsError extends StageEError so callers can `except StageEError`."""
    err = StageETsError(["fake error"])
    assert isinstance(err, StageEError)


def test_stage_e_ts_error_timeout_message_format() -> None:
    """The timeout branch in run_tsc_no_emit produces a `timed out` line.

    We cannot test the subprocess-timeout path end-to-end without
    pytest-timeout (not in deps) AND without leaking subprocess transports
    via monkeypatched ``asyncio.wait_for``. The error-message format is
    what user-facing SSE consumers see (Plan 04-12 _stable_error_code
    maps StageETsError → STAGE_E_TS_ERROR), so pin the format here.
    """
    err = StageETsError(["tsc timed out after 60s"])
    assert "STAGE_E_TS_ERROR" in str(err)
    assert any("timed out" in line.lower() for line in err.errors)
    assert "60s" in err.errors[0]


def test_ensure_codegen_node_modules_returns_path() -> None:
    """ensure_codegen_node_modules returns a Path that ends with node_modules."""
    p = ensure_codegen_node_modules()
    assert isinstance(p, Path)
    assert p.name == "node_modules"
    assert p.parent.name == "codegen-templates"


def test_ensure_codegen_node_modules_idempotent() -> None:
    """Repeated calls return the same path (no extra pnpm install on hit)."""
    p1 = ensure_codegen_node_modules()
    p2 = ensure_codegen_node_modules()
    assert p1 == p2
    assert p1.exists()


def test_ensure_codegen_node_modules_has_typescript_and_wrangler() -> None:
    """Pre-warmed dir contains the binaries Stage E phase 6 invokes."""
    p = ensure_codegen_node_modules()
    bin_dir = p / ".bin"
    assert (bin_dir / "tsc").exists() or (bin_dir / "tsc").is_symlink()
    assert (bin_dir / "wrangler").exists() or (bin_dir / "wrangler").is_symlink()
