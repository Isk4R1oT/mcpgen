"""F2 L2 cache key extension (Phase 5 D-32).

Plan 05-05 Task 3 -- verifies:

- ``l2_key(..., shuffle_temp_marker="5x3")`` differs from
  ``l2_key(..., shuffle_temp_marker="3x3")`` -- bumping the F2 iteration
  spec invalidates F2 cache entries cleanly.
- Pre-existing callers (Pass 0..5 + Stage E) NOT supplying
  ``shuffle_temp_marker`` produce IDENTICAL keys to those passing the
  default ``"none"`` -- the in-code default-vs-explicit invariant matches
  Phase 3 D-35 ``prompt_version`` precedent.
- F2 caller pattern produces a stable 64-hex sha256 digest.
- F1 + F3 do NOT use ``l2_key`` at all (D-32 -- documented in the module
  docstring; assertion via inspection of ``cache.keys`` source).

The Phase 2/3/4 ``test_cache_keys_prompt_version.py`` regression suite is
complementary -- this file adds Phase 5 specific coverage without modifying
the existing tests.
"""

from __future__ import annotations

import inspect
from typing import Any

from mcpgen_engine.cache import keys as cache_keys_module
from mcpgen_engine.cache.keys import l2_key


def _is_64_hex(value: str) -> bool:
    return len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def test_f2_distinct_markers_produce_distinct_keys() -> None:
    """Bumping the 5x3 spec to 3x3 invalidates F2 L2 entries (D-32 contract)."""
    pass_input: dict[str, Any] = {"pass_2": "abc", "pass_3": "def"}
    a = l2_key(
        pass_name="stage_f2",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="F2_JUDGE",
        shuffle_temp_marker="5x3",
    )
    b = l2_key(
        pass_name="stage_f2",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="F2_JUDGE",
        shuffle_temp_marker="3x3",
    )
    assert a != b
    assert _is_64_hex(a)
    assert _is_64_hex(b)


def test_default_shuffle_temp_marker_unchanged_from_explicit_none() -> None:
    """Pre-existing callers omitting the kwarg produce the SAME key as those
    passing the default ``"none"`` -- backward-compat invariant."""
    pass_input: dict[str, Any] = {"a": 1, "b": [2, 3]}
    omitted = l2_key(
        pass_name="pass_0",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="PASS_0_SETTINGS",
    )
    explicit_default = l2_key(
        pass_name="pass_0",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="PASS_0_SETTINGS",
        shuffle_temp_marker="none",
    )
    assert omitted == explicit_default


def test_pass_0_default_differs_from_f2_caller() -> None:
    """Pass 0 default ``"none"`` differs from F2 ``"5x3"`` -- demonstrates the
    invalidation lever crosses pass-name boundaries cleanly."""
    pass_input: dict[str, Any] = {"x": 1}
    pass_0 = l2_key(
        pass_name="pass_0",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="PASS_0_SETTINGS",
    )
    f2 = l2_key(
        pass_name="stage_f2",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="F2_JUDGE",
        shuffle_temp_marker="5x3",
    )
    assert pass_0 != f2


def test_f2_caller_pattern_deterministic() -> None:
    """The full F2 caller pattern produces a deterministic 64-hex digest."""
    pass_input: dict[str, Any] = {"sha": "abc123"}
    a = l2_key(
        pass_name="stage_f2",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="F2_JUDGE",
        prompt_version="1",
        template_version="1",
        shuffle_temp_marker="5x3",
    )
    b = l2_key(
        pass_name="stage_f2",
        pass_version="1",
        pass_input=pass_input,
        sampling_profile_label="F2_JUDGE",
        prompt_version="1",
        template_version="1",
        shuffle_temp_marker="5x3",
    )
    assert a == b
    assert _is_64_hex(a)


def test_module_documents_f1_f3_no_l2_policy() -> None:
    """The cache.keys module docstring states F1+F3 have no L2 entry (D-32)."""
    src = inspect.getsource(cache_keys_module)
    assert "F1" in src
    assert "NO L2" in src
    assert "F3" in src
    assert "stochastic" in src.lower()


def test_module_documents_f2_shuffle_temp_marker() -> None:
    """The cache.keys module docstring documents the F2 marker (D-32)."""
    src = inspect.getsource(cache_keys_module)
    assert "shuffle_temp_marker" in src
    # The 5x3 example is the canonical Phase 5 spec
    assert "5x3" in src
