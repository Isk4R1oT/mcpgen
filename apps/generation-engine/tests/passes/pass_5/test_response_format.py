"""Pass 5 Phase 5a — D-10 ``response_format`` enum gate tests.

Verifies:
- ``should_add_response_format`` D-10 verbatim conditions:
  * True iff ``len(always_include) + len(opt_in) > 20`` AND
    ``tool.type == universal AND tool.name == 'fetch'`` OR
    ``tool.type ∈ {action, specialized}``.
  * False for ``list_objects`` (D-10 explicit exclusion — already exposes
    ``properties`` for opt-in field selection).
  * False for ``search`` (Pitfall #5 — search is one-shot; never gated).
  * False when ``len(always_include) + len(opt_in) <= 20``.
- ``RESPONSE_FORMAT_DESCRIPTION`` matches D-10 verbatim.
- ``inject_response_format_param`` adds the enum + default + description
  WITHOUT mutating the caller's input dict (pure function invariant).

References:
- 04-CONTEXT.md D-10 (verbatim).
- docs/mcpgen-pass-5-design.md §1.5.
"""

from __future__ import annotations

from typing import Any

from mcpgen_ir.types import Tool1, Type

from mcpgen_engine.passes.pass_5.field_ranking import FieldRanking
from mcpgen_engine.passes.pass_5.response_format import (
    RESPONSE_FORMAT_DESCRIPTION,
    inject_response_format_param,
    should_add_response_format,
)

# ─────────────────────────── Test fixtures ─────────────────────────────────


def _ranking_with_field_count(*, always_include: int, opt_in: int) -> FieldRanking:
    """Build a FieldRanking with the given total field count split."""
    return FieldRanking(
        always_include=[f"a_{i}" for i in range(always_include)],
        opt_in=[f"o_{i}" for i in range(opt_in)],
        always_exclude=[],
    )


def _tool(name: str, type_: Type) -> Tool1:
    return Tool1(name=name, type=type_, source_endpoints=["GET /v1/x"])


# ─────────────────────────── Gate condition tests ──────────────────────────


def test_gate_true_for_fetch_with_25_fields() -> None:
    """fetch + 25 fields (15+10) → gate True per D-10."""
    tool = _tool("fetch", Type.universal)
    ranking = _ranking_with_field_count(always_include=15, opt_in=10)
    assert should_add_response_format(tool, ranking) is True


def test_gate_false_for_list_objects() -> None:
    """list_objects with 25 fields → gate False (D-10 explicit exclusion)."""
    tool = _tool("list_objects", Type.universal)
    ranking = _ranking_with_field_count(always_include=15, opt_in=10)
    assert should_add_response_format(tool, ranking) is False


def test_gate_false_for_search() -> None:
    """search with 25 fields → gate False (Pitfall #5: one-shot)."""
    tool = _tool("search", Type.universal)
    ranking = _ranking_with_field_count(always_include=15, opt_in=10)
    assert should_add_response_format(tool, ranking) is False


def test_gate_false_for_under_20_fields() -> None:
    """fetch with <=20 fields → gate False per D-10."""
    tool = _tool("fetch", Type.universal)
    ranking = _ranking_with_field_count(always_include=10, opt_in=10)  # exactly 20
    assert should_add_response_format(tool, ranking) is False


def test_gate_true_for_action_with_25_fields() -> None:
    """Action tool with > 20 fields → gate True per D-10."""
    tool = _tool("charges_capture", Type.action)
    ranking = _ranking_with_field_count(always_include=20, opt_in=5)
    assert should_add_response_format(tool, ranking) is True


def test_gate_true_for_specialized_with_25_fields() -> None:
    """Specialized tool with > 20 fields → gate True per D-10."""
    tool = _tool("balance_summary", Type.specialized)
    ranking = _ranking_with_field_count(always_include=21, opt_in=5)
    assert should_add_response_format(tool, ranking) is True


def test_gate_false_for_workflow() -> None:
    """Workflow tool — D-10 does NOT include workflow → gate False."""
    tool = _tool("schedule_event", Type.workflow)
    ranking = _ranking_with_field_count(always_include=15, opt_in=10)
    assert should_add_response_format(tool, ranking) is False


# ───────────────────────── RESPONSE_FORMAT_DESCRIPTION verbatim ────────────


def test_response_format_description_verbatim() -> None:
    """Description string MUST match D-10 verbatim."""
    expected = (
        "Detail level. 'summary'=core fields only (~500 tokens); "
        "'detailed'=structured full data (~2000 tokens); "
        "'raw'=complete unprocessed response. "
        "Default 'summary' for context efficiency. "
        "Use 'detailed' for full inspection, 'raw' for debugging."
    )
    assert expected == RESPONSE_FORMAT_DESCRIPTION


# ───────────────────────── inject_response_format_param ────────────────────


def test_inject_response_format_param_adds_enum() -> None:
    """Injects {response_format: {type, enum, default, description}} entry."""
    input_schema: dict[str, Any] = {
        "type": "object",
        "properties": {"id": {"type": "string"}},
        "additionalProperties": False,
    }
    result = inject_response_format_param(input_schema)
    rf_prop = result["properties"]["response_format"]
    assert rf_prop["type"] == "string"
    assert rf_prop["enum"] == ["summary", "detailed", "raw"]
    assert rf_prop["default"] == "summary"
    assert rf_prop["description"] == RESPONSE_FORMAT_DESCRIPTION


def test_inject_response_format_param_pure_does_not_mutate() -> None:
    """Caller's input dict MUST NOT be mutated (pure function)."""
    input_schema: dict[str, Any] = {
        "type": "object",
        "properties": {"id": {"type": "string"}},
        "additionalProperties": False,
    }
    original_props_before = dict(input_schema["properties"])
    _ = inject_response_format_param(input_schema)
    # Caller's `properties` is unchanged (no `response_format` key added).
    assert input_schema["properties"] == original_props_before
    assert "response_format" not in input_schema["properties"]


def test_inject_response_format_param_preserves_existing_props() -> None:
    """Injection preserves all existing input_schema properties."""
    input_schema: dict[str, Any] = {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "limit": {"type": "integer", "default": 25},
        },
        "additionalProperties": False,
    }
    result = inject_response_format_param(input_schema)
    assert result["properties"]["id"] == {"type": "string"}
    assert result["properties"]["limit"] == {"type": "integer", "default": 25}
    assert "response_format" in result["properties"]
