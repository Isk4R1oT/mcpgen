"""Pass 5 — truncation templates table tests.

Verifies CONTEXT D-07 frozen table + Pitfall #5 anti-loop invariants:

- Every template includes "usually sufficient" OR "only paginate if the
  user explicitly requested all".
- The ``search`` template NEVER mentions ``next_cursor`` / ``offset`` /
  ``cursor`` / ``paginate`` (case-insensitive) per Pitfall #5 prevention.

These are pure module-level table assertions — no LLM, no I/O.

References:
- 04-CONTEXT.md D-07 (frozen 8-row truncation table)
- 04-CONTEXT.md D-50 (Pitfall #5 mitigation: anti-loop wording mandatory;
  search NEVER mentions next_cursor/offset)
- docs/mcpgen-pass-5-design.md §3 + Appendix A.
- Analog: apps/generation-engine/tests/passes/pass_4/test_verbs.py.
"""

from __future__ import annotations

import pytest

from mcpgen_engine.passes.pass_5.templates import (
    _TRUNCATION_TEMPLATES,
    TRUNCATION_TEMPLATES,
)

# ─────────────────────────────── Constants ──────────────────────────────────

_ANTI_LOOP_PHRASES: tuple[str, ...] = (
    "usually sufficient",
    "only paginate if the user explicitly requested all",
)
_SEARCH_FORBIDDEN_LOWER: tuple[str, ...] = (
    "next_cursor",
    "offset",
    "cursor",
    "paginate",
)
_EXPECTED_KEYS: frozenset[str] = frozenset(
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


# ─────────────────────────── Table-shape tests ──────────────────────────────


def test_all_eight_tool_types_present() -> None:
    """D-07 frozen table has exactly 8 keys (no more, no less)."""
    assert set(TRUNCATION_TEMPLATES.keys()) == _EXPECTED_KEYS
    assert len(TRUNCATION_TEMPLATES) == 8


def test_public_alias_matches_private_table() -> None:
    """Public ``TRUNCATION_TEMPLATES`` is the same MappingProxyType view."""
    assert TRUNCATION_TEMPLATES is _TRUNCATION_TEMPLATES


# ─────────────────────────── Threshold tests (D-07) ─────────────────────────


def test_search_threshold_is_10000() -> None:
    assert TRUNCATION_TEMPLATES["search"]["threshold_tokens"] == 10_000


def test_list_objects_threshold_is_15000() -> None:
    assert TRUNCATION_TEMPLATES["list_objects"]["threshold_tokens"] == 15_000


def test_list_collections_threshold_is_10000() -> None:
    assert TRUNCATION_TEMPLATES["list_collections"]["threshold_tokens"] == 10_000


def test_fetch_threshold_is_20000() -> None:
    assert TRUNCATION_TEMPLATES["fetch"]["threshold_tokens"] == 20_000


def test_upsert_threshold_is_5000() -> None:
    assert TRUNCATION_TEMPLATES["upsert"]["threshold_tokens"] == 5_000


def test_delete_threshold_is_5000() -> None:
    assert TRUNCATION_TEMPLATES["delete"]["threshold_tokens"] == 5_000


def test_action_threshold_is_5000() -> None:
    assert TRUNCATION_TEMPLATES["action"]["threshold_tokens"] == 5_000


def test_workflow_threshold_is_15000() -> None:
    assert TRUNCATION_TEMPLATES["workflow"]["threshold_tokens"] == 15_000


# ─────────────────────────── Anti-loop wording (Pitfall #5) ─────────────────


def test_every_template_contains_anti_loop_phrase() -> None:
    """Pitfall #5: every template MUST contain anti-loop wording."""
    for tool_type, row in TRUNCATION_TEMPLATES.items():
        template = row["template"]
        assert isinstance(template, str)
        assert any(phrase in template for phrase in _ANTI_LOOP_PHRASES), (
            f"Template for {tool_type!r} missing anti-loop wording: "
            f"must include one of {_ANTI_LOOP_PHRASES!r}"
        )


# ─────────────────────────── Search-no-pagination invariants ────────────────


def test_search_template_never_mentions_cursor() -> None:
    """Pitfall #5: search template MUST NOT mention ``cursor``."""
    template = TRUNCATION_TEMPLATES["search"]["template"]
    assert isinstance(template, str)
    assert "cursor" not in template.lower()


def test_search_template_never_mentions_offset() -> None:
    """Pitfall #5: search template MUST NOT mention ``offset``."""
    template = TRUNCATION_TEMPLATES["search"]["template"]
    assert isinstance(template, str)
    assert "offset" not in template.lower()


def test_search_template_never_mentions_next_cursor() -> None:
    """Pitfall #5: search template MUST NOT mention ``next_cursor``."""
    template = TRUNCATION_TEMPLATES["search"]["template"]
    assert isinstance(template, str)
    assert "next_cursor" not in template.lower()


def test_search_template_never_mentions_paginate() -> None:
    """Pitfall #5: search template MUST NOT mention ``paginate``."""
    template = TRUNCATION_TEMPLATES["search"]["template"]
    assert isinstance(template, str)
    assert "paginate" not in template.lower()


def test_search_template_lexical_exclusion_full_set() -> None:
    """Cross-check: full forbidden-set scan over the search template."""
    template = TRUNCATION_TEMPLATES["search"]["template"]
    assert isinstance(template, str)
    template_lower = template.lower()
    for forbidden in _SEARCH_FORBIDDEN_LOWER:
        assert (
            forbidden not in template_lower
        ), f"search template contains forbidden term {forbidden!r}: {template!r}"


# ─────────────────────────── Read-only table (T-04-04) ──────────────────────


def test_table_is_read_only_mappingproxytype() -> None:
    """T-04-04-table-mutation: the table is read-only at runtime."""
    with pytest.raises(TypeError):
        TRUNCATION_TEMPLATES["search"] = {}  # type: ignore[index]


def test_table_inner_rows_are_read_only() -> None:
    """Inner per-tool-type dicts are also read-only (defense-in-depth)."""
    with pytest.raises(TypeError):
        TRUNCATION_TEMPLATES["search"]["threshold_tokens"] = 99_999  # type: ignore[index]


# ─────────────────────────── Row-shape sanity ───────────────────────────────


def test_each_row_has_threshold_and_template_keys() -> None:
    for tool_type, row in TRUNCATION_TEMPLATES.items():
        assert "threshold_tokens" in row, f"{tool_type} missing threshold_tokens"
        assert "template" in row, f"{tool_type} missing template"
        assert isinstance(row["threshold_tokens"], int)
        assert isinstance(row["template"], str)
        assert row["threshold_tokens"] > 0


def test_list_objects_template_includes_explicit_pagination_warning() -> None:
    """list_objects is the ONE row that uses the longer anti-loop phrase."""
    template = TRUNCATION_TEMPLATES["list_objects"]["template"]
    assert isinstance(template, str)
    assert "only paginate if the user explicitly requested all" in template
