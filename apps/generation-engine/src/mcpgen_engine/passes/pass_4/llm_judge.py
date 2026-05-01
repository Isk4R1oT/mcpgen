"""Pass 4 — selective LLM judgment for medium-confidence action verbs (D-26 Phase 2).

Concurrency Sem(5) per D-26. Single retry on Pydantic ValidationError /
``UnexpectedModelBehavior``. Falls back to D-29 conservative defaults
after retry exhaustion (NOT a ``Pass4Error`` raise — D-26 Phase 2
emit-and-continue).

``_LlmJudgeOutput`` deliberately OMITS ``openWorldHint`` per Research A3
+ D-27 invariant; ``openWorldHint`` is constructed Python-side at IR
assembly in
``consistency.assemble_annotations_with_open_world_hint``.

Threats addressed:
- T-03-OW (D-27): ``_LlmJudgeOutput`` Pydantic schema with
  ``ConfigDict(extra='forbid')`` cannot accept ``openWorldHint`` even if
  the LLM hallucinates it.
- T-03-VP (D-29): conservative-default fallback caps damage on retry
  exhaustion (UX safety > optimization).
- Pitfall #2: every ``.run()`` call passes ``model_settings=PASS_4_SETTINGS``
  carrying the verified ``_PROVIDER_ROUTING``.

References:
- 03-CONTEXT.md D-26 (Phase 2) + D-27 (openWorldHint invariant) + D-29
  (conservative defaults)
- 03-RESEARCH.md §"Common Pitfalls" §"Phase-3-specific subtleties" A3
- 03-PATTERNS.md ``passes/pass_4/llm_judge.py`` row + Shared Patterns
  "LLM model + agent construction" + "Local intermediate Pydantic types"
"""

from __future__ import annotations

import asyncio
from typing import Final

import httpx
import structlog
from mcpgen_ir.types import Pass2Output
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior

from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import PASS_4_SETTINGS
from mcpgen_engine.observability import run_with_tracing
from mcpgen_engine.passes.pass_4.prompts import (
    PASS_4_JUDGE_SYSTEM_PROMPT,
    build_judge_prompt,
)

_log = structlog.get_logger(__name__)

# ─────────────────────────── Module-level constants ────────────────────────

# D-26 Phase 2: per-pass concurrency cap for selective LLM judgment.
PASS_4_JUDGE_CONCURRENCY: Final[int] = 5

# Two-tier retry budgets (mirroring Pass 0/2 shape).
_MAX_TRANSIENT_RETRIES: Final[int] = 3
# D-29: 1 validation retry then conservative fallback (UX safety).
_MAX_VALIDATION_RETRIES: Final[int] = 1
_TRANSIENT_BACKOFF_BASE: Final[float] = 1.0
_TRANSIENT_BACKOFF_MAX: Final[float] = 4.0

# D-29: conservative defaults — UX safety > optimization. Used when the LLM
# call exhausts its retries (validation failure OR transient HTTP error).
_CONSERVATIVE_DEFAULTS: Final[dict[str, bool]] = {
    "readOnlyHint": False,
    "destructiveHint": True,
    "idempotentHint": False,
}


# ──────────────────────────── Judge-mode output ────────────────────────────


class _LlmJudgeOutput(BaseModel):
    """LLM-emitted judgment — 3 booleans + rationale.

    ``openWorldHint`` is DELIBERATELY OMITTED per Research A3 + D-27.
    The IR construction site
    (``consistency.assemble_annotations_with_open_world_hint``) adds
    ``openWorldHint=True`` Python-side. ``ConfigDict(extra='forbid')``
    rejects any LLM hallucinated field at decode time.
    """

    # IR camelCase field names mirror MCP spec ``Annotations`` shape — N815
    # is not enabled in pyproject.toml, so no noqa needed.
    model_config = ConfigDict(extra="forbid")
    readOnlyHint: bool
    destructiveHint: bool
    idempotentHint: bool
    rationale: str = Field(default="")


# ──────────────────────────── Agent singleton ──────────────────────────────


PASS_4_JUDGE_AGENT: Final[Agent[None, _LlmJudgeOutput]] = make_agent(
    output_type=_LlmJudgeOutput,
    system_prompt=PASS_4_JUDGE_SYSTEM_PROMPT,
)


# ────────────────────────── Transient-retry helper ─────────────────────────


