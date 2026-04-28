"""Pass 2 — length_budget unit tests.

Covers D-07 length budgets verbatim, tiktoken cl100k_base path, char-count
fallback path, and ValueError on unknown tool_type.

References:
- 03-CONTEXT.md D-07 (budgets) + D-13 (retry policy)
- 03-RESEARCH.md §"Code Examples" Example 2
"""

from __future__ import annotations

import pytest

from mcpgen_engine.passes.pass_2 import length_budget
from mcpgen_engine.passes.pass_2.length_budget import (
    LENGTH_BUDGETS,
    count_tokens,
    is_within_budget,
)

# ─────────────────────── LENGTH_BUDGETS constant (D-07) ────────────────────


def test_length_budgets_constant_has_4_keys() -> None:
    assert set(LENGTH_BUDGETS) == {"universal", "action", "workflow", "specialized"}


def test_length_budgets_universal_tuple() -> None:
    assert LENGTH_BUDGETS["universal"] == (200, 300, 400)


def test_length_budgets_action_tuple() -> None:
    assert LENGTH_BUDGETS["action"] == (100, 150, 200)


def test_length_budgets_workflow_tuple() -> None:
    assert LENGTH_BUDGETS["workflow"] == (150, 200, 300)


def test_length_budgets_specialized_tuple() -> None:
    assert LENGTH_BUDGETS["specialized"] == (80, 120, 150)


# ─────────────────────────── count_tokens behaviour ────────────────────────


def test_count_tokens_returns_positive_int() -> None:
    n = count_tokens("hello world")
    assert isinstance(n, int)
    assert n >= 1


def test_count_tokens_empty_string_returns_at_least_1() -> None:
    # max(1, ...) guard — an empty string still returns >= 1 (caller should not
    # divide by it).
    assert count_tokens("") >= 1


def test_count_tokens_long_text_proportional() -> None:
    short = count_tokens("word " * 10)
    long = count_tokens("word " * 1000)
    assert long > short


# ─────────────────────────── is_within_budget ──────────────────────────────


def test_is_within_budget_universal_in_range() -> None:
    # Universal budget = (200, 300, 400). Build a string that yields ~300 tokens
    # under both tiktoken (cl100k_base, ~4 chars/token) AND the char-count
    # fallback (`len(text) // 4`). 1200 chars -> 300 tokens via fallback;
    # tiktoken on the same string is also ~250-320 tokens, comfortably inside
    # the 200-400 window.
    text = "word " * 240  # 1200 chars
    ok, hint = is_within_budget(text, "universal")
    assert ok is True
    assert hint is None


def test_is_within_budget_universal_too_short_returns_hint() -> None:
    ok, hint = is_within_budget("", "universal")
    assert ok is False
    assert hint is not None
    assert "shorter than" in hint
    assert "200-token" in hint


def test_is_within_budget_universal_too_long_returns_hint() -> None:
    # ~600 tokens via char-count (2400 chars). tiktoken yields ~500-600 here
    # - both are above the 400-token max for universal.
    text = "word " * 480
    ok, hint = is_within_budget(text, "universal")
    assert ok is False
    assert hint is not None
    assert "longer than" in hint
    assert "400-token" in hint


def test_is_within_budget_action_too_long_returns_hint() -> None:
    # ~250 tokens via char-count fallback (1000 chars). action max = 200.
    text = "word " * 200
    ok, hint = is_within_budget(text, "action")
    assert ok is False
    assert hint is not None
    assert "longer than" in hint
    assert "200-token" in hint


def test_is_within_budget_unknown_tool_type_raises() -> None:
    with pytest.raises(ValueError, match="invalid"):
        is_within_budget("text", "invalid")


def test_count_tokens_when_tiktoken_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    """Char-count fallback path: monkeypatch out tiktoken and assert the
    `len(text) // 4` math (with the max(1, ...) guard for empty strings).
    """
    monkeypatch.setattr(length_budget, "_USE_TIKTOKEN", False)
    monkeypatch.setattr(length_budget, "_ENCODER", None)
    # "hello world" = 11 chars → 11 // 4 = 2.
    assert length_budget.count_tokens("hello world") == 2
    # Empty string is guarded.
    assert length_budget.count_tokens("") == 1


def test_count_tokens_fallback_proportional(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fallback math is monotonic in input length."""
    monkeypatch.setattr(length_budget, "_USE_TIKTOKEN", False)
    monkeypatch.setattr(length_budget, "_ENCODER", None)
    short = length_budget.count_tokens("a" * 40)
    long = length_budget.count_tokens("a" * 4000)
    assert long > short
