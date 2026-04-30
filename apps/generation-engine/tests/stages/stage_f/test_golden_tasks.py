"""Plan 05-07 Task 2 -- GoldenTask loader (CONTEXT D-23 + D-43)."""

from __future__ import annotations

import json
from collections.abc import Generator
from pathlib import Path
from unittest.mock import patch

import pytest
from mcpgen_ir.types import GoldenTask
from pydantic import ValidationError

from mcpgen_engine.stages.stage_f import golden_tasks
from mcpgen_engine.stages.stage_f.golden_tasks import load_golden_tasks


def _write_fixture(root: Path, spec_slug: str, entries: list[dict]) -> Path:
    spec_dir = root / spec_slug
    spec_dir.mkdir(parents=True)
    path = spec_dir / "golden_tasks.json"
    path.write_text(json.dumps(entries), encoding="utf-8")
    return path


@pytest.fixture(autouse=True)
def _reset_fixtures_root_cache() -> Generator[None, None, None]:
    """``_fixtures_root`` is lru_cached -- bust between tests so each test
    can patch the parent walk with its own tmp_path."""
    golden_tasks._fixtures_root.cache_clear()
    yield
    golden_tasks._fixtures_root.cache_clear()


def test_load_golden_tasks_returns_pydantic_models(tmp_path: Path) -> None:
    _write_fixture(
        tmp_path,
        "demo_spec",
        [
            {
                "task_id": "t1",
                "prompt": "Find the customer with email a@b.com",
                "expected_outcome": "Returns customer object with email a@b.com",
                "expected_sequence": ["search", "fetch"],
                "max_iterations": 10,
            },
            {
                "task_id": "t2",
                "prompt": "Refund the most recent charge",
                "expected_outcome": "Charge refunded; trajectory ends with end_turn",
            },
        ],
    )
    with patch.object(golden_tasks, "_fixtures_root", lambda: tmp_path):
        tasks = load_golden_tasks("demo_spec", allow_auto_generated=False)
    assert len(tasks) == 2
    assert all(isinstance(t, GoldenTask) for t in tasks)
    assert tasks[0].task_id == "t1"
    assert tasks[0].expected_sequence == ["search", "fetch"]
    # Pydantic default kicks in when `max_iterations` omitted.
    assert tasks[1].max_iterations == 10


def test_load_golden_tasks_propagates_validation_error(tmp_path: Path) -> None:
    _write_fixture(
        tmp_path,
        "broken_spec",
        [
            # Missing `expected_outcome` -- Pydantic rejects.
            {"task_id": "t1", "prompt": "do a thing"},
        ],
    )
    with (
        patch.object(golden_tasks, "_fixtures_root", lambda: tmp_path),
        pytest.raises(ValidationError),
    ):
        load_golden_tasks("broken_spec", allow_auto_generated=False)


def test_load_golden_tasks_missing_file_with_strict_raises(tmp_path: Path) -> None:
    # No file written -- strict mode must raise.
    with (
        patch.object(golden_tasks, "_fixtures_root", lambda: tmp_path),
        pytest.raises(FileNotFoundError) as exc,
    ):
        load_golden_tasks("does_not_exist", allow_auto_generated=False)
    assert "allow_auto_generated=True" in str(exc.value)


def test_load_golden_tasks_missing_file_with_allow_returns_empty(tmp_path: Path) -> None:
    # No file written -- allow_auto_generated returns [] (Plan 05-09 wires
    # actual auto-gen).
    with patch.object(golden_tasks, "_fixtures_root", lambda: tmp_path):
        tasks = load_golden_tasks("does_not_exist", allow_auto_generated=True)
    assert tasks == []
