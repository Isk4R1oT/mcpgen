"""F1 check #2 — Jinja2 template artifact leak tests (Plan 05-03 Task 1).

Behavior block per plan:

- A ``.ts`` file with a Jinja artifact -> fail with ``STAGE_E_TEMPLATE_LEAKED``.
- A clean ``.ts`` file -> ``passed=True``.
- The check ignores ``.md`` and ``.json`` files (only ``.ts`` is scanned).
"""

from __future__ import annotations

from pathlib import Path

from mcpgen_engine.stages.stage_f.f1_checks.template_artifacts import (
    check_template_artifacts,
)


def test_artifact_in_ts_file_fails(tmp_path: Path) -> None:
    leaky = tmp_path / "leaky.ts"
    leaky.write_text('const x = "{{ PLACEHOLDER }}";\nexport default x;\n', encoding="utf-8")
    result = check_template_artifacts(tmp_path)
    assert result.passed is False
    assert result.error == "STAGE_E_TEMPLATE_LEAKED"
    assert "leaky.ts" in result.offending_files


def test_clean_ts_files_pass(tmp_path: Path) -> None:
    clean = tmp_path / "clean.ts"
    clean.write_text('export const x: string = "no artifacts here";\n', encoding="utf-8")
    result = check_template_artifacts(tmp_path)
    assert result.passed is True
    assert result.error is None
    assert result.offending_files == []


def test_only_ts_files_scanned(tmp_path: Path) -> None:
    """Markdown and JSON files with ``{{`` MUST NOT trip the check."""
    md_file = tmp_path / "README.md"
    md_file.write_text("Use {{ template_var }} in Jinja docs.", encoding="utf-8")
    json_file = tmp_path / "schema.json"
    json_file.write_text('{"example": "{{ raw_jinja }}"}', encoding="utf-8")
    clean_ts = tmp_path / "ok.ts"
    clean_ts.write_text("export const ok = 1;\n", encoding="utf-8")

    result = check_template_artifacts(tmp_path)
    assert result.passed is True
    assert result.offending_files == []
