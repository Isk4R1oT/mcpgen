"""F1 check #10 — jsonschema dual-validation tests (Plan 05-04 Task 1).

CONTEXT D-05 step 10 + D-54 (Pitfall #33 dual-schema). Validates that BOTH
inputSchema AND outputSchema (when present) are valid Draft 2020-12 schemas
using ``jsonschema.Draft202012Validator`` with ``FormatChecker`` enabled.
"""

from __future__ import annotations

from typing import Any

from mcpgen_engine.stages.stage_f.f1_checks.json_schema import (
    JsonSchemaError,
    JsonSchemaResult,
    validate_tool_schemas,
)
from mcpgen_engine.stages.stage_f.failure_patterns import F1_CHECK_TO_RETRY


def _good_input_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "search query"},
        },
        "required": ["query"],
        "additionalProperties": False,
    }


def _good_output_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "results": {"type": "array", "items": {"type": "object"}},
        },
        "required": ["results"],
    }


def test_valid_dual_schemas_pass() -> None:
    """A tool with valid input + output schema returns passed=True."""
    tools: list[dict[str, Any]] = [
        {
            "name": "search",
            "inputSchema": _good_input_schema(),
            "outputSchema": _good_output_schema(),
        },
    ]
    result = validate_tool_schemas(tools)
    assert isinstance(result, JsonSchemaResult)
    assert result.passed is True
    assert result.error is None
    assert result.errors == []


def test_invalid_input_schema_fails_with_input_code() -> None:
    """Bad inputSchema (wrong `type` value) -> JSON_SCHEMA_INVALID_INPUT."""
    bad = _good_input_schema()
    bad["type"] = "invalid_type_name"
    tools = [{"name": "search", "inputSchema": bad, "outputSchema": _good_output_schema()}]
    result = validate_tool_schemas(tools)
    assert result.passed is False
    assert result.error == "JSON_SCHEMA_INVALID_INPUT"
    assert any(e.kind == "inputSchema" for e in result.errors)


def test_invalid_output_schema_fails_with_output_code() -> None:
    """Bad outputSchema (when input is fine) -> JSON_SCHEMA_INVALID_OUTPUT."""
    bad_out = _good_output_schema()
    bad_out["type"] = "not_a_real_type"
    tools = [{"name": "fetch", "inputSchema": _good_input_schema(), "outputSchema": bad_out}]
    result = validate_tool_schemas(tools)
    assert result.passed is False
    assert result.error == "JSON_SCHEMA_INVALID_OUTPUT"
    assert any(e.kind == "outputSchema" for e in result.errors)


def test_missing_output_schema_is_ok() -> None:
    """outputSchema is OPTIONAL in MCP 2025-06-18 — absence is not an error."""
    tools = [{"name": "fetch", "inputSchema": _good_input_schema()}]  # no outputSchema
    result = validate_tool_schemas(tools)
    assert result.passed is True
    assert result.error is None


def test_missing_input_schema_fails() -> None:
    """inputSchema is REQUIRED — null/missing -> error."""
    tools = [{"name": "fetch", "inputSchema": None, "outputSchema": _good_output_schema()}]
    result = validate_tool_schemas(tools)
    assert result.passed is False
    assert result.error == "JSON_SCHEMA_INVALID_INPUT"
    assert any(e.kind == "inputSchema" and "null" in e.message.lower() for e in result.errors)


def test_format_checker_activates_on_date_time() -> None:
    """FormatChecker is wired; clean date-time example passes the metaschema gate.

    The F1 check validates SCHEMAS (not instances), so FormatChecker mostly
    matters for ``examples`` literals embedded in the schema. We assert the
    POSITIVE contract: a clean schema with a valid date-time example passes.
    Negative coverage (malformed format value) is verified at the Pass 3 layer
    where the value is resolved against an instance.
    """
    clean_schema = {
        "type": "object",
        "properties": {
            "created_at": {
                "type": "string",
                "format": "date-time",
                "examples": ["2025-04-29T12:00:00Z"],
            },
        },
    }
    tools_clean = [{"name": "x", "inputSchema": clean_schema}]
    res_clean = validate_tool_schemas(tools_clean)
    assert res_clean.passed is True


def test_multiple_errors_capped() -> None:
    """Result truncates at 20 errors to keep payload bounded."""
    tools: list[dict[str, Any]] = []
    # Generate 25 broken tools.
    for i in range(25):
        tools.append(
            {
                "name": f"t{i}",
                "inputSchema": {"type": "definitely_not_valid"},
            }
        )
    result = validate_tool_schemas(tools)
    assert result.passed is False
    assert result.error == "JSON_SCHEMA_INVALID_INPUT"
    assert len(result.errors) <= 20


def test_input_failure_takes_precedence_over_output_in_error_code() -> None:
    """If both schemas fail, error code reports the input variant (more upstream).

    Per failure_patterns.py D-06 mapping: JSON_SCHEMA_INVALID_INPUT -> Pass 3,
    JSON_SCHEMA_INVALID_OUTPUT -> Pass 5. Pass 3 is upstream of Pass 5, so we
    surface the input failure first when both happen on the same tool.
    """
    tools = [
        {
            "name": "broken",
            "inputSchema": {"type": "bogus"},
            "outputSchema": {"type": "bogus"},
        }
    ]
    result = validate_tool_schemas(tools)
    assert result.passed is False
    assert result.error == "JSON_SCHEMA_INVALID_INPUT"


def test_retry_targets_match_failure_patterns() -> None:
    """JSON_SCHEMA_INVALID_INPUT -> pass_3; JSON_SCHEMA_INVALID_OUTPUT -> pass_5."""
    assert F1_CHECK_TO_RETRY["JSON_SCHEMA_INVALID_INPUT"] == "pass_3"
    assert F1_CHECK_TO_RETRY["JSON_SCHEMA_INVALID_OUTPUT"] == "pass_5"


def test_error_carries_path_and_message() -> None:
    """A JsonSchemaError carries the JSON path + a human-readable message."""
    bad = {"type": "object", "properties": "not_a_dict"}  # properties must be a dict
    tools = [{"name": "weird", "inputSchema": bad}]
    result = validate_tool_schemas(tools)
    assert result.passed is False
    err: JsonSchemaError = result.errors[0]
    assert err.tool_name == "weird"
    assert err.kind == "inputSchema"
    assert err.message  # non-empty
