"""Pass 4 — tests for consistency.py (Pass4Error + auto-fix rules + IR assembly).

Threats covered:
- T-03-OW (D-27): every assembled ``Annotations`` has ``openWorldHint=True``;
  attempting to construct ``Annotations(openWorldHint=False)`` raises a
  Pydantic ``ValidationError`` (Literal[True] invariant).
- Pitfall #31 (D-32): the auto-fix rules align ``readOnlyHint`` and
  ``idempotentHint`` so paired hints are consistent for read tools.
"""

from __future__ import annotations

import pytest
from mcpgen_ir.types import Annotations
from pydantic import ValidationError

from mcpgen_engine.passes.pass_4.consistency import (
    Pass4Error,
    assemble_annotations_with_open_world_hint,
    enforce_consistency_with_autofix,
)

# ────────────────────────────── Pass4Error shape ────────────────────────────


def test_pass_4_error_preserves_violations() -> None:
    err = Pass4Error("MISSING_HINTS: tool 'x' missing [a, b]", violations=["missing: [a]"])
    assert err.violations == ["missing: [a]"]
    assert "MISSING_HINTS" in str(err)


def test_pass_4_error_default_violations_empty() -> None:
    err = Pass4Error("OOPS")
    assert err.violations == []


def test_pass_4_error_is_value_error() -> None:
    """Mirror Pass2Error/Pass3Error: subclass ValueError so callers can
    catch the broad family if they don't care about pass identity."""
    assert issubclass(Pass4Error, ValueError)


# ────────────────────────── enforce_consistency clean ───────────────────────


def test_enforce_consistency_passes_clean_input() -> None:
    """Already-consistent input passes through unchanged (no auto-fix log)."""
    inp = {"t": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True}}
    out = enforce_consistency_with_autofix(inp)
    assert out == inp


# ────────────────────── enforce_consistency auto-fixes ──────────────────────


def test_enforce_consistency_autofixes_destructive_overrides_read_only(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Rule 2: destructive=True forces readOnly=False; warning logged."""
    inp = {"t": {"readOnlyHint": True, "destructiveHint": True, "idempotentHint": False}}
    out = enforce_consistency_with_autofix(inp)
    assert out["t"]["readOnlyHint"] is False
    assert out["t"]["destructiveHint"] is True
    captured = capsys.readouterr()
    log_text = captured.out + captured.err
    assert "pass_4.consistency.autofix_destructive_overrides_read_only" in log_text


def test_enforce_consistency_autofixes_read_only_implies_idempotent(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Rule 1: readOnly=True forces idempotent=True; warning logged."""
    inp = {"t": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": False}}
    out = enforce_consistency_with_autofix(inp)
    assert out["t"]["readOnlyHint"] is True
    assert out["t"]["idempotentHint"] is True
    captured = capsys.readouterr()
    log_text = captured.out + captured.err
    assert "pass_4.consistency.autofix_read_only_implies_idempotent" in log_text


def test_enforce_consistency_both_autofixes_apply() -> None:
    """Rule 2 fires first → readOnly cleared → Rule 1 doesn't re-fire."""
    inp = {"t": {"readOnlyHint": True, "destructiveHint": True, "idempotentHint": False}}
    out = enforce_consistency_with_autofix(inp)
    # destructive=True wins → readOnly=False; idempotent stays False.
    assert out["t"] == {
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": False,
    }


def test_enforce_consistency_destructive_alone_unchanged() -> None:
    """destructive=True with readOnly=False already → no auto-fix."""
    inp = {"t": {"readOnlyHint": False, "destructiveHint": True, "idempotentHint": False}}
    out = enforce_consistency_with_autofix(inp)
    assert out == inp


# ────────────────────── enforce_consistency missing hints ───────────────────


def test_enforce_consistency_missing_hint_raises() -> None:
    """Rule 3: any missing field raises Pass4Error with stable code."""
    inp = {"t": {"readOnlyHint": True}}  # missing 2
    with pytest.raises(Pass4Error) as exc_info:
        enforce_consistency_with_autofix(inp)
    assert "MISSING_HINTS" in str(exc_info.value)
    assert exc_info.value.violations  # non-empty


def test_enforce_consistency_missing_one_hint_raises() -> None:
    """Rule 3: exactly one missing field still raises (no silent default)."""
    inp = {"t": {"readOnlyHint": True, "destructiveHint": False}}
    with pytest.raises(Pass4Error, match="MISSING_HINTS"):
        enforce_consistency_with_autofix(inp)


# ────────────────────── enforce_consistency immutability ────────────────────


def test_enforce_consistency_returns_new_dict_immutable() -> None:
    """Output is a new dict; input is not mutated."""
    inp = {"t": {"readOnlyHint": True, "destructiveHint": True, "idempotentHint": False}}
    inp_snapshot = {k: dict(v) for k, v in inp.items()}
    out = enforce_consistency_with_autofix(inp)
    assert out is not inp
    assert inp == inp_snapshot  # input unchanged


# ───────────────────────────── IR assembly ──────────────────────────────────


def test_assemble_annotations_sets_open_world_hint_true() -> None:
    """Every assembled Annotations carries openWorldHint=True (D-27)."""
    inp = {"t": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True}}
    out = assemble_annotations_with_open_world_hint(inp)
    assert "t" in out
    assert out["t"].openWorldHint is True


def test_assemble_annotations_pydantic_invariant_holds() -> None:
    """Multi-tool assembly: every Annotations has openWorldHint=True (Literal[True])."""
    inp = {
        "a": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True},
        "b": {"readOnlyHint": False, "destructiveHint": True, "idempotentHint": True},
        "c": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False},
    }
    out = assemble_annotations_with_open_world_hint(inp)
    assert set(out.keys()) == {"a", "b", "c"}
    for ann in out.values():
        assert ann.openWorldHint is True


