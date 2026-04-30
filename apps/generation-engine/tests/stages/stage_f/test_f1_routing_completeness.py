"""F1 check #5 — routing-completeness tests (Plan 05-03 Task 2).

Behavior block per plan:

- All routing rules + workflow steps map to real RawIR endpoints -> ``passed=True``.
- One orphan rule -> ``passed=False, error="ROUTING_INCOMPLETE"``.
"""

from __future__ import annotations

from mcpgen_engine.stages.stage_f.f1_checks.routing_completeness import (
    check_routing_completeness,
)
from mcpgen_engine.stages.stage_f.failure_patterns import f1_check_to_retry


def _make_raw_ir(endpoints: list[tuple[str, str]]) -> dict[str, object]:
    return {"endpoints": [{"method": m, "path": p} for m, p in endpoints]}


def test_complete_routing_passes() -> None:
    raw_ir = _make_raw_ir(
        [("GET", "/v1/customers"), ("POST", "/v1/charges"), ("GET", "/v1/charges/{id}")]
    )
    pass_1_output = {
        "routing": {
            "smart_id": {"format": "{tenant}-stripe:{type}:{collection}:{id}"},
            "rules": [
                {
                    "universal_tool": "search",
                    "target_endpoint": "GET /v1/customers",
                    "params_mapping": {"query": "query"},
                },
                {
                    "universal_tool": "fetch",
                    "target_endpoint": "GET /v1/charges/{id}",
                    "params_mapping": {"id": "id"},
                },
            ],
        },
        "workflows": [],
    }
    result = check_routing_completeness(pass_1_output=pass_1_output, raw_ir=raw_ir)
    assert result.passed is True
    assert result.error is None
    assert result.missing == []


def test_orphan_routing_fails_with_pass_1_signal() -> None:
    raw_ir = _make_raw_ir([("GET", "/v1/customers")])
    pass_1_output = {
        "routing": {
            "smart_id": {"format": "x"},
            "rules": [
                {
                    "universal_tool": "search",
                    "target_endpoint": "GET /v1/customers",
                    "params_mapping": {},
                },
                {
                    "universal_tool": "fetch",
                    "target_endpoint": "GET /v1/orphans/{id}",  # not in RawIR
                    "params_mapping": {},
                },
            ],
        },
        "workflows": [],
    }
    result = check_routing_completeness(pass_1_output=pass_1_output, raw_ir=raw_ir)
    assert result.passed is False
    assert result.error == "ROUTING_INCOMPLETE"
    assert "GET /v1/orphans/{id}" in result.missing
    # Failure -> retry Pass 1 (CONTEXT D-06).
    assert f1_check_to_retry("ROUTING_INCOMPLETE") == "pass_1"


def test_orphan_workflow_step_also_flagged() -> None:
    raw_ir = _make_raw_ir([("GET", "/v1/customers"), ("POST", "/v1/charges")])
    pass_1_output = {
        "routing": {
            "smart_id": {"format": "x"},
            "rules": [],
        },
        "workflows": [
            {
                "name": "schedule_event",
                "steps": [
                    {"endpoint": "GET /v1/customers", "description": "find"},
                    {"endpoint": "POST /v1/missing", "description": "create"},
                ],
                "partial_failure_strategy": "rollback",
            }
        ],
    }
    result = check_routing_completeness(pass_1_output=pass_1_output, raw_ir=raw_ir)
    assert result.passed is False
    assert "POST /v1/missing" in result.missing
