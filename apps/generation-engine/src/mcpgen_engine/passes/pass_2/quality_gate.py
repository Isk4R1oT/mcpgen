"""Pass 2 — inline quality gate (single Qwen judge per tool, D-09).

Phase 3 of the Pass 2 pipeline. Judge mode (``INLINE_GATE_SETTINGS``,
T=0.0). Abbreviated 4-component rubric: Purpose / Guidelines / Limitations
/ Parameter overview (drops Examples + Length & Completeness — those are
validated programmatically per D-09).

Threshold ≥3 on each. <3 → ONE retry of the originating Description (via
``authoring.py`` rerun for that single tool only). Max 1 retry round per
D-09 (NOT D-13's 2 — these are independent budgets per design).

Returns the (possibly retried) descriptions PLUS a ``quality_warnings``
``dict[tool_name, bool]`` consumed by ``run()`` to set
``Pass2WarningSet.quality_warning``.

References:
- 03-CONTEXT.md D-09 (verbatim) + D-13 (separate budget — quality gate has
  its own 1-retry cap)
- 03-PATTERNS.md ``passes/pass_2/quality_gate.py`` row
- docs/mcpgen-pass-2-design.md §9
"""

from __future__ import annotations

import asyncio
from typing import Final

import structlog
from mcpgen_ir.types import Description, Pass1Output, RawIR, Tool1, Type
from pydantic import BaseModel, ConfigDict, Field
from pydantic_ai import Agent

# We import _author_one as a private cross-module dep — D-09 requires the
# gate's retry path to re-author through the same code path that produced
# the failing description (so the same prompts + validators apply). Promoting
# _author_one to a public symbol would imply external callers can re-author
# tools individually, which is not a Plan 03-04 contract.
from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import INLINE_GATE_SETTINGS
from mcpgen_engine.observability import run_with_tracing
from mcpgen_engine.passes.pass_2.authoring import _author_one as _retry_author_one
from mcpgen_engine.passes.pass_2.validation import render_description_markdown

# ─────────────────────────── Module-level constants ────────────────────────

# D-09: same fan-out concurrency as authoring (10).
QUALITY_GATE_CONCURRENCY: Final[int] = 10

# D-09: pass threshold — fail if any of the 4 abbreviated rubric scores < 3.
_RUBRIC_THRESHOLD: Final[int] = 3

# D-09: exactly one retry round per tool (independent of D-13's authoring
# retry budget).
_MAX_GATE_RETRIES: Final[int] = 1


# ──────────────────────────── Judge-mode output ────────────────────────────


class _GateScores(BaseModel):
    """Judge-mode output: 4 scores from the abbreviated rubric (D-09).

    Closed schema (``extra="forbid"``) so any LLM drift is rejected at
    decode time rather than silently accepted.
    """

    model_config = ConfigDict(extra="forbid")

    purpose: int = Field(ge=1, le=5)
    guidelines: int = Field(ge=1, le=5)
    limitations: int = Field(ge=1, le=5)
    parameter_overview: int = Field(ge=1, le=5)
    rationale: str = Field(default="")


# ──────────────────────────── Judge system prompt ──────────────────────────


_GATE_SYSTEM_PROMPT: Final[str] = """You are a quality judge for MCP tool descriptions.

Score the supplied description on 4 components (D-09 abbreviated rubric):
- purpose (1-5): is the 1-3-sentence purpose clear and specific?
- guidelines (1-5): are when_to_use bullets concrete and agent-relevant?
- limitations (1-5): are constraints/side-effects/failure modes called out?
- parameter_overview (1-5): does the param overview name key params and
  their relationships?

Score each on a 1-5 scale where 1 = unusable, 3 = minimum acceptable,
5 = excellent. Provide a brief rationale (1-2 sentences) explaining the
lowest score.

Do NOT score Examples or Length — those are validated programmatically.
Do NOT modify the description; only score.
"""


# ──────────────────────────── Agent singleton ──────────────────────────────


