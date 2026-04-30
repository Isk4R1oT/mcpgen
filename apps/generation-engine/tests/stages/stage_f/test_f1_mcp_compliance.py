"""F1 check #4 — MCP protocol compliance tests (Plan 05-03 Task 1).

Behavior block per plan:

- All 4 annotations explicit + ``openWorldHint=True`` for every tool -> ``passed=True``.
- One tool missing ``readOnlyHint`` -> ``passed=False, error="MCP_COMPLIANCE_FAIL_ANNOTATIONS"``.
- ``openWorldHint=False`` -> ``passed=False`` (invariant violated).
"""

from __future__ import annotations

from typing import Any

from mcpgen_engine.stages.stage_f.f1_checks.mcp_compliance import (
    REQUIRED_PROTOCOL_VERSION,
    check_mcp_compliance,
)


def _make_tool(name: str, **annotation_overrides: Any) -> dict[str, Any]:
    """Build a minimal final-tool dict with all 4 annotations explicit."""
    annotations: dict[str, Any] = {
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    }
    annotations.update(annotation_overrides)
    return {
        "name": name,
        "annotations": annotations,
        "inputSchema": {"type": "object", "properties": {}},
    }


def test_all_annotations_explicit_passes() -> None:
    tools = [_make_tool("search"), _make_tool("fetch")]
    result = check_mcp_compliance(final_tools=tools, mcp_protocol_version=REQUIRED_PROTOCOL_VERSION)
    assert result.passed is True
    assert result.error is None
    assert result.offending_tools == []


def test_missing_annotation_fails_with_pass4_signal() -> None:
    bad = _make_tool("search")
    del bad["annotations"]["readOnlyHint"]
    tools = [bad, _make_tool("fetch")]
    result = check_mcp_compliance(final_tools=tools, mcp_protocol_version=REQUIRED_PROTOCOL_VERSION)
    assert result.passed is False
    assert result.error == "MCP_COMPLIANCE_FAIL_ANNOTATIONS"
    # Offender details cite the specific tool + missing key for retry-prompt context.
    offenders = result.offending_tools
    assert len(offenders) >= 1
    assert offenders[0][0] == "search"
    assert "readOnlyHint" in offenders[0][1]


def test_open_world_hint_invariant_violation_fails() -> None:
    tools = [_make_tool("search", openWorldHint=False)]
    result = check_mcp_compliance(final_tools=tools, mcp_protocol_version=REQUIRED_PROTOCOL_VERSION)
    assert result.passed is False
    assert result.error == "MCP_COMPLIANCE_FAIL_ANNOTATIONS"
    assert any("openWorldHint" in detail for _name, detail in result.offending_tools)


def test_protocol_version_drift_fails_with_stage_e_signal() -> None:
    tools = [_make_tool("search")]
    result = check_mcp_compliance(final_tools=tools, mcp_protocol_version="2024-11-05")
    assert result.passed is False
    assert result.error == "MCP_COMPLIANCE_FAIL_PROTOCOL_VERSION"
    assert result.offending_tools[0][0] == "__manifest__"
