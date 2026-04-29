"""Pass 5 — truncation config builder + runtime substitution unit tests.

Verifies CONTEXT D-07 tool-type resolution + ``str.format()`` substitution
with explicit named placeholders. ``TruncationConfig1`` is an internal Pass 5
type with ``extra='forbid'``.

References:
- 04-CONTEXT.md D-07 (frozen 8-row table — Phase 4 deterministic).
- 04-CONTEXT.md D-50 (Pitfall #5: anti-loop wording invariants).
- docs/mcpgen-pass-5-design.md §3 + Appendix A.
- Analog: apps/generation-engine/tests/passes/pass_4/test_verbs.py.

Note: ``Tool1`` (frozen IR) has fields ``{name, type, source_endpoints}`` ONLY —
for ``Type.universal`` tools the ``name`` IS the universal-tool variant
(``"search"`` / ``"list_objects"`` / ...). Same convention as
``passes/pass_4/rules.py``.
"""

from __future__ import annotations

import pytest
from mcpgen_ir.types import (
    CoverageProofItem,
    Pass1Output,
    Routing1,
    SampleInvocation,
    SmartId,
    Tool1,
    Type,
)
from pydantic import ValidationError

from mcpgen_engine.passes.pass_5.truncation import (
    TOOL_TYPE_KEYS,
    TruncationConfig1,
    apply_truncation_template,
    build_all_truncation_configs,
    build_truncation_config,
    resolve_tool_type,
)

# ─────────────────────────────── Helpers ────────────────────────────────────


def _make_tool(name: str, tool_type: Type) -> Tool1:
    return Tool1(name=name, type=tool_type, source_endpoints=["GET /v1/items"])


def _make_pass_1_output(tools: list[Tool1]) -> Pass1Output:
    smart_id = SmartId(
        format="example:{type}:{collection}:{identifier}",
        types=["object"],
        collections=["Item"],
    )
    routing = Routing1(smart_id=smart_id, rules=[])
    coverage_proof = [
        CoverageProofItem(
            endpoint_id=t.source_endpoints[0],
            mapped_to_universal_tool=t.name,
            sample_invocation=SampleInvocation(
                url="https://example.com/api",  # type: ignore[arg-type]
                method="GET",
                params={},
            ),
        )
        for t in tools
    ]
    return Pass1Output(
        tools=tools,
        routing=routing,
        workflows=[],
        coverage_pct=100.0 if tools else 0.0,
        coverage_proof=coverage_proof,
    )


# ─────────────────── resolve_tool_type — universal variants ─────────────────


def test_resolve_tool_type_universal_search() -> None:
    tool = _make_tool("search", Type.universal)
    assert resolve_tool_type(tool) == "search"


def test_resolve_tool_type_universal_fetch() -> None:
    tool = _make_tool("fetch", Type.universal)
    assert resolve_tool_type(tool) == "fetch"


def test_resolve_tool_type_universal_list_objects() -> None:
    tool = _make_tool("list_objects", Type.universal)
    assert resolve_tool_type(tool) == "list_objects"


def test_resolve_tool_type_universal_list_collections() -> None:
    tool = _make_tool("list_collections", Type.universal)
    assert resolve_tool_type(tool) == "list_collections"


def test_resolve_tool_type_universal_upsert() -> None:
    tool = _make_tool("upsert", Type.universal)
    assert resolve_tool_type(tool) == "upsert"


def test_resolve_tool_type_universal_delete() -> None:
    tool = _make_tool("delete", Type.universal)
    assert resolve_tool_type(tool) == "delete"


# ─────────────────── resolve_tool_type — non-universal types ────────────────


def test_resolve_tool_type_action() -> None:
    tool = _make_tool("charges_capture", Type.action)
    assert resolve_tool_type(tool) == "action"


def test_resolve_tool_type_workflow() -> None:
    tool = _make_tool("schedule_event", Type.workflow)
    assert resolve_tool_type(tool) == "workflow"


def test_resolve_tool_type_specialized_to_fetch() -> None:
    """Specialized reads route to ``fetch`` analog (single-object semantics)."""
    tool = _make_tool("balance_get", Type.specialized)
    assert resolve_tool_type(tool) == "fetch"


def test_resolve_tool_type_universal_unknown_name_falls_back_to_fetch() -> None:
    """Defensive: a universal-typed tool with non-canonical name routes to
    fetch analog (single-object closest)."""
    tool = _make_tool("custom_universal", Type.universal)
    # Non-canonical universal name → defensive fallback.
    assert resolve_tool_type(tool) == "fetch"


# ─────────────────── build_truncation_config ───────────────────────────────


