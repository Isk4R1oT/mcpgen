"""Pass 5 Phase 4 — truncation config builder + runtime substitution.

Per CONTEXT D-07: maps each ``Tool1`` to its ``tool_type`` key in
``_TRUNCATION_TEMPLATES``, builds a ``TruncationConfig1`` per tool, and
provides a runtime substitution helper ``apply_truncation_template`` (also
referenced by Stage E ``truncation.ts.j2`` template in plan 04-08 — D-07 is
the source of truth for both Python orchestration AND TS runtime).

Threats addressed:
- T-04-04-template-injection: substitution uses safe ``str.format()`` with
  explicit named placeholders (``{N}`` / ``{Total}`` / ``{Total_minus_N}``
  + tool-type-specific kwargs). No ``eval()``, no Jinja2.

References:
- 04-CONTEXT.md D-07 (frozen 8-row table — Phase 4 deterministic).
- 04-CONTEXT.md D-50 (Pitfall #5 mitigation: anti-loop wording mandatory;
  search NEVER mentions next_cursor/offset).
- docs/mcpgen-pass-5-design.md §3 + Appendix A.
- Analog: ``passes/pass_4/rules.py::apply_tool_type_rules`` (uses
  ``Tool1.name`` as the universal-tool variant since the IR's ``Tool1`` has
  fields ``{name, type, source_endpoints}`` ONLY — no separate
  ``universal_tool`` field).

Note on input type: the plan referred to ``ToolTaxonomyEntry``; the actual
type carried by ``Pass1Output.tools`` is ``Tool1`` (structurally identical:
``{name, type, source_endpoints}``). We accept ``Tool1`` here to match the
data flow in the orchestrator (consistent with ``passes/pass_4/rules.py`` +
``passes/pass_5/pagination.py``).
"""

from __future__ import annotations

from typing import Any, Final

import structlog
from mcpgen_ir.types import Pass1Output, Tool1, Type
from pydantic import BaseModel, ConfigDict

from mcpgen_engine.passes.pass_5.templates import _TRUNCATION_TEMPLATES

_log = structlog.get_logger(__name__)


# ─────────────────────────── Exhaustive tool-type set ───────────────────────

# 8 canonical tool-type keys matching ``_TRUNCATION_TEMPLATES``. Used for
# cross-validation in plan 04-05 (final assembly verifies every tool's
# resolved type is a member of this set).
TOOL_TYPE_KEYS: Final[frozenset[str]] = frozenset(
    {
        "search",
        "list_objects",
        "list_collections",
        "fetch",
        "upsert",
        "delete",
        "action",
        "workflow",
    }
)


# ─────────────────────────── Internal Pass 5 type ──────────────────────────


class TruncationConfig1(BaseModel):
    """Internal Pass 5 truncation config — NOT exported in IR.

    The IR-exported ``TruncationConfig`` (``packages/ir/python/types.py``) has
    a slightly different shape (``threshold_tokens`` + ``guidance_template``
    only, no ``tool_type``). Plan 04-05 final-assembly converts
    ``TruncationConfig1`` → IR ``TruncationConfig`` shape.
    """

    model_config = ConfigDict(extra="forbid")
    tool_type: str
    threshold_tokens: int
    template: str


# ─────────────────────────── Tool-type resolver ────────────────────────────


def resolve_tool_type(tool: Tool1) -> str:
    """Map ``Tool1`` → truncation-template key.

    For ``Type.universal`` tools, ``tool.name`` IS the universal-tool variant
    (``"search"`` / ``"fetch"`` / ``"list_objects"`` / ``"list_collections"``
    / ``"upsert"`` / ``"delete"``) per Pass 1 output convention. For
    non-universal tools, the ``Type`` enum value drives the lookup.

    Specialized reads route to the ``"fetch"`` analog (single-object semantics
    is the closest match in the D-07 table).
    """
    if tool.type == Type.universal and tool.name in TOOL_TYPE_KEYS:
        return str(tool.name)
    if tool.type == Type.action:
        return "action"
    if tool.type == Type.workflow:
        return "workflow"
    if tool.type == Type.specialized:
        # Specialized reads route to fetch analog (single-object semantics).
        return "fetch"
    # Defensive fallback — e.g. universal-typed tool with non-canonical name.
    # Single-object read is the safest analog.
    return "fetch"


# ─────────────────────────── Per-tool config builder ────────────────────────


def build_truncation_config(
    tool: Tool1,
    pagination_strategy_value: str,
) -> TruncationConfig1:
    """Combine tool-type lookup with the frozen template table.

    ``pagination_strategy_value`` is currently unused at the per-tool level
    (D-07 templates are not pagination-strategy-conditional in v1) but is
    accepted in the signature so the plan-04-05 orchestrator can pass it
    uniformly across all Phase-4 helpers and so future strategy-aware
    template variants don't require a signature break.
    """
    del pagination_strategy_value  # reserved — see docstring.
    tool_type = resolve_tool_type(tool)
    row = _TRUNCATION_TEMPLATES[tool_type]
    threshold = row["threshold_tokens"]
    template = row["template"]
    if not isinstance(threshold, int):
        msg = f"D-07 row {tool_type!r} threshold is not int (got {type(threshold).__name__})"
        raise TypeError(msg)
    if not isinstance(template, str):
        msg = f"D-07 row {tool_type!r} template is not str (got {type(template).__name__})"
        raise TypeError(msg)
    return TruncationConfig1(
        tool_type=tool_type,
        threshold_tokens=threshold,
        template=template,
    )


# ─────────────────────────── Runtime substitution helper ────────────────────


def apply_truncation_template(
    tool_type: str,
    n_shown: int,
    total: int,
    **kwargs: Any,
) -> str:
    """Substitute placeholders into the D-07 template for ``tool_type``.

    Always supplies ``N`` / ``Total`` / ``Total_minus_N``. Caller passes
    tool-type-specific kwargs (``cursor_value`` / ``offset_value`` for
    list_objects; ``action`` for action+workflow; ``success_count`` /
    ``total_steps`` for workflow; ``operation`` for upsert).

    Raises:
        KeyError: if ``tool_type`` is not in ``_TRUNCATION_TEMPLATES`` OR if
            the template requires a placeholder that was not supplied via
            kwargs (this is the safe-substitution invariant —
            ``T-04-04-template-injection`` mitigation).
    """
    row = _TRUNCATION_TEMPLATES[tool_type]
    template = row["template"]
    if not isinstance(template, str):
        msg = f"D-07 row {tool_type!r} template is not str"
        raise TypeError(msg)
    return template.format(
        N=n_shown,
        Total=total,
        Total_minus_N=max(0, total - n_shown),
        **kwargs,
    )


# ─────────────────────────── Orchestrator ──────────────────────────────────


def build_all_truncation_configs(
    pass_1_output: Pass1Output,
    pagination_strategy_value: str,
) -> dict[str, TruncationConfig1]:
    """Walk every tool in ``pass_1_output.tools`` and build its truncation config.

    Returns a ``dict[tool_name → TruncationConfig1]``. Logs a structural
    breakdown (tool-type histogram) without touching any spec text.
    """
    result: dict[str, TruncationConfig1] = {}
    for tool in pass_1_output.tools:
        result[tool.name] = build_truncation_config(tool, pagination_strategy_value)
    breakdown = {
        ttype: sum(1 for c in result.values() if c.tool_type == ttype)
        for ttype in sorted(TOOL_TYPE_KEYS)
    }
    _log.info(
        "pass_5.truncation.build_complete",
        tool_count=len(result),
        tool_type_breakdown=breakdown,
    )
    return result
