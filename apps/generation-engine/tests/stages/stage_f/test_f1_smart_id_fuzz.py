"""F1 check #3 — smart-ID cross-tenant fuzz tests (Plan 05-03 Task 1).

Behavior block per plan:

- Tenant A's smart-ID under tenant A's expected prefix -> accepted.
- Tenant B's smart-ID under tenant A's expected prefix -> rejected.
- Malformed smart-ID (no colons) -> rejected.

Plus the wrapper-level ``smart_id_fuzz`` -> ``SmartIdFuzzResult`` orchestrator.
"""

from __future__ import annotations

from mcpgen_engine.stages.stage_f.f1_checks.smart_id_fuzz import (
    parse_smart_id,
    smart_id_fuzz,
)


def test_own_tenant_accepted() -> None:
    smart_id = "abc1-stripe:object:Charge:ch_test"
    result = parse_smart_id(smart_id, expected_prefix="abc1-stripe")
    assert result.accepted is True
    assert result.tenant == "abc1-stripe"


def test_cross_tenant_rejected() -> None:
    """Tenant B's ID under tenant A's expected prefix MUST reject (Pitfall #1)."""
    cross_id = "xyz2-stripe:object:Charge:ch_test"
    result = parse_smart_id(cross_id, expected_prefix="abc1-stripe")
    assert result.accepted is False
    # Diagnostic: parser still returns the observed tenant for debug surfacing.
    assert result.tenant == "xyz2-stripe"


def test_malformed_id_rejected() -> None:
    result = parse_smart_id("not_a_smart_id_at_all", expected_prefix="abc1-stripe")
    assert result.accepted is False
    assert result.tenant is None


def test_smart_id_fuzz_passes_when_parser_isolated() -> None:
    result = smart_id_fuzz(
        spec_slug="stripe",
        sample_collection="Charge",
        sample_id="ch_test",
    )
    assert result.passed is True
    assert result.error is None
    assert result.details == "OK"