_QUALITY_GATE_AGENT: Final[Agent[None, _GateScores]] = make_agent(
    output_type=_GateScores,
    system_prompt=_GATE_SYSTEM_PROMPT,
)


_log = structlog.get_logger(__name__)


# ─────────────────────────────── Helpers ───────────────────────────────────


def _build_judge_prompt(tool_name: str, tool_type: Type, description: Description) -> str:
    """Compose the judge user prompt — embeds the rendered markdown so the
    judge scores the same string the MCP agent will see in ``tools/list``."""
    markdown = render_description_markdown(description)
    return (
        f"Tool: {tool_name}\n"
        f"Type: {tool_type.value}\n\n"
        f"--- Description to score ---\n"
        f"{markdown}\n"
        f"--- End description ---\n\n"
        f"Return scores as a JSON object with the 5 fields per the system prompt."
    )


# ──────────────────────────── Per-tool judge ───────────────────────────────


async def _judge_one(
    tool: Tool1,
    description: Description,
    *,
    generation_id: str,
) -> tuple[bool, _GateScores]:
    """Score one description via the abbreviated 4-component rubric (D-09).

    Returns ``(passes_threshold, scores)``. ``passes_threshold`` is True
    iff every score is >= ``_RUBRIC_THRESHOLD`` (3).
    """
    prompt = _build_judge_prompt(tool.name, tool.type, description)
    # Threaded generation_id correlates Langfuse traces per-generation
    # (Phase 10 plan 10-03 D-06 item 1).
    result = await run_with_tracing(
        _QUALITY_GATE_AGENT,
        prompt,
        session_id=generation_id,
        stage="pass-2-quality-gate",
        model_settings=INLINE_GATE_SETTINGS,
    )
    scores = result.output
    passes = (
        scores.purpose >= _RUBRIC_THRESHOLD
        and scores.guidelines >= _RUBRIC_THRESHOLD
        and scores.limitations >= _RUBRIC_THRESHOLD
        and scores.parameter_overview >= _RUBRIC_THRESHOLD
    )
    return passes, scores


# ─────────────────────────────── Public API ────────────────────────────────


async def quality_gate_all_tools(
    descriptions: dict[str, Description],
    pass_1_output: Pass1Output,
    raw_ir: RawIR,
    *,
    generation_id: str,
) -> tuple[dict[str, Description], dict[str, bool]]:
    """Run the gate per tool; retry authoring once on score < 3.

    Returns ``(final_descriptions, quality_warnings)`` where
    ``quality_warnings[name]`` is True iff the gate ultimately failed
    (after the single allowed retry round per D-09).

    Concurrency capped at ``QUALITY_GATE_CONCURRENCY`` (10) — same value
    as authoring per D-09.
    """
    tools_by_name = {t.name: t for t in pass_1_output.tools}
    sem = asyncio.Semaphore(QUALITY_GATE_CONCURRENCY)
    quality_warnings: dict[str, bool] = {}
    final_descriptions: dict[str, Description] = dict(descriptions)

    async def _gate_one(name: str) -> None:
        tool = tools_by_name[name]
        description = final_descriptions[name]
        async with sem:
            passes, scores = await _judge_one(tool, description, generation_id=generation_id)
            if passes:
                quality_warnings[name] = False
                return
            _log.warning(
                "pass_2.quality_gate.retry",
                tool_name=name,
                scores=scores.model_dump(),
            )
            # D-09: 1 retry — re-author the failing tool, then re-judge once.
            retry_result = await _retry_author_one(
                tool, raw_ir, pass_1_output, generation_id=generation_id
            )
            retry_passes, retry_scores = await _judge_one(
                tool, retry_result.description, generation_id=generation_id
            )
            final_descriptions[name] = retry_result.description
            quality_warnings[name] = not retry_passes
            if not retry_passes:
                _log.warning(
                    "pass_2.quality_gate.retry_failed",
                    tool_name=name,
                    scores=retry_scores.model_dump(),
                )

    await asyncio.gather(*(_gate_one(name) for name in descriptions))
    return final_descriptions, quality_warnings
