"""Pass 1 Phase 1.2 — Qwen3-Coder LLM schema synthesis (per-tool parallel).

Two primary entry points:

- ``synthesize_universal_tools(classified, raw_ir, uncovered=None)`` — runs
  ONE LLM call returning the 6 universal tools (D-29). Concurrency is enforced
  by the orchestrator's ``Semaphore(10)`` — this module is single-call.
- ``synthesize_extra_tool(extra, raw_ir)`` — runs ONE LLM call returning a
  single ``Tool1`` for an action / workflow / specialized extra. The caller
  fans out N tasks under the same shared semaphore.

Wraps two module-level Agent singletons (one per output_type) constructed via
``make_agent`` from the agent factory — Pitfall A: NO direct LLM-SDK
constructor calls here; the shared MODEL singleton in ``llm/client.py`` is
the only legal site. Sampling profile = ``PASS_1_SETTINGS`` (temperature=0.2,
top_p=0.9, max_tokens=8192, extra_body provider routing pin).

Retry policy (mirrors Pass 0 ``llm.py`` two-tier loop):

- *Transient* errors (network / 5xx / rate-limit) — exponential backoff
  (1s/2s/4s) up to 3 attempts.
- *Pydantic ValidationError* / ``UnexpectedModelBehavior`` — 3 retries with
  the validation error fed back into the prompt (D-26 reused pattern).
  After 3 retries → ``Pass1Error("LLM_VALIDATION_FAILED")``.

OpenAI compliance (D-30 / Pitfall #32) — HARDCODED post-LLM enforcement:
- ``search.name == "search"`` and ``search.type == universal``.
- ``fetch.name == "fetch"`` and ``fetch.type == universal``.
The full ``inputSchema`` enforcement (single string param) lands in Pass 3
(Phase 3); Phase 2 fixture acceptance is structural — same names + same
routing rules + same smart-ID format.

Threats addressed:
- T-2-07-01 (D-51): user prompts built via ``prompts.py`` XML-sandbox spec text.
- T-2-13 (D-52): structlog only emits structural counts (universal_count,
  extra_type, validation_attempt). NEVER spec content.
- T-2-07-04 (DoS): tenacity-style transient backoff + bounded retries.
- T-2-07-05 (mode-collapse): provider routing pinned via PASS_1_SETTINGS.

References:
- 02-CONTEXT.md D-04 (provider routing) + D-06 (sampling profile) + D-26
  (retry/degrade) + D-29 (6 universal always) + D-30 (OpenAI compliance) +
  D-50 (single async run per pass) + D-51 (XML sandboxing)
- 02-RESEARCH.md §"Pattern 1" (PydanticAI agent factory) + §"Pass 1 Module
  Skeleton" lines 1172-1224
- 02-PATTERNS.md `passes/pass_1/schema_synth.py` row
- docs/mcpgen-pass-1-design.md §3.5 (per-tool synthesis)
"""

from __future__ import annotations

import asyncio
from typing import Final

import httpx
import structlog
from mcpgen_ir.types import RawIR, Tool1, Type
from pydantic import BaseModel, ConfigDict, ValidationError
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior

from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import PASS_1_SETTINGS
from mcpgen_engine.observability import run_with_tracing

from .classify import ExtraTool, UniversalToolClass
from .prompts import (
    PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT,
    build_schema_synth_user_prompt_extra,
    build_schema_synth_user_prompt_universal,
)

# D-26 — retries on transient and validation errors.
_MAX_TRANSIENT_RETRIES: Final[int] = 3
_MAX_VALIDATION_RETRIES: Final[int] = 3
_TRANSIENT_BACKOFF_BASE: Final[float] = 1.0
_TRANSIENT_BACKOFF_MAX: Final[float] = 4.0


# ───────────────────────────── Errors ──────────────────────────────────────


class Pass1Error(ValueError):
    """Stable user-facing error class for Pass 1 schema-synthesis failures.

    The first token of ``args[0]`` is treated as the stable error code by
    downstream layers (CLI / API). Mirrors ``Pass0Error`` shape per CLAUDE.md
    "Use specific error types" guidance.
    """


# ───────────────────────────── LLM output types ────────────────────────────


class _UniversalToolsLlmOutput(BaseModel):
    """Structured output of the 6-universal synthesis call.

    PydanticAI uses this as the function-call schema; the LLM is forced to
    return all 6 fields so D-29 (6 universal always) is enforced at decode
    time rather than via post-validation.
    """

    model_config = ConfigDict(extra="forbid")

    search: Tool1
    fetch: Tool1
    list_collections: Tool1
    list_objects: Tool1
    upsert: Tool1
    delete: Tool1


# ───────────────────────────── Agent singletons ────────────────────────────


PASS_1_UNIVERSAL_AGENT: Final[Agent[None, _UniversalToolsLlmOutput]] = make_agent(
    output_type=_UniversalToolsLlmOutput,
    system_prompt=PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT,
)

