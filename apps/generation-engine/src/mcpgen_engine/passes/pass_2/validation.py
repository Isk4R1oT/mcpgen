"""Pass 2 — deterministic validation surface (length / forbidden / examples / injection).

Pure-function module: no LLM, no I/O, no async. Composes ``length_budget``,
``forbidden``, and a local copy of the D-15 prompt-injection regex into
per-Description validators that the Pass 2 retry loop (Plan 03-04) calls
after each LLM call AND after each retry per the D-12 invariant.

The pure-Python markdown renderer (``render_description_markdown``) mirrors
the TS ``apps/cli/src/init/render_description.ts`` that lands in Plan 03-12.
Length-budget and forbidden-phrase validation run against the SAME string
the MCP agent will see in ``tools/list``, so the renderer is the single
source of truth for that text.

Dependency note: ``_PROMPT_INJECTION_REGEX`` and ``_DESCRIPTION_PREVIEW_CHARS``
are defined locally to keep this plan independent of Plan 03-02
(``passes/pass_2/prompts.py``), which adds the same constants for the LLM
prompt builder. Plan 03-04 (orchestrator) reconciles by importing both
modules; the values MUST stay identical across the two files. Any change
to D-15 must be applied here AND in ``prompts.py``.

References:
- 03-CONTEXT.md D-11 (examples policy) + D-12 (retry-revalidation) + D-13
  (retry policy) + D-15 (injection heuristic) + D-47 (Pitfall #10)
- docs/mcpgen-pass-2-design.md §11 + §13
- packages/ir/python/types.py (`Description`, `Tool1`, `RawIR`, `Endpoint`,
  `Method`)
"""

from __future__ import annotations

import re
from typing import Final

from mcpgen_ir.types import Description, RawIR, Tool1

from mcpgen_engine.passes.pass_2.forbidden import find_forbidden_phrases
from mcpgen_engine.passes.pass_2.length_budget import is_within_budget

# ─────────────────────── D-15 sanitisation constants ───────────────────────
# Local copy — MUST stay in sync with the values in
# ``mcpgen_engine.passes.pass_2.prompts`` once Plan 03-02 lands. See module
# docstring for the rationale.

_PROMPT_INJECTION_REGEX: Final[re.Pattern[str]] = re.compile(
    r"(ignore (previous|all) instructions|disregard|new instructions|system:)",
    re.IGNORECASE,
)

_DESCRIPTION_PREVIEW_CHARS: Final[int] = 500


# ───────────── D-11 examples-from-spec heuristic candidate pattern ─────────
# Matches "example-flavoured" substrings the LLM might hallucinate:
# - Resource-ID prefixes (`ch_`, `cus_`, `evt_`, ... + 8+ id-body chars,
#   including underscores so multi-segment IDs like `ch_test_123abcdef`
#   match as a single token).
# - Stripe-style secret keys (`sk_test_*`, `sk_live_*`) — checked BEFORE
#   the generic prefix arm so the more specific pattern wins.
# - Hex-encoded blobs (16+ hex chars: SHA fragments, request IDs).
# - JWTs (`eyJ...`).
# - Full HTTP(S) URLs.
# - Bearer-prefixed tokens.

_EXAMPLE_CANDIDATE_REGEX: Final[re.Pattern[str]] = re.compile(
    r"(?:sk_(?:test|live)_[A-Za-z0-9_]{8,}"
    r"|[a-z]{2,5}_[A-Za-z0-9_]{8,}"
    r"|[0-9a-fA-F]{16,}"
    r"|eyJ[A-Za-z0-9._-]{20,}"
    r"|https?://[^\s\"<>)]+"
    r"|Bearer\s+[A-Za-z0-9._-]{8,})"
)


# ──────────────────────────────── Errors ───────────────────────────────────


