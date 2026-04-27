"""Pass 1 — Six-Tool Pattern Consolidation (entry point + sub-stage exports).

Four internal phases (D-28):

- Phase 1.1 — deterministic classification (``classify.py``).
- Phase 1.2 — Qwen LLM schema synthesis (``schema_synth.py``); per-tool parallel
  with ``asyncio.Semaphore(10)``.
- Phase 1.3 — deterministic routing (``routing.py``); smart-ID format + Rule[].
- Phase 1.4 — deterministic coverage validation (``coverage.py``); 3-retry
  orchestration on coverage gap (D-34).

Public API::

    async def run(
        pass_0_output: Pass0Output,
        raw_ir: RawIR,
        spec_title: str,
        options: UserOptions,
    ) -> Pass1Output

The orchestrator chains 1.1 → 1.2 → 1.3 → 1.4 and constructs the FROZEN
``Pass1Output`` IR. Failure modes:

- ``Pass1Error("LLM_VALIDATION_FAILED")`` — propagated from
  ``schema_synth.py`` when the LLM exhausts its validation retries; orchestrator
  surfaces directly (Phase 5 F2 will handle).
- Coverage gap after 3 retries → degraded fallback (D-34): residue endpoints
  emitted as ``specialized_tools`` with ``coverage_pct < 100.0`` recorded so
  callers can flag the QualityReport.

Threats addressed:
- T-2-07-01..06 (per `02-07-PLAN.md` threat register) — inherited from
  the per-phase modules.

References:
- 02-CONTEXT.md D-28 (4-phase pipeline) + D-29 (6 universal always) + D-31
  (smart-ID format) + D-33 (coverage proof) + D-34 (3-retry + degrade) +
  D-35 (6-12 final tool target) + D-36 (action/workflow/specialized gates) +
  D-50 (single async run per pass)
- 02-RESEARCH.md §"Pass 1 Module Skeleton" lines 1172-1224
- 02-PATTERNS.md `passes/pass_1/__init__.py` row
- docs/mcpgen-pass-1-design.md (whole doc)
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Final

import structlog
from mcpgen_ir.types import (
    CoverageProofItem,
    Method,
    Pass0Output,
    Pass1Output,
    RawIR,
    Routing1,
    Tool1,
    Type,
)

from mcpgen_engine.passes.pass_0.filter import UserOptions

from .classify import (
    ClassifiedTools,
    ExtraTool,
    classify_tool_plans,
)
from .coverage import (
    CoverageError,
    build_coverage_proof,
    coverage_pct,
    find_uncovered,
)
from .routing import (
    build_routing_config,
    build_smart_id_format,
    build_smart_id_regex,
    derive_spec_slug,
)
from .schema_synth import (
    Pass1Error,
    synthesize_extra_tool,
    synthesize_universal_tools,
)

# D-28 — schema-synth concurrency cap.
PASS_1_SCHEMA_SYNTH_CONCURRENCY: Final[int] = 10

# D-34 — coverage retry budget before degraded fallback.
MAX_COVERAGE_RETRIES: Final[int] = 3

__all__ = [
    "MAX_COVERAGE_RETRIES",
    "PASS_1_SCHEMA_SYNTH_CONCURRENCY",
    "Pass1Error",
    "build_smart_id_format",
    "build_smart_id_regex",
    "derive_spec_slug",
    "run",
]

_log = structlog.get_logger(__name__)


# ─────────────────────────── Public API ────────────────────────────────────


async def run(
    pass_0_output: Pass0Output,
    raw_ir: RawIR,
    spec_title: str,
    options: UserOptions,
) -> Pass1Output:
    """Orchestrate Pass 1 — Six-Tool Pattern Consolidation.

    Phases:

    1. Classify Pass 0 tool_plans into 6 universal slots + extras (deterministic).
    2. Synthesize tool schemas via Qwen LLM, parallel concurrency 10.
    3. Build routing config (deterministic): smart-ID format + Rule[].
    4. Validate coverage (deterministic) — every Pass 0 endpoint must map to
       at least one rule. On coverage gap: re-synthesize universal tools with
       uncovered list in the prompt, up to ``MAX_COVERAGE_RETRIES`` times,
       then degrade residue to ``specialized_tools`` (D-34).

    Logs only structural counts (D-52). Pure: no I/O outside the LLM call.
    """
    # We accept ``options`` for forward compatibility (`max_tools_override`
    # may eventually feed Pass 1 size budget hints) but Phase 2 doesn't read
    # it directly — silenced via underscore-no-op.
    _ = options

    start_ts = time.monotonic()

    # Phase 1.1 — deterministic classification.
    classified = classify_tool_plans(
        pass_0_output.tool_plans,
        composite_candidates=pass_0_output.composite_candidates,
        dependency_graph=raw_ir.dependency_graph,
    )

    # Phase 1.2 — schema synthesis with concurrency limit.
    sem = asyncio.Semaphore(PASS_1_SCHEMA_SYNTH_CONCURRENCY)
    universal_tools, extras_tools = await _synthesize_all(classified, raw_ir, sem, uncovered=None)

    # Phase 1.3 — deterministic routing.
    spec_slug = derive_spec_slug(spec_title)
    routing = build_routing_config(universal_tools, extras_tools, spec_slug, raw_ir)

    # Phase 1.4 — deterministic coverage validation + 3-retry orchestration.
    proofs, coverage = _build_proofs_and_coverage(pass_0_output, routing, raw_ir)

    retries = 0
    while coverage < 100.0 and retries < MAX_COVERAGE_RETRIES:
        retries += 1
        uncovered = find_uncovered(pass_0_output.tool_plans, proofs, raw_ir)
        _log.warning(
            "pass_1.run.coverage_retry",
            attempt=retries,
            max_attempts=MAX_COVERAGE_RETRIES,
            uncovered_count=len(uncovered),
            coverage_pct=coverage,
        )
        # Retry only the universal call — extras are unchanged across retries
        # (the coverage gap is always a universal-slot drift; extras are
        # one-call-per-tool and either succeed or raise).
        async with sem:
            universal_tools = await synthesize_universal_tools(
                classified.universal, raw_ir, uncovered=uncovered
            )
        routing = build_routing_config(universal_tools, extras_tools, spec_slug, raw_ir)
        proofs, coverage = _build_proofs_and_coverage(pass_0_output, routing, raw_ir)

    degraded = False
    if coverage < 100.0:
        # D-34 — degrade residue to specialized_tools.
        uncovered = find_uncovered(pass_0_output.tool_plans, proofs, raw_ir)
        degraded_extras = _degrade_uncovered_to_specialized(uncovered)
        extras_tools = [*extras_tools, *degraded_extras]
        routing = build_routing_config(universal_tools, extras_tools, spec_slug, raw_ir)
        proofs, coverage = _build_proofs_and_coverage(pass_0_output, routing, raw_ir)
        degraded = True
        _log.warning(
            "pass_1.run.degraded_fallback",
            uncovered_count=len(uncovered),
            new_specialized_count=len(degraded_extras),
            final_coverage_pct=coverage,
        )

    final_tools = [*universal_tools, *extras_tools]
    elapsed_ms = int((time.monotonic() - start_ts) * 1000)

    _log.info(
        "pass_1.run.complete",
        final_tool_count=len(final_tools),
        coverage_pct=coverage,
        coverage_proof_count=len(proofs),
        retries=retries,
        degraded=degraded,
        warnings_count=len(classified.warnings),
        elapsed_ms=elapsed_ms,
    )

    return Pass1Output(
        tools=final_tools,
        routing=routing,
        workflows=[],
        coverage_pct=coverage,
        coverage_proof=proofs,
    )


# ─────────────────────────── Synthesis driver ──────────────────────────────


async def _synthesize_all(
    classified: ClassifiedTools,
    raw_ir: RawIR,
    sem: asyncio.Semaphore,
    *,
    uncovered: list[str] | None,
) -> tuple[list[Tool1], list[Tool1]]:
    """Run Phase 1.2 schema synthesis: 1 universal call + N extra calls.

    Concurrency 10 via the shared ``Semaphore``. Each extra tool consumes
    one slot for the duration of its LLM call; the universal call also
    consumes one slot.
    """

    async def _synth_universal() -> list[Tool1]:
        async with sem:
            return await synthesize_universal_tools(
                classified.universal, raw_ir, uncovered=uncovered
            )

    async def _synth_extra(extra: ExtraTool) -> Tool1:
        async with sem:
            return await synthesize_extra_tool(extra, raw_ir)

    universal_task = _synth_universal()
    extra_tasks = [_synth_extra(e) for e in classified.extras]
    universal_tools, extras_tools = await asyncio.gather(
        universal_task,
        _gather_or_empty(extra_tasks),
    )
    # Type assertion: gather returns objects shape-matching the tasks.
    return universal_tools, list(extras_tools)


async def _gather_or_empty(tasks: list) -> list:  # type: ignore[type-arg]
    """``asyncio.gather`` over a possibly-empty list (returns ``[]`` if empty).

    Avoids the edge case where ``asyncio.gather()`` on no args returns a
    coroutine that doesn't await cleanly under all event-loop policies.
    """
    if not tasks:
        return []
    return list(await asyncio.gather(*tasks))


# ─────────────────────────── Coverage helpers ──────────────────────────────


def _build_proofs_and_coverage(
    pass_0_output: Pass0Output,
    routing: Routing1,
    raw_ir: RawIR,
) -> tuple[list[CoverageProofItem], float]:
    """Deterministic coverage proof + percentage.

    Wrapper exists so the orchestrator's retry loop reads naturally; both
    underlying functions in ``coverage.py`` are pure.
    """
    try:
        proofs = build_coverage_proof(pass_0_output.tool_plans, routing, raw_ir)
    except CoverageError as exc:
        # CoverageError = sample-URL round-trip failure. Treat as zero
        # coverage so the orchestrator retries / degrades. Log but don't
        # leak spec content (only error message + endpoint identifier).
        _log.warning("pass_1.coverage.url_round_trip_failed", error=str(exc))
        proofs = []
    pct = coverage_pct(pass_0_output.tool_plans, proofs, raw_ir)
    return proofs, pct


# ─────────────────────────── Degraded fallback ─────────────────────────────


def _degrade_uncovered_to_specialized(uncovered: list[str]) -> list[Tool1]:
    """D-34 — emit each uncovered endpoint as a specialized_tools Tool1.

    Names are derived deterministically from the endpoint's method + path,
    normalised to the IR regex ``^[a-z][a-z0-9_]{0,63}$`` and de-duplicated.
    """
    seen: set[str] = set()
    tools: list[Tool1] = []
    for endpoint_id in uncovered:
        method, path = _split_endpoint_id(endpoint_id)
        candidate = _normalize_to_tool_name(f"specialized_{method.lower()}_{path}")
        candidate = _ensure_unique(candidate or "specialized_tool", seen)
        seen.add(candidate)
        tools.append(
            Tool1(
                name=candidate,
                type=Type.specialized,
                source_endpoints=[endpoint_id],
            )
        )
    return tools


def _split_endpoint_id(endpoint_id: str) -> tuple[str, str]:
    parts = endpoint_id.split(" ", 1)
    if len(parts) < 2:
        return ("GET", endpoint_id)
    return (parts[0].upper(), parts[1])


def _method_str(method: Method | str) -> str:
    if isinstance(method, Method):
        return str(method.value)
    return str(method).upper()


def _normalize_to_tool_name(raw: str) -> str:
    lowered = raw.lower()
    replaced = re.sub(r"[^a-z0-9_]+", "_", lowered)
    collapsed = re.sub(r"_+", "_", replaced).strip("_")
    while collapsed and collapsed[0].isdigit():
        collapsed = collapsed[1:]
    return collapsed[:64]


def _ensure_unique(candidate: str, seen: set[str]) -> str:
    if candidate not in seen:
        return candidate or "specialized_tool"
    base = candidate or "specialized_tool"
    i = 2
    while True:
        suffix = f"_{i}"
        max_base = max(1, 64 - len(suffix))
        next_candidate = f"{base[:max_base]}{suffix}"
        if next_candidate not in seen:
            return next_candidate
        i += 1
