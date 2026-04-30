"""Phase 5 D-29 — strictly-additive IR fields (TDD RED phase).

Verifies that:

1. `GoldenTask` + `RetryRound` Pydantic types are importable from
   `mcpgen_ir.types` (codegen output of the new Zod source exports).
2. New `QualityReport` fields default to safe values per CONTEXT D-29
   (so pre-Phase-5 fixtures continue to validate).
3. `RetryRound` validates a realistic Stage F retry trace.
4. `QualityReport` round-trips through `model_dump` + `model_validate`
   without losing the additive fields (proves the JSON-schema → Pydantic
   pipeline preserves shape end-to-end).

Pre-Phase-5 fixtures elsewhere (passes/test_pipeline.py etc.) construct
`QualityReport` only with the original Phase-1 required fields — those
tests MUST keep passing after this commit (additive-only contract).
"""

from __future__ import annotations

from mcpgen_ir.types import (
    F1Static,
    F2Smell,
    GoldenTask,
    QualityBadge,
    QualityReport,
    RetryRound,
)


def _make_minimal_quality_report() -> QualityReport:
    """Build a QualityReport using only Phase-1 required fields.

    Mirrors the shape pre-Phase-5 fixtures use; if Phase 5 broke
    backwards-compat by making any new field required, this helper would
    raise ValidationError at runtime.
    """
    return QualityReport(
        spec_hash="a" * 64,
        f1_static=F1Static(
            passed=True,
            ts_compile_errors=[],
            json_schema_errors=[],
            mcp_compliance_errors=[],
            secret_scan_findings=[],
            bundle_bytes=1024,
        ),
        f2_smell=F2Smell(
            tool_scores=[],
            overall_average=4.5,
            passed=True,
        ),
        f3_agent_eval=None,
        overall_score=4.2,
        quality_badge=QualityBadge.verified,
    )


def test_golden_task_imports_with_defaults() -> None:
    """Test 1: GoldenTask defaults match D-29 (max_iterations=10, nullable seq/errors)."""
    task = GoldenTask(task_id="t1", prompt="p", expected_outcome="o")
    assert task.task_id == "t1"
    assert task.prompt == "p"
    assert task.expected_outcome == "o"
    assert task.expected_sequence is None
    assert task.expected_errors is None
    assert task.max_iterations == 10


def _enum_value(x: object) -> str:
    """Datamodel-codegen sometimes emits the JSON-Schema `default` as a raw
    string rather than an Enum instance. Both shapes round-trip through
    `model_dump` → `model_validate` cleanly. Tests accept either."""
    return x.value if hasattr(x, "value") else str(x)


def test_retry_round_validates_realistic_trace() -> None:
    """Test 2: RetryRound captures a Stage F retry round."""
    rr = RetryRound(
        round_number=1,
        triggered_by="F2.purpose<3",
        retry_target="pass_2",
        outcome="retried",
        cost_usd=0.05,
        duration_s=12.3,
    )
    assert rr.round_number == 1
    assert rr.triggered_by == "F2.purpose<3"
    assert rr.retry_target == "pass_2"
    assert _enum_value(rr.outcome) == "retried"
    assert rr.cost_usd == 0.05
    assert rr.duration_s == 12.3


def test_quality_report_additive_defaults() -> None:
    """Test 3: pre-Phase-5 fixture validates with all D-29 fields default-provided."""
    qr = _make_minimal_quality_report()
    assert qr.retry_history == []
    assert qr.f3_test_agent_id is None
    assert qr.f2_low_confidence_run is False
    assert _enum_value(qr.golden_task_set_origin) == "hand_authored"
    assert _enum_value(qr.sandbox_environment) == "real"
    assert qr.warnings == []
    assert qr.generation_time_seconds is None
    assert qr.total_cost_usd is None


def test_quality_report_round_trip_preserves_shape() -> None:
    """Test 4: model_dump → model_validate preserves additive fields."""
    qr = _make_minimal_quality_report()
    dumped = qr.model_dump()
    rebuilt = QualityReport.model_validate(dumped)
    assert rebuilt.retry_history == []
    assert rebuilt.f3_test_agent_id is None
    assert rebuilt.f2_low_confidence_run is False
    assert _enum_value(rebuilt.golden_task_set_origin) == "hand_authored"
    assert _enum_value(rebuilt.sandbox_environment) == "real"
    assert rebuilt.warnings == []
    assert rebuilt.generation_time_seconds is None
    assert rebuilt.total_cost_usd is None
