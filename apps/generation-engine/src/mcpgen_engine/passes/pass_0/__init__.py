"""Pass 0 — Tool Inventory & Naming (entry point + sub-stage exports).

Three internal stages (D-16):
- Stage 0a — deterministic filter (`filter.py`).
- Stage 0b — Qwen LLM call (`llm.py` for ≤ 200 endpoints; `chunked.py` for > 200).
- Stage 0c — deterministic validation (`validation.py`) — caps + naming.

Per-endpoint auth detection lives in `auth_detect.py` (D-21, D-22).

Public API:

    async def run(raw_ir: RawIR, options: UserOptions) -> Pass0Output

The orchestrator chains 0a → auth_detect → 0b (single OR chunked) → 0c and
constructs the FROZEN ``Pass0Output`` IR. Failure modes:

- ``Pass0Error("MULTI_SERVER_SPLIT_REQUIRED")`` — re-raised; the user's
  surface signal to split the spec across multiple servers (D-18).
- ``Pass0Error("SPEC_TOO_LARGE_ENDPOINTS")`` — re-raised; > 1000 endpoints
  past the deterministic filter (D-20).
- ``Pass0Error("LLM_VALIDATION_FAILED")`` — caught and converted to a
  degraded fallback (D-26): every kept endpoint emitted as a `specialized`
  ToolPlan with `degraded=true` flagged in `prompt_injection_warnings`.

Other ``Pass0Error`` subcodes from validation (`INVALID_NAMING`,
`DUPLICATE_NAMING`, `INVALID_TARGET_COMPLEXITY`, `INVALID_OVERRIDE`)
propagate to the caller.

Threats addressed:
- T-2-15 (D-51): inherited from `prompts.py` / `llm.py`.
- T-2-16 (D-52): structlog logs only structural counts at this layer
  (final_tool_plan_count, total_dropped, chunked, degraded, elapsed_ms).

References:
- 02-CONTEXT.md D-16 (3 stages), D-20 (chunked threshold), D-26 (retry/degrade),
  D-50 (single async run per pass)
- 02-RESEARCH.md §"Pass 0 Module Skeleton"
- 02-PATTERNS.md `passes/pass_0/__init__.py` row
- docs/mcpgen-pass-0-design.md (whole doc)
"""

from __future__ import annotations

import re
import time
from typing import Final

import structlog
from mcpgen_ir.types import (
    AuthRequirement1,
    Category,
    DroppedEndpoint1,
    Endpoint,
    Method,
    Pass0Output,
    RawIR,
    TargetComplexity,
    ToolPlan,
)

from .auth_detect import detect_auth_per_endpoint
from .chunked import CHUNKED_THRESHOLD, HARD_FAIL_THRESHOLD, run_llm_chunked
from .filter import UserOptions, deterministic_filter
from .llm import run_llm_stage
from .validation import (
    Pass0Error,
    Pass0LlmOutput,
    cluster_by_path_prefix,
    enforce_caps,
    validate_naming,
)

# Re-exports for callers that orchestrate Pass 0 together with surrounding stages.
__all__ = [
    "CHUNKED_THRESHOLD",
    "HARD_FAIL_THRESHOLD",
    "Pass0Error",
    "UserOptions",
    "run",
]

# Hard-cap for the orchestrator's pre-LLM count gate. Mirrors the chunked
# module's value to fail-fast before any LLM call fires.
_PRE_LLM_HARD_FAIL_THRESHOLD: Final[int] = HARD_FAIL_THRESHOLD

# Maximum count of degraded specialized_tools to emit when the LLM exhausts
# its validation retries. Past this threshold we still raise — the spec is
# fundamentally unmappable. Ceiling matches the comprehensive tier cap (D-25).
_DEGRADED_FALLBACK_HARD_FAIL: Final[int] = 80

_log = structlog.get_logger(__name__)


# ─────────────────────────────── Public API ────────────────────────────────


