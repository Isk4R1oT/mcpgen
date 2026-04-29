"""@cloudflare/workers-oauth-provider pin verification tests (RESEARCH Open Q4).

Plan 04-09 strictly verifies (does NOT edit) the package.json entry that Plan
04-06 wrote upfront. The pin lives in `packages/codegen-templates/package.json`
and a paired `docs/decisions/2026-04-28-oauth-provider-pin.md` records the
rationale + verified API surface.

Source-of-truth references:
- `04-RESEARCH.md` Open Q4 (pre-1.0 dep — verify and pin)
- `04-RESEARCH.md` §"Standard Stack" (`@cloudflare/workers-oauth-provider`)
- `04-09-PLAN.md` `<threat_model>` row T-04-09-oauth-api-drift.
- `01-CONTEXT.md` D-13 (paired decision-log mandatory for dep pins)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

# Test-file location: apps/generation-engine/tests/stages/stage_e/<file>
# parents[5] resolves to the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[5]
_PACKAGE_JSON = _REPO_ROOT / "packages" / "codegen-templates" / "package.json"
_DECISION_LOG = _REPO_ROOT / "docs" / "decisions" / "2026-04-28-oauth-provider-pin.md"

_PIN_REGEX = re.compile(r'"@cloudflare/workers-oauth-provider"\s*:\s*"[~^]?(0\.2\.\d+)"')


def test_package_json_pins_oauth_provider_to_0_2_x() -> None:
    """Verify the 0.2.x pin lives in packages/codegen-templates/package.json.

    Plan 04-06 OWNS the write; this test re-asserts the entry at every plan
    04-09 run so a future drop or auto-bump fails fast.
    """
    assert _PACKAGE_JSON.exists(), f"package.json missing at {_PACKAGE_JSON}"
    body = _PACKAGE_JSON.read_text("utf-8")
    match = _PIN_REGEX.search(body)
    assert match is not None, (
        "Expected `@cloudflare/workers-oauth-provider` pinned to ~0.2.x or ^0.2.x; " f"got:\n{body}"
    )


def test_package_json_oauth_pin_is_in_dev_dependencies() -> None:
    """The oauth-provider pin lives under devDependencies (template hoist)."""
    body = json.loads(_PACKAGE_JSON.read_text("utf-8"))
    dev_deps = body.get("devDependencies", {})
    assert "@cloudflare/workers-oauth-provider" in dev_deps
    pin = dev_deps["@cloudflare/workers-oauth-provider"]
    assert _PIN_REGEX.match(
        f'"@cloudflare/workers-oauth-provider": "{pin}"'
    ), f"Pin {pin!r} does not match 0.2.x range"


def test_decision_log_exists() -> None:
    """Paired decision-log MUST exist at `docs/decisions/2026-04-28-oauth-provider-pin.md`."""
    assert _DECISION_LOG.exists(), (
        f"Paired decision-log missing at {_DECISION_LOG}; per Phase 1 D-13 "
        "every dep pin requires a decision-log entry."
    )


def test_decision_log_records_verified_version() -> None:
    """Decision-log MUST mention the verified `0.2.2` version explicitly."""
    text = _DECISION_LOG.read_text("utf-8")
    assert "0.2.2" in text, (
        "Decision-log must record the verified patch version (0.2.2). " f"Found:\n{text[:500]}"
    )


def test_decision_log_minimum_length() -> None:
    """Decision-log carries enough context (≥30 lines) to satisfy Phase 1 D-13."""
    lines = _DECISION_LOG.read_text("utf-8").splitlines()
    assert len(lines) >= 30, f"Decision-log must be ≥30 lines (Phase 1 D-13); got {len(lines)}"
