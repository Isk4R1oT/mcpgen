"""Pass 2 — Description Authoring (4-phase orchestrator).

Public API:

    async def run(pass_1_output: Pass1Output, raw_ir: RawIR) -> Pass2Output

Four phases (D-04):

- Phase 1 (classify, det): per-tool template selection happens inside
  ``authoring.py`` via ``classify.select_template`` per ``Tool1.type``.
- Phase 2 (authoring, LLM): per-tool ``author_all_tools``, Sem(10),
  2-tier retry per D-12 + D-13.
- Phase 3 (quality_gate, LLM): single Qwen judge per tool with
  ``INLINE_GATE_SETTINGS``, abbreviated 4-component rubric, max 1 retry
  per D-09.
- Phase 4 (assembly, det): set ``description_hash`` on every Description
  per D-14; aggregate ``Pass2WarningSet`` flags + injection counts to
  structured logs; build the ``Pass2Output`` Pydantic instance.

Threats addressed:
- T-03-EX (D-12 + D-13): authoring.py owns the retry-revalidation loop.
- T-03-PI heuristic (D-15): ``count_prompt_injection_warnings`` aggregated
  to structured logs (no blocking).
- Pitfall #7 (D-14): every emitted ``Descriptions`` has
  ``description_hash`` set (consumed by Plan 03-12 for diff surfacing).

References:
- 03-CONTEXT.md D-04 + D-05 + D-12 + D-13 + D-14 + D-15 + D-39
- 03-PATTERNS.md ``passes/pass_2/__init__.py`` row
- docs/mcpgen-pass-2-design.md §4
"""

from __future__ import annotations

import time
from typing import Final

import structlog
from mcpgen_ir.types import Descriptions, Pass1Output, Pass2Output, RawIR

from mcpgen_engine.passes.pass_2.authoring import author_all_tools
from mcpgen_engine.passes.pass_2.diff import description_hash
from mcpgen_engine.passes.pass_2.quality_gate import quality_gate_all_tools
from mcpgen_engine.passes.pass_2.validation import (
    Pass2Error,
    count_prompt_injection_warnings,
)

# Re-exports for callers that orchestrate Pass 2 together with other passes.
__all__ = [
    "PASS_2_VERSION",
    "Pass2Error",
    "run",
]

# D-35 cache-key hint — bump when authoring/prompts change in a way that
# invalidates cached Pass 2 outputs (decision must accompany the bump in
# ``docs/decisions/``).
PASS_2_VERSION: Final[str] = "1"


_log = structlog.get_logger(__name__)


# ─────────────────────────────── Public API ────────────────────────────────


async def run(pass_1_output: Pass1Output, raw_ir: RawIR) -> Pass2Output:
    """Author per-tool descriptions; emit ``Pass2Output`` with
    ``description_hash`` set on every entry per D-14.

    Pure orchestrator: chains the 3 phases authoring → quality_gate →
    assembly with no I/O outside the LLM calls already inside the
    sub-modules. Returns the FROZEN ``Pass2Output`` IR shape.
    """
    start = time.monotonic()

    # Phase 2: authoring (Phase 1 = template selection happens inside authoring per tool).
    authored = await author_all_tools(pass_1_output, raw_ir)

    # Phase 3: inline quality gate.
    descriptions_in = {name: result.description for name, result in authored.items()}
    gated_descriptions, quality_warnings = await quality_gate_all_tools(
        descriptions_in, pass_1_output, raw_ir
    )

    # Phase 4: assembly with description_hash (D-14).
    pass_2_descriptions: dict[str, Descriptions] = {}
    for name, description in gated_descriptions.items():
        hash_ = description_hash(description)
        pass_2_descriptions[name] = Descriptions.model_validate(
            {**description.model_dump(), "description_hash": hash_}
        )

    # Aggregate structural counts for observability (D-13 + D-15).
    # The IR Pass2Output schema only carries `descriptions` — warning
    # surfacing to the SSE event happens in pipeline.py (Plan 03-12) via
    # the structured log records below. Per D-52 we log structural counts
    # only — never spec content.
    warnings_count = sum(
        1
        for r in authored.values()
        if any(
            [
                r.warnings.length_violation,
                r.warnings.forbidden_pattern_violation,
                r.warnings.examples_not_in_spec,
            ]
        )
    )
    quality_warning_count = sum(1 for v in quality_warnings.values() if v)
    injection_warning_count = sum(
        count_prompt_injection_warnings(raw_ir, t) for t in pass_1_output.tools
    )
    elapsed_ms = int((time.monotonic() - start) * 1000)
    _log.info(
        "pass_2.run.complete",
        tool_count=len(pass_2_descriptions),
        warnings_count=warnings_count,
        quality_warning_count=quality_warning_count,
        prompt_injection_warnings_count=injection_warning_count,
        elapsed_ms=elapsed_ms,
    )

    return Pass2Output(descriptions=pass_2_descriptions)
