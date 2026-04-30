"""F1 static validation orchestrator (CONTEXT D-04 / D-05 / D-07).

Plan 05-03 ships the 8 cheap deterministic checks (D-05 steps 1-8). Plan 05-04
extends with the 3 subprocess checks (steps 9 gitleaks / 10 jsonschema / 11 tsc),
preserving the cheapest-first ordering and the early-abort semantics.

Pipeline order (CONTEXT D-05):

1. bundle_size            ($0, <0.1s)
2. template_artifacts     ($0, <0.5s)
3. smart_id_fuzz          ($0, <1s)
4. mcp_compliance         ($0, <1s)
5. routing_completeness   ($0, <1s)
6. auth_middleware        ($0, <0.1s)
7. openai_compliance      ($0, <0.5s)
8. examples_provenance    ($0, <1s)
9. secret_scan            ($0, ~2s)   <-- Plan 05-04
10. json_schema           ($0, ~1s)   <-- Plan 05-04
11. ts_compile            ($0, ~3-5s) <-- Plan 05-04

Fail-closed semantics (CONTEXT D-07): F1 failure (after the orchestrator returns)
blocks F2 + F3 from running. The orchestrator itself does NOT short-circuit on
generic failures — it runs every cheap check so the F1 outcome matrix is complete
in a single round (cheaper to surface 3 failures at once than discover them across
3 retry rounds). The ONLY hard short-circuit is BUNDLE_SIZE_HARD, which is a
terminal "spec is too big" verdict that no retry can fix.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .f1_checks import (
    auth_middleware,
    bundle_size,
    examples_provenance,
    json_schema,
    mcp_compliance,
    openai_compliance,
    routing_completeness,
    secret_scan,
    smart_id_fuzz,
    template_artifacts,
    ts_compile,
)
from .failure_patterns import f1_check_to_retry


@dataclass(frozen=True)
class F1CheckOutcome:
    """The result of a single F1 check.

    ``retry_target`` is resolved via ``failure_patterns.f1_check_to_retry`` — when
    the check passes (``error is None``) it is also ``None``; when the check fails
    terminally (e.g. ``BUNDLE_SIZE_HARD``) it is ``None`` because no retry can fix
    the underlying signal.
    """

    check_name: str
    passed: bool
    error: str | None
    retry_target: str | None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class F1RunResult:
    """Aggregate outcome across every cheap check in the cheapest-first pipeline.

    ``subprocess_checks_pending`` is set to True until Plan 05-04 wires steps
    9/10/11; downstream callers (the retry orchestrator in Plan 05-08, the
    QualityReport assembler in Plan 05-07) read this flag so they know the F1
    floor in this Phase-5 wave is intentionally partial.
    """

    passed: bool
    outcomes: list[F1CheckOutcome]
    first_failure: F1CheckOutcome | None
    subprocess_checks_pending: bool


def _record(
    check_name: str,
    passed: bool,
    error: str | None,
    details: dict[str, Any],
) -> F1CheckOutcome:
    """Build a single outcome row, resolving the retry target via failure_patterns."""
    retry_target = f1_check_to_retry(error) if error is not None else None
    return F1CheckOutcome(
        check_name=check_name,
        passed=passed,
        error=error,
        retry_target=retry_target,
        details=details,
    )


async def run_f1_cheap_checks(
    *,
    generated_dir: Path,
    bundle_size_kb: int,
    final_tools: list[dict[str, Any]],
    mcp_protocol_version: str,
    pass_1_output: dict[str, Any],
    raw_ir: dict[str, Any],
    pass_2_output: dict[str, Any],
    spec_slug: str,
    sample_collection: str,
    sample_id: str,
) -> F1RunResult:
    """Run the 8 cheap deterministic F1 checks per CONTEXT D-05 steps 1-8.

    Each check is invoked synchronously inside this ``async`` orchestrator so it
    can be awaited alongside Plan 05-04's subprocess checks (gitleaks / tsc are
    natively asyncio-friendly via ``asyncio.create_subprocess_exec``). The
    cheap-check tail therefore preserves the same ``await``-able shape Plan 05-08
    will compose against the F2 / F3 orchestrators.

    BUNDLE_SIZE_HARD is the only short-circuit: a >950 KB bundle cannot be fixed
    by re-running any pass, so we surface ``MULTI_SERVER_SPLIT_REQUIRED`` and
    skip the rest of F1 to avoid wasted work.
    """
    outcomes: list[F1CheckOutcome] = []

    # Step 1: bundle_size — the only hard short-circuit (CONTEXT D-05 step 1).
    bundle_result = bundle_size.check_bundle_size(bundle_size_kb)
    outcomes.append(
        _record(
            "bundle_size",
            bundle_result.passed,
            bundle_result.error,
            {"kb": bundle_result.bundle_size_kb, "warning": bundle_result.warning},
        )
    )
    if bundle_result.error == "BUNDLE_SIZE_HARD":
        return F1RunResult(
            passed=False,
            outcomes=outcomes,
            first_failure=outcomes[-1],
            subprocess_checks_pending=True,
        )

    # Step 2: template_artifacts — Stage E Jinja2 leak detector.
    template_result = template_artifacts.check_template_artifacts(generated_dir)
    outcomes.append(
        _record(
            "template_artifacts",
            template_result.passed,
            template_result.error,
            {"offending_files": template_result.offending_files},
        )
    )

    # Step 3: smart_id_fuzz — cross-tenant rejection (Pitfall #1).
    fuzz_result = smart_id_fuzz.smart_id_fuzz(
        spec_slug=spec_slug,
        sample_collection=sample_collection,
        sample_id=sample_id,
    )
    outcomes.append(
        _record(
            "smart_id_fuzz",
            fuzz_result.passed,
            fuzz_result.error,
            {"info": fuzz_result.details},
        )
    )

    # Step 4: mcp_compliance — 4 annotations + openWorldHint=true + protocol version.
    mcp_result = mcp_compliance.check_mcp_compliance(
        final_tools=final_tools,
        mcp_protocol_version=mcp_protocol_version,
    )
    outcomes.append(
        _record(
            "mcp_compliance",
            mcp_result.passed,
            mcp_result.error,
            {"offending_tools": mcp_result.offending_tools},
        )
    )

    # Step 5: routing_completeness — every Pass 1 routing target maps to RawIR.
    routing_result = routing_completeness.check_routing_completeness(
        pass_1_output=pass_1_output,
        raw_ir=raw_ir,
    )
    outcomes.append(
        _record(
            "routing_completeness",
            routing_result.passed,
            routing_result.error,
            {"missing": routing_result.missing},
        )
    )

    # Step 6: auth_middleware — host-header allowlist FIRST (Pitfall #15).
    auth_result = auth_middleware.check_auth_middleware(generated_dir)
    outcomes.append(
        _record(
            "auth_middleware",
            auth_result.passed,
            auth_result.error,
            {"info": auth_result.details},
        )
    )

    # Step 7: openai_compliance — search/fetch canonical-fixture diff (Pitfall #32).
    openai_result = openai_compliance.check_openai_compliance(final_tools)
    outcomes.append(
        _record(
            "openai_compliance",
            openai_result.passed,
            openai_result.error,
            {"diff": openai_result.diff},
        )
    )

    # Step 8: examples_provenance — Pass 2 examples derivable from spec (Pitfall #10).
    examples_result = examples_provenance.check_examples_provenance(
        pass_2_output=pass_2_output,
        raw_ir=raw_ir,
    )
    outcomes.append(
        _record(
            "examples_provenance",
            examples_result.passed,
            examples_result.error,
            {"offending_examples": examples_result.offending_examples},
        )
    )

    first_failure = next((o for o in outcomes if not o.passed), None)
    return F1RunResult(
        passed=first_failure is None,
        outcomes=outcomes,
        first_failure=first_failure,
        subprocess_checks_pending=True,
    )


async def run_f1(
    *,
    generated_dir: Path,
    bundle_size_kb: int,
    final_tools: list[dict[str, Any]],
    mcp_protocol_version: str,
    pass_1_output: dict[str, Any],
    raw_ir: dict[str, Any],
    pass_2_output: dict[str, Any],
    spec_slug: str,
    sample_collection: str,
    sample_id: str,
) -> F1RunResult:
    """Full F1 pipeline (CONTEXT D-04 / D-05 / D-07): 8 cheap + 3 subprocess checks.

    Cheapest-first ordering. The only short-circuit is BUNDLE_SIZE_HARD
    (terminal: a >950 KB bundle cannot be fixed by any retry). All other
    failures still allow the rest of the pipeline to run so the caller sees
    every failing check in a single round (cheaper to surface 3 failures at
    once than discover them across 3 retry rounds).

    D-07 fail-closed contract: any check failure -> ``F1RunResult.passed=False``.
    The pipeline glue (Plan 05-08 ``stages/stage_f/__init__.py``) reads this
    field and skips F2 + F3 when it is False; ``test_pipeline_f1_fail.py`` locks
    that gate.

    ``subprocess_checks_pending=False`` is set unconditionally because we run
    the subprocess tail every time (or skip everything via BUNDLE_SIZE_HARD).
    """
    cheap = await run_f1_cheap_checks(
        generated_dir=generated_dir,
        bundle_size_kb=bundle_size_kb,
        final_tools=final_tools,
        mcp_protocol_version=mcp_protocol_version,
        pass_1_output=pass_1_output,
        raw_ir=raw_ir,
        pass_2_output=pass_2_output,
        spec_slug=spec_slug,
        sample_collection=sample_collection,
        sample_id=sample_id,
    )

    outcomes: list[F1CheckOutcome] = list(cheap.outcomes)

    # Step 9: secret_scan (gitleaks subprocess; SECRETS_LEAKED is terminal D-06).
    # WR-02: Run secret_scan unconditionally — even when BUNDLE_SIZE_HARD fires.
    # SECRETS_LEAKED is itself terminal per failure_patterns.F1_CHECK_TO_RETRY,
    # and an oversized bundle that ALSO leaks credentials must surface both
    # signals or the operator will fix the bundle, re-run, and only then
    # discover the secret leak.
    secret_result = await secret_scan.run_secret_scan(generated_dir)
    outcomes.append(
        _record(
            "secret_scan",
            secret_result.passed,
            secret_result.error,
            {
                "findings": len(secret_result.findings),
                "info": secret_result.details,
            },
        )
    )

    # BUNDLE_SIZE_HARD is terminal — no retry can shrink the bundle; cascading
    # to remaining subprocess checks (json_schema, ts_compile) just wastes
    # wall-clock + LLM-judge cost downstream. secret_scan above already ran.
    if cheap.first_failure is not None and cheap.first_failure.error == "BUNDLE_SIZE_HARD":
        return F1RunResult(
            passed=False,
            outcomes=outcomes,
            first_failure=cheap.first_failure,
            subprocess_checks_pending=False,
        )

    # Step 10: json_schema (Draft 2020-12 metaschema for input + output).
    json_result = json_schema.validate_tool_schemas(final_tools)
    outcomes.append(
        _record(
            "json_schema",
            json_result.passed,
            json_result.error,
            {
                "errors": [
                    {
                        "tool": e.tool_name,
                        "kind": e.kind,
                        "path": list(e.path),
                        "message": e.message[:200],
                    }
                    for e in json_result.errors[:5]
                ]
            },
        )
    )

    # Step 11: ts_compile (npx tsc --noEmit; first-50 errors only).
    ts_result = await ts_compile.run_ts_compile(generated_dir)
    outcomes.append(
        _record(
            "ts_compile",
            ts_result.passed,
            ts_result.error,
            {
                "errors": [
                    {
                        "file": e.file,
                        "line": e.line,
                        "code": e.code,
                        "msg": e.message[:200],
                    }
                    for e in ts_result.errors[:10]
                ]
            },
        )
    )

    first_failure = next((o for o in outcomes if not o.passed), None)
    return F1RunResult(
        passed=first_failure is None,
        outcomes=outcomes,
        first_failure=first_failure,
        subprocess_checks_pending=False,
    )
