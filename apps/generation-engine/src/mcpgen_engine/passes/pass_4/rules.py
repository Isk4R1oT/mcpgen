"""Pass 4 — deterministic tool-type rules + workflow conservative aggregation (D-28 + D-30).

`RuleResult` is an INTERNAL intermediate type carrying only the 3 mutable
booleans (readOnly/destructive/idempotent) — `openWorldHint` is NEVER set
here per D-27 (Pydantic ``Literal[True]`` invariant enforces at IR
construction site in Plan 03-11).

Threats addressed:
- T-03-OW (D-27): Pass 4 deterministic modules NEVER set ``openWorldHint``.
- Pitfall #31 (D-32): tool-type rule table HARDCODES ``read_only=True`` for
  every read-shaped tool (universal search/fetch/list_collections/list_objects
  + specialized) — Cursor's ``readOnlyHint`` short-circuit skips the
  confirmation prompt regardless of ``openWorldHint``.

Plan 03-10 deviation (documented in 03-10-SUMMARY.md):
- The frozen IR ``Tool1`` model has fields ``{name, type, source_endpoints}``
  ONLY — there is no ``universal_tool`` field. The plan's truth-table key
  ``(tool_type_value, universal_tool_value_or_None)`` is implemented here as
  ``(tool.type.value, tool.name)`` for ``Type.universal`` tools (tool name
  IS the canonical universal-tool variant for universal tools per Pass 1
  output convention) and ``(tool.type.value, None)`` for ``Type.specialized``.

References:
- 03-CONTEXT.md D-26 + D-27 + D-28 + D-30 + D-32
- 03-RESEARCH.md §"Architecture Patterns" Pattern 5 + Pattern 6
- 03-PATTERNS.md `passes/pass_4/rules.py` row
- docs/mcpgen-pass-4-design.md §3 + §3.3
"""

from __future__ import annotations

from typing import Final

from mcpgen_ir.types import Tool1, Type
from pydantic import BaseModel, ConfigDict


class RuleResult(BaseModel):
    """Internal Pass 4 intermediate — 3 mutable booleans only.

    ``openWorldHint`` is NEVER set here per D-27 (added at ``Annotations``
    construction in Plan 03-11). ``is_decisive=False`` means action / workflow
    not covered by the tool-type table; caller falls through to verb pattern OR
    LLM judgment OR conservative aggregation.
    """

    model_config = ConfigDict(extra="forbid")
    is_decisive: bool
    read_only: bool | None = None
    destructive: bool | None = None
    idempotent: bool | None = None


# D-28 verbatim — keys: ``(tool.type.value, universal_variant_or_None)``.
# For ``Type.universal``: the variant is ``tool.name`` (e.g. "search", "fetch").
# For ``Type.specialized``: the variant is ``None`` (single rule for all).
# ``Type.action`` and ``Type.workflow`` deliberately have NO entries — callers
# route them to verbs.py / aggregate_workflow_annotations respectively.
#
# Tuple value: ``(read_only, destructive, idempotent)``.
_TOOL_TYPE_RULES: Final[dict[tuple[str, str | None], tuple[bool, bool, bool]]] = {
    # Universal read-only family — Pitfall #31 (D-32) requires read_only=True
    ("universal", "search"): (True, False, True),
    ("universal", "fetch"): (True, False, True),
    ("universal", "list_collections"): (True, False, True),
    ("universal", "list_objects"): (True, False, True),
    # Universal write — D-28
    ("universal", "upsert"): (False, False, False),  # creates can dup → not idempotent
    ("universal", "delete"): (False, True, True),  # destructive but re-delete is no-op
    # Specialized read pattern — D-28 (treats all specialized as read-shaped)
    ("specialized", None): (True, False, True),
    # NOTE: action + workflow NOT in this table; fall through to verb pattern OR aggregation
}

# D-29 conservative defaults (UX safety > optimization). Used by the workflow
# aggregator when an endpoint has no claiming owner, when the owning tool is a
# nested workflow (avoid unbounded recursion), or when the owner is an action
# (verbs.py is intentionally NOT imported here to avoid circular imports;
# Plan 03-11 orchestrator can re-aggregate after action verbs are resolved).
_CONSERVATIVE_DEFAULT: Final[tuple[bool, bool, bool]] = (False, True, False)