async def run(raw_ir: RawIR, options: UserOptions) -> Pass0Output:
    """Orchestrate Pass 0 — Tool Inventory & Naming.

    Pipeline:

    1. Stage 0a — `deterministic_filter`.
    2. Per-endpoint auth detection (`detect_auth_per_endpoint`).
    3. Pre-LLM count gate — > 1000 kept endpoints raises
       ``Pass0Error("SPEC_TOO_LARGE_ENDPOINTS")``.
    4. Stage 0b — `run_llm_stage` for ≤ 200 endpoints, `run_llm_chunked`
       above. On `LLM_VALIDATION_FAILED` → degraded fallback.
    5. Stage 0c — `enforce_caps` + `validate_naming`.
    6. Construct the FROZEN ``Pass0Output``.

    Logs only structural counts (D-52). Pure: no I/O outside the LLM call;
    deterministic for a given (raw_ir, options) modulo LLM non-determinism.
    """
    start_ts = time.monotonic()
    warnings: list[str] = []

    # Stage 0a — deterministic filter.
    kept_endpoints, deterministic_dropped = deterministic_filter(raw_ir.endpoints, options)

    # Per-endpoint auth detection (D-21). Stage A doesn't yet plumb through
    # operation-level security overrides or vendor extensions; the IR carries
    # only `security_schemes`. Pass `None`/empty maps for now — Phase 2 plumbing
    # of those signals lands in a future Stage A enrichment.
    auth_requirements_by_id = detect_auth_per_endpoint(
        endpoints=kept_endpoints,
        global_security_schemes=raw_ir.security_schemes,
        global_default_security=None,
        operation_security_by_endpoint=None,
        extensions_by_endpoint=None,
    )

    # Pre-LLM count gate (D-20).
    if len(kept_endpoints) > _PRE_LLM_HARD_FAIL_THRESHOLD:
        suggestions = cluster_by_path_prefix(kept_endpoints, min_cluster_size=30)
        _log.warning(
            "pass_0.run.spec_too_large",
            kept_count=len(kept_endpoints),
            hard_fail_threshold=_PRE_LLM_HARD_FAIL_THRESHOLD,
            suggestion_count=len(suggestions),
        )
        raise Pass0Error(
            f"SPEC_TOO_LARGE_ENDPOINTS: {len(kept_endpoints)} endpoints exceed "
            f"the {_PRE_LLM_HARD_FAIL_THRESHOLD}-endpoint pipeline ceiling; "
            "split the spec by top-level path prefix",
            suggestions=suggestions,
        )

    # Stage 0b — single-shot vs chunked.
    chunked = len(kept_endpoints) > CHUNKED_THRESHOLD
    degraded = False
    try:
        if chunked:
            llm_output = await run_llm_chunked(kept_endpoints, options)
        else:
            llm_output = await run_llm_stage(kept_endpoints, options)
    except Pass0Error as exc:
        # Only LLM_VALIDATION_FAILED converts to degraded fallback (D-26).
        # SPEC_TOO_LARGE_ENDPOINTS / LLM_TRANSIENT_FAILED propagate.
        if not str(exc).startswith("LLM_VALIDATION_FAILED"):
            raise
        if len(kept_endpoints) > _DEGRADED_FALLBACK_HARD_FAIL:
            # Beyond the comprehensive cap we have no way to produce a
            # meaningful fallback — re-raise so the caller surfaces the failure.
            raise
        llm_output = _build_degraded_fallback(kept_endpoints)
        degraded = True
        warnings.append(
            "degraded=true: Pass 0 LLM validation exhausted retries; "
            "kept endpoints emitted as specialized_tools",
        )
        _log.warning(
            "pass_0.run.degraded_fallback",
            kept_count=len(kept_endpoints),
            error=str(exc),
        )

    # Stage 0c — caps + naming.
    validated = enforce_caps(
        llm_output,
        target_complexity=options.target_complexity,
        max_tools_override=options.max_tools_override,
    )
    validate_naming(validated.tool_plans)

    # Build final Pass0Output.
    elapsed_ms = int((time.monotonic() - start_ts) * 1000)

    final_dropped = [
        *(_to_pass0_dropped(d) for d in deterministic_dropped),
        *(_to_pass0_dropped(d) for d in validated.cap_dropped),
        *(_to_pass0_dropped(d) for d in llm_output.llm_dropped_endpoints),
    ]
    pass0_output = Pass0Output(
        tool_plans=validated.tool_plans,
        dropped_endpoints=final_dropped,
        composite_candidates=llm_output.composite_candidates,
        auth_requirements=_to_pass0_auth(auth_requirements_by_id),
        target_complexity=TargetComplexity(options.target_complexity),
        prompt_injection_warnings=warnings,
    )

    _log.info(
        "pass_0.run.complete",
        final_tool_plan_count=len(pass0_output.tool_plans),
        total_dropped=len(pass0_output.dropped_endpoints),
        chunked=chunked,
        degraded=degraded,
        elapsed_ms=elapsed_ms,
    )

    return pass0_output


