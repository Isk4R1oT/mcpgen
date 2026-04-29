"""Pass 5 Phase 4 — FROZEN truncation guidance template table.

Per CONTEXT D-07 verbatim (with Pitfall #5 anti-loop wording invariants):

| Tool type        | Threshold | Anti-loop phrase                                    |
|------------------|-----------|-----------------------------------------------------|
| search           | 10K       | "usually sufficient" + NO next_cursor/offset/cursor |
| list_objects     | 15K       | "usually sufficient" + "only paginate if..."        |
| list_collections | 10K       | "usually sufficient"                                |
| fetch            | 20K       | "usually sufficient"                                |
| upsert           | 5K        | "usually sufficient"                                |
| delete           | 5K        | "usually sufficient"                                |
| action           | 5K        | "usually sufficient"                                |
| workflow         | 15K       | "usually sufficient"                                |

Threats addressed:
- T-04-04-pagination-loops (Pitfall #5): every template contains the
  anti-loop phrase; ``search`` lexically excludes pagination hints.
  Verified by ``_assert_anti_loop_wording()`` and
  ``_assert_search_no_pagination_hints()`` called at module import time.
- T-04-04-table-mutation: ``MappingProxyType`` wrapping makes the table
  read-only at runtime — neither outer nor inner mappings can be mutated.

Substitution placeholders (used by ``truncation.apply_truncation_template``):
- ``{N}`` — count shown
- ``{Total}`` — total count
- ``{Total_minus_N}`` — remaining count
- ``{cursor_value}`` — opaque cursor string for list_objects continuation
- ``{offset_value}`` — integer offset for list_objects continuation
- ``{action}`` — action / workflow tool name
- ``{success_count}`` — workflow successful sub-step count
- ``{total_steps}`` — workflow total sub-step count
- ``{operation}`` — upsert verb (``create`` / ``update``)

Note: ``str.format`` interprets ``{{`` / ``}}`` as literal braces. The
``list_objects`` template uses ``{{cursor: '{cursor_value}'}}`` to render
literal ``{cursor: '...'}`` in the agent-facing output text.

References:
- 04-CONTEXT.md D-07 verbatim
- 04-RESEARCH.md §"Code Examples" Code Example 3
- docs/mcpgen-pass-5-design.md Appendix A
- Analog: ``passes/pass_4/verbs.py::ACTION_VERB_PATTERNS`` (Final dict
  pattern with import-time consistency assertion).
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType
from typing import Final

# ──────────────────── D-07 frozen table — verbatim source ───────────────────

# Plain dict literal first (so import-time validators can iterate); the
# read-only MappingProxyType wrappers are constructed below after validation.
_RAW: Final[dict[str, dict[str, object]]] = {
    "search": {
        "threshold_tokens": 10_000,
        "template": (
            "Showing top {N} results. {Total_minus_N} more matches exist; "
            "usually sufficient. Refine query for precision."
        ),
        # NOTE (Pitfall #5): search NEVER mentions next_cursor / offset /
        # cursor / paginate. search is one-shot per Pass 5 design Appendix A.
    },
    "list_objects": {
        "threshold_tokens": 15_000,
        "template": (
            "Showing {N} of {Total} objects. {Total_minus_N} more available; "
            "usually sufficient. To continue, use {{cursor: '{cursor_value}'}} "
            "or {{offset: {offset_value}}}. "
            "only paginate if the user explicitly requested all."
        ),
    },
    "list_collections": {
        "threshold_tokens": 10_000,
        "template": "Showing {N} of {Total} collections; usually sufficient.",
    },
    "fetch": {
        "threshold_tokens": 20_000,
        "template": (
            "Object has {Total} fields, showing {N} default. "
            "To see all fields, call fetch again with properties=['*'] or "
            "specify field names. Default usually sufficient."
        ),
    },
    "upsert": {
        "threshold_tokens": 5_000,
        "template": (
            "Upsert completed. Returning {N} of {Total} fields of the "
            "{operation} object; usually sufficient."
        ),
    },
    "delete": {
        "threshold_tokens": 5_000,
        "template": (
            "Delete completed. Confirmation: {N} of {Total} resources affected. "
            "Result usually sufficient."
        ),
    },
    "action": {
        "threshold_tokens": 5_000,
        "template": (
            "Action `{action}` completed. Output truncated at {N} tokens; "
            "usually sufficient. Use search/fetch to inspect resulting state."
        ),
    },
    "workflow": {
        "threshold_tokens": 15_000,
        "template": (
            "Workflow `{action}` completed: {success_count}/{total_steps} "
            "sub-operations. Truncated to key results; usually sufficient. "
            "Sub-operation details available via fetch."
        ),
    },
}


# ─────────────────────────── Pitfall #5 invariants ──────────────────────────

_ANTI_LOOP_PHRASES: Final[tuple[str, ...]] = (
    "usually sufficient",
    "only paginate if the user explicitly requested all",
)
_SEARCH_FORBIDDEN_LOWER: Final[tuple[str, ...]] = (
    "next_cursor",
    "offset",
    "cursor",
    "paginate",
)


def _assert_anti_loop_wording() -> None:
    """Pitfall #5: every template MUST contain anti-loop wording.

    Raised at import time so a corrupted template table causes the engine to
    fail loud rather than silently emit a server with pagination-loop-prone
    guidance.
    """
    for tool_type, row in _RAW.items():
        template = row["template"]
        if not isinstance(template, str):
            type_name = type(template).__name__
            msg = f"Pass 5 D-07 row {tool_type!r} has non-str template " f"(got {type_name})"
            # AssertionError (not TypeError) — this is a hard D-07 contract
            # violation discovered at import time, not a user-input issue.
            raise AssertionError(msg)  # noqa: TRY004
        if not any(phrase in template for phrase in _ANTI_LOOP_PHRASES):
            msg = (
                f"Pass 5 D-07 truncation template for {tool_type!r} missing "
                f"anti-loop wording (must include one of {_ANTI_LOOP_PHRASES!r})."
            )
            raise AssertionError(msg)


def _assert_search_no_pagination_hints() -> None:
    """Pitfall #5: ``search`` template MUST NOT mention next_cursor / offset /
    cursor / paginate (case-insensitive).

    ``search`` is one-shot per Pass 5 design Appendix A — agents that see
    cursor / offset hints in a search-truncation message tend to enter
    pagination loops chasing diminishing-quality results.
    """
    search_template = _RAW["search"]["template"]
    if not isinstance(search_template, str):
        msg = "Pass 5 D-07 search row has non-str template"
        # AssertionError (not TypeError) — D-07 contract violation at import
        # time, not a runtime input issue.
        raise AssertionError(msg)  # noqa: TRY004
    template_lower = search_template.lower()
    for forbidden in _SEARCH_FORBIDDEN_LOWER:
        if forbidden in template_lower:
            msg = (
                f"Pass 5 D-07 search template MUST NOT mention {forbidden!r} "
                f"(Pitfall #5 invariant): {search_template!r}"
            )
            raise AssertionError(msg)


# Run invariants at module import time — fail loud on corruption.
_assert_anti_loop_wording()
_assert_search_no_pagination_hints()


# ─────────────────────── Read-only table (T-04-04 mitigation) ───────────────

_TRUNCATION_TEMPLATES: Final[Mapping[str, Mapping[str, object]]] = MappingProxyType(
    {key: MappingProxyType(value) for key, value in _RAW.items()}
)
"""FROZEN per-tool-type truncation guidance table per D-07.

Read-only at runtime via ``MappingProxyType`` (T-04-04-table-mutation).
Both the outer mapping AND each inner row mapping are wrapped so attempts to
mutate either raise ``TypeError``.
"""

# Public alias — same view, different name. Callers should import this.
TRUNCATION_TEMPLATES: Final[Mapping[str, Mapping[str, object]]] = _TRUNCATION_TEMPLATES
