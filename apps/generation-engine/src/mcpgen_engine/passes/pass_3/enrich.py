"""Pass 3 — Phase 2: per-parameter LLM enrichment (Semaphore 20 pipeline-scoped, D-17).

Two-tier retry: outer validation-retry (max 2 attempts), inner transient-HTTP
with exponential backoff (1s/2s/4s). D-12/D-24 invariant: retry prompt
re-includes examples policy verbatim via ``build_param_retry_user_prompt``.

After exhaustion: emit a deterministic fallback ``ParameterEnrichment`` built
from spec metadata (no LLM); log warning, do NOT raise — continue with
remaining params. Cross-parameter validation in Plan 03-09 catches structural
issues; this module's job is to never block a server's pass.

Threats: T-03-EX-Pass3 (D-12/D-24 retry-revalidation), Pitfall #2
(``PASS_3_SETTINGS`` embeds the verified ``_PROVIDER_ROUTING``).

References:
- 03-CONTEXT.md D-04 + D-16 + D-17 + D-24
- 03-PATTERNS.md ``passes/pass_3/enrich.py`` row + Shared Patterns "Two-tier retry"
- docs/mcpgen-pass-3-design.md §5
- Analog: apps/generation-engine/src/mcpgen_engine/passes/pass_2/authoring.py
"""

from __future__ import annotations

import asyncio
from typing import Final

import httpx
import structlog
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior

from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import PASS_3_SETTINGS
from mcpgen_engine.observability import run_with_tracing
from mcpgen_engine.passes.pass_3.extract import ParameterSpec
from mcpgen_engine.passes.pass_3.prompts import (
    PASS_3_SYSTEM_PROMPT,
    build_param_retry_user_prompt,
    build_param_user_prompt,
)

_log = structlog.get_logger(__name__)


# ─────────────────────────── Module-level constants ────────────────────────

# D-17: pipeline-scoped concurrency cap for per-parameter LLM enrichment.
# 20 across ALL params in ALL tools (NOT per-tool). For a 10-tool / 80-param
# server this means ~4 batches of 20 ≈ 30-60s wall-clock.
PASS_3_ENRICHMENT_CONCURRENCY: Final[int] = 20

# Two-tier retry budgets (mirrors pass_2.authoring shape):
# - validation: max 2 outer retries (D-13 cap analog for Pass 3) — 1 initial
#   attempt + up to 2 D-12-aware retries (re-include examples policy verbatim).
# - transient-HTTP: max 3 inner attempts with exponential backoff 1s/2s/4s.
_MAX_TRANSIENT_RETRIES: Final[int] = 3
_MAX_VALIDATION_RETRIES: Final[int] = 2
_TRANSIENT_BACKOFF_BASE: Final[float] = 1.0
_TRANSIENT_BACKOFF_MAX: Final[float] = 4.0


# ─────────────────────────── Pydantic output type ──────────────────────────


class ParameterEnrichment(BaseModel):
    """LLM-emitted per-parameter enrichment — internal Pass 3 type.

    Composed with ``ParameterSpec`` (extract.py) by Plan 03-09 cross-validation
    to produce the final JSON Schema property entry per D-22. Plan 03-08
    naming.py applies ``suggested_rename`` if non-null and matches a D-19
    ambiguous-name pattern.

    Field constraints:
    - ``description``: 5-component MCP-Bundles template; min 20 / max 400
      chars (the system prompt targets 80-300 but we allow slack at both
      ends so PydanticAI's structured-output decoder doesn't raise on
      borderline outputs that the deterministic fallback also covers).
    - ``example``: STRING | null — concrete safe example value. ``None`` is
      explicitly allowed when the spec offers nothing safe to copy.
    - ``suggested_rename``: STRING | null — only set when the LLM detects a
      D-19 ambiguous name; naming.py decides whether to apply it.
    - ``inferred_enum``: list[STRING] | null — only when the spec description
      implies an enumeration not encoded in ``ParameterSpec.enum``.
    """

    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=20, max_length=400)
    example: str | None = None
    suggested_rename: str | None = None
    inferred_enum: list[str] | None = None