# ─────────────────────────── Degraded fallback ─────────────────────────────


def _build_degraded_fallback(endpoints: list[Endpoint]) -> Pass0LlmOutput:
    """Build a degraded `Pass0LlmOutput` — one specialized ToolPlan per endpoint.

    Used when the LLM exhausts validation retries (D-26). The user gets a
    workable surface (every endpoint becomes a tool) instead of a hard fail.
    Names are derived deterministically from the endpoint's operationId or
    method+path, normalized to the IR regex `^[a-z][a-z0-9_]{0,63}$` and
    deduplicated by appending a numeric suffix on collisions.
    """
    seen: set[str] = set()
    plans: list[ToolPlan] = []
    for ep in endpoints:
        candidate = _normalize_to_tool_name(ep.operation_id) if ep.operation_id else ""
        if not candidate:
            method = _method_str(ep.method).lower()
            path_token = _normalize_to_tool_name(ep.path) or "endpoint"
            candidate = f"{path_token}_{method}"
        candidate = _ensure_unique(candidate, seen)
        seen.add(candidate)

        plans.append(
            ToolPlan(
                name=candidate,
                category=Category.specialized,
                source_endpoints=[f"{_method_str(ep.method)} {ep.path}"],
                rationale="degraded fallback after Pass 0 LLM validation exhaustion",
            )
        )
    return Pass0LlmOutput(
        tool_plans=plans,
        composite_candidates=[],
        llm_dropped_endpoints=[],
    )


# ──────────────────────────── Conversion helpers ───────────────────────────


def _to_pass0_dropped(d: object) -> DroppedEndpoint1:
    """Coerce any DroppedEndpoint variant to the FROZEN `DroppedEndpoint1` IR shape.

    Both `DroppedEndpoint` (used by filter/validation) and `DroppedEndpoint1`
    (used by `Pass0Output`) carry the same field set; the IR codegen produced
    duplicate models. We round-trip via `model_dump` to keep the orchestrator
    decoupled from which variant a sub-stage returns.
    """
    if hasattr(d, "model_dump"):
        return DroppedEndpoint1.model_validate(d.model_dump())
    msg = f"unexpected dropped-endpoint shape: {type(d).__name__}"
    raise TypeError(msg)


def _to_pass0_auth(
    auth_by_id: dict[str, list[object]],
) -> dict[str, list[AuthRequirement1]]:
    """Coerce `dict[str, list[AuthRequirement]]` → `dict[str, list[AuthRequirement1]]`."""
    out: dict[str, list[AuthRequirement1]] = {}
    for endpoint_id, reqs in auth_by_id.items():
        out[endpoint_id] = [
            AuthRequirement1.model_validate(req.model_dump() if hasattr(req, "model_dump") else req)
            for req in reqs
        ]
    return out


# ──────────────────────────── Name normalization ───────────────────────────


def _method_str(method: Method | str) -> str:
    """Coerce ``Endpoint.method`` (Method enum or str) to uppercase string form."""
    if isinstance(method, Method):
        return str(method.value)
    return str(method).upper()


def _normalize_to_tool_name(raw: str) -> str:
    """Best-effort normalization of `raw` to the IR tool-name regex.

    Lowercases, replaces non-alphanum with `_`, collapses repeats, strips
    leading underscores/digits, truncates to 64 chars. May return an empty
    string if `raw` has no usable characters — caller falls back to a
    structural default.
    """
    lowered = raw.lower()
    replaced = re.sub(r"[^a-z0-9_]+", "_", lowered)
    collapsed = re.sub(r"_+", "_", replaced).strip("_")
    while collapsed and collapsed[0].isdigit():
        collapsed = collapsed[1:]
    return collapsed[:64]


def _ensure_unique(candidate: str, seen: set[str]) -> str:
    """Append `_<n>` until uniqueness; clamp to 64 chars (mirrors chunked.py)."""
    if candidate not in seen:
        return candidate or "tool"
    base = candidate or "tool"
    i = 2
    while True:
        suffix = f"_{i}"
        max_base = max(1, 64 - len(suffix))
        next_candidate = f"{base[:max_base]}{suffix}"
        if next_candidate not in seen:
            return next_candidate
        i += 1
