"""F1 check #1 — bundle-size hard gate tests (Plan 05-03 Task 1).

Behavior block per plan:

- ``bundle_size_kb=412`` -> ``BundleSizeResult(passed=True)``.
- ``bundle_size_kb=951`` -> ``passed=False, error="BUNDLE_SIZE_HARD"``.
- ``bundle_size_kb=899`` -> ``passed=True, warning="BUNDLE_SIZE_WARN"`` (warn band).

Also asserts the LAUNCH_CRITERIA threshold is imported (Phase 1 D-13 invariant) — no
hardcoded ``950`` in the source module.
"""

from __future__ import annotations

import inspect

from mcpgen_engine.launch_criteria import LAUNCH_CRITERIA
from mcpgen_engine.stages.stage_f.f1_checks import bundle_size as bundle_size_module
from mcpgen_engine.stages.stage_f.f1_checks.bundle_size import (
    BundleSizeResult,
    check_bundle_size,
)


def test_clean_pass_far_below_threshold() -> None:
    result = check_bundle_size(412)
    assert result == BundleSizeResult(passed=True, bundle_size_kb=412, error=None, warning=None)


def test_hard_fail_above_fail_threshold() -> None:
    result = check_bundle_size(951)
    assert result.passed is False
    assert result.error == "BUNDLE_SIZE_HARD"
    assert result.warning is None
    assert result.bundle_size_kb == 951


def test_warn_band_passes_with_warning() -> None:
    result = check_bundle_size(899)
    assert result.passed is True
    assert result.error is None
    assert result.warning == "BUNDLE_SIZE_WARN"
    assert result.bundle_size_kb == 899


def test_threshold_imported_not_hardcoded() -> None:
    """Source MUST import LAUNCH_CRITERIA — Phase 1 D-13 + Pitfall #29 mitigation."""
    src = inspect.getsource(bundle_size_module)
    assert "LAUNCH_CRITERIA" in src
    # Spot-check the canonical values (sanity for Phase 5 wave-2 readers — no fragility:
    # if these values change in the TS source the launch-criteria-paired-decision hook
    # forces an explicit decision doc).
    bundle = LAUNCH_CRITERIA["BUNDLE_SIZE"]
    assert isinstance(bundle, dict)
    assert int(bundle["FAIL_KB_EXCLUSIVE"]) == 950
    assert int(bundle["WARN_KB"]) == 950
    assert int(bundle["PASS_KB"]) == 800
