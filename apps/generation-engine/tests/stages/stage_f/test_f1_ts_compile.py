"""F1 check #11 — tsc --noEmit subprocess tests (Plan 05-04 Task 2).

CONTEXT D-05 step 11. The pure-Python `parse_tsc_output` test runs without any
toolchain; integration tests that spawn `npx tsc` carry `requires_wrangler` so
they skip cleanly on CI machines without the pre-warmed `node_modules`.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from mcpgen_engine.stages.stage_f.f1_checks.ts_compile import (
    TsCompileResult,
    TsError,
    parse_tsc_output,
    run_ts_compile,
)
from mcpgen_engine.stages.stage_f.failure_patterns import F1_CHECK_TO_RETRY


def test_parse_tsc_output_extracts_standard_error_line() -> None:
    """Parser extracts file/line/col/code/message from standard tsc stdout."""
    sample = (
        "src/foo.ts(12,4): error TS2322: Type 'string' is not assignable to type 'number'.\n"
        "src/bar.ts(3,1): error TS1109: Expression expected.\n"
    )
    errors = parse_tsc_output(sample)
    assert len(errors) == 2
    assert errors[0] == TsError(
        file="src/foo.ts",
        line=12,
        col=4,
        code="TS2322",
        message="Type 'string' is not assignable to type 'number'.",
    )
    assert errors[1].code == "TS1109"
    assert errors[1].file == "src/bar.ts"


def test_parse_tsc_output_ignores_non_error_lines() -> None:
    """Lines that don't match the tsc error format are ignored (no false positives)."""
    sample = (
        "Found 0 errors. Watching for file changes.\n"
        "Some progress message that should not parse as an error.\n"
    )
    errors = parse_tsc_output(sample)
    assert errors == []


def test_parse_tsc_output_handles_empty_input() -> None:
    """Empty / whitespace input returns empty list (no exceptions)."""
    assert parse_tsc_output("") == []
    assert parse_tsc_output("\n\n   \n") == []


def test_ts_compile_retry_target() -> None:
    """TS_COMPILE_FAILED -> stage_e per D-06."""
    assert F1_CHECK_TO_RETRY["TS_COMPILE_FAILED"] == "stage_e"


@pytest.mark.requires_wrangler
async def test_ts_compile_pass_clean_project(tmp_path: Path) -> None:
    """Smoke: a tsconfig + a single valid `.ts` file compiles cleanly.

    Skipped when `npx` is missing; the pre-warmed node_modules is also assumed
    to be present alongside `packages/codegen-templates/`.
    """
    if shutil.which("npx") is None:
        pytest.skip("npx not on PATH")
    (tmp_path / "tsconfig.json").write_text(
        '{"compilerOptions": {"strict": true, "noEmit": true, "target": "ES2022", '
        '"module": "ES2022", "moduleResolution": "node", "skipLibCheck": true}}',
        encoding="utf-8",
    )
    (tmp_path / "index.ts").write_text("const x: number = 42;\nconsole.log(x);\n", encoding="utf-8")
    result = await run_ts_compile(tmp_path)
    assert isinstance(result, TsCompileResult)
    assert result.passed is True
    assert result.error is None
    assert result.errors == []


@pytest.mark.requires_wrangler
async def test_ts_compile_detects_type_error(tmp_path: Path) -> None:
    """Type-mismatch in code -> passed=False, error=TS_COMPILE_FAILED, errors[]."""
    if shutil.which("npx") is None:
        pytest.skip("npx not on PATH")
    (tmp_path / "tsconfig.json").write_text(
        '{"compilerOptions": {"strict": true, "noEmit": true, "target": "ES2022", '
        '"module": "ES2022", "moduleResolution": "node", "skipLibCheck": true}}',
        encoding="utf-8",
    )
    (tmp_path / "index.ts").write_text(
        'const x: number = "this is a string";\nconsole.log(x);\n',
        encoding="utf-8",
    )
    result = await run_ts_compile(tmp_path)
    assert result.passed is False
    assert result.error == "TS_COMPILE_FAILED"
    assert len(result.errors) >= 1
    assert all(isinstance(e, TsError) for e in result.errors)


async def test_ts_compile_timeout_handled(tmp_path: Path) -> None:
    """If tsc hangs >timeout, return TS_COMPILE_TIMEOUT cleanly."""

    class _FakeProc:
        returncode: int | None = None

        async def communicate(self) -> tuple[bytes, bytes]:
            import asyncio as _aio

            await _aio.sleep(5)
            return (b"", b"")

        def kill(self) -> None:
            self.returncode = -9

        async def wait(self) -> int:
            return -9

    fake = _FakeProc()
    with patch(
        "mcpgen_engine.stages.stage_f.f1_checks.ts_compile." "asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=fake),
    ):
        result = await run_ts_compile(tmp_path, timeout_seconds=0.1)
    assert result.passed is False
    assert result.error == "TS_COMPILE_TIMEOUT"


def test_parse_tsc_output_caps_to_50_errors_at_module_level() -> None:
    """parse_tsc_output itself does NOT cap; the orchestrator does. Verify shape."""
    # Generate 60 lines.
    lines = [f"src/x{i}.ts({i},1): error TS{2000 + i}: Diagnostic {i}.\n" for i in range(60)]
    parsed = parse_tsc_output("".join(lines))
    assert len(parsed) == 60  # parser returns all; cap is applied in run_ts_compile
