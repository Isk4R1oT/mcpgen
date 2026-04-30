"""GoldenTask loader (CONTEXT D-23 + D-43).

Reads ``packages/engine-fixtures/<spec_slug>/golden_tasks.json`` and validates
each entry through the strictly-additive ``GoldenTask`` Pydantic model shipped
by Plan 05-01 (``mcpgen_ir.types.GoldenTask``).

Phase 5 ships hand-tuned tasks for Stripe + GitHub + Notion (D-43); Linear +
Slack auto-generate via Pass 0 in Plan 05-09 (lower fidelity, flagged in
``QualityReport.golden_task_set_origin``). The ``allow_auto_generated`` flag
exists today as a contract slot -- the actual auto-generation wiring lives in
Plan 05-09.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

from mcpgen_ir.types import GoldenTask

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _fixtures_root() -> Path:
    """Walk parent directories until ``packages/engine-fixtures/`` resolves.

    Same pattern as ``mock_clients._canonical_dir`` -- works in worktrees and
    the main repo without env-var configuration. Cached because hundreds of
    F3 invocations hit the same path.
    """
    path = Path(__file__).resolve()
    for _ in range(10):
        cand = path.parent / "packages" / "engine-fixtures"
        if cand.exists():
            return cand
        path = path.parent
    raise FileNotFoundError(
        "packages/engine-fixtures/ not found via parent walk; "
        "load_golden_tasks cannot resolve fixture paths."
    )


def load_golden_tasks(spec_slug: str, *, allow_auto_generated: bool) -> list[GoldenTask]:
    """Load and validate hand-authored golden tasks for a fixture.

    Args:
        spec_slug: directory name under ``packages/engine-fixtures/``
            (``stripe`` / ``github`` / ``notion`` / ``linear`` / ``slack``).
        allow_auto_generated: when True, missing ``golden_tasks.json`` returns
            an empty list (Plan 05-09 wires the actual auto-gen path); when
            False (production default), raise FileNotFoundError so a fresh
            install cannot silently regress F3 coverage.

    Returns:
        list of GoldenTask validated through the Pydantic mirror.

    Raises:
        FileNotFoundError: when ``allow_auto_generated=False`` and the file
            is absent.
        pydantic.ValidationError: when any entry fails Pydantic validation
            (propagates verbatim -- the retry orchestrator surfaces invalid
            fixtures as an operator-fix issue, not a pipeline retry).
    """
    path = _fixtures_root() / spec_slug / "golden_tasks.json"
    if not path.exists():
        if not allow_auto_generated:
            raise FileNotFoundError(
                f"golden_tasks.json missing for {spec_slug!r}; pass "
                "allow_auto_generated=True to fall back to Pass-0-generated "
                "tasks (Plan 05-09 wires; Plan 05-07 ships the contract)."
            )
        log.warning(
            "auto_generated_golden_tasks_pending",
            extra={"spec_slug": spec_slug, "plan": "05-09"},
        )
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [GoldenTask.model_validate(entry) for entry in raw]
