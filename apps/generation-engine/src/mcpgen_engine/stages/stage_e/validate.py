"""Stage E Phase 6 — TypeScript validation + bundle-size gate (CONTEXT D-27 + D-28).

This module owns the LAST phase of the Stage E pipeline:

- ``run_tsc_no_emit(output_dir, hoisted_node_modules)`` runs
  ``npx tsc --noEmit -p tsconfig.json`` in the generated dir using the
  pre-warmed ``packages/codegen-templates/node_modules`` (CONTEXT D-39).
  Returns the warning count on success; raises ``StageETsError`` on errors
  or timeout (WARNING 5 semantics: errors raise, warnings count silently).

- ``capture_bundle_size_kb(output_dir, hoisted_node_modules)`` runs
  ``npx wrangler deploy --dry-run --outdir <tmp>`` and parses the
  ``gzip: X.YZ KiB`` line from stdout (verified against wrangler 4.85.0,
  RESEARCH Code Example 5).

- ``gate_bundle_size(size_kb, raw_ir)`` enforces the Phase 1 D-13 launch
  thresholds (PASS_KB / WARN_KB) imported from
  ``packages/contracts/src/launch-criteria.ts``: < 800 pass / 800-950 warn /
  > 950 hard fail with ``StageEBundleTooLargeError`` carrying
  ``compute_top_level_path_prefixes(raw_ir)`` suggested splits.

- ``ensure_codegen_node_modules()`` returns the path to the pre-warmed
  ``packages/codegen-templates/node_modules`` directory; runs
  ``pnpm install`` once if missing. Idempotent on repeat calls.

Subclass exceptions ``StageETsError`` and ``StageEBundleTooLargeError`` both
extend ``StageEError`` so callers can ``except StageEError`` catch-all.
The user-facing SSE error code mapping (``STAGE_E_TS_ERROR`` /
``STAGE_E_BUNDLE_TOO_LARGE`` / ``STAGE_E_FAILED``) is the responsibility
of plan 04-12's ``_stable_error_code()`` helper — this module ONLY raises
the typed exceptions.

References:
- 04-CONTEXT.md D-27 (tsc validation) + D-28 (wrangler bundle gate) + D-39
  (node_modules pre-warm).
- 04-RESEARCH.md §"Code Examples" Code Example 4 + Code Example 5.
- packages/contracts/src/launch-criteria.ts (Phase 1 D-13 invariant).
- docs/mcpgen-stage-e-design.md §9 phase 6.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Final

import structlog
from mcpgen_ir.types import RawIR

from mcpgen_engine.passes.pass_0.validation import cluster_by_path_prefix
from mcpgen_engine.stages.stage_e import StageEError

_log = structlog.get_logger(__name__)

# Phase 1 D-13 invariant: PASS_KB / WARN_KB mirror
# packages/contracts/src/launch-criteria.ts. The launch-criteria-assertion
# CI step + pre-commit hook block silent threshold drift (Pitfall #29
# "AI-fix-by-lowering-threshold"). DO NOT change values here without a
# paired docs/decisions/<YYYY-MM-DD>-<slug>.md entry.
PASS_KB: Final[int] = 800
WARN_KB: Final[int] = 950

# wrangler 4.85.0 stdout: "Total Upload: 0.17 KiB / gzip: 0.15 KiB"
# (RESEARCH Code Example 5 — permissive on whitespace).
_BUNDLE_SIZE_RE: Final[re.Pattern[str]] = re.compile(r"gzip:\s*([\d.]+)\s*KiB")

# Repo-root-relative path to the pre-warmed node_modules. Computed lazily
# in ``ensure_codegen_node_modules`` so importing this module never spawns
# a subprocess.
_CODEGEN_TEMPLATES_DIRNAME: Final[str] = "codegen-templates"


class StageETsError(StageEError):
    """Raised when ``tsc --noEmit`` reports errors or times out.

    Carries the first 50 ``": error TS"`` lines from tsc output. Plan 04-12
    maps this to SSE error code ``STAGE_E_TS_ERROR``. Per CONTEXT D-27 we
    do NOT auto-fix tsc errors — surface to the planner / human investigator.
    """

    def __init__(self, errors: list[str]) -> None:
        self.errors: list[str] = list(errors)[:50]
        super().__init__(
            f"STAGE_E_TS_ERROR: tsc --noEmit failed with {len(errors)} error "
            f"line(s) (showing first {len(self.errors)})"
        )


class StageEBundleTooLargeError(StageEError):
    """Raised when gzipped bundle exceeds ``WARN_KB`` (950 KiB).

    Carries ``size_kb`` and the suggested top-level path prefixes per
    Phase 2 D-18 multi-server-split heuristic. Plan 04-12 maps this to SSE
    error code ``STAGE_E_BUNDLE_TOO_LARGE`` and surfaces
    ``MULTI_SERVER_SPLIT_REQUIRED`` in the user-facing message.
    """

    def __init__(self, size_kb: float, suggested_splits: list[str]) -> None:
        self.size_kb: float = size_kb
        self.suggested_splits: list[str] = list(suggested_splits)
        super().__init__(
            f"STAGE_E_BUNDLE_TOO_LARGE: gzipped bundle {size_kb} KiB exceeds "
            f"{WARN_KB} KiB ceiling — MULTI_SERVER_SPLIT_REQUIRED. "
            f"Suggested splits: {self.suggested_splits}"
        )


def _find_codegen_templates_dir() -> Path:
    """Walk upward from this file to find ``packages/codegen-templates/``.

    Pre-condition: the file lives under
    ``apps/generation-engine/src/mcpgen_engine/stages/stage_e/`` of the
    monorepo. We walk parents until we find a sibling
    ``packages/codegen-templates`` directory, then return that path.

    Raises ``StageEError`` if the directory cannot be located — this is a
    repository layout violation and indicates the engine is being invoked
    from outside the monorepo checkout (which is unsupported in v1).
    """
    here = Path(__file__).resolve()
    current = here.parent
    while current != current.parent:
        candidate = current / "packages" / _CODEGEN_TEMPLATES_DIRNAME
        if candidate.is_dir():
            return candidate
        current = current.parent
    raise StageEError(
        "STAGE_E_FAILED: cannot locate packages/codegen-templates/ in any "
        f"ancestor of {here}; engine must run from within the monorepo."
    )


def ensure_codegen_node_modules() -> Path:
    """Return path to the pre-warmed ``packages/codegen-templates/node_modules``.

    Idempotent: returns the existing path if already installed; runs
    ``pnpm install`` exactly once if the directory is missing (CONTEXT D-39
    pre-warm). The 120s timeout is a defense against a stuck install — the
    install actually runs in 10-30s under normal conditions.

    Pre-condition: ``pnpm`` reachable on PATH. Raises ``StageEError``
    (`STAGE_E_FAILED`) on install failure or timeout.
    """
    pkg_dir = _find_codegen_templates_dir()
    nm = pkg_dir / "node_modules"
    if nm.is_dir():
        # Idempotent — already pre-warmed (CLI auto-start hook OR a prior
        # call). No subprocess spawned.
        return nm

    _log.info("stage_e.codegen_node_modules.installing", pkg_dir=str(pkg_dir))
    pnpm_path = shutil.which("pnpm")
    if pnpm_path is None:
        raise StageEError(
            "STAGE_E_FAILED: pnpm not found on PATH; cannot pre-warm "
            "packages/codegen-templates/node_modules"
        )
    try:
        # S603: argv is a literal list with a resolved absolute path from
        # shutil.which; no shell, no untrusted input. The cwd is also
        # internally derived (packages/codegen-templates/) — no traversal.
        subprocess.run(  # noqa: S603
            [pnpm_path, "install"],
            cwd=pkg_dir,
            check=True,
            timeout=120,
            capture_output=True,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as exc:
        raise StageEError(f"STAGE_E_FAILED: pnpm install in {pkg_dir} failed: {exc}") from exc

    if not nm.is_dir():
        raise StageEError(f"STAGE_E_FAILED: pnpm install completed but {nm} not present")
    _log.info("stage_e.codegen_node_modules.ready", path=str(nm))
    return nm


def _ensure_node_modules_symlink(output_dir: Path, hoisted_node_modules: Path) -> None:
    """Symlink ``output_dir/node_modules`` → hoisted node_modules (idempotent).

    tsc resolves ``compilerOptions.types`` (``@cloudflare/workers-types``)
    and import paths via ``node_modules`` relative to the project — NOT via
    ``NODE_PATH`` (that's a Node.js runtime resolver, not tsc). Symlinking
    the pre-warmed dir is the cheapest path that lets tsc find every type
    package without running ``pnpm install`` per generation.

    On Windows, symlink may need Developer Mode / admin; for now we are
    macOS/Linux-only (engine targets Fly.io Linux Machines per
    docs/mcpgen-architecture.md §4).
    """
    target = output_dir / "node_modules"
    if target.is_symlink():
        # Idempotent — already linked. Verify still points where we expect;
        # if not, replace.
        if target.resolve() == hoisted_node_modules.resolve():
            return
        target.unlink()
    elif target.exists():
        # Real directory exists already (e.g. a stale per-call install).
        # Leave it alone — caller's responsibility to clean.
        return
    target.symlink_to(hoisted_node_modules, target_is_directory=True)


async def run_tsc_no_emit(
    output_dir: Path,
    *,
    hoisted_node_modules: Path,
    timeout_s: int = 120,
) -> int:
    """Spawn ``npx tsc --noEmit -p tsconfig.json`` in the generated dir.

    Per WARNING 5 semantics from plan 04-11 truths block:
    - Returns ``warning_count: int`` on returncode 0 with no error lines
      (count may be 0; informational, NEVER raises on warnings alone).
    - Raises ``StageETsError`` when:
      * returncode != 0, OR
      * any output line matches ``": error TS"`` (tsc returncode 0 but
        diagnostics present — defensive),
      * subprocess times out (``asyncio.TimeoutError`` → kill → raise).

    Pre-condition: ``hoisted_node_modules`` is the path to a pre-installed
    ``packages/codegen-templates/node_modules`` from
    :func:`ensure_codegen_node_modules`. We symlink it into ``output_dir``
    so tsc resolves ``@cloudflare/workers-types`` etc. via the standard
    project-relative ``node_modules`` lookup (NODE_PATH alone is NOT
    sufficient for tsc type-package resolution).
    """
    _ensure_node_modules_symlink(output_dir, hoisted_node_modules)

    env = os.environ.copy()
    env["NODE_PATH"] = str(hoisted_node_modules)
    env["NPM_CONFIG_OFFLINE"] = "true"  # reject network during tsc.
    cmd = [
        "npx",
        "--prefix",
        str(hoisted_node_modules.parent),
        "tsc",
        "--noEmit",
        "-p",
        "tsconfig.json",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=output_dir,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
    except TimeoutError as exc:
        proc.kill()
        # Best-effort wait so the subprocess fully terminates before raising.
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(proc.wait(), timeout=2)
        raise StageETsError([f"tsc timed out after {timeout_s}s"]) from exc

    text = stdout_bytes.decode("utf-8", errors="replace") + stderr_bytes.decode(
        "utf-8", errors="replace"
    )
    lines = text.splitlines()
    error_lines = [ln for ln in lines if ": error TS" in ln]
    warning_lines = [ln for ln in lines if ": warning TS" in ln]

    if proc.returncode != 0 or error_lines:
        # Prefer the actual error lines; fall back to the full output if tsc
        # produced no parseable error lines (rare — usually means a config
        # error before type-checking starts).
        errors = (
            error_lines
            or [ln for ln in lines if ln.strip()]
            or [f"tsc exited with code {proc.returncode}"]
        )
        _log.warning(
            "stage_e.tsc_failed",
            error_count=len(error_lines),
            output_dir=str(output_dir),
            returncode=proc.returncode,
        )
        raise StageETsError(errors)

    _log.info(
        "stage_e.tsc_passed",
        output_dir=str(output_dir),
        warning_count=len(warning_lines),
    )
    return len(warning_lines)


async def capture_bundle_size_kb(
    output_dir: Path,
    *,
    hoisted_node_modules: Path,
) -> float:
    """Run ``wrangler deploy --dry-run`` and parse gzipped bundle size.

    Verified 2026-04-28 against wrangler 4.85.0:

        Total Upload: 0.17 KiB / gzip: 0.15 KiB

    NO Cloudflare auth required for ``--dry-run``. Returns the gzip KiB as
    float. Raises ``RuntimeError`` (caught + remapped to ``StageEError`` by
    the orchestrator) on regex miss with the full stdout/stderr — explicit
    failure beats silent zero.
    """
    # wrangler bundles imports through esbuild, which resolves modules via
    # the project-relative node_modules — same constraint as tsc.
    _ensure_node_modules_symlink(output_dir, hoisted_node_modules)
    with tempfile.TemporaryDirectory(prefix="mcpgen-bundle-") as tmp:
        cmd = [
            "npx",
            "--prefix",
            str(hoisted_node_modules.parent),
            "wrangler",
            "deploy",
            "--dry-run",
            "--outdir",
            tmp,
        ]
        env = {
            **os.environ,
            "NODE_PATH": str(hoisted_node_modules),
            "CLOUDFLARE_API_TOKEN": "",  # explicitly empty — --dry-run never needs it.
            "CI": "true",  # silence wrangler interactive prompts.
        }
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=output_dir,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=120)
        text = stdout_bytes.decode("utf-8", errors="replace") + stderr_bytes.decode(
            "utf-8", errors="replace"
        )
        if proc.returncode != 0:
            raise RuntimeError(f"wrangler --dry-run failed (exit {proc.returncode}):\n{text}")
        match = _BUNDLE_SIZE_RE.search(text)
        if match is None:
            raise RuntimeError(f"could not parse gzip size from wrangler output:\n{text}")
        return float(match.group(1))


def compute_top_level_path_prefixes(raw_ir: RawIR) -> list[str]:
    """Phase 2 D-18 multi-server-split heuristic — re-export under
    Stage E's namespace.

    Clusters ``raw_ir.endpoints`` by first two path segments and returns
    prefixes whose cluster size meets the cluster threshold (default 30
    per pass_0.validation). Returns sorted list (alphabetical) for
    deterministic UX.
    """
    return cluster_by_path_prefix(list(raw_ir.endpoints))


async def gate_bundle_size(size_kb: float, raw_ir: RawIR) -> tuple[float, list[str]]:
    """Phase 1 D-13 / CONTEXT D-28 soft-gate.

    - ``size_kb < PASS_KB`` (800)        → ``(size_kb, [])`` clean pass.
    - ``PASS_KB <= size_kb <= WARN_KB``  → ``(size_kb, [warn-line])``.
    - ``size_kb > WARN_KB`` (> 950)      → raises ``StageEBundleTooLargeError``
      with suggested top-level path prefixes (may be empty for small specs).
    """
    if size_kb > WARN_KB:
        prefixes = compute_top_level_path_prefixes(raw_ir)
        _log.warning(
            "stage_e.bundle_too_large",
            size_kb=size_kb,
            suggested_splits=prefixes,
        )
        raise StageEBundleTooLargeError(size_kb, prefixes)
    warnings: list[str] = []
    if size_kb >= PASS_KB:
        warnings.append(f"bundle_size_warn: {size_kb} KiB approaches CF Workers 1MB limit")
    return size_kb, warnings


__all__ = [
    "PASS_KB",
    "WARN_KB",
    "_BUNDLE_SIZE_RE",
    "StageEBundleTooLargeError",
    "StageETsError",
    "capture_bundle_size_kb",
    "compute_top_level_path_prefixes",
    "ensure_codegen_node_modules",
    "gate_bundle_size",
    "run_tsc_no_emit",
]
