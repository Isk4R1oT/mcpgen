"""Retry orchestrator FSM tests (Plan 05-08, CONTEXT D-24, D-25, D-27).

Locks:
- Initial state: F1 passes -> state advances; round counter starts at 1.
- F2 failure -> plan_f2_retry returns RetryTrigger(target_pass=pass_2,...)
- After round 3: can_retry returns False with RETRY_ROUNDS_EXHAUSTED.
- Cumulative cost > $0.50 (free tier) -> RETRY_BUDGET_EXHAUSTED_COST.
- Cumulative wall clock > 600s (free tier) -> RETRY_BUDGET_EXHAUSTED_TIME.
- F1 BUNDLE_SIZE_HARD -> plan_f1_retry returns None (terminal).
- F1 SECRETS_LEAKED -> plan_f1_retry returns None (terminal per D-06).
"""

from __future__ import annotations

import time

from mcpgen_engine.stages.stage_f.retry_orchestrator import (
    RetryContext,
    RetryState,
    can_retry,
    plan_f1_retry,
    plan_f2_retry,
    plan_f3_retry,
)

# ─── State machine transitions ──────────────────────────────────────────────


def test_initial_state_round_one() -> None:
    ctx = RetryContext()
    assert ctx.state == RetryState.INITIAL
    assert ctx.round == 1
    assert ctx.cumulative_cost_usd == 0.0


# ─── can_retry budget guards ────────────────────────────────────────────────


def test_can_retry_round_one_allowed() -> None:
    ctx = RetryContext(round=1, cumulative_cost_usd=0.0)
    allowed, reason = can_retry(ctx)
    assert allowed is True
    assert reason is None


def test_can_retry_round_two_allowed() -> None:
    ctx = RetryContext(round=2, cumulative_cost_usd=0.10)
    allowed, _reason = can_retry(ctx)
    assert allowed is True


def test_can_retry_round_three_blocked() -> None:
    """D-27: max 2 retry rounds; round 3 is the terminal cap."""
    ctx = RetryContext(round=3, cumulative_cost_usd=0.10)
    allowed, reason = can_retry(ctx)
    assert allowed is False
    assert reason == "RETRY_ROUNDS_EXHAUSTED"


def test_can_retry_cost_cap_free_tier() -> None:
    """D-27: free-tier cost cap = $0.50."""
    ctx = RetryContext(round=2, cumulative_cost_usd=0.55, is_pro_tier=False)
    allowed, reason = can_retry(ctx)
    assert allowed is False
    assert reason == "RETRY_BUDGET_EXHAUSTED_COST"


def test_can_retry_cost_cap_pro_tier_higher() -> None:
    """D-27: pro-tier cost cap = $2.00 — $0.55 still allowed."""
    ctx = RetryContext(round=2, cumulative_cost_usd=0.55, is_pro_tier=True)
    allowed, _ = can_retry(ctx)
    assert allowed is True


def test_can_retry_wall_clock_free_tier() -> None:
    """D-27: free-tier wall-clock cap = 600s; backdate the start so we exceed."""
    ctx = RetryContext(round=2, cumulative_cost_usd=0.10, is_pro_tier=False)
    # Backdate start time 700 seconds (> 600s cap).
    ctx.wall_clock_start = time.time() - 700
    allowed, reason = can_retry(ctx)
    assert allowed is False
    assert reason == "RETRY_BUDGET_EXHAUSTED_TIME"


def test_can_retry_wall_clock_pro_tier() -> None:
    """D-27: pro-tier wall-clock cap = 1800s; 700s still allowed."""
    ctx = RetryContext(round=2, cumulative_cost_usd=0.10, is_pro_tier=True)
    ctx.wall_clock_start = time.time() - 700
    allowed, _ = can_retry(ctx)
    assert allowed is True


# ─── plan_f1_retry: error-code -> retry target ──────────────────────────────


def test_plan_f1_retry_bundle_size_hard_terminal() -> None:
    """D-06: BUNDLE_SIZE_HARD has no retry path — returns None."""
    ctx = RetryContext()
    trigger = plan_f1_retry("BUNDLE_SIZE_HARD", ctx)
    assert trigger is None


