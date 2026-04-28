"""Pass 4 — tests for rules.py (D-28 tool-type rules + D-30 workflow aggregation).

Threats covered: T-03-OW (openWorldHint never set in RuleResult), Pitfall #31
(D-32 — read tools force readOnly=True).
"""

from __future__ import annotations

from mcpgen_ir.types import Tool1, Type

from mcpgen_engine.passes.pass_4.rules import (
    RuleResult,
    aggregate_workflow_annotations,
    apply_tool_type_rules,
)

# ──────────────────────────── apply_tool_type_rules ────────────────────────


def test_universal_search_returns_decisive_read_only() -> None:
    tool = Tool1(name="search", type=Type.universal, source_endpoints=["GET /v1/foo"])
    result = apply_tool_type_rules(tool)
    assert result.is_decisive is True
    assert result.read_only is True
    assert result.destructive is False
    assert result.idempotent is True


def test_universal_fetch_returns_decisive_read_only() -> None:
    tool = Tool1(name="fetch", type=Type.universal, source_endpoints=["GET /v1/foo/{id}"])
    result = apply_tool_type_rules(tool)
    assert result.is_decisive is True
    assert result.read_only is True
    assert result.destructive is False
    assert result.idempotent is True


def test_universal_list_collections_returns_decisive_read_only() -> None:
    tool = Tool1(name="list_collections", type=Type.universal, source_endpoints=[])
    result = apply_tool_type_rules(tool)
    assert result.is_decisive is True
    assert result.read_only is True
    assert result.destructive is False
    assert result.idempotent is True


def test_universal_list_objects_returns_decisive_read_only() -> None:
    tool = Tool1(name="list_objects", type=Type.universal, source_endpoints=["GET /v1/foo"])
    result = apply_tool_type_rules(tool)
    assert result.is_decisive is True
    assert result.read_only is True
    assert result.destructive is False
    assert result.idempotent is True


def test_universal_upsert_returns_not_read_only_not_destructive_not_idempotent() -> None:
    tool = Tool1(name="upsert", type=Type.universal, source_endpoints=["POST /v1/foo"])
    result = apply_tool_type_rules(tool)
    assert result.is_decisive is True
    assert result.read_only is False
    assert result.destructive is False
    assert result.idempotent is False


def test_universal_delete_returns_destructive_idempotent() -> None:
    tool = Tool1(name="delete", type=Type.universal, source_endpoints=["DELETE /v1/foo/{id}"])
    result = apply_tool_type_rules(tool)
    assert result.is_decisive is True
    assert result.read_only is False
    assert result.destructive is True
    assert result.idempotent is True


def test_specialized_returns_read_only() -> None:
    tool = Tool1(
        name="balance_summary", type=Type.specialized, source_endpoints=["GET /v1/balance"]
    )
    result = apply_tool_type_rules(tool)
    assert result.is_decisive is True
    assert result.read_only is True
    assert result.destructive is False
    assert result.idempotent is True


def test_action_returns_not_decisive() -> None:
    tool = Tool1(name="charges_capture", type=Type.action, source_endpoints=["POST /v1/charges"])
    result = apply_tool_type_rules(tool)
    assert result.is_decisive is False
    assert result.read_only is None
    assert result.destructive is None
    assert result.idempotent is None


def test_workflow_returns_not_decisive_via_apply_rules() -> None:
    tool = Tool1(name="schedule_event", type=Type.workflow, source_endpoints=["POST /events"])
    result = apply_tool_type_rules(tool)
    assert result.is_decisive is False


def test_universal_unknown_name_returns_not_decisive() -> None:
    """Defensive: a universal-typed tool with an unrecognized name (i.e., not one of
    the 6 canonical UniversalTool variants) is not in the table."""
    tool = Tool1(name="weird_universal_name", type=Type.universal, source_endpoints=[])
    result = apply_tool_type_rules(tool)
    assert result.is_decisive is False


# ─────────────────── Pitfall #31 (D-32) — read tools force readOnly=True ────


def test_pitfall_31_all_read_tools_force_read_only_true() -> None:
    """D-32: Pitfall #31 — Cursor's readOnlyHint short-circuit requires
    readOnly=True on ALL read tools (universal search/fetch/list_*, specialized).
    Independent of openWorldHint (which is invariant True per D-27)."""
    read_tools = [
        Tool1(name="search", type=Type.universal, source_endpoints=[]),
        Tool1(name="fetch", type=Type.universal, source_endpoints=[]),
        Tool1(name="list_collections", type=Type.universal, source_endpoints=[]),
        Tool1(name="list_objects", type=Type.universal, source_endpoints=[]),
        Tool1(name="anything_specialized", type=Type.specialized, source_endpoints=[]),
    ]
    for tool in read_tools:
        result = apply_tool_type_rules(tool)
        assert result.is_decisive is True, f"{tool.name} not decisive"
        assert result.read_only is True, f"{tool.name} not read_only=True (Pitfall #31)"


# ──────────────────────── D-27 invariant — openWorldHint NOT in RuleResult ──


def test_rule_result_does_not_contain_open_world_hint() -> None:
    """D-27 invariant: RuleResult intermediate carries only the 3 mutable booleans
    + is_decisive. openWorldHint is added at IR-construction (Plan 03-11), never here."""
    result = RuleResult(is_decisive=True, read_only=True, destructive=False, idempotent=True)
    dumped = result.model_dump()
    assert "openWorldHint" not in dumped
    assert "open_world_hint" not in dumped
    assert set(dumped.keys()) == {"is_decisive", "read_only", "destructive", "idempotent"}


# ─────────────────── aggregate_workflow_annotations (D-30 conservative) ─────


