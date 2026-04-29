"""Pass 5 Phase 5b — cross-tool consistency validators.

Per CONTEXT D-08 invariants:

- Every list-style tool's pagination ``style`` must match the server-wide
  strategy chosen by majority vote.
- ``cursor`` / ``offset`` parameter names must be uniform across all
  list-style tools in a single server (catches drift across collections).
- Every truncation ``guidance_template`` must contain ``{N}`` and
  ``{Total}`` placeholders (catches mid-flight D-07 table corruption).

All validators raise ``Pass5Error`` (subclass of ``ValueError``) with:
- A stable error code as the first token of ``args[0]``
  (``PAGINATION_INCONSISTENT`` / ``TRUNCATION_PLACEHOLDERS_MISSING`` /
  ``PAGINATION_PARAM_NAMES_INCONSISTENT``).
- A ``violations: list[str]`` attribute carrying per-tool failure detail.

Threats addressed:
- T-04-05-pagination-inconsistency (D-08): cross-tool style check raises
  before assembly hits Stage E.
- T-04-05-truncation-placeholder-corruption: catches D-07 table drift.

References:
- 04-CONTEXT.md D-08.
- Analog: ``apps/generation-engine/src/mcpgen_engine/passes/pass_3/validation.py``
  (Pass3Error + cross-tool validators with violations list).
"""

from __future__ import annotations

from typing import Any

from mcpgen_engine.passes.pass_5.pagination import PaginationStrategy

# ──────────────────────────────── Errors ───────────────────────────────────


