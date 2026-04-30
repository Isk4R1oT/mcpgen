"""Retry orchestrator FSM (CONTEXT D-24, D-25, D-26, D-27).

Explicit finite-state machine for Stage F retry orchestration. Recursive
function chains and reactive streams hide the round counter and make
failure analysis hard; an FSM with a typed ``RetryState`` enum + a
``RetryContext`` dataclass surfaces every transition for SSE + Langfuse
traces.

Components
----------

- ``RetryState`` — every state the pipeline can be in during Stage F.
- ``RetryTrigger`` — one failure -> one retry-target dispatch.
- ``RetryContext`` — round counter + cumulative cost / wall-clock + trigger
  history; persisted to ``retry_state.json`` for debug per D-40.
- ``can_retry(ctx)`` — D-27 budget guards: rounds <= 2; cost <= cap (free
  $0.50 / pro $2.00); wall clock <= cap (free 600s / pro 1800s).
- ``plan_f1_retry`` / ``plan_f2_retry`` / ``plan_f3_retry`` — pure functions
  mapping Stage F failure signals to retry triggers via ``failure_patterns``.

The orchestrator is intentionally separated from the pipeline-driver
glue (``pipeline.py``). Pipeline glue calls ``can_retry`` + the planning
functions; this module owns the decision logic but never executes the
retries itself.

LAUNCH_CRITERIA invariant (Pitfall #29)
---------------------------------------

The cost / wall-clock caps are project-level invariants (not launch
criteria) so they live as module constants here. The actual launch
criteria thresholds (F2_SMELL_MIN, F3_AGENT_PASS_RATE_MIN) belong to
``quality_report.py`` — that module imports them from
``mcpgen_engine.launch_criteria``. Never hardcode launch criteria in this
module.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from .failure_patterns import (
    f1_check_to_retry,
    f2_component_to_retry,
    f3_pattern_to_retry,
)

log = logging.getLogger(__name__)

# D-27 budget caps. NOT launch criteria — these are project-level UX
# invariants ("a free-tier generation must complete in 10 minutes").
# Changing them requires a paired-decision doc per Pitfall #29 spirit but
# does NOT trigger the launch_criteria-paired-decision.sh hook.
_MAX_ROUNDS: int = 2
_COST_CAP_FREE_USD: float = 0.50
_COST_CAP_PRO_USD: float = 2.00
_WALL_CLOCK_FREE_SECONDS: float = 600.0
_WALL_CLOCK_PRO_SECONDS: float = 1800.0


class RetryState(StrEnum):
    """FSM states. Logged to SSE + Langfuse for traceability (D-24)."""

    INITIAL = "initial"
    F1_RUNNING = "f1_running"
    F1_DONE = "f1_done"
    F2_RUNNING = "f2_running"
    F2_DONE = "f2_done"
    F3_RUNNING = "f3_running"
    F3_DONE = "f3_done"
    RETRY_PLANNED = "retry_planned"
    UPSTREAM_RUNNING = "upstream_running"
    VALIDATION_COMPLETE = "validation_complete"
    TERMINAL_FAILURE = "terminal_failure"


@dataclass(frozen=True)
class RetryTrigger:
    """One failure signal -> one retry target.

    ``source`` is the failure identifier (e.g. ``f1.TS_COMPILE_FAILED`` /
    ``f2.purpose`` / ``f3.agent_passes_wrong_format``); ``target_pass`` is
    the upstream pass to re-run (``pass_0..5`` / ``stage_e``); ``reason`` is
    the operator-facing explanation surfaced in SSE + QualityReport.
    """

    source: str
    target_pass: str
    reason: str


@dataclass
class RetryContext:
    """Mutable retry state across rounds. Persisted to ``retry_state.json``.

    Round counter starts at 1 (= first run). Round 2 = first retry; round 3
    = second retry / terminal cap (D-27 max 2 retry rounds).
    """

    state: RetryState = RetryState.INITIAL
    round: int = 1
    cumulative_cost_usd: float = 0.0
    wall_clock_start: float = field(default_factory=time.time)
    triggers: list[RetryTrigger] = field(default_factory=list)
    history: list[dict[str, Any]] = field(default_factory=list)
    is_pro_tier: bool = False

    def cumulative_wall_clock(self) -> float:
        """Seconds since the orchestrator first started (used by can_retry)."""
        return time.time() - self.wall_clock_start


def can_retry(ctx: RetryContext) -> tuple[bool, str | None]:
    """D-27 budget guards. Returns ``(allowed, reason_if_blocked)``.

    Reason codes (surfaced to QualityReport.warnings via the orchestrator):
    - ``RETRY_ROUNDS_EXHAUSTED``  — round counter > 2.
    - ``RETRY_BUDGET_EXHAUSTED_COST`` — cumulative LLM cost >= tier cap.
    - ``RETRY_BUDGET_EXHAUSTED_TIME`` — wall clock >= tier cap.
    """
    if ctx.round > _MAX_ROUNDS:
        return False, "RETRY_ROUNDS_EXHAUSTED"
    cap = _COST_CAP_PRO_USD if ctx.is_pro_tier else _COST_CAP_FREE_USD
    if ctx.cumulative_cost_usd >= cap:
        return False, "RETRY_BUDGET_EXHAUSTED_COST"
    wall_cap = _WALL_CLOCK_PRO_SECONDS if ctx.is_pro_tier else _WALL_CLOCK_FREE_SECONDS
    if ctx.cumulative_wall_clock() >= wall_cap:
        return False, "RETRY_BUDGET_EXHAUSTED_TIME"
    return True, None


def plan_f1_retry(error_code: str, ctx: RetryContext) -> RetryTrigger | None:
    """Map an F1 error code to a retry trigger.

    D-06: ``BUNDLE_SIZE_HARD`` and ``SECRETS_LEAKED`` are terminal — no
    retry can fix them; we return ``None`` so the caller knows to surface
    the failure to the operator instead of attempting another round.
    """
    target = f1_check_to_retry(error_code)
    if target is None:
        return None
    _ = ctx  # ctx unused for f1; kept symmetrical with f2/f3 signatures
    return RetryTrigger(
        source=f"f1.{error_code}",
        target_pass=target,
        reason=error_code,
    )


def plan_f2_retry(
    per_component_failures: dict[str, float], ctx: RetryContext
) -> list[RetryTrigger]:
    """Map per-component F2 averages below 3.0 to retry triggers.

    D-13: components with ``score < 3`` go to their owner pass:
    ``purpose`` / ``guidelines`` / ``limitations`` / ``length_completeness``
    -> Pass 2; ``parameter_explanation`` -> Pass 3; ``examples`` -> ``None``
    (deferred to v1.1, no retry).

    De-duplication: multiple components routing to the same pass collapse
    into a single trigger so the cascade invalidation runs once.
    """
    _ = ctx  # signature parity with f1/f3
    triggers: list[RetryTrigger] = []
    for component, score in per_component_failures.items():
        if score >= 3.0:
            continue
        target = f2_component_to_retry(component)
        if target is None:
            continue
        triggers.append(
            RetryTrigger(
                source=f"f2.{component}",
                target_pass=target,
                reason=f"score {score:.2f} < 3.0",
            )
        )
    return _dedupe_by_target_pass(triggers)


def plan_f3_retry(failure_patterns: list[str], ctx: RetryContext) -> list[RetryTrigger]:
    """Map F3 failure-pattern names to retry triggers per D-25.

    Patterns come from heuristic detection on the F3 trajectory + judge
    score (Stage F design Appendix A). Unknown patterns raise ``KeyError``
    via ``f3_pattern_to_retry`` — that's intentional so a pipeline-side
    typo doesn't silently swallow a real failure.
    """
    _ = ctx
    triggers: list[RetryTrigger] = []
    for pat in failure_patterns:
        target = f3_pattern_to_retry(pat)
        triggers.append(RetryTrigger(source=f"f3.{pat}", target_pass=target, reason=pat))
    return _dedupe_by_target_pass(triggers)


def _dedupe_by_target_pass(triggers: list[RetryTrigger]) -> list[RetryTrigger]:
    """Collapse triggers that share a target_pass — one cascade per pass."""
    by_pass: dict[str, RetryTrigger] = {}
    for t in triggers:
        by_pass.setdefault(t.target_pass, t)
    return list(by_pass.values())


# Earliest pass to invalidate cascades downstream automatically (D-26).
_PASS_ORDER: tuple[str, ...] = (
    "pass_0",
    "pass_1",
    "pass_2",
    "pass_3",
    "pass_4",
    "pass_5",
    "stage_e",
)


def select_earliest_target(triggers: list[RetryTrigger]) -> str | None:
    """Pick the earliest target_pass among triggers — single cascade root.

    When multiple triggers fire at once (e.g., F2 reports purpose=2 AND
    parameter_explanation=2 -> Pass 2 + Pass 3 retries), invalidating from
    the *earliest* pass naturally cascades to every later pass via D-26
    PASS_DOWNSTREAM. Returns ``None`` when ``triggers`` is empty.
    """
    if not triggers:
        return None
    target_set = {t.target_pass for t in triggers}
    for pass_name in _PASS_ORDER:
        if pass_name in target_set:
            return pass_name
    # Fallback: return the first trigger's target if none matched the
    # canonical order (defensive — should never happen given the
    # failure_patterns table only emits canonical pass names).
    return triggers[0].target_pass
