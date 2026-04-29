"""Stage E Phase 5 — Pitfall #5 re-assertion at handler-template level.

Plan 04-10 Wave 0 RED tests for the search-handler anti-pagination-loop
invariant (CONTEXT D-07 search-row + D-50 + Pitfall #5).

Pass 5 ``templates.py`` already enforces the anti-loop wording in its own
truncation table (Plan 04-04 D-07 search row); Plan 04-10 ships the same
invariant at the *handler* level — the per-tool ``tool_search.ts.j2``
template MUST NOT mention ``next_cursor`` / ``offset`` / ``cursor`` /
``paginate`` anywhere in its rendered output. ``list_objects`` MAY mention
those tokens because that is exactly the point of list pagination.

This is a defence-in-depth: even if a future refactor accidentally pulls
the runtime ``truncation.ts`` table into the search handler's truncation
copy, this test catches the regression at the handler-template render
level (cheap, fast, deterministic — no Worker boot required).

References:
- 04-CONTEXT.md D-07 (truncation thresholds verbatim) + D-50 (Pitfall #5
  mitigation locked at every emission point).
- 04-RESEARCH.md §"Operational Concerns" anti-loop section.
- 04-PATTERNS.md `templates/tool_search.ts.j2` row (Pitfall #5 invariant).
"""

from __future__ import annotations

from mcpgen_ir.types import FinalTool, Pass1Output

from mcpgen_engine.stages.stage_e.tools import render_tool_handler

_FORBIDDEN_IN_SEARCH: tuple[str, ...] = (
    "next_cursor",
    "nextCursor",
    "offset",
    "page_token",
)


def test_tool_search_no_next_cursor_in_rendered_output(
    final_tool_search: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Pitfall #5 — search-handler rendered output does NOT contain
    ``next_cursor`` (search is one-shot; pagination invitation = loop)."""
    _, content, template_name = render_tool_handler(final_tool_search, pass_1_output_handlers)
    assert template_name == "tool_search.ts.j2"
    assert "next_cursor" not in content, (
        "tool_search.ts.j2 leaks `next_cursor` (Pitfall #5 D-50 violation): "
        "search handler MUST be one-shot, not invite pagination."
    )


def test_tool_search_no_offset_in_rendered_output(
    final_tool_search: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Pitfall #5 — search-handler does NOT contain `offset` either."""
    _, content, _ = render_tool_handler(final_tool_search, pass_1_output_handlers)
    # search handler must not mention any of the canonical pagination tokens.
    for forbidden in _FORBIDDEN_IN_SEARCH:
        assert forbidden not in content, (
            f"tool_search.ts.j2 leaks pagination token {forbidden!r} "
            "(Pitfall #5 / D-07 search-row violation)"
        )


def test_tool_list_objects_may_have_next_cursor(
    final_tool_list_objects: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """list_objects template ALLOWED to mention `next_cursor` per D-07.

    Sanity test: confirm the anti-loop invariant is *scoped* to the search
    handler and is NOT a blanket ban — list_objects is the canonical
    pagination tool per CONTEXT D-07 and Pass 5 design §3.1.
    """
    _, content, template_name = render_tool_handler(final_tool_list_objects, pass_1_output_handlers)
    assert template_name == "tool_list_objects.ts.j2"
    # The list_objects template is allowed to surface pagination tokens —
    # we only enforce the negative invariant for the search handler.
    # We do NOT assert presence here (the handler may delegate to
    # `applyPagination` from runtime/pagination.ts and never spell the
    # token literally — that is also acceptable).
    # Plan 04-15: uses registerTool (canonical SDK v1 form — Plan 04-15 D-4).
    assert "server.registerTool(" in content
