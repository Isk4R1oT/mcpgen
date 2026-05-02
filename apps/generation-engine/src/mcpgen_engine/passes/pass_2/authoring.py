"""Pass 2 — per-tool description authoring (4 Agent singletons + Sem(10) + retry loop).

Phase 2 of the Pass 2 pipeline (D-04 / Plan 03-04 step). Per-tool concurrency
= 10 (D-08). Two-tier retry: outer validation-retry (max 2 per D-13)
re-runs ALL validators per D-12 invariant; inner transient-HTTP-retry
with exponential backoff (1s/2s/4s).

After retry exhaustion: emit Description with violation flags set in a
``Pass2WarningSet`` dataclass (NOT a Pass2Error raise — D-13 says
emit-and-continue per tool, do NOT block the pass).

Threats addressed:
- T-03-EX (D-12): retry prompt re-includes forbidden + examples-from-spec
  policy via ``build_retry_user_prompt``; validation re-runs every retry.
- Pitfall #2 (continues): every Agent call uses PASS_2_SETTINGS embedding
  the verified _PROVIDER_ROUTING.

References:
- 03-CONTEXT.md D-04 + D-08 + D-12 + D-13
- 03-PATTERNS.md ``passes/pass_2/authoring.py`` row + Shared Patterns "Two-tier retry"
- docs/mcpgen-pass-2-design.md §4
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Final

import httpx
import structlog
from mcpgen_ir.types import Description, Pass1Output, RawIR, Tool1, Type
from pydantic import ValidationError
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior

from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import PASS_2_SETTINGS
from mcpgen_engine.observability import run_with_tracing
from mcpgen_engine.passes.pass_2.classify import select_template
from mcpgen_engine.passes.pass_2.prompts import (
    PASS_2_ACTION_SYSTEM_PROMPT,
    PASS_2_SPECIALIZED_SYSTEM_PROMPT,
    PASS_2_UNIVERSAL_SYSTEM_PROMPT,
    PASS_2_WORKFLOW_SYSTEM_PROMPT,
    build_retry_user_prompt,
    build_user_prompt,
)
from mcpgen_engine.passes.pass_2.validation import (
    validate_description_length,
    validate_examples_from_spec,
    validate_no_forbidden_phrases,
)

# ─────────────────────────── Module-level constants ────────────────────────

# D-08: per-tool concurrency cap for the authoring fan-out.
PASS_2_AUTHORING_CONCURRENCY: Final[int] = 10

# D-13 retry policy for Pass 2 — cap at 2 validation retries per tool across
# ALL failure modes (vs 3 in Pass 0). Transient-HTTP retries use Pass 0's
# 3-attempt budget with the same exponential backoff curve (1s/2s/4s).
_MAX_TRANSIENT_RETRIES: Final[int] = 3
_MAX_VALIDATION_RETRIES: Final[int] = 2
_TRANSIENT_BACKOFF_BASE: Final[float] = 1.0
_TRANSIENT_BACKOFF_MAX: Final[float] = 4.0


# ─────────────────────────── Module-level Agent singletons ─────────────────
# D-06: one Agent per tool type, constructed via ``make_agent`` (Pitfall A:
# never construct OpenAIModel/Provider here — the singleton MODEL in
# ``llm/client.py`` is the only legal model construction site).

PASS_2_UNIVERSAL_AGENT: Final[Agent[None, Description]] = make_agent(
    output_type=Description,
    system_prompt=PASS_2_UNIVERSAL_SYSTEM_PROMPT,
)
PASS_2_ACTION_AGENT: Final[Agent[None, Description]] = make_agent(
    output_type=Description,
    system_prompt=PASS_2_ACTION_SYSTEM_PROMPT,
)
PASS_2_WORKFLOW_AGENT: Final[Agent[None, Description]] = make_agent(
    output_type=Description,
    system_prompt=PASS_2_WORKFLOW_SYSTEM_PROMPT,
)
PASS_2_SPECIALIZED_AGENT: Final[Agent[None, Description]] = make_agent(
    output_type=Description,
    system_prompt=PASS_2_SPECIALIZED_SYSTEM_PROMPT,
)

_AGENTS_BY_TYPE: Final[dict[Type, Agent[None, Description]]] = {
    Type.universal: PASS_2_UNIVERSAL_AGENT,
    Type.action: PASS_2_ACTION_AGENT,
    Type.workflow: PASS_2_WORKFLOW_AGENT,
    Type.specialized: PASS_2_SPECIALIZED_AGENT,
}


_log = structlog.get_logger(__name__)


# ──────────────────────────── Public dataclasses ───────────────────────────


@dataclass
class Pass2WarningSet:
    """Per-tool emit-and-continue flags from D-13 retry exhaustion.

    The orchestrator (``__init__.py``) aggregates these into a structural
    warnings counter for the SSE event surface (D-13). ``quality_warning``
    is set by ``quality_gate.py`` downstream — never by this module.
    """

    length_violation: str | None = None
    forbidden_pattern_violation: list[str] = field(default_factory=list)
    examples_not_in_spec: list[str] = field(default_factory=list)
    quality_warning: bool = False


@dataclass
class AuthoredToolResult:
    """Per-tool authoring outcome.

    ``description`` is the LLM-emitted ``Description`` (always populated when
    this dataclass is returned — pure transient/validation crashes raise
    ``Pass2Error`` instead). ``warnings`` carries the D-13 flag set from the
    last attempt (empty when authoring succeeded cleanly).
    """

    tool_name: str
    description: Description
    warnings: Pass2WarningSet


# ────────────────────────── Transient-retry helper ─────────────────────────


async def _run_with_transient_retry(
    agent: Agent[None, Description],
    prompt: str,
    *,
    generation_id: str,
) -> Description:
    """Inner retry: exponential backoff on httpx.HTTPError (1s/2s/4s).

    Mirrors ``pass_0/llm.py::_run_with_transient_retry`` shape. Pydantic
    ``ValidationError`` / ``UnexpectedModelBehavior`` is NOT caught here —
    that bubbles up to the outer validation-retry loop.
    """
    backoff = _TRANSIENT_BACKOFF_BASE
    last_exc: BaseException | None = None
    for attempt in range(_MAX_TRANSIENT_RETRIES):
        try:
            # Threaded generation_id correlates Langfuse traces per-generation
            # (Phase 10 plan 10-03 D-06 item 1).
            result = await run_with_tracing(
                agent,
                prompt,
                session_id=generation_id,
                stage="pass-2-author",
                model_settings=PASS_2_SETTINGS,
            )
        except httpx.HTTPError as exc:
            last_exc = exc
            _log.warning(
                "pass_2.author.transient_retry",
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


# ─────────────────── Deterministic Description fallback ───────────────────


# Minimal hand-written purpose lines per universal tool (D-21 spirit).
# All ≥ 20 chars to satisfy `Description.purpose.min_length`.
_UNIVERSAL_PURPOSE: Final[dict[str, str]] = {
    "search": (
        "Search across all collections by free-text query "
        "and return matching objects with smart-IDs."
    ),
    "fetch": (
        "Fetch a single object by its smart-ID after locating " "it via search or list_objects."
    ),
    "list_collections": (
        "List the available collections (resource types) " "exposed by this MCP server."
    ),
    "list_objects": (
        "List objects within a single collection with optional " "filter, sort, and pagination."
    ),
    "upsert": (
        "Create new objects or update existing ones by smart-ID " "across any supported collection."
    ),
    "delete": (
        "Delete an object, a list of objects, or an entire " "collection by smart-ID. Destructive."
    ),
}


def _build_deterministic_description(tool: Tool1) -> Description:
    """Synthesize a structurally valid ``Description`` from spec metadata.

    Used when the LLM exhausts validation retries (most often Qwen3-Coder
    returning malformed structured output for `fetch` / universal tools).
    Result is intentionally generic but ALWAYS satisfies the Pydantic
    constraints (purpose >= 20 chars; when_to_use >= 1 string;
    parameter_overview 50-400 chars). Stage F2 smell scan downstream
    flags low-quality tools so the operator can re-run with a better
    model or prompt without crashing the whole pipeline.

    Pure: no I/O, no LLM. Mirrors ``pass_3.enrich._build_deterministic_fallback``
    pattern.
    """
    purpose = _UNIVERSAL_PURPOSE.get(
        tool.name,
        f"Tool '{tool.name}' wraps {len(tool.source_endpoints)} upstream "
        f"endpoint(s) ({tool.type.value}).",
    )
    if len(purpose) < 20:
        purpose = f"{purpose} (auto-generated fallback)"

    if tool.name in _UNIVERSAL_PURPOSE:
        when_to_use = [
            f"When the agent needs to invoke the canonical `{tool.name}` "
            f"operation against this MCP server."
        ]
    else:
        when_to_use = [
            f"When the underlying operation '{tool.name}' is required by the " f"agent task plan."
        ]

    parameter_overview = (
        f"Parameters are derived from {len(tool.source_endpoints)} source "
        f"endpoint(s) of the original API spec; refer to the per-parameter "
        f"`description` fields in this tool's input schema for the precise "
        f"meaning, format, and example values. Auto-generated fallback "
        f"description; LLM authoring failed retries — operator should "
        f"re-run with a richer model or prompt."
    )
    if len(parameter_overview) < 50:
        parameter_overview = parameter_overview + " " * (50 - len(parameter_overview))
    parameter_overview = parameter_overview[:400]

    limitations: list[str] = [
        "LLM authoring of this description exhausted retries; semantics may be "
        "less polished than for sibling tools.",
    ]

    return Description(
        purpose=purpose,
        when_to_use=when_to_use,
        when_not_to_use=None,
        how_to_use=None,
        limitations=limitations,
        parameter_overview=parameter_overview,
        description_hash=None,
    )


# ────────────────────────── Per-tool authoring loop ────────────────────────


async def _author_one(
    tool: Tool1,
    raw_ir: RawIR,
    pass_1_output: Pass1Output,
    *,
    generation_id: str,
) -> AuthoredToolResult:
    """Author one tool's description with the D-12 + D-13 retry loop.

    Outer loop (max ``_MAX_VALIDATION_RETRIES + 1`` attempts = 1 initial +
    up to 2 retries per D-13) wraps the inner transient-retry helper. After
    every attempt — initial AND retries — re-runs ALL three validators per
    the D-12 invariant (Pitfall #10 mitigation). On retry exhaustion emits
    the last ``Description`` with the corresponding ``Pass2WarningSet``
    flags set (D-13 emit-and-continue).
    """
    agent = _AGENTS_BY_TYPE[tool.type]
    template_label = select_template(tool.type)
    last_validation_error: str | None = None
    warnings = Pass2WarningSet()
    last_description: Description | None = None

    for attempt in range(_MAX_VALIDATION_RETRIES + 1):
        prompt = (
            build_user_prompt(tool, raw_ir, pass_1_output)
            if last_validation_error is None
            else build_retry_user_prompt(tool, raw_ir, pass_1_output, last_validation_error)
        )
        try:
            description = await _run_with_transient_retry(
                agent, prompt, generation_id=generation_id
            )
        except (ValidationError, UnexpectedModelBehavior) as exc:
            last_validation_error = f"{type(exc).__name__}: {exc}"
            cause = exc.__cause__
            if cause is not None:
                last_validation_error += f" (caused by {type(cause).__name__}: {cause})"
            _log.warning(
                "pass_2.author.validation_retry",
                tool_name=tool.name,
                attempt=attempt + 1,
                max_attempts=_MAX_VALIDATION_RETRIES + 1,
                error_class=type(exc).__name__,
            )
            continue

        # D-12 invariant: re-run ALL validators after every attempt
        # (initial AND retries). Pitfall #10 mitigation.
        length_hint = validate_description_length(description, template_label)
        forbidden = validate_no_forbidden_phrases(description)
        hallucinated = validate_examples_from_spec(description, raw_ir, tool)

        violations: list[str] = []
        if length_hint is not None:
            violations.append(f"length: {length_hint}")
        if forbidden:
            violations.append(f"forbidden phrases: {', '.join(forbidden)}")
        if hallucinated:
            violations.append(f"examples not in spec: {', '.join(hallucinated)}")

        last_description = description

        if not violations:
            # Clean pass — drop any prior warnings carried over from a
            # previous failed attempt.
            return AuthoredToolResult(
                tool_name=tool.name,
                description=description,
                warnings=Pass2WarningSet(),
            )

        # Has violations — set warnings (overwritten on success of next
        # retry) and try again.
        warnings = Pass2WarningSet(
            length_violation=length_hint,
            forbidden_pattern_violation=forbidden,
            examples_not_in_spec=hallucinated,
        )
        last_validation_error = "; ".join(violations)
        _log.warning(
            "pass_2.author.validation_failed",
            tool_name=tool.name,
            attempt=attempt + 1,
            violation_count=len(violations),
        )

    # Retry budget exhausted → emit-and-continue per D-13.
    # POST-09.1 fix: when LLM keeps returning malformed structured output
    # (most often `fetch` / universal tools where Qwen3-Coder collapses the
    # mandatory `parameter_overview` to <50 chars or skips `when_to_use`),
    # we previously raised Pass2Error and crashed the whole pipeline at
    # Stage C. Mirror Pass 3's deterministic_fallback pattern instead:
    # synthesize a structurally valid Description from spec metadata so
    # the pipeline keeps moving. Stage F2 smell scan still flags the tool
    # as low-quality so the operator knows to retry with a richer prompt.
    if last_description is None:
        last_description = _build_deterministic_description(tool)
        warnings = Pass2WarningSet(
            length_violation=None,
            forbidden_pattern_violation=[],
            examples_not_in_spec=[],
        )
        _log.warning(
            "pass_2.author.fallback_to_deterministic",
            tool_name=tool.name,
            last_error=last_validation_error or "unknown",
        )

    _log.warning(
        "pass_2.author.emit_with_warnings",
        tool_name=tool.name,
        warnings_count=sum(
            [
                bool(warnings.length_violation),
                bool(warnings.forbidden_pattern_violation),
                bool(warnings.examples_not_in_spec),
            ]
        ),
    )
    return AuthoredToolResult(
        tool_name=tool.name,
        description=last_description,
        warnings=warnings,
    )


# ─────────────────────────────── Public fan-out ────────────────────────────


async def author_all_tools(
    pass_1_output: Pass1Output,
    raw_ir: RawIR,
    *,
    generation_id: str,
) -> dict[str, AuthoredToolResult]:
    """Per-tool fan-out under ``Semaphore(PASS_2_AUTHORING_CONCURRENCY)``.

    D-08: concurrency 10 across the entire pass. Returns a stable mapping
    keyed by tool name (the orchestrator uses the same key for the
    quality-gate phase).
    """
    sem = asyncio.Semaphore(PASS_2_AUTHORING_CONCURRENCY)

    async def _bound(tool: Tool1) -> tuple[str, AuthoredToolResult]:
        async with sem:
            result = await _author_one(tool, raw_ir, pass_1_output, generation_id=generation_id)
            return tool.name, result

    pairs = await asyncio.gather(*(_bound(t) for t in pass_1_output.tools))
    return dict(pairs)
