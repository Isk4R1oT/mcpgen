"""Pitfall #31 — Cursor confirmation invariant for read tools (D-32, D-48).

Pass 4 must emit explicit ``readOnlyHint=True`` for every read-categorized
tool (universal search/fetch/list_collections/list_objects + specialized
reads), so Cursor's short-circuit skips confirmation regardless of the
``openWorldHint`` invariant. Phase 5 F3 client-mock verifies the runtime
behaviour; this test verifies the IR shape against the hand-tuned fixtures
in isolation.

The test is fixture-driven (no LLM) and runs on every PR.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# tests/integration/test_pass_4_cursor_invariant.py → parents[4] is repo root
# (apps/generation-engine/tests/integration/<file>.py).
_REPO_ROOT = Path(__file__).resolve().parents[4]
_FIXTURES_DIR = _REPO_ROOT / "packages" / "engine-fixtures"
_FIXTURE_NAMES: tuple[str, ...] = ("stripe", "github", "notion")

_READ_UNIVERSAL_NAMES: frozenset[str] = frozenset(
    {"search", "fetch", "list_collections", "list_objects"}
)


@pytest.mark.parametrize("fixture_name", _FIXTURE_NAMES)
def test_read_tools_have_explicit_read_only_hint(fixture_name: str) -> None:
    """For every read-categorized tool, assert ``readOnlyHint=True`` AND
    ``openWorldHint=True``.

    Read-categorized = universal search/fetch/list_collections/list_objects
    OR ``type == "specialized"`` (per Pass 1 taxonomy).
    """
    fixture_dir = _FIXTURES_DIR / fixture_name
    pass_1 = json.loads((fixture_dir / "pass-1-output.json").read_text())
    pass_4 = json.loads((fixture_dir / "pass-4-output.json").read_text())

    found_read_tool = False
    for tool in pass_1["tools"]:
        is_read_universal = tool["type"] == "universal" and tool["name"] in _READ_UNIVERSAL_NAMES
        is_specialized_read = tool["type"] == "specialized"
        if not (is_read_universal or is_specialized_read):
            continue
        found_read_tool = True
        ann = pass_4["annotations"][tool["name"]]
        assert ann["readOnlyHint"] is True, (
            f"{fixture_name}/{tool['name']}: Pitfall #31 violation — read tool "
            "must have readOnlyHint=True for Cursor to skip confirmation."
        )
        assert ann["openWorldHint"] is True, (
            f"{fixture_name}/{tool['name']}: D-27 invariant violation — "
            "every annotation must have openWorldHint=True."
        )

    assert found_read_tool, (
        f"{fixture_name}: no read-categorized tools found in Pass 1 output — "
        "Stripe/GitHub/Notion fixtures must include search/fetch/list_*."
    )


@pytest.mark.parametrize("fixture_name", _FIXTURE_NAMES)
def test_every_annotation_has_open_world_hint(fixture_name: str) -> None:
    """D-27 invariant: every Pass 4 annotation MUST have ``openWorldHint=True``
    (we wrap external REST APIs)."""
    fixture_dir = _FIXTURES_DIR / fixture_name
    pass_4 = json.loads((fixture_dir / "pass-4-output.json").read_text())
    for tool_name, ann in pass_4["annotations"].items():
        assert (
            ann["openWorldHint"] is True
        ), f"{fixture_name}/{tool_name}: openWorldHint must be true (D-27)."
