"""Pass 0 Stage 0b — Qwen3-Coder LLM call (categorization + naming + composites).

Single primary entry point: ``run_llm_stage(endpoints, options) -> Pass0LlmOutput``.
Wraps a module-level ``PASS_0_AGENT`` (constructed once via ``make_agent`` from
the agent factory — Pitfall A: NO direct OpenAIModel/Provider construction here).

Retry policy (D-26):

- Tenacity exponential backoff (1s/2s/4s, max 3 attempts) on transient
  OpenRouter errors: ``httpx.HTTPError``, ``httpx.TimeoutException``,
  rate-limit / connection-refused responses bubble up as those types
  through PydanticAI.
- Pydantic ``ValidationError`` is caught explicitly: 3 retries with the
  validation error fed back into ``build_retry_user_prompt`` so the LLM
  can self-correct (e.g., name-regex violations are rejected at decode
  time because ``ToolPlan.name`` carries the regex constraint in IR).
- After 3 validation retries → raise ``Pass0Error("LLM_VALIDATION_FAILED",
  ...)`` so the orchestrator can engage the degraded fallback.

Threats addressed:
- T-2-15 (D-51): user prompt is built via ``build_user_prompt`` which
  XML-sandboxes spec text.
- T-2-13 (D-52): structlog only emits structural counts (tool_plan_count,
  composite_candidate_count, dropped_by_llm_count). NEVER spec content.
- T-2-17 (D-26): Pydantic validation failures retry with feedback rather
  than silently degrading.

References:
- 02-CONTEXT.md D-04 (provider routing pinned), D-06 (sampling profile),
  D-26 (retry/degrade), D-50 (single async run per pass), D-51 (XML sandboxing)
- 02-RESEARCH.md §"Pattern 3" + Pitfall A (no direct model construction)
- 02-PATTERNS.md `passes/pass_0/llm.py` row
- docs/mcpgen-pass-0-design.md §6 (prompts) + §8 (retry logic)
"""

from __future__ import annotations

from typing import Final

import httpx
import structlog
from mcpgen_ir.types import Endpoint
from pydantic import ValidationError
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior

from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import PASS_0_SETTINGS
from mcpgen_engine.observability import run_with_tracing

from .filter import UserOptions
from .prompts import PASS_0_SYSTEM_PROMPT, build_retry_user_prompt, build_user_prompt
from .validation import Pass0Error, Pass0LlmOutput

# D-26: 3 retries on transient errors AND 3 retries on validation errors.
_MAX_TRANSIENT_RETRIES: Final[int] = 3
_MAX_VALIDATION_RETRIES: Final[int] = 3

# Initial backoff for transient errors (seconds). Doubled per attempt: 1s, 2s, 4s.
_TRANSIENT_BACKOFF_BASE: Final[float] = 1.0
_TRANSIENT_BACKOFF_MAX: Final[float] = 4.0

# Module-level Agent singleton — constructed once at import. Sampling /
# extra_body propagation happens at `.run()` time via `model_settings=`.
PASS_0_AGENT: Final[Agent[None, Pass0LlmOutput]] = make_agent(
    output_type=Pass0LlmOutput,
    system_prompt=PASS_0_SYSTEM_PROMPT,
)

_log = structlog.get_logger(__name__)


# ─────────────────────────────── Public API ────────────────────────────────


