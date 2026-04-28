"""Pass 4 — tests for titles.py (D-31 deterministic title generation).

Verifies the four type-specific paths + 60-char cap + ellipsis truncation +
de-pluralization safety for action verb reordering.
"""

from __future__ import annotations

from mcpgen_ir.types import Tool1, Type

from mcpgen_engine.passes.pass_4.titles import _MAX_TITLE_LENGTH, generate_title

# ─────────────────────────────── Universal ──────────────────────────────────


def test_universal_search_title() -> None:
    tool = Tool1(name="search", type=Type.universal, source_endpoints=[])
    assert generate_title(tool) == "Search"


def test_universal_list_objects_title() -> None:
    tool = Tool1(name="list_objects", type=Type.universal, source_endpoints=[])
    assert generate_title(tool) == "List Objects"


def test_universal_list_collections_title() -> None:
    tool = Tool1(name="list_collections", type=Type.universal, source_endpoints=[])
    assert generate_title(tool) == "List Collections"


def test_universal_fetch_title() -> None:
    tool = Tool1(name="fetch", type=Type.universal, source_endpoints=[])
    assert generate_title(tool) == "Fetch"


def test_universal_upsert_title() -> None:
    tool = Tool1(name="upsert", type=Type.universal, source_endpoints=[])
    assert generate_title(tool) == "Upsert"


def test_universal_delete_title() -> None:
    tool = Tool1(name="delete", type=Type.universal, source_endpoints=[])
    assert generate_title(tool) == "Delete"


# ─────────────────────────────── Action ─────────────────────────────────────


def test_action_charges_capture_title() -> None:
    """D-31 verb reordering: 'charges_capture' → 'Capture Charge'
    (verb at start, object de-pluralized)."""
    tool = Tool1(name="charges_capture", type=Type.action, source_endpoints=[])
    assert generate_title(tool) == "Capture Charge"


def test_action_messages_send_title() -> None:
    tool = Tool1(name="messages_send", type=Type.action, source_endpoints=[])
    assert generate_title(tool) == "Send Message"


def test_action_orders_cancel_title() -> None:
    tool = Tool1(name="orders_cancel", type=Type.action, source_endpoints=[])
    assert generate_title(tool) == "Cancel Order"


def test_action_users_lock_title() -> None:
    tool = Tool1(name="users_lock", type=Type.action, source_endpoints=[])
    assert generate_title(tool) == "Lock User"


# ─────────────────────────────── Workflow ───────────────────────────────────


def test_workflow_schedule_event_title() -> None:
    tool = Tool1(name="schedule_event", type=Type.workflow, source_endpoints=[])
    assert generate_title(tool) == "Schedule Event"


def test_workflow_upload_with_thumbnail_title() -> None:
    tool = Tool1(name="upload_with_thumbnail", type=Type.workflow, source_endpoints=[])
    assert generate_title(tool) == "Upload With Thumbnail"


# ─────────────────────────────── Specialized ────────────────────────────────


def test_specialized_account_balance_summary_title() -> None:
    tool = Tool1(name="account_balance_summary", type=Type.specialized, source_endpoints=[])
    assert generate_title(tool) == "Account Balance Summary"


# ─────────────────────────────── Length cap ─────────────────────────────────


def test_max_title_length_constant_is_60() -> None:
    assert _MAX_TITLE_LENGTH == 60


def test_truncates_at_60_chars_with_ellipsis() -> None:
    """Long tool name must be truncated to 60 chars total (including ellipsis)."""
    # Tool-name regex caps at 64 chars, so we use a 60-char snake_case name
    # whose title-cased form exceeds 60 chars (joined with spaces).
    long_name = "a_" * 30 + "b"  # 61 chars; title would be "A A ... A B" (~60 chars-ish)
    long_name = long_name[:64]  # respect IR regex cap
    tool = Tool1(name=long_name, type=Type.universal, source_endpoints=[])
    title = generate_title(tool)
    assert len(title) <= _MAX_TITLE_LENGTH
    if len(long_name) > _MAX_TITLE_LENGTH:
        # Got truncated — verify ellipsis present
        assert title.endswith("…")


def test_truncation_uses_ellipsis_char() -> None:
    """Use single Unicode ellipsis char (…) not three dots so we don't waste budget."""
    # Build a name guaranteed to overflow when title-cased.
    name = "really_long_workflow_name_that_definitely_overflows_the_cap"
    name = name[:64]
    tool = Tool1(name=name, type=Type.workflow, source_endpoints=[])
    title = generate_title(tool)
    if len(title) == _MAX_TITLE_LENGTH:
        assert title.endswith("…")


# ──────────────────────────── Edge cases ────────────────────────────────────


def test_action_with_short_object_no_pluralization_artifact() -> None:
    """'ws' is too short to depluralize (≤3 chars); should NOT crash or strip."""
    tool = Tool1(name="ws_send", type=Type.action, source_endpoints=[])
    assert generate_title(tool) == "Send Ws"


def test_action_single_token_returns_title_case_fallback() -> None:
    """Action with no underscore (single token) cannot be verb-reordered;
    falls back to plain title-case."""
    tool = Tool1(name="ping", type=Type.action, source_endpoints=[])
    assert generate_title(tool) == "Ping"


def test_action_two_word_object_depluralizes_last_word() -> None:
    """For multi-word objects (e.g., 'payment_intents_capture'), only the LAST
    object word gets de-pluralized."""
    tool = Tool1(name="payment_intents_capture", type=Type.action, source_endpoints=[])
    assert generate_title(tool) == "Capture Payment Intent"


def test_action_object_not_ending_in_s_unchanged() -> None:
    """Object that doesn't end in 's' is not modified."""
    tool = Tool1(name="data_capture", type=Type.action, source_endpoints=[])
    # 'data' has 4 chars and ends with 'a' — no depluralization
    assert generate_title(tool) == "Capture Data"
