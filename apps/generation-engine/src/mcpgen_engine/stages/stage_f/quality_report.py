"""QualityReport composite-score + Quality Badge assembly (CONTEXT D-28).

Encodes the D-28 formula verbatim:

    if F1 fails:
        overall = 0.0; badge = needs_review
    elif F2 fails (overall < F2_SMELL_MIN) AND no F3:
        overall = 2.5; badge = needs_review
    elif F2 passes AND no F3:
        overall = (0.5 * F2_overall / 5 + 0.5) * 5  # = 0.5*F2/5+0.5 expressed in 0-5
        badge = standard (verified requires F3 >= F3_AGENT_PASS_RATE_MIN per D-28)
    else (all 3 ran):
        overall_normalized = 0.10 * 1 + 0.40 * F2/5 + 0.50 * F3.pass_rate
        overall = overall_normalized * 5  # store as 0-5 score
        badge:
          premium       if F1.passed and F2 >= 4.5 and F3 >= 0.85
          else verified if F1.passed and F2 >= F2_SMELL_MIN and F3 >= F3_AGENT_PASS_RATE_MIN
          else standard if F1.passed and F2 >= 3.5 and F3 >= 0.5
          else needs_review

LAUNCH_CRITERIA invariant (Pitfall #29)
---------------------------------------

The verified-tier thresholds (F2 >= 4.0, F3 >= 0.7) are the LAUNCH_CRITERIA;
the premium / standard sub-tier thresholds (4.5 / 0.85 / 3.5 / 0.5) are
local D-28 constants. Premium-tier and standard-tier are tighter / looser
than the launch criteria respectively; bumping LAUNCH_CRITERIA's verified
floor automatically lifts the verified tier here. The pre-commit hook +
``test_module_does_not_hardcode_4_0_threshold`` defend against accidentally
copy-pasting 4.0 / 0.7 into this module.
"""

from __future__ import annotations

from typing import Final, Literal

from mcpgen_engine.launch_criteria import LAUNCH_CRITERIA

# D-28 sub-tier thresholds — local constants, not launch criteria.
_PREMIUM_F2_FLOOR: Final[float] = 4.5
_PREMIUM_F3_FLOOR: Final[float] = 0.85
_STANDARD_F2_FLOOR: Final[float] = 3.5
_STANDARD_F3_FLOOR: Final[float] = 0.5

QualityBadge = Literal["premium", "verified", "standard", "needs_review"]


def _f2_min() -> float:
    """LAUNCH_CRITERIA F2 minimum (verified tier)."""
    return float(LAUNCH_CRITERIA["F2_SMELL_MIN"])  # type: ignore[arg-type]


def _f3_min() -> float:
    """LAUNCH_CRITERIA F3 minimum pass-rate (verified tier)."""
    return float(LAUNCH_CRITERIA["F3_AGENT_PASS_RATE_MIN"])  # type: ignore[arg-type]


def compute_overall(
    *,
    f1_passed: bool,
    f2_overall: float | None,
    f3_pass_rate: float | None,
) -> float:
    """D-28 composite score, returned in the 0-5 range.

    F2 overall is in 0-5; F3 pass_rate is in 0-1. The weighted-sum formula
    operates in 0-1 space then multiplies by 5 to land in 0-5 (D-28 verbatim).
    """
    if not f1_passed:
        return 0.0
    if f3_pass_rate is None:
        # F2-only path: F1 passed but operator opted out of F3 (and the
        # auto-trigger guard below didn't kick in — caller's responsibility).
        if f2_overall is None or f2_overall < _f2_min():
            return 2.5
        # 0-5 expression of "0.5*F2/5 + 0.5".
        normalized = 0.5 * f2_overall / 5.0 + 0.5
        return normalized * 5
    # All three F-stages ran.
    f2_norm = (f2_overall or 0.0) / 5.0
    normalized = 0.10 * 1.0 + 0.40 * f2_norm + 0.50 * f3_pass_rate
    return normalized * 5


def compute_badge(
    *,
    f1_passed: bool,
    f2_overall: float | None,
    f3_pass_rate: float | None,
) -> QualityBadge:
    """D-28 badge mapping with LAUNCH_CRITERIA-sourced verified tier."""
    if not f1_passed:
        return "needs_review"
    f2 = f2_overall or 0.0

    if f3_pass_rate is None:
        # F2-only path: D-28 says "standard or verified". Verified requires
        # F3 >= F3_AGENT_PASS_RATE_MIN per D-28 — F3 absent fails that
        # condition, so verified is unreachable here. Use standard as the
        # safest interpretation (documented in this module's docstring;
        # see Plan 05-09 for the Pro-tier verified-without-F3 calibration).
        if f2 >= _STANDARD_F2_FLOOR:
            return "standard"
        return "needs_review"

    # All three F-stages ran.
    if f2 >= _PREMIUM_F2_FLOOR and f3_pass_rate >= _PREMIUM_F3_FLOOR:
        return "premium"
    if f2 >= _f2_min() and f3_pass_rate >= _f3_min():
        return "verified"
    if f2 >= _STANDARD_F2_FLOOR and f3_pass_rate >= _STANDARD_F3_FLOOR:
        return "standard"
    return "needs_review"
