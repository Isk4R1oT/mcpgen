"""Pass 4 — Annotations Inference (3-phase orchestrator).

Public API:

    async def run(pass_3_output: Pass3Output, pass_2_output: Pass2Output,
                  pass_1_output: Pass1Output) -> Pass4Output

Three phases (D-26):

- Phase 1 (deterministic, $0, <1s): rules + verbs + titles for ~80% of
  tools. Universal + specialized tools get the tool-type rule triple;
  workflow tools get conservative aggregation; action tools first try the
  high-confidence verb pattern, falling back to ``_needs_llm_review`` for
  medium-confidence verbs.
- Phase 2 (LLM ‖ Sem 5, $0.01-0.03): selective Qwen judgment for tools
  marked ``_needs_llm_review`` only (typically 0-3 per server). All other
  tools skip the LLM entirely.
- Phase 3 (deterministic, $0, <1s): consistency validation with auto-fix
  (Rules 1+2; D-26) followed by final IR assembly with
  ``openWorldHint=True`` hardcoded (D-27 invariant).

Threats addressed:
- T-03-OW (D-27): every emitted ``Annotations`` has ``openWorldHint=True``
  via ``consistency.assemble_annotations_with_open_world_hint`` (single
  legal construction site in this package).
- T-03-VP (D-29): conservative defaults guard the action verb path —
  unmatched verbs route to LLM judgment which itself falls back to
  conservative defaults on retry exhaustion.
- Pitfall #31 (D-32): the deterministic rule table from Plan 03-10
  hardcodes ``readOnlyHint=True`` for every read-shaped tool (universal
  search/fetch/list_*, specialized) — verified by the test suite.

References:
- 03-CONTEXT.md D-04 + D-26 + D-27 + D-32 + D-39
- 03-RESEARCH.md §"Architecture Patterns" Pattern 5
- docs/mcpgen-pass-4-design.md §5 + Appendix A
"""

from __future__ import annotations

import time
from typing import Final

import structlog
from mcpgen_ir.types import (
    Pass1Output,
    Pass2Output,
    Pass3Output,
    Pass4Output,
    Type,
)

from mcpgen_engine.passes.pass_4.consistency import (
    Pass4Error,
    assemble_annotations_with_open_world_hint,
    enforce_consistency_with_autofix,
)
from mcpgen_engine.passes.pass_4.llm_judge import (
    _CONSERVATIVE_DEFAULTS,
    judge_action_tools,
)
from mcpgen_engine.passes.pass_4.rules import (
    aggregate_workflow_annotations,
    apply_tool_type_rules,
)
from mcpgen_engine.passes.pass_4.titles import generate_title
from mcpgen_engine.passes.pass_4.verbs import match_verb_pattern

# Re-exports for callers that orchestrate Pass 4 together with other passes.
__all__ = [
    "PASS_4_VERSION",
    "Pass4Error",
    "run",
]

# D-35 cache-key hint — bump when prompts/logic change in a way that
# invalidates cached Pass 4 outputs (decision must accompany the bump in
# ``docs/decisions/``).
PASS_4_VERSION: Final[str] = "1"

_log = structlog.get_logger(__name__)


# ─────────────────────────────── Public API ────────────────────────────────


async def run(
    pass_3_output: Pass3Output,  # noqa: ARG001 — kept for downstream Stage E parity
    pass_2_output: Pass2Output,
    pass_1_output: Pass1Output,
    *,
    generation_id: str,
) -> Pass4Output:
    """3-phase Pass 4 orchestrator (D-26).

    ``pass_3_output`` is currently unused but accepted for API parity with
    the downstream pipeline (Plan 03-12 chains Pass 2 → Pass 3 → Pass 4
    by signature). Pass 2 descriptions enrich the LLM judge's prompts;
    Pass 1 tools drive the deterministic rule + verb + workflow paths.

    ``generation_id`` correlates Langfuse traces per-generation (Phase 10
    plan 10-03 D-06 item 1) and is threaded through ``judge_action_tools``
    to ``run_with_tracing``.
    """
    start = time.monotonic()
    all_tools = pass_1_output.tools

    # ─── Phase 1: deterministic rules + verb matching + title generation ───
    triples: dict[str, dict[str, bool]] = {}
    titles: dict[str, str] = {}
    needs_llm_review: list[str] = []

    for tool in all_tools:
        titles[tool.name] = generate_title(tool)

        # Tool-type rules cover universal + specialized exhaustively.
        rule_result = apply_tool_type_rules(tool)
        if rule_result.is_decisive:
            assert rule_result.read_only is not None
            assert rule_result.destructive is not None
            assert rule_result.idempotent is not None
            triples[tool.name] = {
                "readOnlyHint": rule_result.read_only,
                "destructiveHint": rule_result.destructive,
                "idempotentHint": rule_result.idempotent,
            }
            continue

        # Action tools: try high-confidence verb pattern first; medium →
        # LLM review; none → conservative defaults (D-29 fallback).
        if tool.type == Type.action:
            verb_result = match_verb_pattern(tool.name)
            if verb_result.confidence == "high":
                assert verb_result.read_only is not None
                assert verb_result.destructive is not None
                assert verb_result.idempotent is not None
                triples[tool.name] = {
                    "readOnlyHint": verb_result.read_only,
                    "destructiveHint": verb_result.destructive,
                    "idempotentHint": verb_result.idempotent,
                }
                continue
            if verb_result.confidence == "medium":
                needs_llm_review.append(tool.name)
                continue
            # No verb match → conservative defaults (D-29).
            triples[tool.name] = dict(_CONSERVATIVE_DEFAULTS)
            continue

        # Workflow tools: D-30 conservative aggregation across sub-operations.
        if tool.type == Type.workflow:
            agg_result = aggregate_workflow_annotations(tool, all_tools)
            assert agg_result.is_decisive
            assert agg_result.read_only is not None
            assert agg_result.destructive is not None
            assert agg_result.idempotent is not None
            triples[tool.name] = {
                "readOnlyHint": agg_result.read_only,
                "destructiveHint": agg_result.destructive,
                "idempotentHint": agg_result.idempotent,
            }
            continue

        # Defensive: any other type → conservative defaults (D-29).
        triples[tool.name] = dict(_CONSERVATIVE_DEFAULTS)

    # ─── Phase 2: selective LLM judgment for medium-confidence actions ─────
    if needs_llm_review:
        llm_results = await judge_action_tools(
            needs_llm_review, pass_2_output, generation_id=generation_id
        )
        for name, result_triple in llm_results.items():
            triples[name] = result_triple

    # Defensive sweep: any tool still missing from the triples dict → fall
    # back to conservative defaults so Phase 3 never raises on missing keys.
    # In normal operation this loop should be a no-op.
    for tool in all_tools:
        if tool.name not in triples:
            _log.warning(
                "pass_4.run.fallback_to_conservative_for_missing",
                tool_name=tool.name,
            )
            triples[tool.name] = dict(_CONSERVATIVE_DEFAULTS)

    # ─── Phase 3: consistency validation + IR assembly (openWorldHint=True) ─
    consistent = enforce_consistency_with_autofix(triples)
    annotations = assemble_annotations_with_open_world_hint(consistent)

    elapsed_ms = int((time.monotonic() - start) * 1000)
    _log.info(
        "pass_4.run.complete",
        tool_count=len(annotations),
        llm_review_count=len(needs_llm_review),
        elapsed_ms=elapsed_ms,
    )

    return Pass4Output(annotations=annotations, titles=titles)
