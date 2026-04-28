"""Pass 2 — deterministic classifier (tool-type → template selection).

Phase 1 of the Pass 2 pipeline (D-04 / D-26): zero LLM, zero I/O. Maps
`Tool1.type` (the Pass 1 IR enum) to the matching system prompt constant
from prompts.py. Single source of truth for prompt routing per D-06 — the
downstream `authoring.py` (Plan 03-04) and `length_budget.py` (Plan 03-03)
both consume this dispatcher rather than re-implementing the mapping.

Pure-function module. Defensive `ValueError` raises on unknown enum values
guard against future enum extensions silently mis-routing (the IR Type
enum is closed today; defensive coding remains free).

References:
- 03-CONTEXT.md D-04 (module layout) + D-06 (per-tool-type templates)
- docs/mcpgen-pass-2-design.md §3 (4 prompt templates per tool type)
- Analog: `apps/generation-engine/src/mcpgen_engine/passes/pass_1/classify.py`
  (Pass 1 deterministic classifier with constant-dict dispatch).
"""

from __future__ import annotations

from typing import Final

from mcpgen_ir.types import Tool1, Type

from mcpgen_engine.passes.pass_2.prompts import (
    PASS_2_ACTION_SYSTEM_PROMPT,
    PASS_2_SPECIALIZED_SYSTEM_PROMPT,
    PASS_2_UNIVERSAL_SYSTEM_PROMPT,
    PASS_2_WORKFLOW_SYSTEM_PROMPT,
)

# Literal labels — used by length_budget (Plan 03-03) and authoring
# (Plan 03-04) for per-tool-type behavior switching.
_TYPE_TO_LABEL: Final[dict[Type, str]] = {
    Type.universal: "universal",
    Type.action: "action",
    Type.workflow: "workflow",
    Type.specialized: "specialized",
}

# Single source of truth for prompt routing per D-06.
_TYPE_TO_PROMPT: Final[dict[Type, str]] = {
    Type.universal: PASS_2_UNIVERSAL_SYSTEM_PROMPT,
    Type.action: PASS_2_ACTION_SYSTEM_PROMPT,
    Type.workflow: PASS_2_WORKFLOW_SYSTEM_PROMPT,
    Type.specialized: PASS_2_SPECIALIZED_SYSTEM_PROMPT,
}


def select_template(tool_type: Type) -> str:
    """Return the literal template label for `tool_type`.

    Pure: no I/O, no LLM. Used by Plan 03-03's length-budget validator and
    Plan 03-04's authoring orchestrator to switch behavior per tool type
    without round-tripping through the prompt strings themselves.

    Raises:
        ValueError: if `tool_type` is not a known Type enum value.
    """
    label = _TYPE_TO_LABEL.get(tool_type)
    if label is None:
        raise ValueError(f"Unknown tool type: {tool_type!r}")
    return label


def select_system_prompt(tool: Tool1) -> str:
    """Return the matching PASS_2_*_SYSTEM_PROMPT constant for `tool.type`.

    Pure: no I/O, no LLM. Returned object is the module-level Final[str]
    constant — callers may rely on object identity (`is`-comparison) for
    routing tests.

    Raises:
        ValueError: if `tool.type` is not a known Type enum value. Surface
            the tool name in the error to aid debugging during Pass 1 IR
            validation drift.
    """
    prompt = _TYPE_TO_PROMPT.get(tool.type)
    if prompt is None:
        raise ValueError(f"Unknown tool type for tool {tool.name!r}: {tool.type!r}")
    return prompt
