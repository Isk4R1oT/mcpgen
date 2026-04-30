"""Pass 5 Phase 3 — LLM-bearing field-importance ranking.

Per CONTEXT D-09 (set membership only — no scores), D-06 (concurrency 10),
D-11 (max 1 LLM retry then deterministic fallback). Heuristic pre-ranking
from Pass 5 design Appendix B reduces the LLM-call surface to tools with
> 10 response fields. Conservative bias when uncertain → ``opt_in``.

Threats addressed:

- T-04-03-PI: prompts wrap spec excerpts in ``<spec_excerpt>``; injection
  regex flags suspicious content (delegated to ``prompts.py``).
- T-04-03-quantization-drift: SOLE construction site is ``make_agent(...)``
  at module load; reuses the FROZEN ``_PROVIDER_ROUTING`` via
  ``PASS_5_SETTINGS``.
- T-04-03-cost-runaway: max 3 transient retries (httpx error) + 1
  validation retry → deterministic fallback. No infinite loops.
- T-04-03-LLM-output-injection: ``FieldRanking`` has ``extra='forbid'``;
  hallucinated keys raise ``ValidationError`` and are caught by the outer
  retry loop.
- T-04-03-spec-leak: structural-only logging (``tool_count``,
  ``llm_call_count``, ``fallback_count``); raw spec content NEVER logged.

References:

- 04-CONTEXT.md D-01 + D-06 + D-09 + D-11.
- 04-RESEARCH.md "Code Examples" Code Example 2 (verbatim source).
- docs/mcpgen-pass-5-design.md §1.4 + §7 + Appendix B.
- Analog: ``apps/generation-engine/src/mcpgen_engine/passes/pass_3/enrich.py``
  (per-item LLM fan-out + 2-tier retry + Semaphore).
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, Final

import httpx
import structlog
from mcpgen_ir.types import (
    Descriptions,
    Pass1Output,
    Pass2Output,
    Tool1,
)
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior

from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import PASS_5_SETTINGS
from mcpgen_engine.observability import run_with_tracing
from mcpgen_engine.passes.pass_5.output_schema import OutputSchemaSpec
from mcpgen_engine.passes.pass_5.prompts import (
    PASS_5_FIELD_RANKING_SYSTEM_PROMPT,
    build_field_ranking_user_prompt,
)

_log = structlog.get_logger(__name__)


# ─────────────────────────── Module-level constants ────────────────────────

# D-06: per-tool concurrency cap for the LLM field-ranking phase.
PASS_5_FIELD_RANKING_CONCURRENCY: Final[int] = 10

# D-11: Pass 5 retry policy — 1 outer retry then deterministic fallback.
# (Pass 3 D-26 has 2 outer retries; Pass 5 D-11 trims to 1 — shorter outer
# budget because the deterministic fallback is high-quality.)
_MAX_TRANSIENT_RETRIES: Final[int] = 3
_MAX_VALIDATION_RETRIES: Final[int] = 1
_TRANSIENT_BACKOFF_BASE: Final[float] = 1.0
_TRANSIENT_BACKOFF_MAX: Final[float] = 4.0

# Pass 5 design §1.4 — only call the LLM when > 10 response fields.
_FIELD_COUNT_LLM_THRESHOLD: Final[int] = 10

# Pass 5 design Appendix B — heuristic pre-ranking regex sets.
_HIGH_VALUE_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^(id|.*_id|name|.*_name|title|status|.*_status|type|created_at|"
    r"updated_at|.*_at|summary)$",
    re.IGNORECASE,
)
_LOW_VALUE_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^_|.*_internal$|^raw_|.*_raw$|debug|deprecated|.*_metadata$",
    re.IGNORECASE,
)


# ─────────────────────────── Pydantic output type ──────────────────────────


class FieldRanking(BaseModel):
    """LLM output type — set membership only per D-09 (no scores).

    Constraints (D-09 LLM-output-injection mitigation):
    - ``extra='forbid'`` rejects hallucinated keys.
    - All three lists default to empty so partial responses still validate
      and the deterministic fallback can fill the gaps.
    """

    model_config = ConfigDict(extra="forbid")

    always_include: list[str] = Field(default_factory=list)
    opt_in: list[str] = Field(default_factory=list)
    always_exclude: list[str] = Field(default_factory=list)


# ─────────────────────────── Module-level Agent singleton ──────────────────
# D-01 invariant: ``make_agent`` is the SOLE legal model construction site.
# Never construct ``OpenAIModel`` / ``OpenAIProvider`` here.

PASS_5_FIELD_RANKING_AGENT: Final[Agent[None, FieldRanking]] = make_agent(
    output_type=FieldRanking,
    system_prompt=PASS_5_FIELD_RANKING_SYSTEM_PROMPT,
)


# ─────────────────────────── Heuristic + deterministic ranking ─────────────


def heuristic_score(
    field_name: str,
    is_required: bool,
    description: str | None,
) -> float:
    """Pass 5 design Appendix B verbatim heuristic score.

    - Required → +0.5 baseline (else 0.0).
    - High-value field name pattern → +0.3.
    - Low-value field name pattern → -0.3.
    - Description signals 'main'/'primary'/'key' → +0.2.
    - Description signals 'internal'/'deprecated'/'debug' → -0.3.

    Pure: no I/O, no LLM, deterministic.
    """
    score = 0.5 if is_required else 0.0
    if _HIGH_VALUE_PATTERN.match(field_name):
        score += 0.3
    if _LOW_VALUE_PATTERN.match(field_name):
        score -= 0.3
    if description:
        d = description.lower()
        if any(w in d for w in ("main", "primary", "key")):
            score += 0.2
        if any(w in d for w in ("internal", "deprecated", "debug")):
            score -= 0.3
    return score


def deterministic_ranking(
    fields: dict[str, dict[str, Any]],
) -> FieldRanking:
    """Cutoff +0.3 / -0.3 per D-11 fallback. Conservative bias → opt_in.

    Used as:
    - First-pass classifier for tools with ≤ 10 fields (NO LLM call).
    - Fallback when the LLM ranker exhausts retries.

    Pure: no I/O, no LLM, deterministic.
    """
    always_include: list[str] = []
    opt_in: list[str] = []
    always_exclude: list[str] = []
    for name, schema in fields.items():
        score = heuristic_score(
            name,
            bool(schema.get("required")),
            schema.get("description"),
        )
        if score >= 0.3:
            always_include.append(name)
        elif score <= -0.3:
            always_exclude.append(name)
        else:
            # -0.3 < score < +0.3 → conservative bias prefers opt_in.
            opt_in.append(name)
    return FieldRanking(
        always_include=always_include,
        opt_in=opt_in,
        always_exclude=always_exclude,
    )


# ─────────────────────────── Transient-retry helper ────────────────────────


async def _run_with_transient_retry(prompt: str) -> FieldRanking:
    """Inner retry tier: 3 attempts with exponential backoff (1s/2s/4s).

    Mirrors ``pass_3/enrich.py::_run_with_transient_retry`` shape.
    Pydantic ``ValidationError`` / ``UnexpectedModelBehavior`` are NOT caught
    here — they bubble up to the outer validation-retry loop in
    ``_rank_one`` so the deterministic fallback (D-11) is reached.
    """
    backoff = _TRANSIENT_BACKOFF_BASE
    last_exc: BaseException | None = None
    for attempt in range(_MAX_TRANSIENT_RETRIES):
        try:
            # TODO(09-05): thread generation_id through pass_5.run signature.
            result = await run_with_tracing(
                PASS_5_FIELD_RANKING_AGENT,
                prompt,
                session_id="unknown",
                stage="pass-5-field-ranking",
                model_settings=PASS_5_SETTINGS,
            )
        except httpx.HTTPError as exc:
            last_exc = exc
            _log.warning(
                "pass_5.field_ranking.transient_retry",
                attempt=attempt + 1,
                max_attempts=_MAX_TRANSIENT_RETRIES,
                error_class=type(exc).__name__,
            )
            if attempt + 1 >= _MAX_TRANSIENT_RETRIES:
                break
            await asyncio.sleep(min(backoff, _TRANSIENT_BACKOFF_MAX))
            backoff *= 2
            continue
        else:
            return result.output

    assert last_exc is not None
    raise last_exc


# ─────────────────────────── Per-tool LLM ranker ───────────────────────────


async def _rank_one(
    fields: dict[str, dict[str, Any]],
    tool: Tool1,
    description: Descriptions | None,
) -> FieldRanking:
    """Outer retry tier: 1 validation retry → deterministic fallback (D-11).

    On validation failure of every attempt: emit deterministic fallback;
    log a warning, do NOT raise — Pass 5 must never block a server's pass
    on a single bad LLM response.
    """
    prompt, _injection_warnings = build_field_ranking_user_prompt(tool, fields, description)
    for outer_attempt in range(_MAX_VALIDATION_RETRIES + 1):
        try:
            return await _run_with_transient_retry(prompt)
        except (ValidationError, UnexpectedModelBehavior) as exc:
            _log.warning(
                "pass_5.field_ranking.validation_retry",
                tool_name=tool.name,
                attempt=outer_attempt + 1,
                max_attempts=_MAX_VALIDATION_RETRIES + 1,
                error_class=type(exc).__name__,
            )
            if outer_attempt >= _MAX_VALIDATION_RETRIES:
                _log.warning(
                    "pass_5.field_ranking.validation_fallback",
                    tool_name=tool.name,
                    error_class=type(exc).__name__,
                )
                return deterministic_ranking(fields)
        except httpx.HTTPError as exc:
            # Transient retries exhausted upstream → fall back.
            _log.warning(
                "pass_5.field_ranking.http_fallback",
                tool_name=tool.name,
                error_class=type(exc).__name__,
            )
            return deterministic_ranking(fields)

    # Defensive — loop should always return via one of the branches above.
    return deterministic_ranking(fields)


async def rank_fields_for_tool(
    tool: Tool1,
    output_schema_spec: OutputSchemaSpec,
    description: Descriptions | None,
    sem: asyncio.Semaphore,
) -> FieldRanking:
    """Per-tool ranking. Below threshold → deterministic only (no LLM).

    Above threshold → acquire ``sem``, build prompt, call LLM with the
    2-tier retry policy. Conservative bias on fallback (uncertain → opt_in)
    per Anthropic guidance "better agent asks than burns tokens".
    """
    fields = output_schema_spec.fields
    if len(fields) <= _FIELD_COUNT_LLM_THRESHOLD:
        return deterministic_ranking(fields)
    async with sem:
        return await _rank_one(fields, tool, description)


# ─────────────────────────── Public fan-out ────────────────────────────────


async def rank_all_fields(
    output_schemas: dict[str, OutputSchemaSpec],
    pass_2_output: Pass2Output,
    pass_1_output: Pass1Output,
) -> dict[str, FieldRanking]:
    """Orchestrator: per-tool fan-out under a shared Semaphore (D-06).

    Returns a dict keyed by tool name. Tools whose ``Pass1Output.tools``
    entry cannot be looked up degrade to a deterministic-only ranking
    rather than raising.

    Logs structural metrics only — never spec content
    (T-04-03-spec-leak mitigation).
    """
    sem = asyncio.Semaphore(PASS_5_FIELD_RANKING_CONCURRENCY)
    tools_by_name: dict[str, Tool1] = {t.name: t for t in pass_1_output.tools}
    llm_call_count = 0

    async def _bound(tool_name: str, spec: OutputSchemaSpec) -> tuple[str, FieldRanking]:
        nonlocal llm_call_count
        tool = tools_by_name.get(tool_name)
        if tool is None:
            return tool_name, deterministic_ranking(spec.fields)
        description = pass_2_output.descriptions.get(tool_name)
        # llm_call_count is best-effort — counts tools that crossed the
        # threshold; the actual LLM call may still fall back deterministically.
        if len(spec.fields) > _FIELD_COUNT_LLM_THRESHOLD:
            llm_call_count += 1
        ranking = await rank_fields_for_tool(tool, spec, description, sem)
        return tool_name, ranking

    coros = [_bound(name, spec) for name, spec in output_schemas.items()]
    pairs = await asyncio.gather(*coros)
    result: dict[str, FieldRanking] = dict(pairs)

    _log.info(
        "pass_5.field_ranking.complete",
        tool_count=len(result),
        llm_call_count=llm_call_count,
    )
    return result
