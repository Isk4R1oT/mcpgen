"""Pass 2/3/4 + INLINE_GATE sampling profile invariants (D-02 + Pitfall #2).

Pure-function tests — no fixtures, no LLM calls. Guard against:

- Drift in temperature / top_p / max_tokens away from D-02 values.
- Re-definition of `_PROVIDER_ROUTING` literal (Pitfall #2 regression — every
  ModelSettings MUST share the SAME dict object so a single audit line
  invalidates the whole pin).
- Re-introduction of `require_parameters` in provider routing (decision doc
  2026-04-28: removed because PydanticAI 0.2.20 sends `max_completion_tokens`
  which no qwen/qwen3-coder provider advertises in `supported_parameters`).
"""

from __future__ import annotations

from mcpgen_engine.llm import sampling


def test_pass_2_settings_values() -> None:
    s = sampling.PASS_2_SETTINGS
    assert s["temperature"] == 0.3
    assert s["top_p"] == 0.9
    assert s["max_tokens"] == 2048
    assert s["extra_body"] is sampling._PROVIDER_ROUTING


def test_pass_3_settings_values() -> None:
    s = sampling.PASS_3_SETTINGS
    assert s["temperature"] == 0.2
    assert s["top_p"] == 0.9
    assert s["max_tokens"] == 1024
    assert s["extra_body"] is sampling._PROVIDER_ROUTING


def test_pass_4_settings_values() -> None:
    s = sampling.PASS_4_SETTINGS
    assert s["temperature"] == 0.0
    assert s["top_p"] == 0.9
    assert s["max_tokens"] == 512
    assert s["extra_body"] is sampling._PROVIDER_ROUTING


def test_inline_gate_settings_values() -> None:
    s = sampling.INLINE_GATE_SETTINGS
    assert s["temperature"] == 0.0
    assert s["top_p"] == 0.9
    assert s["max_tokens"] == 512
    assert s["extra_body"] is sampling._PROVIDER_ROUTING


def test_provider_routing_is_singleton() -> None:
    """Pitfall #2 regression guard — single dict reference across all profiles.

    If any future edit constructs a second `_PROVIDER_ROUTING` literal, this
    test fails immediately. The single-source-of-truth audit line stays at
    1 (verified separately via `grep -c '_PROVIDER_ROUTING:' sampling.py`).
    """
    pass_0_extra = sampling.PASS_0_SETTINGS["extra_body"]
    pass_1_extra = sampling.PASS_1_SETTINGS["extra_body"]
    pass_2_extra = sampling.PASS_2_SETTINGS["extra_body"]
    pass_3_extra = sampling.PASS_3_SETTINGS["extra_body"]
    pass_4_extra = sampling.PASS_4_SETTINGS["extra_body"]
    inline_extra = sampling.INLINE_GATE_SETTINGS["extra_body"]
    assert pass_0_extra is pass_1_extra
    assert pass_1_extra is pass_2_extra
    assert pass_2_extra is pass_3_extra
    assert pass_3_extra is pass_4_extra
    assert pass_4_extra is inline_extra
    assert pass_0_extra is sampling._PROVIDER_ROUTING


def test_provider_routing_atlas_cloud_fp8() -> None:
    """Verbatim Phase 2 D-04/D-05 + decision-doc 2026-04-28 routing pin."""
    routing = sampling._PROVIDER_ROUTING["provider"]
    assert routing["order"] == ["atlas-cloud"]
    assert routing["allow_fallbacks"] is False
    assert routing["quantizations"] == ["fp8"]
    assert "require_parameters" not in routing


# ─── Phase 5 D-03: F2 + F3 sampling profiles + Sonnet test-agent module ────


def test_f2_judge_settings_t00_values() -> None:
    """F2 5-shuffle x 3-temp matrix slot 0/3 — temperature 0.0."""
    s = sampling.F2_JUDGE_SETTINGS_T00
    assert s["temperature"] == 0.0
    assert s["top_p"] == 0.9
    assert s["max_tokens"] == 2048
    assert s["extra_body"] is sampling._PROVIDER_ROUTING


