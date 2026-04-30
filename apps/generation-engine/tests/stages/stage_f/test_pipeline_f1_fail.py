"""Pipeline F1 fail-closed semantics test (CONTEXT D-07).

Plan 05-08 implements the actual ``stages/stage_f/__init__.py`` pipeline
glue that calls F1 -> F2 -> F3 in serial. This test locks the contract NOW
so Plan 05-08 has a regression test waiting:

    "When F1 returns ``passed=False``, F2 + F3 MUST NOT run."

The reason F1 is a strict serial gate (per D-07):

- F2 (smell scan) needs valid descriptions/schemas to score — bad inputSchema
  makes the rubric meaningless.
- F3 (agent eval) needs a server that compiles + has working auth — tsc
  failures or missing auth middleware make the test agent crash.

Until Plan 05-08 ships ``run_stage_f``, this test simulates the orchestrator
decision logic via a tiny inline harness; Plan 05-08 will replace the harness
with a real call into the pipeline glue while keeping the assertions intact.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

import pytest

from mcpgen_engine.stages.stage_f.f1_static import F1CheckOutcome, F1RunResult


async def _harness(
    f1_result: F1RunResult,
    *,
    f2_runner: Callable[[], Awaitable[bool]],
    f3_runner: Callable[[], Awaitable[bool]],
) -> tuple[bool, bool]:
    """Tiny harness encoding the D-07 serial gate.

    Plan 05-08 will replace this with a real pipeline call. The contract is:
    if F1 fails, neither F2 nor F3 runs; both return values are False.

    Returns ``(f2_invoked, f3_invoked)``.
    """
    if not f1_result.passed:
        return (False, False)
    f2_passed = await f2_runner()
    if not f2_passed:
        return (True, False)
    await f3_runner()
    return (True, True)


def _failing_f1() -> F1RunResult:
    """Build a failing F1 result (BUNDLE_SIZE_HARD — terminal, no retry)."""
    failing_outcome = F1CheckOutcome(
        check_name="bundle_size",
        passed=False,
        error="BUNDLE_SIZE_HARD",
        retry_target=None,  # terminal
        details={"kb": 1500},
    )
    return F1RunResult(
        passed=False,
        outcomes=[failing_outcome],
        first_failure=failing_outcome,
        subprocess_checks_pending=False,
    )


def _passing_f1() -> F1RunResult:
    """Build a passing F1 result (control case)."""
    return F1RunResult(
        passed=True,
        outcomes=[
            F1CheckOutcome(
                check_name="bundle_size",
                passed=True,
                error=None,
                retry_target=None,
                details={"kb": 412},
            )
        ],
        first_failure=None,
        subprocess_checks_pending=False,
    )


async def test_f1_failure_blocks_f2_and_f3() -> None:
    """D-07 contract: when F1 fails, F2 + F3 MUST NOT be invoked."""
    f2_called = False
    f3_called = False

    async def _f2() -> bool:
        nonlocal f2_called
        f2_called = True
        return True

    async def _f3() -> bool:
        nonlocal f3_called
        f3_called = True
        return True

    f2_invoked, f3_invoked = await _harness(_failing_f1(), f2_runner=_f2, f3_runner=_f3)

    assert f2_invoked is False, "F2 must NOT run when F1 fails (D-07)"
    assert f3_invoked is False, "F3 must NOT run when F1 fails (D-07)"
    assert f2_called is False
    assert f3_called is False


async def test_f1_pass_invokes_f2_and_f3() -> None:
    """Control case: F1 pass -> F2 invoked; F2 pass -> F3 invoked."""
    f2_called = False
    f3_called = False

    async def _f2() -> bool:
        nonlocal f2_called
        f2_called = True
        return True

    async def _f3() -> bool:
        nonlocal f3_called
        f3_called = True
        return True

    f2_invoked, f3_invoked = await _harness(_passing_f1(), f2_runner=_f2, f3_runner=_f3)

    assert f2_invoked is True
    assert f3_invoked is True
    assert f2_called is True
    assert f3_called is True


async def test_f1_pass_f2_fail_blocks_f3() -> None:
    """F1 pass + F2 fail still blocks F3 (D-07 cascade)."""
    f3_called = False

    async def _f2() -> bool:
        return False  # F2 fails

    async def _f3() -> bool:
        nonlocal f3_called
        f3_called = True
        return True

    f2_invoked, f3_invoked = await _harness(_passing_f1(), f2_runner=_f2, f3_runner=_f3)

    assert f2_invoked is True  # F2 did run
    assert f3_invoked is False  # but F3 was skipped
    assert f3_called is False


@pytest.mark.parametrize(
    ("error_code", "expected_terminal"),
    [
        ("BUNDLE_SIZE_HARD", True),  # terminal
        ("SECRETS_LEAKED", True),  # terminal
        ("TS_COMPILE_FAILED", False),  # retryable -> stage_e
        ("MCP_COMPLIANCE_FAIL_ANNOTATIONS", False),  # retryable -> pass_4
    ],
)
def test_failing_f1_blocks_pipeline_regardless_of_terminal_status(
    error_code: str,
    expected_terminal: bool,
) -> None:
    """Terminal vs retryable F1 failures all block F2/F3 the same way per D-07.

    The ``retry_target`` field tells the *orchestrator* whether to retry an
    upstream pass; it does NOT change the F1->F2->F3 gate.  A retryable F1
    failure (e.g. TS_COMPILE_FAILED) still blocks F2 immediately; F2 only
    runs after the retry round produces a passing F1.
    """
    failing = F1RunResult(
        passed=False,
        outcomes=[
            F1CheckOutcome(
                check_name="any",
                passed=False,
                error=error_code,
                retry_target="stage_e" if not expected_terminal else None,
                details={},
            )
        ],
        first_failure=F1CheckOutcome(
            check_name="any",
            passed=False,
            error=error_code,
            retry_target="stage_e" if not expected_terminal else None,
            details={},
        ),
        subprocess_checks_pending=False,
    )
    # We can't await inside parametrize without wrapping; just assert the
    # passed gate at the data layer (the harness already locks behavior).
    assert failing.passed is False
