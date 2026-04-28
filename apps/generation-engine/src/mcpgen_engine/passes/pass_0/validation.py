"""Pass 0 Stage 0c — deterministic validation.

Two responsibilities, both pure-function (no LLM, no I/O):

1. **Naming validation** (D-17) — every ``ToolPlan.name`` must match the regex
   ``^[a-z][a-z0-9_]{0,63}$`` AND be unique across the plan list. Failures
   raise ``Pass0Error("INVALID_NAMING: ...")`` or ``Pass0Error("DUPLICATE_NAMING: ...")``
   with stable error codes that downstream UX surfaces verbatim.

2. **Cap enforcement** (D-18 tiered caps + D-19 Pro override) — given the
   LLM-produced ``Pass0LlmOutput``, trim to the tier cap by dropping the
   lowest-priority plans (``DropReason.EXCEEDS_CAP``); hard-fail with
   ``MULTI_SERVER_SPLIT_REQUIRED`` when the post-trim count exceeds 80, with
   concrete top-level path-prefix suggestions clustered by first two segments
   (Pitfall G calibrated).

Tier caps:

- ``minimal`` → 15 (CRUD only)
- ``standard`` → 50 (default)
- ``comprehensive`` → 80
- ``max_tools_override`` (Pro) → up to 100

References:
- 02-CONTEXT.md D-17 (naming regex) + D-18 (tiered caps) + D-19 (Pro override)
  + D-25 (target_complexity) + D-26 (retry/degrade)
- 02-RESEARCH.md §"Pitfall G" (Stripe `/v1/test_helpers` cluster context)
- 02-PATTERNS.md `passes/pass_0/validation.py` row + Shared Patterns "Error handling"
"""

from __future__ import annotations

import re
from typing import Final

import structlog
from mcpgen_ir.types import CompositeCandidate, DroppedEndpoint, Endpoint, Reason, ToolPlan
from pydantic import BaseModel, ConfigDict, Field

# ─────────────────────────── D-17 / D-18 constants ─────────────────────────

# D-17: tool name regex (verbatim, also enforced at IR construction time).
_TOOL_NAME_REGEX: Final[re.Pattern[str]] = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

# D-18: target_complexity → soft cap.
_TIER_CAPS: Final[dict[str, int]] = {
    "minimal": 15,
    "standard": 50,
    "comprehensive": 80,
}

# D-18: hard-fail threshold (concrete top-level path-prefix split required).
_HARD_FAIL_THRESHOLD: Final[int] = 80

# D-19: Pro override absolute ceiling.
_MAX_OVERRIDE_CAP: Final[int] = 100

# Cluster-suggestion sizing: only suggest splits big enough to be worth it.
_DEFAULT_CLUSTER_MIN: Final[int] = 30

_log = structlog.get_logger(__name__)


# ─────────────────────────────── Errors ────────────────────────────────────


