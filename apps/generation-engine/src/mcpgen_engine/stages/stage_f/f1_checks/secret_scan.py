"""F1 check #9 — gitleaks secret scan (CONTEXT D-05 step 9, Pitfall #12).

Invokes ``gitleaks detect --no-git --redact --report-format json --report-path -``
on the generated server directory. Default rules cover Stripe ``sk_live_``,
GitHub PATs (``ghp_`` / ``gho_`` / ``ghs_``), AWS access keys, and ~150 other
secret patterns (RESEARCH §3.3 + §6.4 — pinned to 8.30.1 in Plan 05-02).

``--redact`` ensures findings carry the literal string ``"REDACTED"`` instead
of the raw secret value, so the F1 outcome can be safely logged + surfaced
through SSE without re-leaking.

``SECRETS_LEAKED`` is TERMINAL per CONTEXT D-06 — no retry path. The hit means
an operator-supplied credential made it into generated code (template misuse,
fixture leak), not a deterministic template bug; the operator must intervene.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import structlog

_log = structlog.get_logger(__name__)

# Cap stored findings to keep the F1 outcome payload bounded; gitleaks may report
# hundreds of hits on a misconfigured spec, but for retry/log purposes the first
# 20 are sufficient context.
_MAX_FINDINGS: int = 20


@dataclass(frozen=True)
class SecretScanResult:
    """Outcome of the gitleaks secret-scan check.

    ``findings`` carries up to ``_MAX_FINDINGS`` redacted match entries (raw
    gitleaks JSON dicts) for surfacing in QualityReport.warnings + Sentry
    breadcrumbs. ``details`` is a short human-readable summary.
    """

    passed: bool
    error: str | None
    findings: list[dict[str, Any]] = field(default_factory=list)
    details: str = ""


async def run_secret_scan(
    generated_dir: Path,
    *,
    timeout_seconds: float = 10.0,
) -> SecretScanResult:
    """Run gitleaks 8.x against ``generated_dir`` and return the outcome.

    Subprocess command:

        gitleaks detect
            --source <generated_dir>
            --no-git              # treat as plain dir (no .git history)
            --redact              # 100% redaction in stdout
            --report-format json
            --report-path -       # JSON to stdout
            --exit-code 0         # always exit 0; we parse findings ourselves

    Failure modes:
    - ``GITLEAKS_NOT_INSTALLED`` — binary missing on PATH; F1 outcome surfaces
      this distinctly so operators install it (Plan 05-02 pinned via Brewfile).
    - ``SECRET_SCAN_TIMEOUT`` — subprocess exceeded ``timeout_seconds``; killed
      and waited at most 5s for cleanup (Pitfall #16 — never leave zombies).
    - ``SECRET_SCAN_OUTPUT_INVALID`` — gitleaks produced non-JSON stdout
      (corrupted run; rare).
    - ``SECRETS_LEAKED`` — one or more findings; **terminal** per D-06.
    """
    if shutil.which("gitleaks") is None:
        return SecretScanResult(
            passed=False,
            error="GITLEAKS_NOT_INSTALLED",
            findings=[],
            details=(
                "gitleaks binary not on PATH; install via "
                "`brew install gitleaks` (Plan 05-02 pins 8.30.x)"
            ),
        )

    # asyncio.create_subprocess_exec is the asyncio-friendly subprocess primitive
    # (RESEARCH §3.2). All arguments are literal flags + an absolute path — no
    # shell metacharacters, no untrusted inputs (S603-safe).
    proc = await asyncio.create_subprocess_exec(
        "gitleaks",
        "detect",
        "--source",
        str(generated_dir),
        "--no-git",
        "--redact",
        "--report-format",
        "json",
        "--report-path",
        "-",
        "--exit-code",
        "0",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout_bytes, _stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
    except TimeoutError:
        proc.kill()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(proc.wait(), timeout=5.0)
        _log.warning(
            "f1.secret_scan.timeout",
            generated_dir=str(generated_dir),
            timeout_seconds=timeout_seconds,
        )
        return SecretScanResult(
            passed=False,
            error="SECRET_SCAN_TIMEOUT",
            findings=[],
            details=f"gitleaks exceeded {timeout_seconds}s wall-clock budget",
        )

    raw = stdout_bytes.decode("utf-8", errors="replace").strip()
    if not raw:
        # Empty output = no findings (gitleaks 8.x emits "[]" for clean runs;
        # we accept empty too for forward compatibility).
        return SecretScanResult(passed=True, error=None, findings=[], details="OK")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        _log.warning(
            "f1.secret_scan.output_invalid",
            generated_dir=str(generated_dir),
            error=str(exc),
        )
        return SecretScanResult(
            passed=False,
            error="SECRET_SCAN_OUTPUT_INVALID",
            findings=[],
            details=f"gitleaks produced non-JSON output ({exc!s})",
        )

    if not isinstance(parsed, list):
        return SecretScanResult(
            passed=False,
            error="SECRET_SCAN_OUTPUT_INVALID",
            findings=[],
            details=f"gitleaks JSON was not a list (got {type(parsed).__name__})",
        )

    findings: list[dict[str, Any]] = [f for f in parsed if isinstance(f, dict)]
    if findings:
        _log.warning(
            "f1.secret_scan.leaked",
            generated_dir=str(generated_dir),
            count=len(findings),
        )
        return SecretScanResult(
            passed=False,
            error="SECRETS_LEAKED",
            findings=findings[:_MAX_FINDINGS],
            details=(
                f"{len(findings)} potential secret(s) detected (redacted) — "
                "terminal failure per D-06; operator must intervene"
            ),
        )
    return SecretScanResult(passed=True, error=None, findings=[], details="OK")
