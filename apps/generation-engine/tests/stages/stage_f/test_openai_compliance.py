"""F1 check #7 — OpenAI Deep Research compliance tests (Plan 05-03 Task 2).

Behavior block per plan:

- ``search.inputSchema`` deep-equals canonical -> ``passed=True``.
- ``search.inputSchema`` adds extra ``limit`` -> drift fail with SEARCH code.
- ``fetch.inputSchema`` renames ``id`` -> ``object_id`` -> drift fail with PARAM_RENAME.
- API without ``search`` / ``fetch`` -> ``passed=True`` (skip).
"""

from __future__ import annotations

import json

from mcpgen_engine.stages.stage_f.f1_checks.openai_compliance import (
    _CANONICAL_DIR,
    check_openai_compliance,
)


def _read_canonical(name: str) -> dict[str, object]:
    path = _CANONICAL_DIR / f"{name}_signature.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_canonical_search_passes() -> None:
    canonical = _read_canonical("search")
    final_tools = [{"name": "search", "inputSchema": canonical}]
    result = check_openai_compliance(final_tools)
    assert result.passed is True, result.diff
    assert result.error is None


def test_canonical_fetch_passes() -> None:
    canonical = _read_canonical("fetch")
    final_tools = [{"name": "fetch", "inputSchema": canonical}]
    result = check_openai_compliance(final_tools)
    assert result.passed is True, result.diff
    assert result.error is None


def test_extra_param_drift_fails_search() -> None:
    canonical = _read_canonical("search")
    drifted = json.loads(json.dumps(canonical))
    drifted["properties"]["limit"] = {"type": "integer"}
    final_tools = [{"name": "search", "inputSchema": drifted}]
    result = check_openai_compliance(final_tools)
    assert result.passed is False
    assert result.error == "OPENAI_COMPLIANCE_DRIFT_SEARCH"
    assert "limit" in result.diff


def test_param_rename_drift_fails_fetch() -> None:
    canonical = _read_canonical("fetch")
    drifted = json.loads(json.dumps(canonical))
    drifted["properties"]["object_id"] = drifted["properties"].pop("id")
    drifted["required"] = ["object_id"]
    final_tools = [{"name": "fetch", "inputSchema": drifted}]
    result = check_openai_compliance(final_tools)
    assert result.passed is False
    # Renames map to Pass 3 (parameter spec) per CONTEXT D-06.
    assert result.error == "OPENAI_COMPLIANCE_DRIFT_PARAM_RENAME"


def test_per_property_description_allowed() -> None:
    """Spec-derived property descriptions are stripped before deep-equal."""
    canonical = _read_canonical("search")
    described = json.loads(json.dumps(canonical))
    described["properties"]["query"]["description"] = "User's search query"
    final_tools = [{"name": "search", "inputSchema": described}]
    result = check_openai_compliance(final_tools)
    assert result.passed is True, result.diff


def test_action_only_api_skips_check() -> None:
    """API with no ``search`` or ``fetch`` tool -> ``passed=True`` (skip)."""
    final_tools = [{"name": "charges_capture", "inputSchema": {"type": "object", "properties": {}}}]
    result = check_openai_compliance(final_tools)
    assert result.passed is True
    assert result.error is None


def test_canonical_dir_resolution_finds_fixtures() -> None:
    """Sanity: the canonical fixtures landed by Plan 05-02 are reachable from this module."""
    assert (_CANONICAL_DIR / "search_signature.json").exists()
    assert (_CANONICAL_DIR / "fetch_signature.json").exists()
    # Module path resolution should not depend on test cwd.
    assert _CANONICAL_DIR.is_absolute()
    assert _CANONICAL_DIR.is_dir()
