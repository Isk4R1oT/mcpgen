"""Pass 4 — tests for verbs.py (D-29 + Appendix B verb pattern table + matcher).

Threats covered: T-03-VP (verb misclassification mitigated by conservative
defaults at the caller; high-confidence matches return explicit booleans).
"""

from __future__ import annotations

from mcpgen_engine.passes.pass_4.verbs import (
    ACTION_VERB_PATTERNS,
    VerbMatchResult,
    match_verb_pattern,
)

# ───────────────────── HIGH CONFIDENCE — destructive verbs ─────────────────


def test_match_refund_high_destructive_not_idempotent() -> None:
    result = match_verb_pattern("charges_refund")
    assert result.confidence == "high"
    assert result.read_only is False
    assert result.destructive is True
    assert result.idempotent is False


def test_match_reverse_high_destructive() -> None:
    result = match_verb_pattern("transactions_reverse")
    assert result.confidence == "high"
    assert result.destructive is True
    assert result.idempotent is False


def test_match_undo_high_destructive() -> None:
    result = match_verb_pattern("actions_undo")
    assert result.confidence == "high"
    assert result.destructive is True
    assert result.idempotent is False


def test_match_cancel_high_destructive_idempotent() -> None:
    result = match_verb_pattern("orders_cancel")
    assert result.confidence == "high"
    assert result.destructive is True
    assert result.idempotent is True


def test_match_void_high_destructive_idempotent() -> None:
    result = match_verb_pattern("payments_void")
    assert result.confidence == "high"
    assert result.destructive is True
    assert result.idempotent is True


def test_match_revoke_high_destructive_idempotent() -> None:
    result = match_verb_pattern("tokens_revoke")
    assert result.confidence == "high"
    assert result.destructive is True
    assert result.idempotent is True


def test_match_archive_high_destructive_idempotent() -> None:
    result = match_verb_pattern("messages_archive")
    assert result.confidence == "high"
    assert result.destructive is True
    assert result.idempotent is True


def test_match_soft_delete_high_destructive_idempotent() -> None:
    result = match_verb_pattern("users_soft_delete")
    assert result.confidence == "high"
    assert result.destructive is True
    assert result.idempotent is True


# ─────── HIGH CONFIDENCE — non-destructive state changes ──────────────────


def test_match_capture_high_not_destructive() -> None:
    result = match_verb_pattern("charges_capture")
    assert result.confidence == "high"
    assert result.read_only is False
    assert result.destructive is False
    assert result.idempotent is False


def test_match_charge_high_not_destructive() -> None:
    result = match_verb_pattern("customers_charge")
    assert result.confidence == "high"
    assert result.destructive is False


def test_match_pay_high_not_destructive() -> None:
    result = match_verb_pattern("invoices_pay")
    assert result.confidence == "high"
    assert result.destructive is False


def test_match_unlock_high_idempotent() -> None:
    result = match_verb_pattern("accounts_unlock")
    assert result.confidence == "high"
    assert result.destructive is False
    assert result.idempotent is True


def test_match_enable_high_idempotent() -> None:
    result = match_verb_pattern("features_enable")
    assert result.confidence == "high"
    assert result.destructive is False
    assert result.idempotent is True


def test_match_activate_high_idempotent() -> None:
    result = match_verb_pattern("subscriptions_activate")
    assert result.confidence == "high"
    assert result.destructive is False
    assert result.idempotent is True


def test_match_approve_high_idempotent() -> None:
    result = match_verb_pattern("requests_approve")
    assert result.confidence == "high"
    assert result.destructive is False
    assert result.idempotent is True


def test_match_confirm_high_idempotent() -> None:
    result = match_verb_pattern("orders_confirm")
    assert result.confidence == "high"
    assert result.destructive is False
    assert result.idempotent is True


# ───────── MEDIUM CONFIDENCE — needs LLM review (no booleans set) ──────────


def test_match_send_medium_confidence() -> None:
    result = match_verb_pattern("messages_send")
    assert result.confidence == "medium"
    assert result.read_only is None
    assert result.destructive is None
    assert result.idempotent is None


def test_match_dispatch_medium_confidence() -> None:
    result = match_verb_pattern("jobs_dispatch")
    assert result.confidence == "medium"


def test_match_notify_medium_confidence() -> None:
    result = match_verb_pattern("users_notify")
    assert result.confidence == "medium"


def test_match_lock_medium_confidence() -> None:
    result = match_verb_pattern("accounts_lock")
    assert result.confidence == "medium"


def test_match_freeze_medium_confidence() -> None:
    result = match_verb_pattern("funds_freeze")
    assert result.confidence == "medium"


def test_match_disable_medium_confidence() -> None:
    result = match_verb_pattern("features_disable")
    assert result.confidence == "medium"


def test_match_publish_medium_confidence() -> None:
    result = match_verb_pattern("posts_publish")
    assert result.confidence == "medium"


def test_match_finalize_medium_confidence() -> None:
    result = match_verb_pattern("reports_finalize")
    assert result.confidence == "medium"


def test_match_submit_medium_confidence() -> None:
    result = match_verb_pattern("forms_submit")
    assert result.confidence == "medium"


# ───────────────────────────── No-match cases ──────────────────────────────


def test_match_unknown_verb_returns_none_confidence() -> None:
    result = match_verb_pattern("charges_explode")
    assert result.confidence == "none"
    assert result.read_only is None
    assert result.destructive is None
    assert result.idempotent is None
    assert result.matched_pattern is None


def test_match_no_underscore_returns_none() -> None:
    """Patterns require ``_<verb>$`` boundary; bare names don't match."""
    result = match_verb_pattern("explode")
    assert result.confidence == "none"


def test_match_returns_first_pattern_when_multiple_could_match() -> None:
    """Deterministic order: the first compiled pattern that matches wins.
    `_undo` is in the (refund|reverse|undo) HIGH group → returns `high`,
    not the medium group (which doesn't contain `_undo` anyway). This test
    pins the deterministic-order invariant."""
    result = match_verb_pattern("foo_undo")
    assert result.confidence == "high"
    assert result.destructive is True
    assert result.idempotent is False


def test_action_verb_patterns_total_count() -> None:
    """6 high-confidence groups + 3 medium-confidence groups = 9 entries."""
    assert len(ACTION_VERB_PATTERNS) == 9


# ─────────────────── D-27 invariant — no openWorldHint on the result ───────


def test_verb_match_result_does_not_contain_open_world_hint() -> None:
    """D-27 invariant: VerbMatchResult NEVER carries openWorldHint.
    openWorldHint=True is added at IR construction in Plan 03-11."""
    result = VerbMatchResult(confidence="high", read_only=False, destructive=True, idempotent=False)
    dumped = result.model_dump()
    assert "openWorldHint" not in dumped
    assert "open_world_hint" not in dumped


def test_matched_pattern_is_set_for_high_match() -> None:
    """matched_pattern is populated on every high/medium hit so callers can
    log + audit which pattern fired (T-03-VP audit trail)."""
    result = match_verb_pattern("orders_cancel")
    assert result.matched_pattern is not None
    assert "cancel" in result.matched_pattern


def test_matched_pattern_is_set_for_medium_match() -> None:
    result = match_verb_pattern("messages_send")
    assert result.matched_pattern is not None
    assert "send" in result.matched_pattern
