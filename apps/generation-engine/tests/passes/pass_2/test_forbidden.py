"""Pass 2 — forbidden-phrase regex catalogue tests.

Covers D-10 verbatim regex patterns across 4 categories
(marketing/filler/tautological/vague), case insensitivity, word-boundary
correctness, and the public `find_forbidden_phrases` helper contract
(sorted, unique, lowercased).

References:
- 03-CONTEXT.md D-10 (regex verbatim) + D-13 (retry policy)
- 03-RESEARCH.md §"Common Pitfalls" Pitfall #10
"""

from __future__ import annotations

from mcpgen_engine.passes.pass_2.forbidden import (
    FORBIDDEN_REGEXES,
    find_forbidden_phrases,
)

# ─────────────────────────── Catalogue shape ───────────────────────────────


def test_forbidden_regexes_dict_has_4_categories() -> None:
    assert set(FORBIDDEN_REGEXES) == {"marketing", "filler", "tautological", "vague"}


# ─────────────────────────────── Marketing ─────────────────────────────────


def test_marketing_catches_powerful() -> None:
    assert "powerful" in find_forbidden_phrases("This is a powerful tool.")


def test_marketing_catches_elegant() -> None:
    assert "elegant" in find_forbidden_phrases("An elegant abstraction.")


def test_marketing_catches_robust() -> None:
    assert "robust" in find_forbidden_phrases("Robust handling of errors.")


def test_marketing_catches_comprehensive() -> None:
    assert "comprehensive" in find_forbidden_phrases("Provides comprehensive coverage.")


def test_marketing_case_insensitive() -> None:
    # Returned values are lowercased per the helper contract.
    assert "powerful" in find_forbidden_phrases("POWERFUL TOOL")


# ──────────────────────────────── Filler ───────────────────────────────────


def test_filler_catches_you_can_use_this_to() -> None:
    assert "you can use this to" in find_forbidden_phrases("you can use this to fetch data")


def test_filler_catches_simply() -> None:
    assert "simply" in find_forbidden_phrases("Simply pass the id.")


def test_filler_catches_easily() -> None:
    assert "easily" in find_forbidden_phrases("Configure easily with a flag.")


# ────────────────────────────── Tautological ───────────────────────────────


def test_tautological_catches_this_list_tool_lists() -> None:
    matches = find_forbidden_phrases("This list tool lists the charges.")
    assert any(m.startswith("this list") for m in matches)


def test_tautological_catches_this_search_searches() -> None:
    matches = find_forbidden_phrases("This search tool searches results.")
    assert any("search" in m for m in matches)


# ──────────────────────────────── Vague ────────────────────────────────────


def test_vague_catches_various_options() -> None:
    assert "various options" in find_forbidden_phrases("Returns various options.")


def test_vague_catches_different_kinds() -> None:
    assert "different kinds" in find_forbidden_phrases("Supports different kinds of input.")


def test_vague_catches_multiple_items() -> None:
    assert "multiple items" in find_forbidden_phrases("Returns multiple items.")


# ────────────────────────────── Helper shape ───────────────────────────────


def test_no_false_positives_on_clean_text() -> None:
    assert find_forbidden_phrases("Search for charges by amount and currency.") == []


def test_returns_sorted_unique_list() -> None:
    # Three marketing matches, returned alphabetically with no duplicates.
    assert find_forbidden_phrases("Powerful and elegant and robust.") == [
        "elegant",
        "powerful",
        "robust",
    ]


def test_word_boundary_avoids_partial_matches() -> None:
    # `\b` boundary keeps the word inside `Despowerlessness` from matching
    # the marketing pattern.
    assert find_forbidden_phrases("Despowerlessness") == []