def _build_workflow_test_tools() -> list[Tool1]:
    return [
        Tool1(name="search", type=Type.universal, source_endpoints=["GET /v1/items"]),
        Tool1(name="fetch", type=Type.universal, source_endpoints=["GET /v1/items/{id}"]),
        Tool1(name="delete", type=Type.universal, source_endpoints=["DELETE /v1/items/{id}"]),
    ]


def test_aggregate_workflow_all_read_subs() -> None:
    """Workflow over two read endpoints → aggregate is read-only, non-destructive,
    idempotent (D-30 AND/OR/AND)."""
    workflow = Tool1(
        name="multi_search",
        type=Type.workflow,
        source_endpoints=["GET /v1/items", "GET /v1/items/{id}"],
    )
    tools = [*_build_workflow_test_tools(), workflow]
    result = aggregate_workflow_annotations(workflow, tools)
    assert result.is_decisive is True
    assert result.read_only is True
    assert result.destructive is False
    assert result.idempotent is True


def test_aggregate_workflow_one_destructive_sub_makes_destructive() -> None:
    """Workflow with one read endpoint + one delete endpoint:
    - read_only AND across {True (fetch), False (delete)} = False
    - destructive OR across {False (fetch), True (delete)} = True
    - idempotent AND across {True (fetch), True (delete)} = True (note: delete IS idempotent)
    """
    workflow = Tool1(
        name="fetch_and_delete",
        type=Type.workflow,
        source_endpoints=["GET /v1/items/{id}", "DELETE /v1/items/{id}"],
    )
    tools = [*_build_workflow_test_tools(), workflow]
    result = aggregate_workflow_annotations(workflow, tools)
    assert result.is_decisive is True
    assert result.read_only is False
    assert result.destructive is True
    assert result.idempotent is True


def test_aggregate_workflow_orphan_endpoint_uses_conservative() -> None:
    """If a workflow endpoint isn't claimed by any other tool, fall back to
    D-29 conservative defaults: (read_only=False, destructive=True, idempotent=False)."""
    workflow = Tool1(
        name="solo_workflow",
        type=Type.workflow,
        source_endpoints=["POST /v1/unknown_endpoint"],
    )
    tools = [*_build_workflow_test_tools(), workflow]
    result = aggregate_workflow_annotations(workflow, tools)
    assert result.is_decisive is True
    assert result.read_only is False
    assert result.destructive is True
    assert result.idempotent is False


def test_aggregate_workflow_skips_self_in_endpoint_owner_index() -> None:
    """Workflow's own source_endpoints are not used to claim their own owners
    (avoid self-resolution)."""
    workflow = Tool1(
        name="self_referential",
        type=Type.workflow,
        source_endpoints=["GET /v1/items"],  # also held by `search`
    )
    tools = [*_build_workflow_test_tools(), workflow]
    result = aggregate_workflow_annotations(workflow, tools)
    # search is the owner (universal/search → read_only=True). Self-skip should
    # not change that — it just prevents the workflow from claiming its OWN
    # endpoints as owner. Verify by removing `search` and confirming we fall back
    # to conservative.
    assert result.is_decisive is True
    assert result.read_only is True
    assert result.destructive is False
    assert result.idempotent is True

    # Now remove `search` so endpoint is orphan: must fall back to conservative.
    tools_without_search = [t for t in tools if t.name != "search"]
    result_without = aggregate_workflow_annotations(workflow, tools_without_search)
    assert result_without.read_only is False
    assert result_without.destructive is True
    assert result_without.idempotent is False


def test_aggregate_workflow_empty_returns_conservative() -> None:
    """Workflow with empty source_endpoints → conservative D-29 default."""
    workflow = Tool1(name="empty_wf", type=Type.workflow, source_endpoints=[])
    tools = [*_build_workflow_test_tools(), workflow]
    result = aggregate_workflow_annotations(workflow, tools)
    assert result.is_decisive is True
    assert result.read_only is False
    assert result.destructive is True
    assert result.idempotent is False


def test_aggregate_workflow_action_sub_uses_conservative() -> None:
    """When a workflow endpoint is owned by an action tool (not in rules table
    and verbs.py not consulted here to avoid circular imports), aggregator falls
    back to conservative defaults per the doc-comment."""
    action_tool = Tool1(
        name="charges_capture",
        type=Type.action,
        source_endpoints=["POST /v1/charges/{id}/capture"],
    )
    workflow = Tool1(
        name="capture_then_notify",
        type=Type.workflow,
        source_endpoints=["POST /v1/charges/{id}/capture"],
    )
    result = aggregate_workflow_annotations(workflow, [action_tool, workflow])
    assert result.is_decisive is True
    assert result.read_only is False
    assert result.destructive is True
    assert result.idempotent is False


def test_aggregate_workflow_non_workflow_input_returns_not_decisive() -> None:
    """Defensive: passing a non-workflow tool returns is_decisive=False."""
    tool = Tool1(name="search", type=Type.universal, source_endpoints=[])
    result = aggregate_workflow_annotations(tool, [tool])
    assert result.is_decisive is False


def test_aggregate_workflow_nested_workflow_uses_conservative() -> None:
    """Nested workflow (workflow refers to endpoint owned by another workflow):
    avoid recursive aggregation by treating nested workflow as conservative."""
    inner_workflow = Tool1(
        name="inner_wf",
        type=Type.workflow,
        source_endpoints=["POST /v1/x"],
    )
    outer_workflow = Tool1(
        name="outer_wf",
        type=Type.workflow,
        source_endpoints=["POST /v1/x"],
    )
    result = aggregate_workflow_annotations(outer_workflow, [inner_workflow, outer_workflow])
    assert result.is_decisive is True
    assert result.read_only is False
    assert result.destructive is True
    assert result.idempotent is False