def test_f2_judge_settings_t02_values() -> None:
    """F2 5-shuffle x 3-temp matrix slot 1/3 — temperature 0.2."""
    s = sampling.F2_JUDGE_SETTINGS_T02
    assert s["temperature"] == 0.2
    assert s["top_p"] == 0.9
    assert s["max_tokens"] == 2048
    assert s["extra_body"] is sampling._PROVIDER_ROUTING


def test_f2_judge_settings_t05_values() -> None:
    """F2 5-shuffle x 3-temp matrix slot 2/3 — temperature 0.5."""
    s = sampling.F2_JUDGE_SETTINGS_T05
    assert s["temperature"] == 0.5
    assert s["top_p"] == 0.9
    assert s["max_tokens"] == 2048
    assert s["extra_body"] is sampling._PROVIDER_ROUTING


def test_f3_judge_settings_values() -> None:
    """F3 LLM judge — single deterministic Qwen call per task per metric."""
    s = sampling.F3_JUDGE_SETTINGS
    assert s["temperature"] == 0.0
    assert s["top_p"] == 1.0
    assert s["max_tokens"] == 1024
    assert s["extra_body"] is sampling._PROVIDER_ROUTING


def test_f3_test_agent_settings_anthropic_side() -> None:
    """F3 test agent — Anthropic-side dict; NO extra_body (Anthropic API rejects it)."""
    s = sampling.F3_TEST_AGENT_SETTINGS
    assert isinstance(s, dict)
    assert s["temperature"] == 0.7
    assert s["top_p"] == 1.0
    assert s["max_tokens"] == 4096
    assert "extra_body" not in s


def test_sonnet_client_module_pins_correct_snapshot() -> None:
    """Module imports without ANTHROPIC_API_KEY; pin matches RESEARCH §6.1 correction."""
    import inspect

    from mcpgen_engine.llm import test_agent

    assert test_agent.SONNET_MODEL_ID == "claude-sonnet-4-5-20250929"
    assert test_agent.ANTHROPIC is not None

    # Module-level docstring must cite Override doc §7.3 + RESEARCH.md §6.1
    # so future-self / reviewers cannot regress to the CONTEXT D-02 typo
    # `claude-sonnet-4-6-20250929` (no such snapshot exists per Anthropic docs).
    src = inspect.getsource(test_agent)
    assert "§7.3" in src, "module docstring must cite Override doc §7.3"
    assert "§6.1" in src, "module docstring must cite RESEARCH.md §6.1"
    # Negative guard: the bad model id may appear in a docstring as a
    # cautionary note; what we forbid is the bad id being assigned to
    # SONNET_MODEL_ID (the only string that ends up in real Anthropic calls).
    assert (
        test_agent.SONNET_MODEL_ID != "claude-sonnet-4-6-20250929"
    ), "do not reintroduce CONTEXT D-02 typo — pin must remain claude-sonnet-4-5-20250929"


def test_pytest_markers_registered_no_warnings() -> None:
    """Registers `requires_anthropic` + `requires_wrangler` markers — no warnings."""
    import shutil
    import subprocess
    from pathlib import Path

    uv_bin = shutil.which("uv")
    assert uv_bin is not None, "uv binary not on PATH — install uv first"
    engine_root = Path(__file__).resolve().parent.parent

    proc = subprocess.run(  # noqa: S603
        [uv_bin, "run", "pytest", "--collect-only", "-m", "requires_anthropic", "tests/"],
        capture_output=True,
        text=True,
        check=False,
        cwd=str(engine_root),
    )
    combined = proc.stdout + proc.stderr
    assert (
        "PytestUnknownMarkWarning" not in combined
    ), f"unknown-mark warning present:\n{combined[-2000:]}"
