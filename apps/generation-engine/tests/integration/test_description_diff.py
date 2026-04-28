"""Pitfall #7 mitigation — description-hash diff surfaced (D-14, D-46).

Asserts:
- Every Description in the hand-tuned Pass 2 fixtures has ``description_hash``
  set (NOT None).
- The stored ``description_hash`` matches
  ``sha256(render_description_markdown(d))`` byte-for-byte (Python ↔ CLI
  parity contract).
- ``diff_summary`` produces the expected ``{changed, unchanged, added,
  removed}`` shape on synthetic hash mappings.

Fixture-driven (no LLM). Runs on every PR.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from mcpgen_ir.types import Pass2Output

from mcpgen_engine.passes.pass_2.diff import description_hash, diff_summary
from mcpgen_engine.passes.pass_2.validation import render_description_markdown

_REPO_ROOT = Path(__file__).resolve().parents[4]
_FIXTURES_DIR = _REPO_ROOT / "packages" / "engine-fixtures"
_FIXTURE_NAMES: tuple[str, ...] = ("stripe", "github", "notion")


@pytest.mark.parametrize("fixture_name", _FIXTURE_NAMES)
def test_every_description_has_description_hash_set(fixture_name: str) -> None:
    """Pitfall #7: every Description in Pass 2 output MUST carry
    ``description_hash`` so the orchestrator can surface inter-run diffs."""
    fixture_dir = _FIXTURES_DIR / fixture_name
    p2 = Pass2Output.model_validate_json((fixture_dir / "pass-2-output.json").read_text())
    for tool_name, desc in p2.descriptions.items():
        assert (
            desc.description_hash is not None
        ), f"{fixture_name}/{tool_name}: description_hash missing (Pitfall #7)."
        assert len(desc.description_hash) == 64, (
            f"{fixture_name}/{tool_name}: description_hash must be sha256 hex "
            f"(64 chars), got {len(desc.description_hash)}."
        )


@pytest.mark.parametrize("fixture_name", _FIXTURE_NAMES)
def test_description_hash_matches_render_function(fixture_name: str) -> None:
    """The stored description_hash MUST be sha256 of the rendered markdown.

    This locks the CLI ↔ engine parity contract (D-14): if this assertion
    fails, either ``render_description_markdown`` (Python) or
    ``renderDescription`` (TS) drifted, breaking description_hash
    determinism across the two surfaces.
    """
    fixture_dir = _FIXTURES_DIR / fixture_name
    p2 = Pass2Output.model_validate_json((fixture_dir / "pass-2-output.json").read_text())
    for tool_name, desc in p2.descriptions.items():
        # Strip the stored hash so render produces the same bytes the
        # original hash was computed over.
        clone = desc.model_copy(update={"description_hash": None})
        recomputed = description_hash(clone)
        assert recomputed == desc.description_hash, (
            f"{fixture_name}/{tool_name}: description_hash drift — stored "
            f"{desc.description_hash[:16]}... vs recomputed "
            f"{recomputed[:16]}... (run the fixture-rebake helper)."
        )


def test_description_hash_diff_surfaced() -> None:
    """diff_summary returns the expected counts on synthetic mappings.

    Specifically: 1 changed, 1 unchanged, 1 added, 1 removed exercises every
    branch of the diff aggregator.
    """
    old = {
        "search": "a" * 64,  # changed below
        "fetch": "b" * 64,  # unchanged
        "stale": "c" * 64,  # removed
    }
    new = {
        "search": "z" * 64,  # changed
        "fetch": "b" * 64,  # unchanged
        "fresh": "d" * 64,  # added
    }
    summary = diff_summary(old, new)
    assert summary == {
        "changed": 1,
        "unchanged": 1,
        "added": 1,
        "removed": 1,
    }


def test_description_hash_diff_zero_when_identical() -> None:
    """diff_summary returns zero changes when both mappings match."""
    same = {"a": "h" * 64, "b": "i" * 64}
    summary = diff_summary(same, same.copy())
    assert summary == {"changed": 0, "unchanged": 2, "added": 0, "removed": 0}


def test_description_hash_render_byte_match_python_only() -> None:
    """Sanity: render_description_markdown is deterministic on a single
    Python instance (rules out hash-randomisation bugs)."""
    fixture_dir = _FIXTURES_DIR / "stripe"
    p2 = Pass2Output.model_validate_json((fixture_dir / "pass-2-output.json").read_text())
    for desc in p2.descriptions.values():
        clone = desc.model_copy(update={"description_hash": None})
        md1 = render_description_markdown(clone)
        md2 = render_description_markdown(clone)
        assert md1 == md2
        assert (
            hashlib.sha256(md1.encode("utf-8")).hexdigest()
            == hashlib.sha256(md2.encode("utf-8")).hexdigest()
        )


# Avoid lint warning for unused json import (kept for future fixture loaders).
_ = json