def test_build_truncation_config_uses_correct_threshold_search() -> None:
    tool = _make_tool("search", Type.universal)
    config = build_truncation_config(tool, pagination_strategy_value="cursor")
    assert config.tool_type == "search"
    assert config.threshold_tokens == 10_000


def test_build_truncation_config_uses_correct_threshold_action() -> None:
    tool = _make_tool("messages_send", Type.action)
    config = build_truncation_config(tool, pagination_strategy_value="none")
    assert config.tool_type == "action"
    assert config.threshold_tokens == 5_000


def test_build_truncation_config_uses_correct_threshold_workflow() -> None:
    tool = _make_tool("schedule_event", Type.workflow)
    config = build_truncation_config(tool, pagination_strategy_value="none")
    assert config.tool_type == "workflow"
    assert config.threshold_tokens == 15_000


# ─────────────────── apply_truncation_template ─────────────────────────────


def test_apply_truncation_template_basic_substitution_search() -> None:
    """``search`` template: ``Showing top {N} results. {Total_minus_N} more matches exist; ...``"""
    out = apply_truncation_template("search", n_shown=10, total=47)
    assert "Showing top 10" in out
    assert "37 more" in out
    assert "usually sufficient" in out


def test_apply_truncation_template_list_objects_with_cursor() -> None:
    """``list_objects`` template requires ``cursor_value`` + ``offset_value`` kwargs."""
    out = apply_truncation_template(
        "list_objects",
        n_shown=25,
        total=200,
        cursor_value="abc123",
        offset_value=25,
    )
    assert "Showing 25 of 200" in out
    assert "175 more" in out
    assert "usually sufficient" in out
    assert "abc123" in out
    assert "only paginate if the user explicitly requested all" in out


def test_apply_truncation_template_action_substitutes_action_name() -> None:
    out = apply_truncation_template("action", n_shown=4096, total=8192, action="charges_capture")
    assert "charges_capture" in out
    assert "4096" in out
    assert "usually sufficient" in out


def test_apply_truncation_template_workflow_substitutes_progress() -> None:
    out = apply_truncation_template(
        "workflow",
        n_shown=10,
        total=100,
        action="schedule_event",
        success_count=2,
        total_steps=3,
    )
    assert "schedule_event" in out
    assert "2/3" in out
    assert "usually sufficient" in out


def test_apply_truncation_template_keyerror_on_missing_placeholder() -> None:
    """str.format() raises KeyError when a required placeholder isn't supplied."""
    with pytest.raises(KeyError):
        # ``action`` template requires ``{action}`` kwarg.
        apply_truncation_template("action", n_shown=100, total=200)


def test_apply_truncation_template_keyerror_on_unknown_tool_type() -> None:
    with pytest.raises(KeyError):
        apply_truncation_template("nonexistent_type", n_shown=1, total=2)


def test_apply_truncation_template_total_minus_n_clamps_to_zero() -> None:
    """When ``n_shown > total`` (pathological), Total_minus_N clamps to 0."""
    out = apply_truncation_template("search", n_shown=100, total=10)
    assert "0 more" in out


# ─────────────────── build_all_truncation_configs ──────────────────────────


def test_build_all_truncation_configs_returns_one_per_tool() -> None:
    tools = [
        _make_tool("search", Type.universal),
        _make_tool("fetch", Type.universal),
        _make_tool("charges_capture", Type.action),
    ]
    pass_1_output = _make_pass_1_output(tools)
    result = build_all_truncation_configs(pass_1_output, pagination_strategy_value="cursor")
    assert set(result.keys()) == {"search", "fetch", "charges_capture"}
    assert result["search"].tool_type == "search"
    assert result["fetch"].tool_type == "fetch"
    assert result["charges_capture"].tool_type == "action"


def test_build_all_truncation_configs_empty_tools_returns_empty_dict() -> None:
    pass_1_output = _make_pass_1_output([])
    result = build_all_truncation_configs(pass_1_output, pagination_strategy_value="none")
    assert result == {}


# ─────────────────── TruncationConfig1 model invariants ────────────────────


def test_truncation_config_extra_forbid() -> None:
    """``TruncationConfig1`` rejects unknown fields (extra='forbid')."""
    with pytest.raises(ValidationError):
        TruncationConfig1(
            tool_type="search",
            threshold_tokens=10_000,
            template="t",
            unknown_field="x",  # type: ignore[call-arg]
        )


def test_tool_type_keys_is_exhaustive_set() -> None:
    """Cross-validation hook for plan 04-05: 8 canonical tool-type keys."""
    assert (
        frozenset(
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
        == TOOL_TYPE_KEYS
    )