PASS_1_EXTRA_AGENT: Final[Agent[None, Tool1]] = make_agent(
    output_type=Tool1,
    system_prompt=PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT,
)


_log = structlog.get_logger(__name__)


# ─────────────────────────── Public API ────────────────────────────────────


async def synthesize_universal_tools(
    classified: UniversalToolClass,
    raw_ir: RawIR,
    *,
    uncovered: list[str] | None = None,
    generation_id: str,
) -> list[Tool1]:
    """Synthesize the 6 universal tools (D-29).

    One LLM call returns ``_UniversalToolsLlmOutput`` (Pydantic-validated).
    OpenAI compliance is enforced post-LLM — D-30 / Pitfall #32.

    ``uncovered`` is the D-34 retry hook: when the orchestrator detects a
    coverage gap, it re-invokes us with the uncovered endpoint list folded
    into the prompt.

    Returns the 6 tools in the canonical order:
    [search, fetch, list_collections, list_objects, upsert, delete].
    """
    user_prompt = build_schema_synth_user_prompt_universal(classified, raw_ir, uncovered=uncovered)
    output = await _run_universal_with_retries(user_prompt, generation_id=generation_id)

    search = _force_openai_compliance_search(output.search)
    fetch = _force_openai_compliance_fetch(output.fetch)
    list_collections = _force_universal_type(output.list_collections, name="list_collections")
    list_objects = _force_universal_type(output.list_objects, name="list_objects")
    upsert = _force_universal_type(output.upsert, name="upsert")
    delete = _force_universal_type(output.delete, name="delete")

    _log.info(
        "pass_1.schema_synth.universal.complete",
        retry_uncovered_count=len(uncovered) if uncovered else 0,
    )

    return [search, fetch, list_collections, list_objects, upsert, delete]


async def synthesize_extra_tool(
    extra: ExtraTool,
    raw_ir: RawIR,
    *,
    generation_id: str,
) -> Tool1:
    """Synthesize one action / workflow / specialized tool.

    The caller supplies concurrency control via the orchestrator's shared
    ``Semaphore(10)`` — this function is single-call.
    """
    user_prompt = build_schema_synth_user_prompt_extra(extra, raw_ir)
    tool = await _run_extra_with_retries(user_prompt, extra=extra, generation_id=generation_id)
    tool = _force_extra_type(tool, expected_type_=extra.type_)
    _log.info(
        "pass_1.schema_synth.extra.complete",
        tool_type=extra.type_,
        plan_name=extra.plan.name,
    )
    return tool


# ───────────────────────────── Retry loops ─────────────────────────────────


async def _run_universal_with_retries(
    user_prompt: str,
    *,
    generation_id: str,
) -> _UniversalToolsLlmOutput:
    """Two-tier retry: transient + validation, mirroring Pass 0 llm.py."""
    last_validation_error: str | None = None

    for validation_attempt in range(_MAX_VALIDATION_RETRIES):
        prompt = (
            user_prompt
            if last_validation_error is None
            else _build_retry_prompt(user_prompt, last_validation_error)
        )
        try:
            output = await _universal_run_with_transient_retry(prompt, generation_id=generation_id)
        except (ValidationError, UnexpectedModelBehavior) as exc:
            last_validation_error = _format_validation_error(exc)
            _log.warning(
                "pass_1.schema_synth.universal.validation_retry",
                attempt=validation_attempt + 1,
                max_attempts=_MAX_VALIDATION_RETRIES,
                error_class=type(exc).__name__,
            )
            continue
        return output

    msg = (
        "LLM_VALIDATION_FAILED: Pass 1 universal synthesis exhausted "
        f"{_MAX_VALIDATION_RETRIES} validation retries"
    )
    raise Pass1Error(msg)


async def _run_extra_with_retries(
    user_prompt: str,
    *,
    extra: ExtraTool,
    generation_id: str,
) -> Tool1:
    last_validation_error: str | None = None

    for validation_attempt in range(_MAX_VALIDATION_RETRIES):
        prompt = (
            user_prompt
            if last_validation_error is None
            else _build_retry_prompt(user_prompt, last_validation_error)
        )
        try:
            output = await _extra_run_with_transient_retry(prompt, generation_id=generation_id)
        except (ValidationError, UnexpectedModelBehavior) as exc:
            last_validation_error = _format_validation_error(exc)
            _log.warning(
                "pass_1.schema_synth.extra.validation_retry",
                attempt=validation_attempt + 1,
                max_attempts=_MAX_VALIDATION_RETRIES,
                tool_type=extra.type_,
                plan_name=extra.plan.name,
                error_class=type(exc).__name__,
            )
            continue
        return output

    msg = (
        "LLM_VALIDATION_FAILED: Pass 1 extra synthesis exhausted "
        f"{_MAX_VALIDATION_RETRIES} validation retries "
        f"for plan='{extra.plan.name}' type={extra.type_}"
    )
    raise Pass1Error(msg)