async def _run_with_transient_retry(
    prompt: str,
    *,
    generation_id: str,
) -> _LlmJudgeOutput:
    """Inner retry: exponential backoff on ``httpx.HTTPError`` (1s/2s/4s).

    Mirrors ``pass_0/llm.py::_run_with_transient_retry`` shape. Pydantic
    ``ValidationError`` / ``UnexpectedModelBehavior`` is NOT caught here —
    they bubble to the outer ``_judge_one`` loop.
    """
    backoff = _TRANSIENT_BACKOFF_BASE
    last_exc: BaseException | None = None
    for attempt in range(_MAX_TRANSIENT_RETRIES):
        try:
            # Threaded generation_id correlates Langfuse traces per-generation
            # (Phase 10 plan 10-03 D-06 item 1).
            result = await run_with_tracing(
                PASS_4_JUDGE_AGENT,
                prompt,
                session_id=generation_id,
                stage="pass-4-judge",
                model_settings=PASS_4_SETTINGS,
            )
        except httpx.HTTPError as exc:
            last_exc = exc
            _log.warning(
                "pass_4.judge.transient_retry",
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


# ──────────────────────────── Per-tool judgment ────────────────────────────


async def _judge_one(
    tool_name: str,
    tool_description: str | None,
    *,
    generation_id: str,
) -> dict[str, bool]:
    """Judge a single medium-confidence action tool.

    Outer loop budget: ``_MAX_VALIDATION_RETRIES + 1`` attempts (= 2). On
    transient OR validation failure across all attempts, returns a copy of
    ``_CONSERVATIVE_DEFAULTS`` per D-29 (NOT a ``Pass4Error`` raise — D-26
    Phase 2 emit-and-continue policy).
    """
    prompt = build_judge_prompt(tool_name, tool_description)
    for attempt in range(_MAX_VALIDATION_RETRIES + 1):
        try:
            output = await _run_with_transient_retry(prompt, generation_id=generation_id)
        except (ValidationError, UnexpectedModelBehavior, httpx.HTTPError) as exc:
            _log.warning(
                "pass_4.judge.validation_or_transient_failed",
                tool_name=tool_name,
                attempt=attempt + 1,
                max_attempts=_MAX_VALIDATION_RETRIES + 1,
                error_class=type(exc).__name__,
            )
            continue
        else:
            return {
                "readOnlyHint": output.readOnlyHint,
                "destructiveHint": output.destructiveHint,
                "idempotentHint": output.idempotentHint,
            }

    _log.warning(
        "pass_4.judge.fallback_to_conservative_defaults",
        tool_name=tool_name,
    )
    return dict(_CONSERVATIVE_DEFAULTS)


# ─────────────────────────────── Public API ────────────────────────────────


async def judge_action_tools(
    needs_llm_review: list[str],
    pass_2_output: Pass2Output | None,
    *,
    generation_id: str = "unknown",
) -> dict[str, dict[str, bool]]:
    """Selective LLM judgment for medium-confidence action tools (D-26 Phase 2).

    Concurrency capped at ``PASS_4_JUDGE_CONCURRENCY`` (= 5).

    ``generation_id`` correlates Langfuse traces per-generation (Phase 10
    plan 10-03 D-06 item 1). Defaults to ``"unknown"`` so existing direct
    test callers continue to work; production callers (Pass 4 orchestrator)
    thread the real value from the BFF.

    Returns ``{tool_name: {readOnlyHint, destructiveHint, idempotentHint}}``
    — the per-tool triples are either the LLM-emitted booleans OR the
    ``_CONSERVATIVE_DEFAULTS`` triple on failure.
    """
    if not needs_llm_review:
        return {}

    # Look up tool descriptions from Pass 2 for richer prompt context.
    descriptions_map: dict[str, str | None] = {}
    if pass_2_output is not None:
        for tool_name in needs_llm_review:
            desc = pass_2_output.descriptions.get(tool_name)
            descriptions_map[tool_name] = desc.purpose if desc is not None else None
    else:
        descriptions_map = {n: None for n in needs_llm_review}

    sem = asyncio.Semaphore(PASS_4_JUDGE_CONCURRENCY)

    async def _bound(name: str) -> tuple[str, dict[str, bool]]:
        async with sem:
            triple = await _judge_one(name, descriptions_map.get(name), generation_id=generation_id)
            return name, triple

    pairs = await asyncio.gather(*(_bound(n) for n in needs_llm_review))
    return dict(pairs)
