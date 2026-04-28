"""L2 cache key `prompt_version` extension (D-35) + IR additive `description_hash` (D-40).

Pure-function tests — no fixtures, no LLM calls, no on-disk IO.

Guarantees:
- Default `prompt_version="1"` keeps Phase 2 Pass 0/1 callers backward-compatible.
- Bumping `prompt_version` invalidates the L2 cache cleanly (Pitfall #7 mitigation).
- L1 / L3 keys remain pure-function deterministic (regression guard).
- `Descriptions.description_hash` is strictly-additive Optional[str] (D-40):
  default None, accepts a string, round-trips via model_dump.
"""

from __future__ import annotations

from mcpgen_ir.types import Descriptions

from mcpgen_engine.cache.keys import l1_key, l2_key, l3_key


def test_default_prompt_version_unchanged_from_pass_0() -> None:
    """Default-value invariant — omitting prompt_version equals passing '1'.

    This is the backward-compat contract for Phase 2 Pass 0/1 callers that
    do not pass the new kwarg.
    """
    pass_input = {"a": 1, "b": [2, 3]}
    a = l2_key(
        pass_name="pass_0",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="PASS_0_SETTINGS",
    )
    b = l2_key(
        pass_name="pass_0",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="PASS_0_SETTINGS",
        prompt_version="1",
    )
    assert a == b


def test_prompt_version_bump_changes_key() -> None:
    """Bumping prompt_version (D-35) invalidates L2 entries — Pitfall #7."""
    pass_input = {"a": 1}
    v1 = l2_key(
        pass_name="pass_2",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="PASS_2_SETTINGS",
        prompt_version="1",
    )
    v2 = l2_key(
        pass_name="pass_2",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="PASS_2_SETTINGS",
        prompt_version="2",
    )
    assert v1 != v2


def test_pass_name_change_changes_key() -> None:
    """Existing invariant preserved — pass_name participates in the key."""
    pass_input = {"a": 1}
    a = l2_key(
        pass_name="pass_2",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="PASS_2_SETTINGS",
    )
    b = l2_key(
        pass_name="pass_3",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="PASS_3_SETTINGS",
    )
    assert a != b


def test_l1_l3_unchanged() -> None:
    """L1 / L3 are pure-function — same input → same hash, valid 64-hex shape."""
    spec_hash = "a" * 64
    k1_a = l1_key(spec_hash)
    k1_b = l1_key(spec_hash)
    assert k1_a == k1_b
    assert len(k1_a) == 64
    assert all(c in "0123456789abcdef" for c in k1_a)

    subset = {"a": 1}
    k3_a = l3_key(tool_name="charges_create", tool_subset=subset, pass_version="1")
    k3_b = l3_key(tool_name="charges_create", tool_subset=subset, pass_version="1")
    assert k3_a == k3_b
    assert len(k3_a) == 64
    assert all(c in "0123456789abcdef" for c in k3_a)


def test_description_hash_optional_in_ir() -> None:
    """D-40 — Descriptions.description_hash defaults to None (additive)."""
    d = Descriptions(
        purpose="x" * 20,
        when_to_use=["use case"],
        limitations=[],
        parameter_overview="x" * 50,
    )
    assert d.description_hash is None


def test_description_hash_can_be_set_in_ir() -> None:
    """D-40 — Descriptions.description_hash accepts a string and round-trips."""
    d = Descriptions(
        purpose="x" * 20,
        when_to_use=["use case"],
        limitations=[],
        parameter_overview="x" * 50,
        description_hash="abc123",
    )
    assert d.description_hash == "abc123"
    dumped = d.model_dump()
    assert dumped["description_hash"] == "abc123"