async def _universal_run_with_transient_retry(
    prompt: str,
    *,
    generation_id: str,
) -> _UniversalToolsLlmOutput:
    backoff = _TRANSIENT_BACKOFF_BASE
    last_exc: BaseException | None = None
    for attempt in range(_MAX_TRANSIENT_RETRIES):
        try:
            # Threaded generation_id correlates Langfuse traces per-generation
            # (Phase 10 plan 10-03 D-06 item 1).
            result = await run_with_tracing(
                PASS_1_UNIVERSAL_AGENT,
                prompt,
                session_id=generation_id,
                stage="pass-1-universal",
                model_settings=PASS_1_SETTINGS,
            )
        except httpx.HTTPError as exc:
            last_exc = exc
            _log.warning(
                "pass_1.schema_synth.universal.transient_retry",
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

    msg = (
        f"LLM_TRANSIENT_FAILED: Pass 1 universal exhausted "
        f"{_MAX_TRANSIENT_RETRIES} transient retries "
        f"(last error: {type(last_exc).__name__})"
    )
    raise Pass1Error(msg) from last_exc


async def _extra_run_with_transient_retry(
    prompt: str,
    *,
    generation_id: str,
) -> Tool1:
    backoff = _TRANSIENT_BACKOFF_BASE
    last_exc: BaseException | None = None
    for attempt in range(_MAX_TRANSIENT_RETRIES):
        try:
            # Threaded generation_id correlates Langfuse traces per-generation
            # (Phase 10 plan 10-03 D-06 item 1).
            result = await run_with_tracing(
                PASS_1_EXTRA_AGENT,
                prompt,
                session_id=generation_id,
                stage="pass-1-extra",
                model_settings=PASS_1_SETTINGS,
            )
        except httpx.HTTPError as exc:
            last_exc = exc
            _log.warning(
                "pass_1.schema_synth.extra.transient_retry",
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

    msg = (
        f"LLM_TRANSIENT_FAILED: Pass 1 extra exhausted "
        f"{_MAX_TRANSIENT_RETRIES} transient retries "
        f"(last error: {type(last_exc).__name__})"
    )
    raise Pass1Error(msg) from last_exc


def _build_retry_prompt(base_prompt: str, validation_error: str) -> str:
    """Append a `<previous_attempt_validation_error>` block to a retry prompt."""
    return (
        f"{base_prompt}\n\n"
        "<previous_attempt_validation_error>\n"
        f"{validation_error}\n"
        "</previous_attempt_validation_error>\n\n"
        "Your previous response did not validate. Read the error above and "
        "produce a corrected response. Preserve any decisions that were "
        "already correct."
    )


def _format_validation_error(exc: ValidationError | UnexpectedModelBehavior) -> str:
    """Stable error-string format for retry-prompt rendering."""
    if isinstance(exc, ValidationError):
        return f"{type(exc).__name__}: {exc}"
    cause = exc.__cause__
    if cause is not None:
        return f"{type(exc).__name__}: {exc} (caused by {type(cause).__name__}: {cause})"
    return f"{type(exc).__name__}: {exc}"


# ───────────────────────── OpenAI compliance enforcement (D-30) ────────────


def _force_openai_compliance_search(tool: Tool1) -> Tool1:
    """Hardcode ``name='search'`` + ``type=universal``.

    Pass 3 (Phase 3) will additionally enforce input_schema = {properties:
    {query: {type: 'string'}}, required: ['query'], additionalProperties:
    False}. Phase 2 only owns the name + type invariant — see plan
    acceptance criteria in 02-07-PLAN.md.
    """
    return tool.model_copy(update={"name": "search", "type": Type.universal})


def _force_openai_compliance_fetch(tool: Tool1) -> Tool1:
    return tool.model_copy(update={"name": "fetch", "type": Type.universal})


def _force_universal_type(tool: Tool1, *, name: str) -> Tool1:
    """Pin ``type=universal`` and ``name`` for a non-search/fetch universal slot.

    Universal-tool names are FROZEN per D-29 — we override any LLM drift
    even when the name they emitted is close. ``list_objects`` MUST be
    named ``list_objects``, not ``list_resources`` or ``query_objects``.
    """
    return tool.model_copy(update={"name": name, "type": Type.universal})


def _force_extra_type(tool: Tool1, *, expected_type_: str) -> Tool1:
    """Pin ``type`` for an extra (action/workflow/specialized) tool.

    The LLM may misclassify an action as universal (especially when the
    underlying spec carries verb-rich routes). Hardcode the type here.
    """
    type_map: dict[str, Type] = {
        "action": Type.action,
        "workflow": Type.workflow,
        "specialized": Type.specialized,
    }
    coerced = type_map.get(expected_type_, Type.specialized)
    return tool.model_copy(update={"type": coerced})
