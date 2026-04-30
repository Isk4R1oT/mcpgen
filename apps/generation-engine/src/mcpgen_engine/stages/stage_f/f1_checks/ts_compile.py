"""F1 check #11 — TypeScript compile (CONTEXT D-05 step 11).

Invokes ``npx tsc --noEmit -p tsconfig.json`` against the generated server
directory. Reuses Phase 4 D-39 pre-warmed ``packages/codegen-templates/node_modules``
via ``stages/stage_e/validate.py::run_tsc_no_emit`` style invocation.

This module is intentionally a thin sibling to Phase 4's tsc wrapper rather
than a re-export: Phase 4 raises typed ``StageETsError`` exceptions because
codegen treats tsc errors as a fail-stop; F1 instead returns a structured
``TsCompileResult`` so the orchestrator can record an outcome row alongside
the other 10 checks.

Failure mapping (CONTEXT D-06):
- ``TS_COMPILE_FAILED`` -> Stage E retry (template bug — Pass outputs are valid)
- ``TS_COMPILE_TIMEOUT`` -> NOT in the retry table; orchestrator surfaces the
  timeout as a generic F1 failure for human investigation.
"""

from __future__ import annotations

import asyncio
import contextlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import structlog

_log = structlog.get_logger(__name__)

# tsc default error format (verified against tsc 5.x; same as Phase 4 D-39):
#   src/foo.ts(12,4): error TS2322: Type 'X' is not assignable to type 'Y'.
# We tolerate Windows backslashes in the path for forward-compat (the engine
# only runs on macOS/Linux today, but the regex shouldn't reject paths).
_TSC_ERROR_RE: Final[re.Pattern[str]] = re.compile(
    r"^(?P<file>[^()]+)\((?P<line>\d+),(?P<col>\d+)\):\s+error\s+(?P<code>TS\d+):\s+(?P<message>.+)$"
)

# CONTEXT D-05 step 11: first-50 errors only — keeps SSE payloads bounded
# while giving Stage E retry enough context to reproduce the template bug.
_MAX_ERRORS: int = 50


@dataclass(frozen=True)
class TsError:
    """One typed-tsc error row."""

    file: str
    line: int
    col: int
    code: str
    message: str


@dataclass(frozen=True)
class TsCompileResult:
    """Outcome of running tsc against ``generated_dir``."""

    passed: bool
    error: str | None
    errors: list[TsError] = field(default_factory=list)


def parse_tsc_output(stdout: str) -> list[TsError]:
    """Extract structured errors from tsc stdout/stderr text.

    Parser is line-oriented and skips lines that don't match the error format
    (informational / progress lines from tsc are silently ignored). Caller is
    responsible for capping the returned list (we keep this pure to make
    truncation visible in the orchestrator code).
    """
    out: list[TsError] = []
    for line in stdout.splitlines():
        m = _TSC_ERROR_RE.match(line)
        if m is None:
            continue
        out.append(
            TsError(
                file=m.group("file").strip(),
                line=int(m.group("line")),
                col=int(m.group("col")),
                code=m.group("code"),
                message=m.group("message").strip(),
            )
        )
    return out


async def run_ts_compile(
    generated_dir: Path,
    *,
    timeout_seconds: float = 30.0,
) -> TsCompileResult:
    """Spawn ``npx tsc --noEmit -p tsconfig.json`` in ``generated_dir``.

    Pre-conditions:
    - ``generated_dir`` contains a valid ``tsconfig.json`` (Stage E ensures this).
    - ``packages/codegen-templates/node_modules`` is pre-warmed (CONTEXT D-39 +
      Phase 4 D-39 ``ensure_codegen_node_modules``); the resolver finds tsc
      through ``npx``'s standard lookup.

    Failure modes:
    - ``TS_COMPILE_TIMEOUT`` — subprocess exceeded ``timeout_seconds`` (default
      30s, matches CONTEXT D-05 budget); proc killed + waited up to 5s.
    - ``TS_COMPILE_FAILED`` — non-zero return code OR any parsed error rows.
    """
    # NOTE: we intentionally do NOT call shutil.which("npx") here — the orchestrator
    # is invoked AFTER Stage E (which already validated npx availability via the
    # tsc validation phase). A missing npx surfaces as a TS_COMPILE_FAILED with
    # the OSError captured in the details (rare; cheaper than re-checking PATH
    # on every F1 run).
    try:
        proc = await asyncio.create_subprocess_exec(
            "npx",
            "tsc",
            "--noEmit",
            "-p",
            "tsconfig.json",
            cwd=str(generated_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        _log.warning(
            "f1.ts_compile.npx_missing",
            generated_dir=str(generated_dir),
            error=str(exc),
        )
        return TsCompileResult(
            passed=False,
            error="TS_COMPILE_FAILED",
            errors=[],
        )

    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(), timeout=timeout_seconds
        )
    except TimeoutError:
        proc.kill()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(proc.wait(), timeout=5.0)
        _log.warning(
            "f1.ts_compile.timeout",
            generated_dir=str(generated_dir),
            timeout_seconds=timeout_seconds,
        )
        return TsCompileResult(
            passed=False,
            error="TS_COMPILE_TIMEOUT",
            errors=[],
        )

    # tsc may emit error rows on stdout (default) OR stderr (with --pretty);
    # combine both before parsing for robustness.
    combined = (
        stdout_bytes.decode("utf-8", errors="replace")
        + "\n"
        + stderr_bytes.decode("utf-8", errors="replace")
    )
    errors = parse_tsc_output(combined)[:_MAX_ERRORS]
    if proc.returncode != 0 or errors:
        _log.warning(
            "f1.ts_compile.failed",
            generated_dir=str(generated_dir),
            error_count=len(errors),
            returncode=proc.returncode,
        )
        return TsCompileResult(
            passed=False,
            error="TS_COMPILE_FAILED",
            errors=errors,
        )
    return TsCompileResult(passed=True, error=None, errors=[])
