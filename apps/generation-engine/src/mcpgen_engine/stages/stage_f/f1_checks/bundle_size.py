"""F1 check #1 — bundle-size hard gate.

Per CONTEXT D-05 step 1 + D-08: read the captured Stage E ``bundle_size_kb`` (Phase 4
D-28 ``StageEManifest.bundle_size_kb``) and gate it on the LAUNCH_CRITERIA thresholds:

- ``size_kb <= LAUNCH_CRITERIA.BUNDLE_SIZE.PASS_KB`` -> pass, no warning.
- ``PASS_KB < size_kb <= LAUNCH_CRITERIA.BUNDLE_SIZE.WARN_KB`` -> warn band.
- ``size_kb > LAUNCH_CRITERIA.BUNDLE_SIZE.FAIL_KB_EXCLUSIVE`` -> hard fail.

A ``BUNDLE_SIZE_HARD`` is terminal — no retry can fix it (the spec is too big for one
Cloudflare Workers bundle); the operator must split into multi-server. The retry
orchestrator surfaces ``MULTI_SERVER_SPLIT_REQUIRED`` instead of cycling another pass.
"""

from __future__ import annotations

from dataclasses import dataclass

from mcpgen_engine.launch_criteria import LAUNCH_CRITERIA


@dataclass(frozen=True)
class BundleSizeResult:
    """Outcome of the bundle-size F1 check.

    ``passed`` is True when the bundle is at or below the WARN ceiling. ``warning``
    is set on the soft band (PASS_KB < size <= WARN_KB) and is purely informational.
    ``error`` is set only on hard failure.
    """

    passed: bool
    bundle_size_kb: int
    error: str | None
    warning: str | None


def check_bundle_size(bundle_size_kb: int) -> BundleSizeResult:
    """Gate the gzipped bundle size against the LAUNCH_CRITERIA thresholds.

    Imports ``LAUNCH_CRITERIA["BUNDLE_SIZE"]`` (mirror of
    ``packages/contracts/src/launch-criteria.ts``) -- the integer thresholds are
    NEVER hardcoded in this module per Phase 1 D-13 + Pitfall #29.
    """
    bundle = LAUNCH_CRITERIA["BUNDLE_SIZE"]
    # Cast through ``int(...)`` to make mypy happy with the ``object`` value type
    # of LAUNCH_CRITERIA; the TS source emits ``as const`` literal ints.
    fail_threshold = int(bundle["FAIL_KB_EXCLUSIVE"])  # type: ignore[index]
    pass_threshold = int(bundle["PASS_KB"])  # type: ignore[index]

    if bundle_size_kb > fail_threshold:
        return BundleSizeResult(
            passed=False,
            bundle_size_kb=bundle_size_kb,
            error="BUNDLE_SIZE_HARD",
            warning=None,
        )
    if bundle_size_kb > pass_threshold:
        # Soft band: warn but allow ship. The warning code goes into the F1 outcome
        # detail and (Plan 05-08) into QualityReport.warnings.
        return BundleSizeResult(
            passed=True,
            bundle_size_kb=bundle_size_kb,
            error=None,
            warning="BUNDLE_SIZE_WARN",
        )
    return BundleSizeResult(
        passed=True,
        bundle_size_kb=bundle_size_kb,
        error=None,
        warning=None,
    )