def apply_tool_type_rules(tool: Tool1) -> RuleResult:
    """Look up ``tool`` in ``_TOOL_TYPE_RULES``; return ``RuleResult``.

    Returns ``is_decisive=False`` for action / workflow tools (not in the
    table — caller routes to verb pattern OR conservative aggregation).
    """
    if tool.type == Type.universal:
        key: tuple[str, str | None] = (tool.type.value, tool.name)
    elif tool.type == Type.specialized:
        key = (tool.type.value, None)
    else:
        # action / workflow — not in this table
        return RuleResult(is_decisive=False)

    if key not in _TOOL_TYPE_RULES:
        # Defensive: e.g. universal-typed tool with non-canonical name
        return RuleResult(is_decisive=False)

    read_only, destructive, idempotent = _TOOL_TYPE_RULES[key]
    return RuleResult(
        is_decisive=True,
        read_only=read_only,
        destructive=destructive,
        idempotent=idempotent,
    )


def aggregate_workflow_annotations(
    workflow: Tool1,
    all_tools: list[Tool1],
) -> RuleResult:
    """D-30: workflow conservative aggregation across sub-operations.

    Invariants:
    - ``read_only = AND across sub-tool annotations`` (any non-RO → workflow not RO)
    - ``destructive = OR across subs`` (any destructive → workflow destructive)
    - ``idempotent = AND across subs`` (any non-idempotent → workflow not idempotent)

    Sub-operation lookup: for each endpoint in ``workflow.source_endpoints``,
    find the OTHER tool that ALSO carries that endpoint in its
    ``source_endpoints`` (the "owning" tool). Apply that owner's rule.

    Fallbacks (all use ``_CONSERVATIVE_DEFAULT`` = ``(False, True, False)``,
    i.e. UX safety: not RO, destructive, not idempotent):
    - endpoint not claimed by any other tool → conservative
    - owning tool is itself a workflow → conservative (avoid recursion)
    - owning tool is an action → conservative (verbs.py not consulted to avoid
      circular import; Plan 03-11 may re-aggregate post action-verb resolution)
    - workflow has empty ``source_endpoints`` → conservative
    """
    if workflow.type != Type.workflow:
        # Defensive: caller should have filtered to workflows only
        return RuleResult(is_decisive=False)

    # Build endpoint→owning-tool index, EXCLUDING the workflow itself so a
    # workflow doesn't claim its own source_endpoints as their owner.
    endpoint_owner: dict[str, Tool1] = {}
    for tool in all_tools:
        if tool.name == workflow.name:
            continue
        for endpoint in tool.source_endpoints:
            endpoint_owner.setdefault(endpoint, tool)  # first claimer wins

    read_onlys: list[bool] = []
    destructives: list[bool] = []
    idempotents: list[bool] = []

    for endpoint_id in workflow.source_endpoints:
        owner = endpoint_owner.get(endpoint_id)
        if owner is None:
            triple = _CONSERVATIVE_DEFAULT
        elif owner.type == Type.workflow:
            # Avoid recursive aggregation — treat nested workflow as conservative
            triple = _CONSERVATIVE_DEFAULT
        elif owner.type in (Type.universal, Type.specialized):
            sub_result = apply_tool_type_rules(owner)
            if sub_result.is_decisive:
                # mypy: rule-table values are always non-None when is_decisive
                assert sub_result.read_only is not None
                assert sub_result.destructive is not None
                assert sub_result.idempotent is not None
                triple = (sub_result.read_only, sub_result.destructive, sub_result.idempotent)
            else:
                triple = _CONSERVATIVE_DEFAULT
        else:
            # action — conservative (verbs.py left to Plan 03-11 orchestrator)
            triple = _CONSERVATIVE_DEFAULT

        read_onlys.append(triple[0])
        destructives.append(triple[1])
        idempotents.append(triple[2])

    if not read_onlys:
        # Empty workflow — conservative D-29 default
        return RuleResult(
            is_decisive=True,
            read_only=_CONSERVATIVE_DEFAULT[0],
            destructive=_CONSERVATIVE_DEFAULT[1],
            idempotent=_CONSERVATIVE_DEFAULT[2],
        )

    return RuleResult(
        is_decisive=True,
        read_only=all(read_onlys),  # AND
        destructive=any(destructives),  # OR
        idempotent=all(idempotents),  # AND
    )