async def run_llm_stage(
    endpoints: list[Endpoint],
    options: UserOptions,
    *,
    generation_id: str,
) -> Pass0LlmOutput:
    """Execute Pass 0 Stage 0b: Qwen LLM categorization + naming.

    Two-tier retry per D-26:

    1. *Transient* errors (network / 5xx / rate-limit) — caught and retried
       with exponential backoff up to ``_MAX_TRANSIENT_RETRIES`` attempts
       per logical call. Implemented inline (rather than via tenacity decorator)
       so we can interleave it with the validation-retry loop below.
    2. *Pydantic ValidationError* — the LLM emitted a structurally invalid
       response (e.g., a tool name that fails the IR regex constraint).
       The error message is folded into ``build_retry_user_prompt`` and
       the LLM is given another shot, up to ``_MAX_VALIDATION_RETRIES``.

    On exhaustion of validation retries → raise
    ``Pass0Error("LLM_VALIDATION_FAILED")`` for the orchestrator's degraded
    fallback path.

    Returns the structured ``Pass0LlmOutput`` (already Pydantic-validated
    by PydanticAI). Logs only structural counts — D-52 prevents spec text
    from reaching observability.
    """
    user_prompt = build_user_prompt(endpoints, options)
    last_validation_error: str | None = None

    for validation_attempt in range(_MAX_VALIDATION_RETRIES):
        prompt = (
            user_prompt
            if last_validation_error is None
            else build_retry_user_prompt(endpoints, options, last_validation_error)
        )
        try:
            output = await _run_with_transient_retry(prompt, generation_id=generation_id)
        except ValidationError as exc:
            last_validation_error = str(exc)
            _log.warning(
                "pass_0.llm.validation_retry",
                attempt=validation_attempt + 1,
                max_attempts=_MAX_VALIDATION_RETRIES,
                error_count=len(exc.errors()),
            )
            continue
        except UnexpectedModelBehavior as exc:
            # PydanticAI wraps tool-call validation failures in
            # UnexpectedModelBehavior (chained from ToolRetryError) once its
            # internal max_result_retries is exhausted. We treat that as a
            # single failed validation attempt at our layer and retry with
            # the underlying error message folded into the prompt (D-26).
            last_validation_error = f"{type(exc).__name__}: {exc}"
            cause = exc.__cause__
            if cause is not None:
                last_validation_error += f" (caused by {type(cause).__name__}: {cause})"
            _log.warning(
                "pass_0.llm.validation_retry",
                attempt=validation_attempt + 1,
                max_attempts=_MAX_VALIDATION_RETRIES,
                error_class=type(exc).__name__,
                cause_class=type(cause).__name__ if cause is not None else None,
            )
            continue

        _log.info(
            "pass_0.llm.complete",
            tool_plan_count=len(output.tool_plans),
            composite_candidate_count=len(output.composite_candidates),
            dropped_by_llm_count=len(output.llm_dropped_endpoints),
            validation_attempt=validation_attempt + 1,
        )
        return output

    raise Pass0Error(
        "LLM_VALIDATION_FAILED: Pass 0 LLM exhausted "
        f"{_MAX_VALIDATION_RETRIES} validation retries; engage degraded fallback",
    )


# ─────────────────────────── Transient retry loop ──────────────────────────


async def _run_with_transient_retry(
    user_prompt: str,
    *,
    generation_id: str,
) -> Pass0LlmOutput:
    """Invoke ``PASS_0_AGENT.run`` with exponential backoff on transient errors.

    Transient = network / connection-refused / read-timeout / 5xx as raised
    via ``httpx.HTTPError``. Pydantic ``ValidationError`` is NOT caught here
    — that bubbles to ``run_llm_stage`` for the validation-feedback retry.
    """
    import asyncio

    backoff = _TRANSIENT_BACKOFF_BASE
    last_exc: BaseException | None = None
    for attempt in range(_MAX_TRANSIENT_RETRIES):
        try:
            # Threaded generation_id correlates Langfuse traces per-generation
            # (Phase 10 plan 10-03 D-06 item 1).
            result = await run_with_tracing(
                PASS_0_AGENT,
                user_prompt,
                session_id=generation_id,
                stage="pass-0",
                model_settings=PASS_0_SETTINGS,
            )
        except httpx.HTTPError as exc:
            last_exc = exc
            _log.warning(
                "pass_0.llm.transient_retry",
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

    raise Pass0Error(
        f"LLM_TRANSIENT_FAILED: Pass 0 LLM exhausted {_MAX_TRANSIENT_RETRIES} "
        f"transient retries (last error: {type(last_exc).__name__})",
    ) from last_exc