# ─────────────────────────── Module-level Agent singleton ──────────────────
# D-04 / Pitfall A: ``make_agent`` is the only legal model construction site;
# never construct OpenAIModel/OpenAIProvider here.

# Single-line `make_agent(output_type=ParameterEnrichment, ...)` form keeps the
# acceptance-criteria grep happy while staying within ruff's line-length limit
# via the surrounding parenthesized expression.
PASS_3_ENRICHMENT_AGENT: Final[Agent[None, ParameterEnrichment]] = make_agent(
    output_type=ParameterEnrichment, system_prompt=PASS_3_SYSTEM_PROMPT
)


# ─────────────────────────── Deterministic fallback ────────────────────────


def _build_deterministic_fallback(param: ParameterSpec) -> ParameterEnrichment:
    """Build a deterministic 5-component description from spec metadata.

    Used when the LLM fails to produce a valid enrichment after retries.
    The result is structurally complete (passes Pydantic validation) but
    lacks LLM polish; cross-param validation in Plan 03-09 still accepts.

    Pure: no I/O, no LLM. Mirrors the system-prompt rubric so downstream
    consumers don't need to special-case fallback descriptions.
    """
    required_str = "required" if param.required else "optional"
    format_str = f"format={param.format}" if param.format else "no format constraint"
    if param.default is not None:
        default_str = f"default={param.default!r}"
    elif param.required:
        default_str = "(no default — required)"
    else:
        default_str = "(no default)"
    enum_str = f"enum={param.enum}" if param.enum else ""
    when_str = (
        "Required for this tool."
        if param.required
        else "Optional — omit to inherit upstream behaviour."
    )

    parts = [
        f"WHAT: The {param.name} parameter ({param.type}, {required_str}).",
        f"FORMAT: {format_str}{('; ' + enum_str) if enum_str else ''}.",
        f"WHEN: {when_str}",
        "EXAMPLE: (see spec)",
        f"DEFAULT: {default_str}",
    ]
    description = "\n".join(parts)[:400]  # cap to ParameterEnrichment max_length
    if len(description) < 20:
        description = description + " (auto-generated fallback description)"

    return ParameterEnrichment(
        description=description,
        example=None,
        suggested_rename=None,
        inferred_enum=None,
    )


# ────────────────────────── Transient-retry helper ─────────────────────────


