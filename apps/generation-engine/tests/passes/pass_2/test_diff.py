"""Pass 2 diff.py — description_hash + diff_summary tests (Pitfall #7 mitigation).

Verifies:
- ``description_hash`` returns a 64-char hex digest, deterministic.
- Hash changes on user-visible content change (purpose, when_to_use).
- Hash hashes the rendered markdown, not the JSON shape (D-14 / Open Q #1).
- ``diff_summary`` correctly bucketizes added / removed / changed / unchanged.
"""

from __future__ import annotations

import re

from mcpgen_ir.types import Description

from mcpgen_engine.passes.pass_2.diff import description_hash, diff_summary
from mcpgen_engine.passes.pass_2.validation import render_description_markdown


def _make_description(
    purpose: str = "Search for charges by amount, currency, or status across the account.",
    when_to_use: list[str] | None = None,
    when_not_to_use: list[str] | None = None,
    how_to_use: str | None = None,
    limitations: list[str] | None = None,
    parameter_overview: str = (
        "Accepts a free-form query string; returns ranked smart-id results."
    ),
) -> Description:
    return Description(
        purpose=purpose,
        when_to_use=when_to_use or ["finding charges by attribute"],
        when_not_to_use=when_not_to_use,
        how_to_use=how_to_use,
        limitations=limitations or ["best-effort match"],
        parameter_overview=parameter_overview,
    )


# ───────────────────────────── description_hash ────────────────────────────


def test_description_hash_returns_64_hex_chars() -> None:
    h = description_hash(_make_description())
    assert len(h) == 64
    assert re.fullmatch(r"[0-9a-f]{64}", h)


def test_description_hash_deterministic() -> None:
    d = _make_description()
    assert description_hash(d) == description_hash(d)


def test_description_hash_changes_on_purpose_change() -> None:
    a = _make_description(purpose="Original purpose for the charges search tool here.")
    b = _make_description(purpose="Different purpose for the charges search tool here.")
    assert description_hash(a) != description_hash(b)


def test_description_hash_changes_on_when_to_use_change() -> None:
    a = _make_description(when_to_use=["trigger A"])
    b = _make_description(when_to_use=["trigger B"])
    assert description_hash(a) != description_hash(b)


def test_description_hash_unchanged_on_optional_field_unchanged_value() -> None:
    a = _make_description(when_not_to_use=None, how_to_use=None)
    b = _make_description(when_not_to_use=None, how_to_use=None)
    assert description_hash(a) == description_hash(b)


def test_description_hash_uses_rendered_markdown() -> None:
    """D-14 / Open Q #1: hash uses the rendered markdown, not JSON serialization."""
    d = _make_description()
    expected = (
        __import__("hashlib").sha256(render_description_markdown(d).encode("utf-8")).hexdigest()
    )
    assert description_hash(d) == expected


# ───────────────────────────── diff_summary ────────────────────────────────


def test_diff_summary_all_unchanged() -> None:
    assert diff_summary({"a": "h1"}, {"a": "h1"}) == {
        "changed": 0,
        "unchanged": 1,
        "added": 0,
        "removed": 0,
    }


def test_diff_summary_all_changed() -> None:
    assert diff_summary({"a": "h1"}, {"a": "h2"}) == {
        "changed": 1,
        "unchanged": 0,
        "added": 0,
        "removed": 0,
    }


def test_diff_summary_added_and_removed() -> None:
    assert diff_summary({"a": "h1", "b": "h2"}, {"a": "h1", "c": "h3"}) == {
        "changed": 0,
        "unchanged": 1,
        "added": 1,
        "removed": 1,
    }


def test_diff_summary_empty_inputs() -> None:
    assert diff_summary({}, {}) == {
        "changed": 0,
        "unchanged": 0,
        "added": 0,
        "removed": 0,
    }


def test_diff_summary_mixed_buckets() -> None:
    """Combined: 1 changed + 1 unchanged + 1 added + 1 removed."""
    old = {"keep_same": "h1", "change_me": "h2", "remove_me": "h3"}
    new = {"keep_same": "h1", "change_me": "h2_new", "add_me": "h4"}
    assert diff_summary(old, new) == {
        "changed": 1,
        "unchanged": 1,
        "added": 1,
        "removed": 1,
    }