class Pass2Error(ValueError):
    """Stable user-facing error class for Pass 2 validation failures.

    The first token of ``args[0]`` is treated as the stable error code by
    downstream layers (CLI / API). Additional context is preserved on the
    ``violations`` attribute. Mirrors the ``Pass0Error`` shape from
    ``passes/pass_0/validation.py``.
    """

    violations: list[str]

    def __init__(
        self: Pass2Error,
        message: str,
        *,
        violations: list[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.violations = violations or []


# ───────────────────────── render_description_markdown ────────────────────


def render_description_markdown(d: Description) -> str:
    """Pure-Python mirror of ``apps/cli/src/init/render_description.ts`` (Plan 03-12).

    Produces the markdown the MCP agent sees in ``tools/list`` so length and
    forbidden-phrase checks operate on the SAME bytes. Component ordering:

        Purpose
        ## When to use
        ## When NOT to use   (omitted if absent)
        ## How to use        (omitted if absent)
        ## Limitations
        ## Parameters

    Optional fields (``when_not_to_use``, ``how_to_use``) are dropped from
    the output when absent so the renderer stays canonical (no empty
    headers).
    """
    parts: list[str] = [d.purpose]
    parts.append("## When to use\n" + "\n".join(f"- {item}" for item in d.when_to_use))
    if d.when_not_to_use:
        parts.append("## When NOT to use\n" + "\n".join(f"- {item}" for item in d.when_not_to_use))
    if d.how_to_use:
        parts.append("## How to use\n" + d.how_to_use)
    parts.append("## Limitations\n" + "\n".join(f"- {item}" for item in d.limitations))
    parts.append("## Parameters\n" + d.parameter_overview)
    return "\n\n".join(parts)


# ────────────────────────────── Validators ─────────────────────────────────


def validate_description_length(description: Description, tool_type: str) -> str | None:
    """Return a retry-hint string if the rendered description is out of
    budget for ``tool_type``, ``None`` when in range.

    Delegates to ``length_budget.is_within_budget`` over the rendered
    markdown — the rendered output is what the MCP agent sees in
    ``tools/list``.
    """
    markdown = render_description_markdown(description)
    ok, hint = is_within_budget(markdown, tool_type)
    return None if ok else hint


def validate_no_forbidden_phrases(description: Description) -> list[str]:
    """Return sorted unique list of forbidden phrases in the rendered
    description (empty list = no violations).

    Delegates to ``forbidden.find_forbidden_phrases``.
    """
    markdown = render_description_markdown(description)
    return find_forbidden_phrases(markdown)


def validate_examples_from_spec(
    description: Description,
    raw_ir: RawIR,
    tool: Tool1,
) -> list[str]:
    """Return list of example-flavoured substrings in the description that
    do NOT appear verbatim in the source spec excerpts (empty = OK).

    v0 heuristic per D-11/D-47: scan the rendered markdown for ID-like /
    hex-like / JWT-like / bearer-like / URL substrings and verify each
    appears in the spec text the LLM was given. Anything that does NOT
    appear is flagged as a candidate hallucination -> retry per D-12.
    Phase 5 F1 adds a stricter regex check.
    """
    spec_text = _collect_spec_excerpt_text(raw_ir, tool)
    markdown = render_description_markdown(description)

    candidates: list[str] = []
    for m in _EXAMPLE_CANDIDATE_REGEX.finditer(markdown):
        candidate = m.group(0)
        if candidate not in spec_text:
            candidates.append(candidate)

    # Dedupe while preserving discovery order (deterministic for the
    # caller and for snapshot fixtures).
    seen: set[str] = set()
    deduped: list[str] = []
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        deduped.append(candidate)
    return deduped


def count_prompt_injection_warnings(raw_ir: RawIR, tool: Tool1) -> int:
    """Count ``_PROMPT_INJECTION_REGEX`` matches in the spec excerpts that
    would be embedded for ``tool``.

    Per D-15 this is a heuristic flag (no blocking). The Pass 2
    orchestrator emits the count to
    ``Pass2Output.flags.prompt_injection_warnings_count`` so the CLI /
    frontend can surface "N warnings on this server".
    """
    spec_text = _collect_spec_excerpt_text(raw_ir, tool)
    return len(_PROMPT_INJECTION_REGEX.findall(spec_text))


# ─────────────────────────────── Helpers ───────────────────────────────────


def _collect_spec_excerpt_text(raw_ir: RawIR, tool: Tool1) -> str:
    """Concatenate the spec text the LLM would see for ``tool``.

    Walks ``tool.source_endpoints`` (each in ``"METHOD path"`` format),
    joins each matching endpoint's ``description`` and ``summary``, and
    truncates each field to ``_DESCRIPTION_PREVIEW_CHARS`` to recreate the
    exact preview window ``prompts.build_user_prompt`` will embed. Unknown
    endpoint references (defensive — Pass 1 should populate accurately)
    are silently skipped.
    """
    excerpts: list[str] = []
    ep_index = {f"{ep.method.value} {ep.path}": ep for ep in raw_ir.endpoints}
    for endpoint_id in tool.source_endpoints:
        ep = ep_index.get(endpoint_id)
        if ep is None:
            continue
        for field_value in (ep.description or "", ep.summary or ""):
            excerpts.append(field_value[:_DESCRIPTION_PREVIEW_CHARS])
    return "\n".join(excerpts)