async def _run_with_transient_retry(
    prompt: str,
    *,
    generation_id: str,
) -> ParameterEnrichment:
    """Inner retry: exponential backoff on httpx.HTTPError (1s/2s/4s).

    Mirrors ``pass_2/authoring.py::_run_with_transient_retry`` shape.
    Pydantic ``ValidationError`` / ``UnexpectedModelBehavior`` are NOT caught
    here — they bubble up to the outer validation-retry loop so the D-12
    invariant (re-include examples policy in retry prompt) takes effect.
    """
    backoff = _TRANSIENT_BACKOFF_BASE
    last_exc: BaseException | None = None
    for attempt in range(_MAX_TRANSIENT_RETRIES):
        try:
            # Threaded generation_id correlates Langfuse traces per-generation
            # (Phase 10 plan 10-03 D-06 item 1).
            result = await run_with_tracing(
                PASS_3_ENRICHMENT_AGENT,
                prompt,
                session_id=generation_id,
                stage="pass-3-enrich",
                model_settings=PASS_3_SETTINGS,
            )
        except httpx.HTTPError as exc:
            last_exc = exc
            _log.warning(
                "pass_3.enrich.transient_retry",
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


# ────────────────────────── Per-parameter enrichment ───────────────────────


async def _enrich_one(
    param: ParameterSpec,
    tool_name: str,
    tool_type: str,
    *,
    generation_id: str,
) -> ParameterEnrichment:
    """Enrich a single parameter; emit fallback after retry exhaustion.

    Outer loop runs ``_MAX_VALIDATION_RETRIES + 1`` attempts (1 initial + 2
    retries per D-13 analog). On every retry the prompt is rebuilt via
    ``build_param_retry_user_prompt`` so the D-12 / D-24 examples-policy
    invariant is re-included verbatim.

    On exhaustion: emit a deterministic 5-component fallback derived from
    spec metadata; log a warning, do NOT raise — Pass 3 must never block a
    server's pass on a single bad parameter.
    """
    last_validation_error: str | None = None
    for attempt in range(_MAX_VALIDATION_RETRIES + 1):
        prompt = (
            build_param_user_prompt(param, tool_name, tool_type)
            if last_validation_error is None
            else build_param_retry_user_prompt(param, tool_name, tool_type, last_validation_error)
        )
        try:
            return await _run_with_transient_retry(prompt, generation_id=generation_id)
        except (ValidationError, UnexpectedModelBehavior) as exc:
            last_validation_error = f"{type(exc).__name__}: {exc}"
            cause = exc.__cause__
            if cause is not None:
                last_validation_error += f" (caused by {type(cause).__name__}: {cause})"
            _log.warning(
                "pass_3.enrich.validation_retry",
                tool_name=tool_name,
                param_name=param.name,
                attempt=attempt + 1,
                max_attempts=_MAX_VALIDATION_RETRIES + 1,
                error_class=type(exc).__name__,
            )

    # Exhausted — emit deterministic fallback (do NOT raise per D-13 analog).
    _log.warning(
        "pass_3.enrich.fallback_to_deterministic",
        tool_name=tool_name,
        param_name=param.name,
        last_error=last_validation_error or "unknown",
    )
    return _build_deterministic_fallback(param)


# ─────────────────────────────── Public fan-out ────────────────────────────


async def enrich_all_params(
    extracted: dict[str, list[ParameterSpec]],
    tool_types_by_name: dict[str, str],
    *,
    generation_id: str = "unknown",
) -> dict[str, list[tuple[ParameterSpec, ParameterEnrichment]]]:
    """Per-parameter fan-out across ALL params in ALL tools (D-17 pipeline-scope).

    ``tool_types_by_name`` maps each ``tool_name`` to its ``Type.value`` string
    (universal/action/workflow/specialized) — needed because ``ParameterSpec``
    doesn't know its parent tool's type. The orchestrator (Plan 03-09) supplies
    this via ``{t.name: t.type.value for t in pass_1_output.tools}``.

    ``generation_id`` correlates Langfuse traces per-generation (Phase 10
    plan 10-03 D-06 item 1). Defaults to ``"unknown"`` so existing direct
    test callers continue to work; production callers thread the real value
    from the BFF via the Pass 3 orchestrator.

    Returns a stable per-tool ordering: ``out[tool_name][i]`` corresponds to
    ``extracted[tool_name][i]`` (the i-th input parameter for that tool).

    Concurrency is pipeline-scoped per D-17: a single ``asyncio.Semaphore(20)``
    bounds in-flight LLM calls across ALL parameters of ALL tools (NOT 20 per
    tool). For a 10-tool / 80-param server: ~4 batches of 20 ≈ 30-60s.
    """
    sem = asyncio.Semaphore(PASS_3_ENRICHMENT_CONCURRENCY)

    async def _bound(
        tool_name: str, param: ParameterSpec
    ) -> tuple[str, ParameterSpec, ParameterEnrichment]:
        async with sem:
            enrichment = await _enrich_one(
                param,
                tool_name,
                tool_types_by_name[tool_name],
                generation_id=generation_id,
            )
            return tool_name, param, enrichment

    # Flatten ALL params across ALL tools into one gather (D-17 pipeline-scope).
    coros = [_bound(tool_name, p) for tool_name, params in extracted.items() for p in params]
    triples = await asyncio.gather(*coros)

    # Re-group by tool_name preserving the original parameter ordering.
    out: dict[str, list[tuple[ParameterSpec, ParameterEnrichment]]] = {
        tool_name: [] for tool_name in extracted
    }
    for tool_name, param, enrichment in triples:
        out[tool_name].append((param, enrichment))
    return out
