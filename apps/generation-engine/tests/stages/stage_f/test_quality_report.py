"""QualityReport composite score + Quality Badge tests (Plan 05-08, CONTEXT D-28).

Locks the verbatim D-28 formula:
- F1 fails -> overall=0.0; badge=needs_review.
- F1 pass + F2=4.5 + F3 pass_rate=0.85 -> badge=premium.
- F1 pass + F2=4.0 + F3 pass_rate=0.7 -> badge=verified.
- F1 pass + F2=3.5 + no F3 -> badge=standard.
- LAUNCH_CRITERIA imported from launch_criteria.py — never hardcoded.
"""

from __future__ import annotations

from mcpgen_engine.launch_criteria import LAUNCH_CRITERIA
from mcpgen_engine.stages.stage_f.quality_report import (
    compute_badge,
    compute_overall,
)

# ─── compute_overall — 0-5 score ────────────────────────────────────────────


def test_overall_f1_fail_returns_zero() -> None:
    """D-28: F1 fail -> overall = 0.0."""
    assert compute_overall(f1_passed=False, f2_overall=4.0, f3_pass_rate=0.7) == 0.0


def test_overall_f2_fail_no_f3_returns_2_5() -> None:
    """D-28: F1 pass + F2 fail (< 4.0) + no F3 -> overall = 2.5."""
    assert compute_overall(f1_passed=True, f2_overall=3.0, f3_pass_rate=None) == 2.5


def test_overall_f2_pass_no_f3_uses_partial_formula() -> None:
    """D-28 'F2 passes AND no F3': overall = (0.5*F2/5 + 0.5) * 5."""
    # F2=4.5 -> 0.5*4.5/5 + 0.5 = 0.45+0.5=0.95 -> *5 = 4.75
    score = compute_overall(f1_passed=True, f2_overall=4.5, f3_pass_rate=None)
    assert abs(score - 4.75) < 1e-6


def test_overall_full_run_premium_score() -> None:
    """D-28: F1 pass + F2=4.5 + F3=0.85 -> 0.10*1 + 0.40*0.9 + 0.50*0.85 = 0.885."""
    score = compute_overall(f1_passed=True, f2_overall=4.5, f3_pass_rate=0.85)
    expected = (0.10 * 1.0 + 0.40 * (4.5 / 5.0) + 0.50 * 0.85) * 5
    assert abs(score - expected) < 1e-6


def test_overall_full_run_verified_score() -> None:
    """F1 pass + F2=4.0 + F3=0.7 -> formula evaluated."""
    score = compute_overall(f1_passed=True, f2_overall=4.0, f3_pass_rate=0.7)
    expected = (0.10 * 1.0 + 0.40 * 0.8 + 0.50 * 0.7) * 5
    assert abs(score - expected) < 1e-6


def test_overall_score_in_zero_to_five_range() -> None:
    """All produced scores must be in [0.0, 5.0]."""
    for f2 in (0.0, 2.5, 3.5, 4.0, 4.5, 5.0):
        for f3 in (0.0, 0.5, 0.7, 0.85, 1.0):
            score = compute_overall(f1_passed=True, f2_overall=f2, f3_pass_rate=f3)
            assert 0.0 <= score <= 5.0


# ─── compute_badge — 4 tiers ────────────────────────────────────────────────


def test_badge_f1_fail_needs_review() -> None:
    """D-28: F1 fail -> needs_review."""
    assert compute_badge(f1_passed=False, f2_overall=5.0, f3_pass_rate=1.0) == "needs_review"


def test_badge_premium_full_run() -> None:
    """D-28: F1 pass + F2 >= 4.5 + F3 >= 0.85 -> premium."""
    assert compute_badge(f1_passed=True, f2_overall=4.5, f3_pass_rate=0.85) == "premium"


def test_badge_verified_at_thresholds() -> None:
    """D-28: F1 pass + F2 >= 4.0 + F3 >= 0.7 -> verified."""
    assert compute_badge(f1_passed=True, f2_overall=4.0, f3_pass_rate=0.7) == "verified"


def test_badge_standard_with_low_f3_or_no_f3() -> None:
    """D-28: F1 pass + F2 >= 3.5 + (F3 absent or >= 0.5) -> standard."""
    assert compute_badge(f1_passed=True, f2_overall=3.5, f3_pass_rate=None) == "standard"
    assert compute_badge(f1_passed=True, f2_overall=3.5, f3_pass_rate=0.5) == "standard"


def test_badge_needs_review_below_all_tiers() -> None:
    """F1 pass + F2=2.0 + no F3 -> needs_review."""
    assert compute_badge(f1_passed=True, f2_overall=2.0, f3_pass_rate=None) == "needs_review"


def test_badge_needs_review_low_f3() -> None:
    """F1 pass + F2=4.0 + F3=0.4 -> needs_review (F3 below 0.5 standard floor)."""
    assert compute_badge(f1_passed=True, f2_overall=4.0, f3_pass_rate=0.4) == "needs_review"


# ─── LAUNCH_CRITERIA invariant ──────────────────────────────────────────────


def test_launch_criteria_threshold_used() -> None:
    """Sanity: F2_SMELL_MIN matches LAUNCH_CRITERIA at the threshold boundary."""
    threshold = float(LAUNCH_CRITERIA["F2_SMELL_MIN"])  # type: ignore[arg-type]
    # At exactly the threshold with F3 >= F3_AGENT_PASS_RATE_MIN -> verified.
    f3_min = float(LAUNCH_CRITERIA["F3_AGENT_PASS_RATE_MIN"])  # type: ignore[arg-type]
    assert compute_badge(f1_passed=True, f2_overall=threshold, f3_pass_rate=f3_min) == "verified"


def test_module_does_not_hardcode_4_0_threshold() -> None:
    """Pitfall #29: threshold must be sourced from LAUNCH_CRITERIA, not literal 4.0."""
    from pathlib import Path

    from mcpgen_engine.stages.stage_f import quality_report

    src_path = Path(quality_report.__file__)
    text = src_path.read_text(encoding="utf-8")
    # Allowed sub-tier thresholds from D-28: 4.5, 0.85, 3.5, 0.5 (premium / standard
    # boundaries). Forbidden: bare ``>= 4.0`` or ``>= 0.7`` outside LAUNCH_CRITERIA
    # context.
    for forbidden in (">= 4.0", ">=4.0", ">= 0.7", ">=0.7"):
        for line in text.splitlines():
            if forbidden in line and "LAUNCH_CRITERIA" not in line:
                raise AssertionError(
                    f"Forbidden hardcoded threshold {forbidden!r} on line: {line!r}"
                )
