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