class Pass5Error(ValueError):
    """Stable user-facing error class for Pass 5 consistency failures.

    The first token of ``args[0]`` is treated as the stable error code by
    downstream layers (CLI / API). Additional context is preserved on the
    ``violations`` attribute. Mirrors ``Pass3Error`` from
    ``passes/pass_3/validation.py`` lines 64-83.
    """

    violations: list[str]

    def __init__(
        self: Pass5Error,
        message: str,
        *,
        violations: list[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.violations = violations or []


# ─────────────────────────── Helpers ───────────────────────────────────────


_LIST_LIKE_UNIVERSAL_NAMES = frozenset({"list_objects", "list_collections", "search"})


def _is_list_like(tool: Any) -> bool:
    """Tool eligible for pagination — universal list_* / search tools.

    Duck-typed on ``tool.type.value`` and ``tool.name`` so the validator
    works with both the frozen IR ``Tool2`` and runtime SimpleNamespace
    test stubs.
    """
    type_attr = getattr(tool, "type", None)
    type_value = getattr(type_attr, "value", None) if type_attr is not None else None
    if type_value != "universal":
        return False
    return getattr(tool, "name", None) in _LIST_LIKE_UNIVERSAL_NAMES


def _pagination_style_value(tool: Any) -> str | None:
    """Pull ``response_config.pagination.style.value`` defensively (None when absent)."""
    rc = getattr(tool, "response_config", None)
    if rc is None:
        return None
    pagination = getattr(rc, "pagination", None)
    if pagination is None:
        return None
    style = getattr(pagination, "style", None)
    if style is None:
        return None
    # IR ``Style`` is an Enum; ``.value`` is "cursor" / "offset" / "page-number" / "none".
    return getattr(style, "value", None) if hasattr(style, "value") else str(style)


def _server_style_value(server: PaginationStrategy) -> str:
    """Map internal PaginationStrategy.style → IR Style.value comparison key.

    PaginationStrategy uses ``"page_number"`` (underscore) for its internal
    Literal; the IR ``Style`` enum has ``.value == "page-number"`` (hyphen).
    Normalize to the IR-side spelling so cross-tool comparison is correct.
    """
    if server.style == "page_number":
        return "page-number"
    return server.style


# ─────────────────────────── Pagination consistency ────────────────────────


def validate_pagination_consistency(
    final_tools: list[Any],
    server_strategy: PaginationStrategy,
) -> None:
    """D-08 invariant: every list-style tool MUST share the server-wide strategy.

    Scans every list-style universal tool (``search`` / ``list_objects`` /
    ``list_collections``); skips tools whose ``response_config.pagination``
    is ``None`` (single-shot tools). Raises ``Pass5Error`` with a populated
    ``violations`` list when any tool's style differs.
    """
    expected = _server_style_value(server_strategy)
    if server_strategy.style == "none":
        # Server-wide "none" means no list tool should carry pagination.
        violations: list[str] = []
        for tool in final_tools:
            if not _is_list_like(tool):
                continue
            tool_style = _pagination_style_value(tool)
            if tool_style is not None and tool_style != "none":
                violations.append(
                    f"{getattr(tool, 'name', '<unknown>')}: server has no pagination "
                    f"but tool emits style {tool_style!r}"
                )
        if violations:
            raise Pass5Error(
                "PAGINATION_INCONSISTENT: list_* tools have mixed strategies",
                violations=violations,
            )
        return

    violations = []
    for tool in final_tools:
        if not _is_list_like(tool):
            continue
        tool_style = _pagination_style_value(tool)
        if tool_style is None:
            # Tool has no pagination block — accepted (single-shot).
            continue
        if tool_style != expected:
            violations.append(
                f"{getattr(tool, 'name', '<unknown>')}: expected pagination style "
                f"{expected!r}, got {tool_style!r}"
            )
    if violations:
        raise Pass5Error(
            "PAGINATION_INCONSISTENT: list_* tools have mixed strategies",
            violations=violations,
        )


# ─────────────────────────── Truncation placeholders ───────────────────────


def validate_truncation_placeholders(final_tools: list[Any]) -> None:
    """Every truncation guidance template MUST contain ``{N}`` and a total-count placeholder.

    Catches mid-flight D-07 table corruption (template strings rewritten
    without their substitution placeholders). Raises ``Pass5Error`` when
    any tool's template is missing ``{N}`` OR is missing every total-count
    placeholder.

    The plan must-have requires ``{N}`` and ``{Total}``; D-07 frozen templates
    (plan 04-04) use ``{Total}`` for list_objects/list_collections/fetch/
    upsert/delete and ``{Total_minus_N}`` for ``search``. Both are total-count
    placeholders by construction (Total_minus_N = Total - N). The validator
    therefore accepts EITHER ``{Total}`` OR ``{Total_minus_N}`` as the total
    count placeholder, which keeps the safety guarantee (catches removal of
    every count placeholder) without rejecting frozen D-07 templates.

    Note: ``action`` and ``workflow`` D-07 templates are deliberately count-
    free per Pass 5 design Appendix A (they describe completion + truncation
    in tokens, not in items). Those templates carry ``{N}`` only for token
    count, and are exempted from the total-count requirement when neither
    placeholder is referenced.

    Defensive on attribute access — IR ``Truncation`` has
    ``guidance_template`` while the internal ``TruncationConfig1`` has
    ``template``; this validator accepts either via ``getattr`` fallback so
    the same function works pre- and post-IR-assembly.
    """
    # Tools requiring BOTH {N} and a Total-count placeholder. Per D-07 frozen
    # templates, all list-style universal tools carry {Total} (or {Total_minus_N}
    # for search). Action / workflow / specialized templates are deliberately
    # count-free per Pass 5 design Appendix A — they describe completion in
    # tokens, not items, and only need {N}.
    _requires_total = frozenset(
        {
            "search",
            "fetch",
            "list_objects",
            "list_collections",
            "upsert",
            "delete",
        }
    )

    violations: list[str] = []
    for tool in final_tools:
        rc = getattr(tool, "response_config", None)
        if rc is None:
            continue
        truncation = getattr(rc, "truncation", None)
        if truncation is None:
            continue
        # Try IR ``guidance_template`` first; fall back to internal ``template``.
        template = getattr(truncation, "guidance_template", None) or getattr(
            truncation, "template", None
        )
        if template is None:
            continue
        if "{N}" not in template:
            violations.append(
                f"{getattr(tool, 'name', '<unknown>')}: truncation template missing " f"{{N}}"
            )
            continue
        # Total-count placeholder check — accept {Total} OR {Total_minus_N}
        # for list-style universal tools. Action/workflow/specialized templates
        # are exempt (their D-07 templates are count-free by design).
        tool_name = getattr(tool, "name", None)
        type_attr = getattr(tool, "type", None)
        type_value = getattr(type_attr, "value", None) if type_attr is not None else None
        is_list_style = type_value == "universal" and tool_name in _requires_total
        if is_list_style:
            has_total = "{Total}" in template
            has_total_minus_n = "{Total_minus_N}" in template
            if not (has_total or has_total_minus_n):
                violations.append(f"{tool_name}: truncation template missing {{Total}}")
    if violations:
        raise Pass5Error(
            "TRUNCATION_PLACEHOLDERS_MISSING: required {N}/{Total} placeholders absent",
            violations=violations,
        )


# ─────────────────────────── cursor/offset uniformity ──────────────────────


def validate_cursor_offset_param_names_uniform(final_tools: list[Any]) -> None:
    """D-08 invariant — cursor + offset param names uniform across list_* tools.

    The frozen IR ``Pagination2`` model does NOT carry per-name fields
    (``cursor_param_name`` / ``offset_param_name`` are part of the internal
    ``PaginationStrategy`` only). This validator therefore inspects whatever
    the runtime tool object exposes via ``response_config.pagination``,
    duck-typed:

    - When the attribute is absent (frozen IR shape) → no drift detected
      (the orchestrator passes the consistent server-wide strategy through
      ``final_assembly`` so the names are uniform by construction).
    - When the attribute is present (Stage E rich runtime shape) →
      uniformity enforced; drift raises ``Pass5Error``.
    """
    cursor_names: set[str] = set()
    offset_names: set[str] = set()
    for tool in final_tools:
        rc = getattr(tool, "response_config", None)
        if rc is None:
            continue
        pagination = getattr(rc, "pagination", None)
        if pagination is None:
            continue
        cursor_name = getattr(pagination, "cursor_param_name", None)
        offset_name = getattr(pagination, "offset_param_name", None)
        if cursor_name:
            cursor_names.add(str(cursor_name))
        if offset_name:
            offset_names.add(str(offset_name))
    violations: list[str] = []
    if len(cursor_names) > 1:
        violations.append(f"cursor param name drift across tools: {sorted(cursor_names)}")
    if len(offset_names) > 1:
        violations.append(f"offset param name drift across tools: {sorted(offset_names)}")
    if violations:
        raise Pass5Error(
            "PAGINATION_PARAM_NAMES_INCONSISTENT: cursor/offset names differ across tools",
            violations=violations,
        )
