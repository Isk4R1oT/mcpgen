"""F1 orchestrator tests (Plan 05-03 Task 3 + Plan 05-04 Task 3).

Plan 05-03 verifies the cheap-checks pipeline runs all 8 modules in the documented
order and short-circuits on BUNDLE_SIZE_HARD.

Plan 05-04 extends with the full ``run_f1`` orchestrator (cheap + 3 subprocess
checks), the BUNDLE_SIZE_HARD short-circuit through the full pipeline, and
verifies subprocess outcomes are appended via the f1_checks namespace.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from mcpgen_engine.stages.stage_f.f1_checks.json_schema import JsonSchemaResult
from mcpgen_engine.stages.stage_f.f1_checks.openai_compliance import _CANONICAL_DIR
from mcpgen_engine.stages.stage_f.f1_checks.secret_scan import SecretScanResult
from mcpgen_engine.stages.stage_f.f1_checks.ts_compile import TsCompileResult
from mcpgen_engine.stages.stage_f.f1_static import (
    F1CheckOutcome,
    F1RunResult,
    run_f1,
    run_f1_cheap_checks,
)


def _read_canonical(name: str) -> dict[str, Any]:
    return json.loads((_CANONICAL_DIR / f"{name}_signature.json").read_text("utf-8"))


def _make_clean_generated_dir(tmp_path: Path) -> Path:
    """Build a minimal generated dir that satisfies the auth-middleware check."""
    middleware_dir = tmp_path / "src" / "auth"
    middleware_dir.mkdir(parents=True, exist_ok=True)
    (middleware_dir / "middleware.ts").write_text(
        'import { ALLOWED_HOSTS } from "../config.js";\n'
        "void ALLOWED_HOSTS;\n"
        "export async function authMiddleware(_r: Request) {\n"
        "  return { ctx: { upstreamCredential: 'x' } };\n"
        "}\n",
        encoding="utf-8",
    )
    (tmp_path / "src" / "server.ts").write_text(
        'import { ALLOWED_HOSTS } from "./config.js";\n' "void ALLOWED_HOSTS;\n",
        encoding="utf-8",
    )
    return tmp_path


@pytest.fixture
def clean_generated_dir(tmp_path: Path) -> Path:
    return _make_clean_generated_dir(tmp_path)


def _clean_inputs(generated_dir: Path) -> dict[str, Any]:
    """Build a fully-passing input set (all 8 cheap checks should return passed)."""
    search = _read_canonical("search")
    fetch = _read_canonical("fetch")
    return {
        "generated_dir": generated_dir,
        "bundle_size_kb": 412,
        "final_tools": [
            {
                "name": "search",
                "inputSchema": search,
                "annotations": {
                    "readOnlyHint": True,
                    "destructiveHint": False,
                    "idempotentHint": True,
                    "openWorldHint": True,
                },
            },
            {
                "name": "fetch",
                "inputSchema": fetch,
                "annotations": {
                    "readOnlyHint": True,
                    "destructiveHint": False,
                    "idempotentHint": True,
                    "openWorldHint": True,
                },
            },
        ],
        "mcp_protocol_version": "2025-06-18",
        "pass_1_output": {
            "routing": {
                "smart_id": {"format": "{tenant}-stripe:{type}:{collection}:{id}"},
                "rules": [
                    {
                        "universal_tool": "search",
                        "target_endpoint": "GET /v1/customers",
                        "params_mapping": {"query": "query"},
                    }
                ],
            },
            "workflows": [],
        },
        "raw_ir": {"endpoints": [{"method": "GET", "path": "/v1/customers"}]},
        "pass_2_output": {"descriptions": {"search": {"examples": None}}},
        "spec_slug": "stripe",
        "sample_collection": "Charge",
        "sample_id": "ch_test",
    }


async def test_all_cheap_checks_pass_clean_input(clean_generated_dir: Path) -> None:
    inputs = _clean_inputs(clean_generated_dir)
    result = await run_f1_cheap_checks(**inputs)
    assert isinstance(result, F1RunResult)
    assert result.passed is True
    assert result.first_failure is None
    assert result.subprocess_checks_pending is True
    # All 8 cheap checks executed.
    names = [o.check_name for o in result.outcomes]
    assert names == [
        "bundle_size",
        "template_artifacts",
        "smart_id_fuzz",
        "mcp_compliance",
        "routing_completeness",
        "auth_middleware",
        "openai_compliance",
        "examples_provenance",
    ]
    for outcome in result.outcomes:
        assert isinstance(outcome, F1CheckOutcome)
        assert outcome.passed is True
        assert outcome.error is None
        assert outcome.retry_target is None


async def test_bundle_size_hard_short_circuits(clean_generated_dir: Path) -> None:
    """BUNDLE_SIZE_HARD aborts early; checks 2-8 do NOT run (CONTEXT D-05 step 1)."""
    inputs = _clean_inputs(clean_generated_dir)
    inputs["bundle_size_kb"] = 1500
    result = await run_f1_cheap_checks(**inputs)
    assert result.passed is False
    assert len(result.outcomes) == 1
    assert result.outcomes[0].check_name == "bundle_size"
    assert result.outcomes[0].error == "BUNDLE_SIZE_HARD"
    # Terminal — no retry target.
    assert result.outcomes[0].retry_target is None
    assert result.first_failure is not None
    assert result.first_failure.error == "BUNDLE_SIZE_HARD"


async def test_failure_records_retry_target(clean_generated_dir: Path) -> None:
    """A non-terminal failure populates retry_target via failure_patterns."""
    inputs = _clean_inputs(clean_generated_dir)
    # Missing readOnlyHint -> MCP_COMPLIANCE_FAIL_ANNOTATIONS -> pass_4.
    del inputs["final_tools"][0]["annotations"]["readOnlyHint"]
    result = await run_f1_cheap_checks(**inputs)
    assert result.passed is False
    mcp_outcome = next(o for o in result.outcomes if o.check_name == "mcp_compliance")
    assert mcp_outcome.error == "MCP_COMPLIANCE_FAIL_ANNOTATIONS"
    assert mcp_outcome.retry_target == "pass_4"
    # Non-terminal failures DON'T short-circuit — pipeline runs all 8 checks.
    assert len(result.outcomes) == 8


# ---------------------------------------------------------------------------
# Plan 05-04 Task 3 — full run_f1 orchestrator tests (cheap + subprocess).
# ---------------------------------------------------------------------------


async def test_run_f1_all_checks_pass_with_mocked_subprocesses(
    clean_generated_dir: Path,
) -> None:
    """run_f1 chains cheap (8) + subprocess (3) checks; all-pass surfaces 11 outcomes.

    Subprocess checks are mocked so the test runs without gitleaks / tsc on PATH.
    The wiring is what we verify: order, count, subprocess_checks_pending=False.
    """
    inputs = _clean_inputs(clean_generated_dir)

    with (
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.secret_scan.run_secret_scan",
            new=AsyncMock(
                return_value=SecretScanResult(passed=True, error=None, findings=[], details="OK")
            ),
        ),
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.json_schema.validate_tool_schemas",
            return_value=JsonSchemaResult(passed=True, error=None, errors=[]),
        ),
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.ts_compile.run_ts_compile",
            new=AsyncMock(return_value=TsCompileResult(passed=True, error=None, errors=[])),
        ),
    ):
        result = await run_f1(**inputs)

    assert isinstance(result, F1RunResult)
    assert result.passed is True
    assert result.first_failure is None
    assert result.subprocess_checks_pending is False
    names = [o.check_name for o in result.outcomes]
    assert names == [
        "bundle_size",
        "template_artifacts",
        "smart_id_fuzz",
        "mcp_compliance",
        "routing_completeness",
        "auth_middleware",
        "openai_compliance",
        "examples_provenance",
        "secret_scan",
        "json_schema",
        "ts_compile",
    ]
    for outcome in result.outcomes:
        assert outcome.passed is True
        assert outcome.error is None


async def test_run_f1_bundle_size_hard_skips_subprocess_checks(
    clean_generated_dir: Path,
) -> None:
    """BUNDLE_SIZE_HARD short-circuits the cheap tail + json_schema + ts_compile.

    WR-02: secret_scan is the ONE exception — it runs unconditionally because
    SECRETS_LEAKED is itself terminal per failure_patterns, and the operator
    must learn about leaked credentials in the same F1 cycle (not after they
    fix the bundle and re-run).
    """
    inputs = _clean_inputs(clean_generated_dir)
    inputs["bundle_size_kb"] = 1500

    secret_mock = AsyncMock(
        return_value=SecretScanResult(passed=True, error=None, findings=[], details="OK")
    )
    json_mock = AsyncMock()  # never awaited; assert_not_called below
    ts_mock = AsyncMock(return_value=TsCompileResult(passed=True, error=None, errors=[]))

    with (
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.secret_scan.run_secret_scan",
            new=secret_mock,
        ),
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.json_schema.validate_tool_schemas",
            new=json_mock,
        ),
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.ts_compile.run_ts_compile",
            new=ts_mock,
        ),
    ):
        result = await run_f1(**inputs)

    assert result.passed is False
    assert result.first_failure is not None
    assert result.first_failure.error == "BUNDLE_SIZE_HARD"
    assert result.subprocess_checks_pending is False
    # bundle_size cheap-check + secret_scan (WR-02 unconditional) — no other tail.
    assert [o.check_name for o in result.outcomes] == ["bundle_size", "secret_scan"]
    # secret_scan ran (WR-02); the other two subprocess checks are skipped.
    secret_mock.assert_called_once()
    json_mock.assert_not_called()
    ts_mock.assert_not_called()


async def test_run_f1_secret_scan_failure_is_terminal(
    clean_generated_dir: Path,
) -> None:
    """SECRETS_LEAKED is terminal: outcome.retry_target == None per D-06."""
    inputs = _clean_inputs(clean_generated_dir)

    with (
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.secret_scan.run_secret_scan",
            new=AsyncMock(
                return_value=SecretScanResult(
                    passed=False,
                    error="SECRETS_LEAKED",
                    findings=[{"RuleID": "stripe-access-token"}],
                    details="1 leak (redacted)",
                )
            ),
        ),
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.json_schema.validate_tool_schemas",
            return_value=JsonSchemaResult(passed=True, error=None, errors=[]),
        ),
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.ts_compile.run_ts_compile",
            new=AsyncMock(return_value=TsCompileResult(passed=True, error=None, errors=[])),
        ),
    ):
        result = await run_f1(**inputs)

    assert result.passed is False
    assert result.first_failure is not None
    assert result.first_failure.check_name == "secret_scan"
    assert result.first_failure.error == "SECRETS_LEAKED"
    # Terminal: retry_target must be None (no retry path per D-06).
    assert result.first_failure.retry_target is None


async def test_run_f1_ts_compile_failure_maps_to_stage_e(
    clean_generated_dir: Path,
) -> None:
    """TS_COMPILE_FAILED -> retry_target == 'stage_e' per D-06."""
    inputs = _clean_inputs(clean_generated_dir)

    with (
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.secret_scan.run_secret_scan",
            new=AsyncMock(
                return_value=SecretScanResult(passed=True, error=None, findings=[], details="OK")
            ),
        ),
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.json_schema.validate_tool_schemas",
            return_value=JsonSchemaResult(passed=True, error=None, errors=[]),
        ),
        patch(
            "mcpgen_engine.stages.stage_f.f1_static.ts_compile.run_ts_compile",
            new=AsyncMock(
                return_value=TsCompileResult(passed=False, error="TS_COMPILE_FAILED", errors=[])
            ),
        ),
    ):
        result = await run_f1(**inputs)

    assert result.passed is False
    assert result.first_failure is not None
    assert result.first_failure.check_name == "ts_compile"
    assert result.first_failure.error == "TS_COMPILE_FAILED"
    assert result.first_failure.retry_target == "stage_e"


@pytest.mark.requires_wrangler
async def test_run_f1_integration_end_to_end_smoke(clean_generated_dir: Path) -> None:
    """Integration smoke: real subprocesses (gitleaks + tsc) on a clean dir.

    Skipped without wrangler binary; this is the only end-to-end exercise of
    the full F1 pipeline with no mocks. We just assert the orchestrator returns
    an F1RunResult and runs through 11 checks (passed status depends on
    fixture validity — for the synthetic clean_generated_dir auth_middleware
    will pass but tsc may complain about missing tsconfig; we accept either).
    """
    if shutil.which("gitleaks") is None or shutil.which("npx") is None:
        pytest.skip("gitleaks or npx not on PATH")
    inputs = _clean_inputs(clean_generated_dir)
    result = await run_f1(**inputs)
    assert isinstance(result, F1RunResult)
    assert result.subprocess_checks_pending is False
    assert len(result.outcomes) == 11