def test_plan_f1_retry_secrets_leaked_terminal() -> None:
    """D-06: SECRETS_LEAKED is terminal — operator-fix only."""
    ctx = RetryContext()
    trigger = plan_f1_retry("SECRETS_LEAKED", ctx)
    assert trigger is None


def test_plan_f1_retry_smart_id_cross_tenant_routes_pass_1() -> None:
    """D-06: SMART_ID_CROSS_TENANT_LEAK -> Pass 1 retry."""
    ctx = RetryContext()
    trigger = plan_f1_retry("SMART_ID_CROSS_TENANT_LEAK", ctx)
    assert trigger is not None
    assert trigger.target_pass == "pass_1"
    assert "smart_id" in trigger.source.lower() or "SMART_ID" in trigger.source


def test_plan_f1_retry_examples_hallucinated_routes_pass_2() -> None:
    """D-06: EXAMPLES_HALLUCINATED -> Pass 2 retry."""
    ctx = RetryContext()
    trigger = plan_f1_retry("EXAMPLES_HALLUCINATED", ctx)
    assert trigger is not None
    assert trigger.target_pass == "pass_2"


def test_plan_f1_retry_ts_compile_routes_stage_e() -> None:
    """D-06: TS_COMPILE_FAILED -> Stage E retry (template fix)."""
    ctx = RetryContext()
    trigger = plan_f1_retry("TS_COMPILE_FAILED", ctx)
    assert trigger is not None
    assert trigger.target_pass == "stage_e"


# ─── plan_f2_retry: per-component < 3 -> retry ──────────────────────────────


def test_plan_f2_retry_purpose_below_threshold_routes_pass_2() -> None:
    """D-13: purpose < 3 -> Pass 2 retry."""
    ctx = RetryContext()
    triggers = plan_f2_retry({"purpose": 2.5, "guidelines": 4.0}, ctx)
    assert len(triggers) == 1
    assert triggers[0].target_pass == "pass_2"


def test_plan_f2_retry_parameter_explanation_below_routes_pass_3() -> None:
    """D-13: parameter_explanation < 3 -> Pass 3 retry (per-param doc owner)."""
    ctx = RetryContext()
    triggers = plan_f2_retry({"parameter_explanation": 2.0}, ctx)
    assert len(triggers) == 1
    assert triggers[0].target_pass == "pass_3"


def test_plan_f2_retry_examples_below_skipped() -> None:
    """D-13: examples below 3 -> None (deferred to v1.1, no retry)."""
    ctx = RetryContext()
    triggers = plan_f2_retry({"examples": 1.0}, ctx)
    assert triggers == []


def test_plan_f2_retry_above_threshold_returns_empty() -> None:
    """All scores >= 3 -> no retries triggered."""
    ctx = RetryContext()
    triggers = plan_f2_retry({"purpose": 4.0, "guidelines": 4.5}, ctx)
    assert triggers == []


def test_plan_f2_retry_dedupes_by_target_pass() -> None:
    """Multiple components routing to same pass -> only one trigger."""
    ctx = RetryContext()
    triggers = plan_f2_retry({"purpose": 2.0, "guidelines": 2.0, "limitations": 2.0}, ctx)
    # All three route to pass_2 -> deduped to one trigger.
    assert len(triggers) == 1
    assert triggers[0].target_pass == "pass_2"


# ─── plan_f3_retry: failure pattern -> retry ────────────────────────────────


def test_plan_f3_retry_pattern_routes_correctly() -> None:
    """D-25: agent_passes_wrong_format -> Pass 3."""
    ctx = RetryContext()
    triggers = plan_f3_retry(["agent_passes_wrong_format"], ctx)
    assert len(triggers) == 1
    assert triggers[0].target_pass == "pass_3"


def test_plan_f3_retry_multiple_patterns() -> None:
    """Multiple patterns -> multiple triggers (deduped if same target)."""
    ctx = RetryContext()
    triggers = plan_f3_retry(["agent_confuses_two_tools", "agent_passes_wrong_format"], ctx)
    targets = {t.target_pass for t in triggers}
    assert "pass_2" in targets
    assert "pass_3" in targets
