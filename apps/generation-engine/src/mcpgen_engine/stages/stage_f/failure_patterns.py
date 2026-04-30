"""F1 / F2 / F3 failure -> upstream-pass retry mapping.

Single source of truth for which pass to retry on which failure. Encodes the three
decision matrices documented in
``.planning/phases/05-generation-engine-validation-stage-f/05-CONTEXT.md``:

- D-06: F1 check -> retry target
- D-13: F2 per-component score < 3 -> retry target
- D-25: F3 failure pattern -> retry target

Rationale for keeping all three tables in one module: the retry orchestrator
(``retry_orchestrator.py``, ships in Plan 05-08) needs a single dispatch site that
collapses any failure (F1 / F2 / F3) into a single retry target. Splitting the tables
across modules would force the orchestrator to import three places and to know about
internal F-stage layouts.

Plan 05-03 ships the F1 table only as ``Final[dict]`` constants; F2 + F3 tables ship
their constants here too so the retry orchestrator (Plan 05-08) has a single import
target. The constants are referenced from check modules but never mutated.
"""

from __future__ import annotations

from typing import Final

# ---------------------------------------------------------------------------
# D-06: F1 check error code -> retry target pass.
#
# ``None`` is an explicit terminal signal (no retry possible). The orchestrator must
# treat ``None`` as "surface to operator" rather than "default to Pass 2".
# ---------------------------------------------------------------------------
F1_CHECK_TO_RETRY: Final[dict[str, str | None]] = {
    # Bundle exceeds Cloudflare Workers 1 MB hard ceiling -> user must split spec.
    "BUNDLE_SIZE_HARD": None,
    # Jinja2 placeholder leaked through codegen -> retry Stage E template render.
    "STAGE_E_TEMPLATE_LEAKED": "stage_e",
    # Smart-ID parser accepts a different tenant's ID -> Pass 1 schema and/or Stage E
    # runtime parser regression. Conservative: retry Pass 1 first; Stage E retry is the
    # natural fallback because Pass 1 retry cascades to Stage E (CONTEXT D-26).
    "SMART_ID_CROSS_TENANT_LEAK": "pass_1",
    # MCP annotations missing or wrong -> Pass 4.
    "MCP_COMPLIANCE_FAIL_ANNOTATIONS": "pass_4",
    # MCP protocol version wrong in .mcpgen.yaml -> Stage E template fix.
    "MCP_COMPLIANCE_FAIL_PROTOCOL_VERSION": "stage_e",
    # Routing table omits an upstream endpoint -> Pass 1.
    "ROUTING_INCOMPLETE": "pass_1",
    # hostHeaderValidation middleware missing or out of order -> Stage E template fix.
    "AUTH_MIDDLEWARE_MISSING": "stage_e",
    # OpenAI Deep Research search/fetch shape drift -> Pass 1 (extra params).
    "OPENAI_COMPLIANCE_DRIFT_SEARCH": "pass_1",
    # Same drift on the fetch tool.
    "OPENAI_COMPLIANCE_DRIFT_FETCH": "pass_1",
    # Property rename inside search/fetch input schema -> Pass 3 (parameter spec).
    "OPENAI_COMPLIANCE_DRIFT_PARAM_RENAME": "pass_3",
    # Pass 2 generated examples not derivable from spec -> retry Pass 2 with anti-pattern.
    "EXAMPLES_HALLUCINATED": "pass_2",
    # Operator-side credential leak -> terminal; surface for human intervention.
    "SECRETS_LEAKED": None,
    # Pass 3 produced an invalid JSON Schema for inputSchema.
    "JSON_SCHEMA_INVALID_INPUT": "pass_3",
    # Pass 5 produced an invalid JSON Schema for outputSchema.
    "JSON_SCHEMA_INVALID_OUTPUT": "pass_5",
    # tsc --noEmit failure -> Stage E template fix (Pass outputs unchanged).
    "TS_COMPILE_FAILED": "stage_e",
}

# ---------------------------------------------------------------------------
# D-13: F2 per-component (per-tool average) below 3.0 -> retry target pass.
#
# ``None`` indicates "deferred to v1.1" (Examples component is not retried because
# tool-level examples are deferred per Phase 5 D-10).
# ---------------------------------------------------------------------------
F2_COMPONENT_TO_RETRY: Final[dict[str, str | None]] = {
    "purpose": "pass_2",
    "guidelines": "pass_2",
    "limitations": "pass_2",
    # The 6-component rubric uses ``parameter_explanation`` as the tag; Pass 2 owns the
    # high-level overview but Pass 3 owns the per-parameter detail. A failing parameter
    # explanation score most often points at Pass 3 (per CONTEXT D-13).
    "parameter_explanation": "pass_3",
    "length_completeness": "pass_2",
    "examples": None,
}

# ---------------------------------------------------------------------------
# D-25: F3 failure pattern -> retry target pass.
#
# Stage F design Appendix A heuristics: the orchestrator detects a pattern from the
# trajectory + judge scores, then dispatches via this table.
# ---------------------------------------------------------------------------
F3_PATTERN_TO_RETRY: Final[dict[str, str]] = {
    "agent_confuses_two_tools": "pass_2",
    "agent_passes_wrong_format": "pass_3",
    "agent_hits_destructive_without_confirmation": "pass_4",
    "agent_loops_after_truncation": "pass_5",
    "agent_hallucinates_data": "pass_5",
    "agent_fails_auth": "stage_e",
    "agent_skips_required_step": "pass_2",
}


def f1_check_to_retry(error_code: str) -> str | None:
    """Return the retry target pass for an F1 error code, or ``None`` if terminal.

    Unknown error codes raise ``KeyError`` to surface coding mistakes loudly: the
    decision matrix MUST cover every error code emitted by an F1 check. Adding a new
    F1 check without extending this table is a regression caught by the F1 orchestrator
    integration test in Plan 05-08.
    """
    return F1_CHECK_TO_RETRY[error_code]


def f2_component_to_retry(component: str) -> str | None:
    """Return the retry target pass for an F2 rubric component, or ``None`` (deferred)."""
    return F2_COMPONENT_TO_RETRY[component]


def f3_pattern_to_retry(pattern: str) -> str:
    """Return the retry target pass for an F3 failure pattern."""
    return F3_PATTERN_TO_RETRY[pattern]
