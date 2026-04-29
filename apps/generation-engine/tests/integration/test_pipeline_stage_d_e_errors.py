"""Stage-D / Stage-E error code mapping (Plan 04-12 Task 1 + must_haves).

Verifies the authoritative subclass-specific isinstance order most-specific-
first per CONTEXT D-49 + D-51:

  StageETsError              → STAGE_E_TS_ERROR
  StageEBundleTooLargeError  → STAGE_E_BUNDLE_TOO_LARGE
  StageETemplateError / bare → STAGE_E_FAILED
  Pass5Error                 → PASS_5_FAILED
  Anything else              → INTERNAL_ERROR

Phase 5 F1 retry orchestration consumes these specific codes per Stage F
design Appendix A — collapsing them via an umbrella `STAGE_E_FAILED` would
break targeted-retry routing.
"""

from __future__ import annotations

import pytest

from mcpgen_engine.passes.pass_5 import Pass5Error
from mcpgen_engine.pipeline import _stable_error_code
from mcpgen_engine.stages.stage_e import StageEError
from mcpgen_engine.stages.stage_e.validate import (
    StageEBundleTooLargeError,
    StageETsError,
)


def test_stage_e_ts_error_maps_to_stage_e_ts_error_code() -> None:
    """StageETsError → STAGE_E_TS_ERROR (Phase 5 retries Pass 3)."""
    exc = StageETsError(["src/index.ts(1,1): error TS1234: synthetic"])
    assert _stable_error_code(exc) == "STAGE_E_TS_ERROR"


def test_stage_e_bundle_too_large_maps_to_stage_e_bundle_too_large_code() -> None:
    """StageEBundleTooLargeError → STAGE_E_BUNDLE_TOO_LARGE (Phase 5
    retries Pass 1 with multi-server-split)."""
    exc = StageEBundleTooLargeError(1024.0, ["v1"])
    assert _stable_error_code(exc) == "STAGE_E_BUNDLE_TOO_LARGE"


def test_bare_stage_e_error_maps_to_stage_e_failed_code() -> None:
    """A bare StageEError instance falls through to the umbrella code."""
    exc = StageEError("synthetic Stage E failure")
    assert _stable_error_code(exc) == "STAGE_E_FAILED"


def test_pass_5_error_maps_to_pass_5_failed_code() -> None:
    """Pass5Error → PASS_5_FAILED (NOT STAGE_E_*; D-49 separation)."""
    exc = Pass5Error("synthetic Pass 5 validation failure")
    assert _stable_error_code(exc) == "PASS_5_FAILED"


def test_arbitrary_runtime_error_maps_to_internal_error_code() -> None:
    """Any exception not in the known set → INTERNAL_ERROR."""
    exc = RuntimeError("synthetic unhandled failure")
    assert _stable_error_code(exc) == "INTERNAL_ERROR"


def test_stage_e_ts_error_is_not_collapsed_to_stage_e_failed() -> None:
    """Regression guard — `StageETsError` IS-A `StageEError`, but the
    isinstance order in `_stable_error_code` MUST check the subclass
    first so the bare-StageEError branch never collapses
    StageETsError → STAGE_E_FAILED. Phase 5 F1 retry orchestration
    routes off the specific subclass code."""
    exc = StageETsError(["error"])
    # Sanity: subclass relation holds (so the umbrella `except StageEError`
    # site keeps working) — but the code mapping disambiguates.
    assert isinstance(exc, StageEError)
    assert _stable_error_code(exc) == "STAGE_E_TS_ERROR"
    assert _stable_error_code(exc) != "STAGE_E_FAILED"


def test_stage_e_bundle_too_large_is_not_collapsed_to_stage_e_failed() -> None:
    """Same guard as above for `StageEBundleTooLargeError`."""
    exc = StageEBundleTooLargeError(960.0, [])
    assert isinstance(exc, StageEError)
    assert _stable_error_code(exc) == "STAGE_E_BUNDLE_TOO_LARGE"
    assert _stable_error_code(exc) != "STAGE_E_FAILED"


@pytest.mark.parametrize(
    ("exc", "expected"),
    [
        (StageETsError(["err"]), "STAGE_E_TS_ERROR"),
        (StageEBundleTooLargeError(960.0, []), "STAGE_E_BUNDLE_TOO_LARGE"),
        (StageEError("bare"), "STAGE_E_FAILED"),
        (Pass5Error("p5"), "PASS_5_FAILED"),
        (ValueError("vanilla"), "INTERNAL_ERROR"),
        (RuntimeError("unhandled"), "INTERNAL_ERROR"),
    ],
)
def test_stable_error_code_table(exc: BaseException, expected: str) -> None:
    """Authoritative table of (exception type, expected code) pairs."""
    assert _stable_error_code(exc) == expected