def test_assemble_annotations_returns_pydantic_instance() -> None:
    inp = {"t": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True}}
    out = assemble_annotations_with_open_world_hint(inp)
    assert isinstance(out["t"], Annotations)


def test_assemble_annotations_preserves_three_booleans() -> None:
    """The 3 mutable booleans must round-trip exactly."""
    inp = {"t": {"readOnlyHint": False, "destructiveHint": True, "idempotentHint": True}}
    out = assemble_annotations_with_open_world_hint(inp)
    ann = out["t"]
    assert ann.readOnlyHint is False
    assert ann.destructiveHint is True
    assert ann.idempotentHint is True


# ─────────────────────── D-27 invariant: Literal[True] ──────────────────────


def test_d27_invariant_attempt_to_set_open_world_hint_false_raises() -> None:
    """Pydantic Literal[True] rejects any value except True at construction.

    We construct via ``model_validate`` to bypass static type checking on
    the ``openWorldHint`` keyword (the IR declares it ``Literal[True]``,
    so a literal ``False`` would be flagged by mypy at the call site).
    """
    with pytest.raises(ValidationError):
        Annotations.model_validate(
            {
                "readOnlyHint": True,
                "destructiveHint": False,
                "idempotentHint": True,
                "openWorldHint": False,
            }
        )


# ───────────────── Pitfall #31 — read tools paired hints ───────────────────


def test_pitfall_31_read_tool_after_consistency_has_paired_hints() -> None:
    """A read-tool input from rules.py (already paired correctly) passes
    through with no auto-fix. Exercises the canonical universal-search
    annotation triple as it would appear from Plan 03-10's rule table."""
    inp = {"search": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True}}
    out = enforce_consistency_with_autofix(inp)
    assert out == inp  # no auto-fix triggered


def test_pitfall_31_after_assembly_read_tool_has_open_world_hint_true() -> None:
    """Combined: enforce_consistency → assemble_annotations → openWorldHint=True
    AND readOnlyHint=True for read tools (Pitfall #31)."""
    inp = {"search": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True}}
    consistent = enforce_consistency_with_autofix(inp)
    annotations = assemble_annotations_with_open_world_hint(consistent)
    assert annotations["search"].readOnlyHint is True
    assert annotations["search"].openWorldHint is True
