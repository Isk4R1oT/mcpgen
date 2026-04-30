"""F1 check #10 — dual-schema MCP validation (CONTEXT D-05 step 10, D-54, Pitfall #33).

Validates that BOTH ``inputSchema`` AND ``outputSchema`` (when present) for
every final tool are themselves valid Draft 2020-12 JSON Schemas. The MCP
2025-06-18 wire-protocol bundle (``packages/engine-fixtures/_canonical/mcp-schema.json``,
pinned in Plan 05-02) is loaded once for forward use by Plan 05-08's pipeline
glue, but the per-tool gate uses ``Draft202012Validator.META_SCHEMA`` because
the MCP bundle describes the WIRE shape (tool definition envelope), not the
inner inputSchema/outputSchema (those follow plain Draft 2020-12).

Failure mapping (CONTEXT D-06 / failure_patterns.py):

- ``JSON_SCHEMA_INVALID_INPUT`` -> Pass 3 (input-parameter spec)
- ``JSON_SCHEMA_INVALID_OUTPUT`` -> Pass 5 (response shaping)

When BOTH input and output are bad on the same tool, we surface the input
error (Pass 3 is upstream of Pass 5; fixing input often cascades to output).

Pitfall #33 mitigation: validating the OUTPUT schema (not just input) catches
Pass-5 schema bugs that would otherwise only surface at runtime when the
tenant Worker tries to validate a real upstream response.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

# How many error rows to keep in the result. Truncating keeps SSE payloads
# bounded; the operator gets the upstream pass to retry from D-06 mapping.
_MAX_ERRORS: int = 20


@dataclass(frozen=True)
class JsonSchemaError:
    """One validation error: which tool, which schema, where, and what."""

    tool_name: str
    kind: str  # "inputSchema" | "outputSchema"
    path: tuple[str | int, ...]
    message: str


@dataclass(frozen=True)
class JsonSchemaResult:
    """Aggregate outcome of validate_tool_schemas across all tools."""

    passed: bool
    error: str | None
    errors: list[JsonSchemaError] = field(default_factory=list)


@lru_cache(maxsize=1)
def _load_mcp_schema_bundle() -> dict[str, Any]:
    """Load the pinned MCP 2025-06-18 wire-protocol schema bundle.

    The bundle is shipped under ``packages/engine-fixtures/_canonical/mcp-schema.json``
    (Plan 05-02). It is NOT used to validate inputSchema/outputSchema directly
    (they're Draft 2020-12 sub-schemas, not full MCP envelopes); we cache it
    here so Plan 05-08's pipeline glue can reuse the load if it needs to do
    envelope-level checks downstream.

    Walks up from this file to find ``packages/engine-fixtures/_canonical/``
    so the function works whether the engine runs from the monorepo root or
    from inside ``apps/generation-engine/`` (test runs).
    """
    here = Path(__file__).resolve()
    current = here.parent
    while current != current.parent:
        candidate = current / "packages" / "engine-fixtures" / "_canonical" / "mcp-schema.json"
        if candidate.is_file():
            data: dict[str, Any] = json.loads(candidate.read_text(encoding="utf-8"))
            return data
        current = current.parent
    raise FileNotFoundError(
        "packages/engine-fixtures/_canonical/mcp-schema.json not found "
        "in any ancestor of " + str(here)
    )


def _validator() -> Draft202012Validator:
    """Build a Draft 2020-12 metaschema validator with FormatChecker active.

    ``FormatChecker()`` enables format-vocabulary checks (date-time, uri,
    email, ipv4, ipv6, uuid, ...) when those values appear inside ``examples``,
    ``default``, or ``const`` literals embedded in the schema. The metaschema
    itself ensures the schema is structurally well-formed.
    """
    return Draft202012Validator(
        schema=Draft202012Validator.META_SCHEMA,
        format_checker=FormatChecker(),
    )


def _path_tuple(absolute_path: Any) -> tuple[str | int, ...]:
    """Convert jsonschema's deque[Any] path into a hashable tuple."""
    return tuple(absolute_path)  # deque is iterable; entries are str|int


def validate_tool_schemas(final_tools: list[dict[str, Any]]) -> JsonSchemaResult:
    """Validate inputSchema + outputSchema for every tool (D-05 step 10).

    Pre-condition: ``_load_mcp_schema_bundle()`` succeeds (Plan 05-02 fixture
    present); we don't actually use the bundle for the gate today, but the
    eager load surfaces missing-fixture failures here rather than in Plan
    05-08's pipeline glue.
    """
    # Eager-load the bundle to fail fast if Plan 05-02's fixture is missing.
    _load_mcp_schema_bundle()

    validator = _validator()
    errors: list[JsonSchemaError] = []

    for tool in final_tools:
        name = str(tool.get("name", "<unnamed>"))
        for kind in ("inputSchema", "outputSchema"):
            schema = tool.get(kind)
            if schema is None:
                # outputSchema is OPTIONAL in MCP 2025-06-18; absence is OK.
                if kind == "outputSchema":
                    continue
                # inputSchema is REQUIRED; null/missing is an error.
                errors.append(
                    JsonSchemaError(
                        tool_name=name,
                        kind=kind,
                        path=(),
                        message="schema is null (inputSchema is required)",
                    )
                )
                continue

            # iter_errors enumerates all metaschema violations + format issues
            # without raising; we collect every row and bound at _MAX_ERRORS.
            for err in validator.iter_errors(schema):
                errors.append(
                    JsonSchemaError(
                        tool_name=name,
                        kind=kind,
                        path=_path_tuple(err.absolute_path),
                        message=err.message,
                    )
                )
                if len(errors) >= _MAX_ERRORS:
                    break
            if len(errors) >= _MAX_ERRORS:
                break
        if len(errors) >= _MAX_ERRORS:
            break

    if errors:
        # Input failures take precedence — Pass 3 is upstream of Pass 5; fixing
        # input cascades. (See module docstring for the rationale.)
        has_input = any(e.kind == "inputSchema" for e in errors)
        error_code = "JSON_SCHEMA_INVALID_INPUT" if has_input else "JSON_SCHEMA_INVALID_OUTPUT"
        return JsonSchemaResult(
            passed=False,
            error=error_code,
            errors=errors[:_MAX_ERRORS],
        )
    return JsonSchemaResult(passed=True, error=None, errors=[])
