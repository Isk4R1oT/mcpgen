"""Stage F — Validation (F1 static + F2 smell + F3 agent eval).

Per .planning/phases/05-generation-engine-validation-stage-f/05-CONTEXT.md D-04.

Module structure mirrors Phase 2/3/4 stages/stage_e/ pattern: single async run() entry
point + sibling check / orchestrator modules.

Phase 5 Plan 05-03 lands the first 8 cheap-deterministic F1 checks (D-05 steps 1-8) +
the F1 orchestrator skeleton + the failure_patterns.py decision matrix (D-06 / D-13 /
D-25). Plan 05-04 extends with the 3 subprocess F1 checks (gitleaks / jsonschema / tsc).
F2 + F3 land in subsequent waves; Plan 05-08 wires the retry orchestrator FSM
(``retry_orchestrator``) + composite-score / quality-badge assembly (``quality_report``)
+ the pipeline-side glue.
"""

from __future__ import annotations

from .f1_static import run_f1
from .f2_smell import run_f2
from .f3_agent_eval import run_f3
from .quality_report import compute_badge, compute_overall
from .retry_orchestrator import (
    RetryContext,
    RetryState,
    RetryTrigger,
    can_retry,
    plan_f1_retry,
    plan_f2_retry,
    plan_f3_retry,
    select_earliest_target,
)

# Bumped manually on logic change; invalidates F2 L2 cache (CONTEXT D-32). Kept as a
# module-level constant so callers in Plan 05-04 onwards can stamp it onto cache keys
# without importing a deeper internal module.
STAGE_F_VERSION: str = "1"

__all__ = [
    "STAGE_F_VERSION",
    "RetryContext",
    "RetryState",
    "RetryTrigger",
    "can_retry",
    "compute_badge",
    "compute_overall",
    "plan_f1_retry",
    "plan_f2_retry",
    "plan_f3_retry",
    "run_f1",
    "run_f2",
    "run_f3",
    "select_earliest_target",
]