class Pass0Error(ValueError):
    """Stable user-facing error class for Pass 0 validation failures.

    The first token of ``args[0]`` is treated as the stable error code by
    downstream layers (CLI / API). Additional context (suggested splits,
    offending names) is preserved on the ``suggestions`` attribute.
    """

    suggestions: list[str]

    def __init__(
        self: Pass0Error,
        message: str,
        *,
        suggestions: list[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.suggestions = suggestions or []


# ─────────────────────── Local intermediate output type ────────────────────


class Pass0LlmOutput(BaseModel):
    """The LLM-produced subset of `Pass0Output` consumed by Stage 0c.

    Defined locally — the FROZEN ``mcpgen_ir.types.Pass0Output`` is the *final*
    output (post-validation). Stage 0c bridges between LLM and final output;
    this transient shape is internal to the engine until Plan 02-06 promotes
    it to the IR.

    Stage 0c (`enforce_caps`) augments / consumes:
    - ``tool_plans`` — kept endpoints rendered as tool plans by the LLM.
    - ``composite_candidates`` — sequential 2-5-step chains the LLM identifies
      as Pass-1 workflow hints (D-23 / Pass 0 design §1.2.6).
    - ``llm_dropped_endpoints`` — LLM-assigned LOW_VALUE / REDUNDANT drops
      (D-23: deterministic drops are already merged in by the orchestrator).

    `composite_candidates` and `llm_dropped_endpoints` default to empty for
    backwards compatibility with existing fixture-derived test inputs.
    """

    model_config = ConfigDict(extra="forbid")

    tool_plans: list[ToolPlan]
    composite_candidates: list[CompositeCandidate] = Field(default_factory=list)
    llm_dropped_endpoints: list[DroppedEndpoint] = Field(default_factory=list)


class CapsEnforcementResult(BaseModel):
    """Output of `enforce_caps`: the post-trim plan list + cap-dropped entries."""

    model_config = ConfigDict(extra="forbid")

    tool_plans: list[ToolPlan]
    cap_dropped: list[DroppedEndpoint]


# ──────────────────────────── Public functions ─────────────────────────────


def validate_naming(plans: list[ToolPlan]) -> None:
    """Enforce D-17 naming regex + uniqueness across `plans`.

    Raises ``Pass0Error("INVALID_NAMING: ...")`` on first regex violation, or
    ``Pass0Error("DUPLICATE_NAMING: ...")`` on first duplicate. Pure: returns
    ``None`` on success; the caller's plan list is unchanged.
    """
    seen: set[str] = set()
    for plan in plans:
        if not _TOOL_NAME_REGEX.match(plan.name):
            suggestion = _suggest_name_correction(plan.name)
            raise Pass0Error(
                f"INVALID_NAMING: '{plan.name}' violates pattern "
                f"^[a-z][a-z0-9_]{{0,63}}$ — try '{suggestion}'",
                suggestions=[suggestion],
            )
        if plan.name in seen:
            raise Pass0Error(
                f"DUPLICATE_NAMING: '{plan.name}' appears more than once across tool plans",
                suggestions=[plan.name],
            )
        seen.add(plan.name)


def enforce_caps(
    llm_output: Pass0LlmOutput,
    target_complexity: str,
    max_tools_override: int | None,
) -> CapsEnforcementResult:
    """Trim plan list to the effective tier cap or hard-fail with split suggestions.

    Resolution order (D-18 + D-19):
    - effective_cap = ``min(max_tools_override, _MAX_OVERRIDE_CAP)`` if set,
      else ``_TIER_CAPS[target_complexity]``.
    - ``len(plans) <= effective_cap`` → return unchanged.
    - ``effective_cap < len(plans) <= _HARD_FAIL_THRESHOLD`` → trim to cap;
      prefer keeping plans that subsume ≥2 endpoints (universal/multi-CRUD)
      over single-endpoint plans; among single-endpoint plans, keep those
      with longer rationales.
    - ``len(plans) > _HARD_FAIL_THRESHOLD`` → raise
      ``Pass0Error("MULTI_SERVER_SPLIT_REQUIRED", suggestions=[...])``.
    """
    if target_complexity not in _TIER_CAPS:
        raise Pass0Error(
            f"INVALID_TARGET_COMPLEXITY: '{target_complexity}' must be one of {sorted(_TIER_CAPS)}",
        )

    effective_cap = _resolve_effective_cap(target_complexity, max_tools_override)
    plan_count = len(llm_output.tool_plans)

    if plan_count > _HARD_FAIL_THRESHOLD:
        suggestions = _suggest_splits_from_plans(llm_output.tool_plans)
        _log.warning(
            "pass_0.caps.multi_server_split_required",
            plan_count=plan_count,
            hard_fail_threshold=_HARD_FAIL_THRESHOLD,
            suggestion_count=len(suggestions),
        )
        raise Pass0Error(
            f"MULTI_SERVER_SPLIT_REQUIRED: {plan_count} tool plans exceed "
            f"the {_HARD_FAIL_THRESHOLD}-tool hard cap; split into multiple servers",
            suggestions=suggestions,
        )

    if plan_count <= effective_cap:
        return CapsEnforcementResult(tool_plans=list(llm_output.tool_plans), cap_dropped=[])

    sorted_by_priority = sorted(
        llm_output.tool_plans,
        key=_plan_priority_key,
        reverse=True,
    )
    kept = sorted_by_priority[:effective_cap]
    dropped_plans = sorted_by_priority[effective_cap:]

    cap_dropped = [
        DroppedEndpoint(
            method=_first_endpoint_method(plan),
            path=_first_endpoint_path(plan),
            reason=Reason.EXCEEDS_CAP,
            can_user_override=True,
        )
        for plan in dropped_plans
    ]

    _log.info(
        "pass_0.caps.trimmed",
        plan_count=plan_count,
        effective_cap=effective_cap,
        target_complexity=target_complexity,
        max_tools_override=max_tools_override,
        kept_count=len(kept),
        dropped_count=len(cap_dropped),
    )

    return CapsEnforcementResult(tool_plans=kept, cap_dropped=cap_dropped)


def cluster_by_path_prefix(
    endpoints: list[Endpoint],
    min_cluster_size: int = _DEFAULT_CLUSTER_MIN,
) -> list[str]:
    """Group endpoints by first two path segments; return clusters ≥ threshold.

    Returns an alphabetically-sorted list of cluster prefixes (e.g.,
    ``["/v1/customers", "/v1/treasury"]``). Used by `enforce_caps` to suggest
    concrete top-level path-prefix splits when the spec exceeds the hard cap.
    """
    counts: dict[str, int] = {}
    for ep in endpoints:
        prefix = _first_two_segments(ep.path)
        if prefix is None:
            continue
        counts[prefix] = counts.get(prefix, 0) + 1

    return sorted(prefix for prefix, count in counts.items() if count >= min_cluster_size)


# ─────────────────────────────── Helpers ───────────────────────────────────


def _resolve_effective_cap(target_complexity: str, max_tools_override: int | None) -> int:
    if max_tools_override is not None:
        if max_tools_override <= 0:
            raise Pass0Error(
                f"INVALID_OVERRIDE: max_tools_override must be positive (got {max_tools_override})"
            )
        return min(max_tools_override, _MAX_OVERRIDE_CAP)
    return _TIER_CAPS[target_complexity]


def _plan_priority_key(plan: ToolPlan) -> tuple[int, int, int]:
    """Higher tuple → higher priority → kept before lower-priority peers.

    Heuristic (D-26 cap-trim policy):
    1. Plans subsuming ≥ 2 endpoints (universal CRUD) outrank single-endpoint plans.
    2. Within each tier, longer rationales (proxy for "more thought / more
       coverage") rank higher.
    3. Stable tiebreaker on negative source-endpoint count (so determinism wins
       over equal-rationale ties).
    """
    multi_endpoint_bonus = 1 if len(plan.source_endpoints) >= 2 else 0
    rationale_length = len(plan.rationale or "")
    source_count = len(plan.source_endpoints)
    return (multi_endpoint_bonus, rationale_length, source_count)


def _first_endpoint_method(plan: ToolPlan) -> str:
    """Extract the method from the first ``source_endpoint`` (`"METHOD path"`)."""
    parts = plan.source_endpoints[0].split(" ", 1)
    return parts[0] if parts else "GET"


def _first_endpoint_path(plan: ToolPlan) -> str:
    """Extract the path from the first ``source_endpoint`` (`"METHOD path"`)."""
    parts = plan.source_endpoints[0].split(" ", 1)
    return parts[1] if len(parts) >= 2 else "/"


def _first_two_segments(path: str) -> str | None:
    """Return the first two path segments (with leading slash), or None.

    ``/v1/customers/abc`` → ``/v1/customers``.
    ``/users`` → ``/users`` (single segment is acceptable for short specs).
    ``/`` or empty → None.
    """
    cleaned = path.strip()
    if not cleaned or cleaned == "/":
        return None
    segments = [s for s in cleaned.split("/") if s]
    if not segments:
        return None
    if len(segments) == 1:
        return f"/{segments[0]}"
    return f"/{segments[0]}/{segments[1]}"


def _suggest_splits_from_plans(plans: list[ToolPlan]) -> list[str]:
    """Build split suggestions from the source endpoints of overflowing plans."""
    paths: list[str] = []
    for plan in plans:
        for endpoint_id in plan.source_endpoints:
            split = endpoint_id.split(" ", 1)
            if len(split) >= 2:
                paths.append(split[1])

    counts: dict[str, int] = {}
    for path in paths:
        prefix = _first_two_segments(path)
        if prefix is None:
            continue
        counts[prefix] = counts.get(prefix, 0) + 1

    return sorted(prefix for prefix, count in counts.items() if count >= _DEFAULT_CLUSTER_MIN)


def _suggest_name_correction(name: str) -> str:
    """Best-effort transform of an invalid name into a regex-conformant one.

    Lowercases, replaces non-alphanum with ``_``, collapses repeats, trims
    leading underscores/digits, and truncates to 64 chars. The output is a
    *suggestion only* — it isn't guaranteed to be unique within the plan list.
    """
    lowered = name.lower()
    replaced = re.sub(r"[^a-z0-9_]+", "_", lowered)
    collapsed = re.sub(r"_+", "_", replaced).strip("_")
    while collapsed and collapsed[0].isdigit():
        collapsed = collapsed[1:]
    if not collapsed:
        return "tool"
    return collapsed[:64]
