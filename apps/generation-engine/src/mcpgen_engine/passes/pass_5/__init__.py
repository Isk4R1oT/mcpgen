"""Pass 5 — Response Shaping (5-phase orchestrator).

Public API:

    async def run(pass_4_output, pass_3_output, pass_2_output,
                  pass_1_output, raw_ir) -> Pass5Output

Five phases (D-05):

- Phase 1 (``pagination.py``, deterministic, $0, < 1s): per-server pagination
  strategy detection (cursor → offset → page-number → none), majority vote.
- Phase 2 (``output_schema.py``, deterministic, $0, < 1s): outputSchema
  extraction with canonical ``{id, object_type, data, metadata}`` envelope.
- Phase 3 (``field_ranking.py``, LLM ‖ Sem 10): per-tool Qwen field-importance
  ranking with deterministic fallback for ≤ 10 fields and LLM exhaustion.
- Phase 4 (``truncation.py``, deterministic, $0, ~1s): per-tool-type
  truncation thresholds + Pitfall #5 anti-loop guidance templates.
- Phase 5 (``response_format.py`` + ``validation.py`` + ``final_assembly.py``,
  deterministic, $0, < 1s): D-10 ``response_format`` enum gate per tool +
  cross-tool consistency validation + ``Tool2[]`` IR assembly.

Threats addressed:
- T-04-05-OW-invariant (D-27 propagation): ``openWorldHint=True`` invariant
  inherited from Pass 4 unchanged via ``final_assembly.assemble_final_tools``.
- T-04-05-pagination-inconsistency (D-08): cross-tool style validator
  raises ``Pass5Error`` BEFORE ``Pass5Output`` is returned.

References:
- 04-CONTEXT.md D-04 + D-05 + D-08 + D-10 + D-41
- docs/mcpgen-pass-5-design.md §4 + §11
- Analog: ``apps/generation-engine/src/mcpgen_engine/passes/pass_4/__init__.py``
  (3-phase orchestrator with deterministic + selective-LLM + consistency-
  validation chain).
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
    Pass5Output,
    RawIR,
)

from mcpgen_engine.passes.pass_5.field_ranking import (
    FieldRanking,
    rank_all_fields,
)
from mcpgen_engine.passes.pass_5.final_assembly import assemble_final_tools
from mcpgen_engine.passes.pass_5.output_schema import extract_all_output_schemas
from mcpgen_engine.passes.pass_5.pagination import (
    PaginationStrategy,
    detect_pagination_for_endpoint,
    detect_pagination_strategy,
    vote_majority_strategy,
)
from mcpgen_engine.passes.pass_5.response_format import should_add_response_format
from mcpgen_engine.passes.pass_5.truncation import build_all_truncation_configs
from mcpgen_engine.passes.pass_5.validation import (
    Pass5Error,
    validate_cursor_offset_param_names_uniform,
    validate_pagination_consistency,
    validate_truncation_placeholders,
)

# D-35 cache-key hint — bumped via paired ``docs/decisions/`` entry whenever
# any Pass 5 prompt OR algorithm changes that invalidates cached outputs.
PASS_5_VERSION: Final[str] = "1"

__all__ = [
    "PASS_5_VERSION",
    "PaginationStrategy",
    "Pass5Error",
    "detect_pagination_for_endpoint",
    "detect_pagination_strategy",
    "rank_all_fields",
    "run",
    "validate_cursor_offset_param_names_uniform",
    "validate_pagination_consistency",
    "validate_truncation_placeholders",
    "vote_majority_strategy",
]

_log = structlog.get_logger(__name__)


# ─────────────────────────────── Public API ────────────────────────────────


async def run(
    pass_4_output: Pass4Output,
    pass_3_output: Pass3Output,
    pass_2_output: Pass2Output,
    pass_1_output: Pass1Output,
    raw_ir: RawIR,
) -> Pass5Output:
    """5-phase Pass 5 orchestrator (D-05).

    Pure orchestrator chaining: pagination → outputSchema → field ranking
    (LLM-bearing) → truncation → response_format gate + cross-tool validation
    + final assembly.

    Returns ``Pass5Output(tools=[...])``. The IR ``Pass5Output`` shape carries
    only the ``tools`` field today; additive ``flags`` (server pagination
    strategy, override count, low-confidence count, response_format added
    count) is deferred to plan 04-06's IR additive bump per Open Q1.
    """
    start = time.monotonic()

    # ─── Phase 1: pagination strategy detection (server-wide) ────────────
    server_pagination, override_warnings = detect_pagination_strategy(pass_1_output, raw_ir)

    # ─── Phase 2: outputSchema extraction (per tool) ─────────────────────
    output_schemas = extract_all_output_schemas(pass_1_output, raw_ir)

    # ─── Phase 3: LLM field ranking (concurrency 10, deterministic fallback) ─
    field_rankings = await rank_all_fields(output_schemas, pass_2_output, pass_1_output)

    # ─── Phase 4: truncation guidance templates (deterministic, frozen table) ─
    truncation_configs = build_all_truncation_configs(pass_1_output, server_pagination.style)

    # ─── Phase 5a: response_format gate flags (D-10) ────────────────────
    response_format_flags: dict[str, bool] = {}
    for tool in pass_1_output.tools:
        ranking = field_rankings.get(tool.name) or FieldRanking()
        response_format_flags[tool.name] = should_add_response_format(tool, ranking)

    # ─── Phase 5b/c: assemble FinalTool[] then run cross-tool validators ─
    # Order: assemble first so the validators can inspect the IR shape they
    # actually receive downstream (pagination-style / truncation-template
    # placeholders are validated on the assembled IR).
    final_tools = assemble_final_tools(
        pass_1_output,
        pass_2_output,
        pass_3_output,
        pass_4_output,
        output_schemas,
        field_rankings,
        truncation_configs,
        server_pagination,
    )

    validate_pagination_consistency(final_tools, server_pagination)
    validate_truncation_placeholders(final_tools)
    validate_cursor_offset_param_names_uniform(final_tools)

    elapsed_ms = int((time.monotonic() - start) * 1000)
    low_confidence_count = sum(
        1 for spec in output_schemas.values() if spec.inference_low_confidence
    )
    response_format_added_count = sum(1 for v in response_format_flags.values() if v)
    llm_call_count = sum(1 for spec in output_schemas.values() if len(spec.fields) > 10)
    _log.info(
        "pass_5.run.complete",
        tool_count=len(final_tools),
        server_pagination=server_pagination.style,
        llm_call_count=llm_call_count,
        low_confidence_count=low_confidence_count,
        response_format_added_count=response_format_added_count,
        pagination_overrides_count=len(override_warnings),
        elapsed_ms=elapsed_ms,
    )

    return Pass5Output(tools=final_tools)
