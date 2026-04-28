"""Pass 2 classify.py — deterministic tool-type → template/system-prompt dispatch.

Verifies the contract that downstream `authoring.py` (Plan 03-04) and
`length_budget.py` (Plan 03-03) consume:

- `select_template(tool_type) -> str` returns a literal label
  (`'universal'` / `'action'` / `'workflow'` / `'specialized'`).
- `select_system_prompt(tool: Tool1) -> str` returns the matching
  PASS_2_*_SYSTEM_PROMPT constant from prompts.py — single source of truth
  for prompt routing per D-06.

These are pure-function tests — no LLM, no I/O. The classify.py module is
Phase 1 of the Pass 2 pipeline (D-04).
"""

from __future__ import annotations

import pytest
from mcpgen_ir.types import Tool1, Type

from mcpgen_engine.passes.pass_2 import prompts
from mcpgen_engine.passes.pass_2.classify import (
    select_system_prompt,
    select_template,
)

# ─────────────────────────── select_template ────────────────────────────────


def test_select_template_universal_returns_string() -> None:
    assert select_template(Type.universal) == "universal"


def test_select_template_action_returns_string() -> None:
    assert select_template(Type.action) == "action"


def test_select_template_workflow_returns_string() -> None:
    assert select_template(Type.workflow) == "workflow"


def test_select_template_specialized_returns_string() -> None:
    assert select_template(Type.specialized) == "specialized"


# ────────────────────────── select_system_prompt ────────────────────────────


def _make_tool(name: str, type_: Type) -> Tool1:
    return Tool1(name=name, type=type_, source_endpoints=[])


def test_select_system_prompt_universal_returns_universal_prompt() -> None:
    tool = _make_tool("search", Type.universal)
    assert select_system_prompt(tool) is prompts.PASS_2_UNIVERSAL_SYSTEM_PROMPT


def test_select_system_prompt_action_returns_action_prompt() -> None:
    tool = _make_tool("charges_capture", Type.action)
    assert select_system_prompt(tool) is prompts.PASS_2_ACTION_SYSTEM_PROMPT


def test_select_system_prompt_workflow_returns_workflow_prompt() -> None:
    tool = _make_tool("schedule_event", Type.workflow)
    assert select_system_prompt(tool) is prompts.PASS_2_WORKFLOW_SYSTEM_PROMPT


def test_select_system_prompt_specialized_returns_specialized_prompt() -> None:
    tool = _make_tool("account_balance_summary", Type.specialized)
    assert select_system_prompt(tool) is prompts.PASS_2_SPECIALIZED_SYSTEM_PROMPT


def test_select_system_prompt_all_4_distinct() -> None:
    """The 4 returned prompts must be distinct objects (regression — we never
    accidentally collapse two tool types onto the same prompt constant).
    """
    tools = [
        _make_tool("u", Type.universal),
        _make_tool("a", Type.action),
        _make_tool("w", Type.workflow),
        _make_tool("s", Type.specialized),
    ]
    selected = {select_system_prompt(t) for t in tools}
    assert len(selected) == 4


# ─────────────────────────── Defensive failure modes ────────────────────────


def test_select_template_unknown_type_raises_valueerror() -> None:
    """Defensive guard — Type enum is closed but future enum extensions must
    not silently mis-route. Use a sentinel non-Type object.
    """
    with pytest.raises(ValueError, match="Unknown tool type"):
        # Defensive sentinel — exercises the dict.get None branch.
        select_template("not-a-type")


def test_select_system_prompt_unknown_type_raises_valueerror() -> None:
    """Same defensive guard for the per-Tool dispatcher; surfaces tool name
    in the error to aid debugging."""
    # Build a Tool1 then mutate its type attribute to an invalid value via
    # model_copy(update=...). Pydantic v2 frozen-config Tool1 (extra=forbid)
    # rejects construction with a non-Type, so we go through the bypass:
    valid_tool = Tool1(name="bogus_tool", type=Type.universal, source_endpoints=[])
    object.__setattr__(valid_tool, "type", "not-a-type")
    with pytest.raises(ValueError, match="Unknown tool type for tool"):
        select_system_prompt(valid_tool)


# ──────────────────── No LLM imports anywhere (regression) ──────────────────


def test_classify_module_does_not_import_llm() -> None:
    """classify.py is pure — must NOT import mcpgen_engine.llm.* per Plan 03-02 contract."""
    from mcpgen_engine.passes.pass_2 import classify

    src = classify.__file__
    assert src is not None
    with open(src, encoding="utf-8") as f:
        body = f.read()
    assert "from mcpgen_engine.llm" not in body
    assert "import mcpgen_engine.llm" not in body
