"""F1 check #8 — examples-provenance hallucination tests (Plan 05-03 Task 2).

Behavior block per plan:

- Every Pass2 example substring-found in RawIR -> ``passed=True``.
- One Pass2 example not derivable -> ``passed=False, error="EXAMPLES_HALLUCINATED"``.
- Tool with ``examples=null`` -> ``passed=True`` (nothing to verify).
- Substring-match is loose v1 (RESEARCH §8.2) — exact JSON canonicalised match.
"""

from __future__ import annotations

from typing import Any

from mcpgen_engine.stages.stage_f.f1_checks.examples_provenance import (
    check_examples_provenance,
)
from mcpgen_engine.stages.stage_f.failure_patterns import f1_check_to_retry


def _make_raw_ir(examples: list[Any]) -> dict[str, Any]:
    return {
        "endpoints": [
            {
                "method": "POST",
                "path": "/v1/charges",
                "request_body": {"examples": examples},
                "responses": {},
            }
        ]
    }


def test_examples_derived_from_spec_pass() -> None:
    """Pass2 examples that match canonical spec examples should pass."""
    pass_2 = {
        "tools": [
            {
                "name": "charges_create",
                "description": {
                    "examples": [{"amount": 1000, "currency": "usd"}],
                },
            }
        ]
    }
    raw_ir = _make_raw_ir([{"amount": 1000, "currency": "usd"}])
    result = check_examples_provenance(pass_2_output=pass_2, raw_ir=raw_ir)
    assert result.passed is True
    assert result.error is None


def test_hallucinated_example_fails_with_pass_2_signal() -> None:
    """Pass2 example NOT in spec corpus -> fail + retry pass_2."""
    pass_2 = {
        "tools": [
            {
                "name": "charges_create",
                "description": {
                    "examples": [{"amount": 9999999, "currency": "fake"}],
                },
            }
        ]
    }
    raw_ir = _make_raw_ir([{"amount": 1000, "currency": "usd"}])
    result = check_examples_provenance(pass_2_output=pass_2, raw_ir=raw_ir)
    assert result.passed is False
    assert result.error == "EXAMPLES_HALLUCINATED"
    assert len(result.offending_examples) >= 1
    assert result.offending_examples[0][0] == "charges_create"
    # Failure -> retry Pass 2 (CONTEXT D-06).
    assert f1_check_to_retry("EXAMPLES_HALLUCINATED") == "pass_2"


def test_examples_null_passes() -> None:
    """A tool with ``examples=null`` (the v0 default) has nothing to verify."""
    pass_2 = {
        "tools": [
            {
                "name": "charges_create",
                "description": {"examples": None},
            }
        ]
    }
    raw_ir = _make_raw_ir([])
    result = check_examples_provenance(pass_2_output=pass_2, raw_ir=raw_ir)
    assert result.passed is True
    assert result.error is None


def test_phase_3_descriptions_shape_walked() -> None:
    """Pass2Output.descriptions (Phase 3 actual shape) is walked too."""
    pass_2 = {
        "descriptions": {
            "charges_create": {"examples": [{"amount": 500, "currency": "eur"}]},
            "charges_capture": {"examples": None},
        }
    }
    raw_ir = _make_raw_ir([{"amount": 500, "currency": "eur"}])
    result = check_examples_provenance(pass_2_output=pass_2, raw_ir=raw_ir)
    assert result.passed is True


def test_no_examples_anywhere_passes() -> None:
    """A Pass2Output with descriptions but no examples key passes (v0 reality)."""
    pass_2 = {
        "descriptions": {
            "charges_create": {"purpose": "Create a charge", "limitations": []},
        }
    }
    raw_ir = _make_raw_ir([])
    result = check_examples_provenance(pass_2_output=pass_2, raw_ir=raw_ir)
    assert result.passed is True
