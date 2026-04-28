"""Pass 4 — tests for prompts.py (judge system prompt + user prompt builder).

Threats covered: T-03-OW (system prompt explicitly forbids openWorldHint),
D-29 conservative-default mention, D-25 untrusted-spec preamble (light),
prompt cost guardrails (description bounded to 500 chars).
"""

from __future__ import annotations

from mcpgen_engine.passes.pass_4.prompts import (
    PASS_4_JUDGE_SYSTEM_PROMPT,
    build_judge_prompt,
)


def test_system_prompt_present_and_non_empty() -> None:
    assert isinstance(PASS_4_JUDGE_SYSTEM_PROMPT, str)
    assert len(PASS_4_JUDGE_SYSTEM_PROMPT) > 100


def test_system_prompt_mentions_three_booleans_only() -> None:
    """D-27 mention: prompt explicitly tells the LLM NOT to include openWorldHint."""
    assert "readOnlyHint" in PASS_4_JUDGE_SYSTEM_PROMPT
    assert "destructiveHint" in PASS_4_JUDGE_SYSTEM_PROMPT
    assert "idempotentHint" in PASS_4_JUDGE_SYSTEM_PROMPT
    assert "Do NOT include openWorldHint" in PASS_4_JUDGE_SYSTEM_PROMPT


def test_system_prompt_mentions_conservative_default() -> None:
    """D-29 fallback guidance: 'conservative' must appear in the system prompt."""
    assert "conservative" in PASS_4_JUDGE_SYSTEM_PROMPT.lower()


def test_system_prompt_mentions_untrusted_spec_data() -> None:
    """D-25 light: prompt labels description excerpt as DATA, not instructions."""
    assert "UNTRUSTED" in PASS_4_JUDGE_SYSTEM_PROMPT


def test_build_judge_prompt_includes_tool_name() -> None:
    prompt = build_judge_prompt("messages_send", None)
    assert "messages_send" in prompt


def test_build_judge_prompt_includes_description_when_provided() -> None:
    prompt = build_judge_prompt("x_send", "Short purpose.")
    assert "Short purpose." in prompt
    assert "Description excerpt" in prompt


def test_build_judge_prompt_truncates_long_description_to_500() -> None:
    """Bounded preview prevents unbounded spec text in prompt (cost guardrail)."""
    long_desc = "A" * 1000
    prompt = build_judge_prompt("x", long_desc)
    # Total payload contains the truncated description but never the full 1000 chars.
    # Easier assertion: count of `A` runs is exactly 500 (truncation cap).
    assert prompt.count("A") == 500


def test_build_judge_prompt_no_description_omits_block() -> None:
    prompt = build_judge_prompt("x", None)
    assert "Description excerpt" not in prompt


def test_build_judge_prompt_empty_description_omits_block() -> None:
    """Empty string is falsy → block elided so we don't emit a stray header."""
    prompt = build_judge_prompt("x", "")
    assert "Description excerpt" not in prompt


def test_build_judge_prompt_mentions_three_target_booleans() -> None:
    """User prompt instructs the model to determine the 3 mutable booleans."""
    prompt = build_judge_prompt("x", None)
    assert "readOnlyHint" in prompt
    assert "destructiveHint" in prompt
    assert "idempotentHint" in prompt
