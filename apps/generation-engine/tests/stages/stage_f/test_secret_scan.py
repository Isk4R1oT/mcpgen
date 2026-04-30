"""F1 check #9 — gitleaks secret_scan tests (Plan 05-04 Task 1).

CONTEXT D-05 step 9 + D-06 (terminal SECRETS_LEAKED).

Tests skip cleanly when gitleaks binary is absent on PATH (CI without
homebrew install). Local dev with `brew install gitleaks` runs all paths.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from mcpgen_engine.stages.stage_f.f1_checks.secret_scan import (
    SecretScanResult,
    run_secret_scan,
)
from mcpgen_engine.stages.stage_f.failure_patterns import F1_CHECK_TO_RETRY

GITLEAKS_AVAILABLE = shutil.which("gitleaks") is not None
_skip_no_gitleaks = pytest.mark.skipif(not GITLEAKS_AVAILABLE, reason="gitleaks binary not on PATH")


@_skip_no_gitleaks
async def test_clean_dir_passes(tmp_path: Path) -> None:
    """A directory with only innocuous code returns passed=True, findings=[]."""
    (tmp_path / "main.ts").write_text(
        'console.log("hello world");\nexport default 42;\n', encoding="utf-8"
    )
    result = await run_secret_scan(tmp_path)
    assert isinstance(result, SecretScanResult)
    assert result.passed is True
    assert result.error is None
    assert result.findings == []


@_skip_no_gitleaks
async def test_stripe_key_detected(tmp_path: Path) -> None:
    """A Stripe sk_live_ token must be detected and reported as SECRETS_LEAKED."""
    leaky = tmp_path / "config.ts"
    # Real-shape Stripe live secret (from gitleaks test vectors); redacted by --redact.
    leaky.write_text(
        'const KEY = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";\nexport default KEY;\n',
        encoding="utf-8",
    )
    result = await run_secret_scan(tmp_path)
    assert result.passed is False
    assert result.error == "SECRETS_LEAKED"
    assert len(result.findings) >= 1
    # gitleaks --redact replaces the secret value with "REDACTED" — verify
    # we are NOT leaking the raw key.
    raw = "4eC39HqLyjWDarjtT1zdp7dc"
    for finding in result.findings:
        assert raw not in str(finding), "raw secret value leaked through redaction"


@_skip_no_gitleaks
async def test_github_pat_detected(tmp_path: Path) -> None:
    """A GitHub PAT (ghp_) prefix must be detected by gitleaks default rules."""
    leaky = tmp_path / "auth.ts"
    # Realistic-entropy PAT — gitleaks `github-pat` rule requires non-trivial
    # Shannon entropy on the suffix (the all-lowercase placeholder used in the
    # plan example fails the entropy floor of the default rule).
    leaky.write_text(
        'const TOKEN = "ghp_p0M4kEtHe5BE7Ab1ldUz9HjLnmK9Lk1AbCdE";\n',
        encoding="utf-8",
    )
    result = await run_secret_scan(tmp_path)
    assert result.passed is False
    assert result.error == "SECRETS_LEAKED"


async def test_subprocess_timeout_handled(tmp_path: Path) -> None:
    """If gitleaks hangs >timeout, return SECRET_SCAN_TIMEOUT cleanly."""
    if not GITLEAKS_AVAILABLE:
        pytest.skip("gitleaks not installed")

    # Mock create_subprocess_exec to return a process whose communicate() hangs.
    class _FakeProc:
        returncode: int | None = None

        async def communicate(self) -> tuple[bytes, bytes]:
            # Sleep longer than the timeout we'll pass so wait_for raises.
            import asyncio as _aio

            await _aio.sleep(5)
            return (b"", b"")

        def kill(self) -> None:
            self.returncode = -9

        async def wait(self) -> int:
            return -9

    fake = _FakeProc()
    with patch(
        "mcpgen_engine.stages.stage_f.f1_checks.secret_scan." "asyncio.create_subprocess_exec",
        new=AsyncMock(return_value=fake),
    ):
        result = await run_secret_scan(tmp_path, timeout_seconds=0.1)
    assert result.passed is False
    assert result.error == "SECRET_SCAN_TIMEOUT"


def test_secret_scan_retry_target_is_terminal() -> None:
    """SECRETS_LEAKED is TERMINAL per D-06: retry target must be None."""
    assert F1_CHECK_TO_RETRY["SECRETS_LEAKED"] is None


async def test_gitleaks_missing_returns_explicit_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """When gitleaks binary is absent on PATH, return GITLEAKS_NOT_INSTALLED."""
    monkeypatch.setattr(
        "mcpgen_engine.stages.stage_f.f1_checks.secret_scan.shutil.which",
        lambda _name: None,
    )
    result = await run_secret_scan(tmp_path)
    assert result.passed is False
    assert result.error == "GITLEAKS_NOT_INSTALLED"
