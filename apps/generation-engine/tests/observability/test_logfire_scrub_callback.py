"""Plan 09-05 Task 2 — unit tests for the scrubbing-callback chain.

Covers Tests 3-6 from the plan ``<behavior>`` block:

- Test 3: ``_preserve_langfuse_session_id`` returns ``match.value`` for
  ``langfuse.session.id``.
- Test 4: ``_preserve_langfuse_session_id`` returns ``None`` for unrelated
  paths (lets default scrubber proceed).
- Test 5: ``_scrub_long_spec_attributes`` redacts a 10001-char spec string.
- Test 6: ``_scrub_long_spec_attributes`` returns ``None`` for a 100-char
  spec value (small spec — let it through unchanged).

These are pure-function tests that construct a synthetic
:class:`logfire.ScrubMatch` payload — they do NOT involve the Logfire span
runtime. End-to-end coverage (callback registered via
``logfire.configure(scrubbing=...)``) lives in
``test_logfire_spec_scrub.py`` (Task 3).
"""

from __future__ import annotations

import re

import logfire
import pytest

from mcpgen_engine.observability.scrubbing import (
    _preserve_langfuse_session_id,
    _scrub_long_spec_attributes,
    combined_scrub_callback,
)


def _make_match(path: tuple[str, ...], value: object) -> logfire.ScrubMatch:
    """Build a synthetic ScrubMatch with a dummy regex match.

    ``pattern_match`` is a real :class:`re.Match` because ScrubMatch's
    dataclass declaration types it as ``re.Match[str]``; an actual match
    object satisfies typeguard's runtime check (the engine's pytest
    config has typeguard installed).
    """
    return logfire.ScrubMatch(
        path=path,
        value=value,
        pattern_match=re.match("session", "session"),  # type: ignore[arg-type]
    )


# ───────────────────────── _preserve_langfuse_session_id ────────────────────


def test_preserve_returns_value_for_langfuse_session_id() -> None:
    """Test 3: the langfuse.session.id whitelist preserves the original value."""
    match = _make_match(("attributes", "langfuse.session.id"), "gen_test_2026Q2")
    result = _preserve_langfuse_session_id(match)
    assert result == "gen_test_2026Q2"


def test_preserve_returns_value_for_langfuse_user_id() -> None:
    """The whitelist also covers langfuse.user.id (Langfuse session+user model)."""
    match = _make_match(("attributes", "langfuse.user.id"), "user_abc")
    result = _preserve_langfuse_session_id(match)
    assert result == "user_abc"


def test_preserve_returns_none_for_unrelated_session_attribute() -> None:
    """Test 4: a non-langfuse attribute named 'other_session_thing' is NOT preserved.

    Returning None tells Logfire's default scrubber to proceed — which it
    will, replacing the value with the scrub marker.
    """
    match = _make_match(("attributes", "other_session_thing"), "leak_me")
    result = _preserve_langfuse_session_id(match)
    assert result is None


def test_preserve_returns_none_for_random_path() -> None:
    """Sanity: a path that has nothing to do with sessions returns None."""
    match = _make_match(("attributes", "some_other_attr"), "x")
    assert _preserve_langfuse_session_id(match) is None


# ───────────────────────── _scrub_long_spec_attributes ──────────────────────


def test_scrub_long_spec_replaces_10001_char_spec_yaml() -> None:
    """Test 5: a 10001-char spec_yaml is replaced with the sha256 marker."""
    big_spec = "openapi: 3.0.0\n" + "x" * 10_000
    match = _make_match(("attributes", "spec_yaml"), big_spec)
    result = _scrub_long_spec_attributes(match)
    assert isinstance(result, str)
    assert result.startswith("<spec redacted, sha256:")
    assert result.endswith(">")
    # 16-char hex prefix
    marker_re = re.compile(r"^<spec redacted, sha256:[a-f0-9]{16}>$")
    assert marker_re.match(result), f"Marker shape mismatch: {result!r}"


def test_scrub_long_spec_returns_none_for_small_spec() -> None:
    """Test 6: a 100-char spec_yaml passes through (no redaction)."""
    small_spec = "openapi: 3.0.0\ninfo: ..."
    match = _make_match(("attributes", "spec_yaml"), small_spec)
    result = _scrub_long_spec_attributes(match)
    assert result is None


def test_scrub_long_spec_returns_none_for_non_spec_attribute() -> None:
    """A 10001-char string under a non-spec attribute key is NOT redacted by this callback.

    (The default Logfire scrubber may still redact it via pattern matching,
    but that's not this callback's responsibility.)
    """
    match = _make_match(("attributes", "some_random_attr"), "x" * 10_001)
    assert _scrub_long_spec_attributes(match) is None


def test_scrub_long_spec_returns_none_for_non_string_value() -> None:
    """Non-string values (e.g. int, list) under a spec key are not redacted.

    Spec content is always a str in our pipeline; a non-str under
    spec_yaml indicates a bug elsewhere, not a leak we should silently mask.
    """
    match = _make_match(("attributes", "spec_yaml"), 42)
    assert _scrub_long_spec_attributes(match) is None


def test_scrub_long_spec_handles_nested_path_via_last_segment() -> None:
    """Nested paths (raw_ir.openapi as 2-segment tuple) match on last segment."""
    big_openapi = "openapi: 3.0.0\n" + "x" * 10_000
    match = _make_match(("attributes", "raw_ir.openapi"), big_openapi)
    result = _scrub_long_spec_attributes(match)
    assert isinstance(result, str)
    assert result.startswith("<spec redacted, sha256:")


def test_scrub_long_spec_returns_none_for_empty_path() -> None:
    """Defensive: empty path → no segment to match → no-op."""
    match = _make_match((), "x" * 10_001)
    assert _scrub_long_spec_attributes(match) is None


# ───────────────────────────── combined_scrub_callback ──────────────────────


def test_combined_callback_chains_spec_first_then_session() -> None:
    """Combined chain: spec scrub fires first, session-id whitelist second.

    Tests both callbacks reachable through the chain.
    """
    # Case A: long spec → spec callback wins.
    long_match = _make_match(("attributes", "spec_yaml"), "x" * 10_001)
    result_a = combined_scrub_callback(long_match)
    assert isinstance(result_a, str)
    assert result_a.startswith("<spec redacted, sha256:")

    # Case B: langfuse.session.id → session callback wins.
    session_match = _make_match(("attributes", "langfuse.session.id"), "gen_x")
    result_b = combined_scrub_callback(session_match)
    assert result_b == "gen_x"

    # Case C: unrelated path → both return None → callback returns None.
    other_match = _make_match(("attributes", "random_thing"), "y")
    result_c = combined_scrub_callback(other_match)
    assert result_c is None


@pytest.mark.parametrize(
    "spec_key",
    [
        "spec_yaml",
        "spec_url_response_body",
        "raw_ir.openapi",
        "openapi",
        "prompt.system",
        "system_prompt",
    ],
)
def test_scrub_long_spec_covers_all_documented_keys(spec_key: str) -> None:
    """Every key listed in :data:`_SPEC_CONTENT_KEYS` must trigger scrubbing."""
    big_value = "x" * 10_001
    match = _make_match(("attributes", spec_key), big_value)
    result = _scrub_long_spec_attributes(match)
    assert result is not None
    assert isinstance(result, str)
    assert result.startswith("<spec redacted, sha256:")
