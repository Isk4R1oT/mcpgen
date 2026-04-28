"""Pass 3 — Phase 4: inline quality gate (single Qwen judge per tool, D-16).

Judge mode (``INLINE_GATE_SETTINGS``, T=0.0). Parameter-specific 5-component
rubric per Pass 3 design §1: Naming / Format / Enums / Defaults / Description.
Threshold ≥3 each. Max 1 retry round per tool (D-16 Phase 4 — analog of
Pass 2 D-09 cap).

Returns ``dict[tool_name, gate_passed]``; caller (``__init__.py::run``) logs
warnings and proceeds — does NOT block per design (full F2 in Phase 5
catches what inline misses).

Pass 3 quality-gate retry is simpler than Pass 2's: there is no
"re-run authoring for one tool" path because the upstream
``enrich.py`` already exhausted its own validation-retry budget per
parameter. Instead, the gate retries the JUDGE itself — the judge may
have been over-strict on the first call (T=0.0 doesn't preclude
single-call noise from the structured-output decoder). If the judge
still fails after 1 retry, the tool is flagged as a quality warning
and the pipeline continues.

Threats addressed:
- Pitfall #2 continues — ``INLINE_GATE_SETTINGS`` embeds the verified
  ``_PROVIDER_ROUTING`` (atlas-cloud / fp8 single provider, no fallback).

References:
- 03-CONTEXT.md D-16 (Phase 4 verbatim)
- 03-PATTERNS.md ``passes/pass_3/quality_gate.py`` row
- docs/mcpgen-pass-3-design.md §1 (5 dimensions) + §5 (Phase 4)
- Analog: ``apps/generation-engine/src/mcpgen_engine/passes/pass_2/quality_gate.py``
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Final

import structlog
from mcpgen_ir.types import Pass1Output
from pydantic import BaseModel, ConfigDict, Field
from pydantic_ai import Agent

from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import INLINE_GATE_SETTINGS

# ─────────────────────────── Module-level constants ────────────────────────

# D-16: per-tool fan-out concurrency (10 — same as Pass 2 quality gate).
QUALITY_GATE_CONCURRENCY_PASS_3: Final[int] = 10

# D-16: pass threshold — fail if any of the 5 rubric scores < 3.
_RUBRIC_THRESHOLD_PASS_3: Final[int] = 3

# D-16: exactly one retry round per tool (independent of enrich.py's
# validation-retry budget — the gate is judging the assembled JSON Schema,
# not the LLM-emitted ParameterEnrichment).
_MAX_GATE_RETRIES_PASS_3: Final[int] = 1

# Truncation bound on the schema JSON embedded in the judge prompt — keeps
# the prompt under the model's context budget for very large universal
# tools (e.g., upsert with 50 collection-specific properties).
_JUDGE_PROMPT_SCHEMA_MAX_CHARS: Final[int] = 8000


# ──────────────────────────── Judge-mode output ────────────────────────────


class _GateScoresPass3(BaseModel):
    """Judge-mode output: 5 scores from the parameter-specific rubric (D-16).

    Closed schema (``extra="forbid"``) so any LLM drift is rejected at
    decode time rather than silently accepted.

    Dimensions per Pass 3 design §1:
    - naming: are property names clear and unambiguous?
    - format: are types/formats/patterns/min-max correctly specified?
    - enums: are enum values present where meaningful?
    - defaults: are sensible defaults provided where the spec implies them?
    - description: do property descriptions follow the 5-component
      MCP-Bundles template?
    """

    model_config = ConfigDict(extra="forbid")

    naming: int = Field(ge=1, le=5)
    format: int = Field(ge=1, le=5)
    enums: int = Field(ge=1, le=5)
    defaults: int = Field(ge=1, le=5)
    description: int = Field(ge=1, le=5)
    rationale: str = Field(default="")


# ──────────────────────────── Judge system prompt ──────────────────────────


_GATE_SYSTEM_PROMPT_PASS_3: Final[str] = (
    "You are a quality judge for MCP tool input schemas (Pass 3 inline gate).\n\n"
    "Score the supplied JSON Schema on 5 dimensions per "
    "docs/mcpgen-pass-3-design.md §1:\n"
    "- naming (1-5): are property names clear and unambiguous (no bare 'id', "
    "'data', 'status', 'time' without entity qualification)?\n"
    "- format (1-5): are types/formats/patterns/min-max correctly specified "
    "for each property?\n"
    "- enums (1-5): are enum values present where meaningful (status, mode, "
    "etc.) and absent where free-form?\n"
    "- defaults (1-5): are sensible defaults provided where the spec implies "
    "them?\n"
    "- description (1-5): does each property's `description` follow the "
    "5-component MCP-Bundles template (what / format / when / example / "
    "default)?\n\n"
    "Score each on a 1-5 scale where 1 = unusable, 3 = minimum acceptable, "
    "5 = excellent. Provide a brief rationale (1-2 sentences) explaining "
    "the lowest score.\n\n"
    "Do NOT modify the schema; only score.\n"
)


# ──────────────────────────── Agent singleton ──────────────────────────────


_QUALITY_GATE_AGENT_PASS_3: Final[Agent[None, _GateScoresPass3]] = make_agent(
    output_type=_GateScoresPass3,
    system_prompt=_GATE_SYSTEM_PROMPT_PASS_3,
)


_log = structlog.get_logger(__name__)


# ─────────────────────────────── Helpers ───────────────────────────────────


def _build_judge_prompt_pass_3(tool_name: str, schema: dict[str, Any]) -> str:
    """Embed the JSON Schema as data for the judge to score.

    Truncates the schema JSON at ``_JUDGE_PROMPT_SCHEMA_MAX_CHARS`` to keep
    the prompt under the model's context budget for very large universal
    tools (e.g., upsert with many collection-specific properties).
    """
    schema_json = json.dumps(schema, indent=2, sort_keys=True)
    if len(schema_json) > _JUDGE_PROMPT_SCHEMA_MAX_CHARS:
        schema_json = (
            schema_json[:_JUDGE_PROMPT_SCHEMA_MAX_CHARS] + "\n... (truncated for judge prompt)"
        )
    return (
        f"Tool: {tool_name}\n\n"
        f"--- Input JSON Schema to score ---\n"
        f"```json\n{schema_json}\n```\n"
        f"--- End schema ---\n\n"
        f"Return scores as a JSON object with the 6 fields per the system prompt."
    )


# ──────────────────────────── Per-tool judge ───────────────────────────────


async def _judge_one_pass_3(
    tool_name: str, schema: dict[str, Any]
) -> tuple[bool, _GateScoresPass3]:
    """Score one input schema via the parameter-specific 5-component rubric.

    Returns ``(passes_threshold, scores)``. ``passes_threshold`` is True
    iff every score is >= ``_RUBRIC_THRESHOLD_PASS_3`` (3).
    """
    prompt = _build_judge_prompt_pass_3(tool_name, schema)
    result = await _QUALITY_GATE_AGENT_PASS_3.run(prompt, model_settings=INLINE_GATE_SETTINGS)
    scores = result.output
    passes = (
        scores.naming >= _RUBRIC_THRESHOLD_PASS_3
        and scores.format >= _RUBRIC_THRESHOLD_PASS_3
        and scores.enums >= _RUBRIC_THRESHOLD_PASS_3
        and scores.defaults >= _RUBRIC_THRESHOLD_PASS_3
        and scores.description >= _RUBRIC_THRESHOLD_PASS_3
    )
    return passes, scores


# ─────────────────────────────── Public API ────────────────────────────────


async def quality_gate_all_tools(
    input_schemas: dict[str, dict[str, Any]],
    pass_1_output: Pass1Output,  # noqa: ARG001 — accepted for symmetry with Pass 2 signature; unused today
    sem: asyncio.Semaphore | None = None,
) -> dict[str, bool]:
    """Run gate per tool; retry the JUDGE call once on score < 3. Never blocks.

    Returns ``{tool_name: gate_passed}`` dict (caller surfaces warnings via
    log aggregation; D-13 emit-and-continue analog).

    The ``pass_1_output`` parameter is accepted for signature symmetry with
    ``passes.pass_2.quality_gate.quality_gate_all_tools`` so the Pass 3
    orchestrator's call-site shape mirrors Pass 2; the value is currently
    unused (the inline judge scores schemas in isolation).

    Concurrency capped at ``QUALITY_GATE_CONCURRENCY_PASS_3`` (10) — same
    value as Pass 2.
    """
    if sem is None:
        sem = asyncio.Semaphore(QUALITY_GATE_CONCURRENCY_PASS_3)
    quality_warnings: dict[str, bool] = {}

    async def _gate_one(name: str, schema: dict[str, Any]) -> None:
        async with sem:
            for attempt in range(_MAX_GATE_RETRIES_PASS_3 + 1):
                passes, scores = await _judge_one_pass_3(name, schema)
                if passes:
                    quality_warnings[name] = False
                    return
                _log.warning(
                    "pass_3.quality_gate.retry_or_fail",
                    tool_name=name,
                    attempt=attempt + 1,
                    scores=scores.model_dump(),
                )
            quality_warnings[name] = True

    await asyncio.gather(*(_gate_one(name, schema) for name, schema in input_schemas.items()))
    return quality_warnings
