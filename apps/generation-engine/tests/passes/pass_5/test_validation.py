"""Pass 5 Phase 5b — cross-tool consistency validators tests.

Verifies:
- ``Pass5Error`` mirrors ``Pass3Error`` shape (``ValueError`` subclass with
  ``violations: list[str]``).
- ``validate_pagination_consistency`` D-08:
  - Passes when every list_* tool's pagination style matches server-wide.
  - Raises ``Pass5Error`` when a list_* tool's pagination style differs.
- ``validate_truncation_placeholders``:
  - Passes when every truncation guidance template contains BOTH ``{N}`` and
    ``{Total}``.
  - Raises ``Pass5Error`` when a template is missing ``{N}``.
  - Raises ``Pass5Error`` when a template is missing ``{Total}``.
- ``validate_cursor_offset_param_names_uniform`` D-08:
  - Passes when every list_* tool uses the same cursor (resp. offset) param.
  - Raises ``Pass5Error`` when cursor or offset param names differ.

References:
- 04-CONTEXT.md D-08.
- Analog: ``apps/generation-engine/src/mcpgen_engine/passes/pass_3/validation.py``.
"""

from __future__ import annotations

from typing import Any

import pytest
from mcpgen_ir.types import Style, Type

from mcpgen_engine.passes.pass_5.pagination import PaginationStrategy
from mcpgen_engine.passes.pass_5.validation import (
    Pass5Error,
    validate_cursor_offset_param_names_uniform,
    validate_pagination_consistency,
    validate_truncation_placeholders,
)

# ─────────────────────────── Pass5Error tests ──────────────────────────────


def test_pass5error_violations_attribute() -> None:
    """Pass5Error preserves the violations list passed to __init__."""
    err = Pass5Error("PAGINATION_INCONSISTENT: bad", violations=["x", "y"])
    assert err.violations == ["x", "y"]
    assert "PAGINATION_INCONSISTENT" in str(err)


def test_pass5error_inherits_valueerror() -> None:
    """Pass5Error is a ValueError subclass (matches Pass3Error pattern)."""
    err = Pass5Error("PAGINATION_INCONSISTENT: bad")
    assert isinstance(err, ValueError)
    assert err.violations == []


# ─────────────────────────── pagination consistency ────────────────────────


def test_validate_pagination_consistency_passes_uniform(
    make_synthetic_final_tool: Any,
) -> None:
    """Every list_* tool with cursor pagination → no raise on cursor server."""
    tools = [
        make_synthetic_final_tool(
            name="list_objects",
            tool_type=Type.universal,
            pagination_style=Style.cursor,
        ),
        make_synthetic_final_tool(
            name="list_collections",
            tool_type=Type.universal,
            pagination_style=Style.cursor,
            source_endpoints=["GET /v1/collections"],
        ),
    ]
    server = PaginationStrategy(style="cursor")
    # Should not raise.
    validate_pagination_consistency(tools, server)


def test_validate_pagination_consistency_raises_on_mixed(
    make_synthetic_final_tool: Any,
) -> None:
    """list_objects with offset on cursor server → Pass5Error."""
    tools = [
        make_synthetic_final_tool(
            name="list_objects",
            tool_type=Type.universal,
            pagination_style=Style.cursor,
        ),
        make_synthetic_final_tool(
            name="list_collections",
            tool_type=Type.universal,
            pagination_style=Style.offset,
            source_endpoints=["GET /v1/collections"],
        ),
    ]
    server = PaginationStrategy(style="cursor")
    with pytest.raises(Pass5Error) as exc_info:
        validate_pagination_consistency(tools, server)
    assert "PAGINATION_INCONSISTENT" in str(exc_info.value)
    assert exc_info.value.violations  # non-empty


# ─────────────────────────── truncation placeholders ───────────────────────


def test_validate_truncation_placeholders_passes_with_N_and_Total(
    make_synthetic_final_tool: Any,
) -> None:
    """Templates containing both {N} and {Total} → no raise."""
    tools = [
        make_synthetic_final_tool(
            name="list_objects",
            truncation_template="Showing {N} of {Total} objects.",
        ),
        make_synthetic_final_tool(
            name="fetch",
            tool_type=Type.universal,
            pagination_style=None,
            truncation_template="Object has {Total} fields, showing {N} default.",
            source_endpoints=["GET /v1/things/{id}"],
        ),
    ]
    validate_truncation_placeholders(tools)


def test_validate_truncation_placeholders_raises_missing_N(
    make_synthetic_final_tool: Any,
) -> None:
    """Template without {N} → Pass5Error."""
    tools = [
        make_synthetic_final_tool(
            name="list_objects",
            truncation_template="Showing some of {Total} objects.",  # no {N}
        ),
    ]
    with pytest.raises(Pass5Error) as exc_info:
        validate_truncation_placeholders(tools)
    assert "TRUNCATION_PLACEHOLDERS_MISSING" in str(exc_info.value)


def test_validate_truncation_placeholders_raises_missing_Total(
    make_synthetic_final_tool: Any,
) -> None:
    """Template without {Total} → Pass5Error."""
    tools = [
        make_synthetic_final_tool(
            name="list_objects",
            truncation_template="Showing {N} objects.",  # no {Total}
        ),
    ]
    with pytest.raises(Pass5Error):
        validate_truncation_placeholders(tools)


# ─────────────────────────── cursor/offset uniformity ──────────────────────


def test_validate_cursor_offset_param_names_uniform_passes(
    make_synthetic_final_tool: Any,
) -> None:
    """No cursor/offset param names attached → trivially passes (IR Pagination2
    doesn't carry param-name fields, so this is the realistic case)."""
    tools = [
        make_synthetic_final_tool(
            name="list_objects",
            pagination_style=Style.cursor,
        ),
        make_synthetic_final_tool(
            name="list_collections",
            pagination_style=Style.cursor,
            source_endpoints=["GET /v1/collections"],
        ),
    ]
    # No cursor_param_name on Pagination2 → no drift detected → no raise.
    validate_cursor_offset_param_names_uniform(tools)


def test_validate_cursor_offset_param_names_uniform_raises_on_drift() -> None:
    """When tools carry distinct cursor param names → Pass5Error.

    Synthesizes minimal duck-typed objects exposing the attribute path the
    validator walks (``response_config.pagination.cursor_param_name``) so we
    can exercise the drift branch even though the frozen IR ``Pagination2``
    doesn't carry these fields. This mirrors how Stage E receives a richer
    runtime shape than the Pass5Output IR.
    """
    from types import SimpleNamespace

    def _make_tool(name: str, cursor_name: str) -> SimpleNamespace:
        return SimpleNamespace(
            name=name,
            type=SimpleNamespace(value="universal"),
            response_config=SimpleNamespace(
                pagination=SimpleNamespace(
                    cursor_param_name=cursor_name,
                    offset_param_name=None,
                ),
                truncation=SimpleNamespace(guidance_template="{N}/{Total}"),
            ),
        )

    tools = [
        _make_tool("list_objects", "cursor"),
        _make_tool("list_collections", "starting_after"),
    ]
    with pytest.raises(Pass5Error) as exc_info:
        validate_cursor_offset_param_names_uniform(tools)  # type: ignore[arg-type]
    assert "PAGINATION_PARAM_NAMES_INCONSISTENT" in str(exc_info.value)
