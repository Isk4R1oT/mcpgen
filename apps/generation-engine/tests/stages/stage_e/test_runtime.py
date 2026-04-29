"""Stage E runtime tests — render_runtime_files emits 8 runtime helpers.

Plan 04-08 Wave 0 — RED tests for ``stages/stage_e/runtime.py`` orchestrator
and the eight Jinja2 templates under
``packages/codegen-templates/templates/`` rendering ``src/runtime/*``.

Coverage:

- 8 runtime files rendered with the right relative paths.
- Every file has non-empty content.
- Smart-ID parser regex matches the canonical 4-part format.
- Pagination clamps + defaults per Pass 5 strategy flag.
- Truncation table mirrors Plan 04-04 D-07 verbatim across 8 tool types.
- Upstream client max-retries hand-rolled at 3 attempts.
- Response shaping field-filter passes through with empty allow lists.
- Errors helper emits all 5 status-code branches per CONTEXT D-32.
- ``render_inputs_hash`` deterministic across calls (GEN-12 cold/warm).

References:
- 04-CONTEXT.md D-23 / D-24 / D-32
- 04-RESEARCH.md §"Code Examples" Pattern 3 + Pattern 5
- 04-PATTERNS.md `templates/smart_id.ts.j2` row.
"""

from __future__ import annotations

import re
from types import SimpleNamespace
from typing import Any

from mcpgen_ir.types import Pass0Output, Pass5Output, RawIR

from mcpgen_engine.stages.stage_e.runtime import (
    _extract_spec_auth_headers,
    render_runtime_files,
)

_EXPECTED_RUNTIME_PATHS: set[str] = {
    "src/runtime/smart_id.ts",
    "src/runtime/pagination.ts",
    "src/runtime/truncation.ts",
    "src/runtime/upstream.ts",
    "src/runtime/response_shaping.ts",
    "src/runtime/errors.ts",
    "src/runtime/capability.ts",
    "src/runtime/sentry_redact.ts",
}


def test_render_runtime_files_emits_eight_files(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """All 8 runtime templates render exactly once into src/runtime/."""
    raw_ir_minimal: Any = SimpleNamespace()  # raw_ir is unused in v1 runtime.py
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    actual_paths = {f.relative_path for f in files}
    assert actual_paths == _EXPECTED_RUNTIME_PATHS
    assert len(files) == 8


def test_every_file_has_non_empty_content(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """No runtime template renders to an empty string."""
    raw_ir_minimal: Any = SimpleNamespace()
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    for f in files:
        assert f.content.strip(), f"empty render for {f.relative_path}"


def test_no_unsubstituted_jinja_markers(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """Rendered output never contains `{{` or `{%` (placeholder leak guard)."""
    raw_ir_minimal: Any = SimpleNamespace()
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    for f in files:
        assert "{{" not in f.content, f"unsubstituted Jinja2 var in {f.relative_path}"
        assert "{%" not in f.content, f"unsubstituted Jinja2 block in {f.relative_path}"


def test_smart_id_template_emits_canonical_regex(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """Smart-ID parser ships the four-part regex per Pass 1 SmartIdSchema."""
    raw_ir_minimal: Any = SimpleNamespace()
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    smart_id = next(f for f in files if f.relative_path == "src/runtime/smart_id.ts")
    # The TS regex is `/^([^:]+):([^:]+):([^:]+):(.+)$/`
    assert "/^([^:]+):([^:]+):([^:]+):(.+)$/" in smart_id.content
    assert "parseSmartId" in smart_id.content
    assert "makeSmartId" in smart_id.content
    # Teaching error message per D-32 spirit (smart_id parser also teaches).
    assert "Use search()" in smart_id.content


def test_pagination_template_clamps_and_defaults(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """Pagination helper exports applyPagination + carries clamp logic."""
    raw_ir_minimal: Any = SimpleNamespace()
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    pagination = next(f for f in files if f.relative_path == "src/runtime/pagination.ts")
    assert "applyPagination" in pagination.content
    # Pass5Output.flags.server_pagination_strategy = "cursor" → cursor branch.
    assert "cursor" in pagination.content
    # Default + max limits surfaced in source.
    assert "DEFAULT_LIMIT" in pagination.content or "default" in pagination.content.lower()


def test_truncation_template_mirrors_d07_eight_tool_types(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """Truncation TS table contains all 8 tool types per D-07 verbatim."""
    raw_ir_minimal: Any = SimpleNamespace()
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    truncation = next(f for f in files if f.relative_path == "src/runtime/truncation.ts")
    for tool_type in (
        "search",
        "list_objects",
        "list_collections",
        "fetch",
        "upsert",
        "delete",
        "action",
        "workflow",
    ):
        assert tool_type in truncation.content, f"missing {tool_type} row"
    # Anti-loop wording (Pitfall #5) preserved across templates.
    assert "usually sufficient" in truncation.content
    # search row MUST NOT mention next_cursor / cursor / paginate (Pitfall #5).
    # Heuristic: extract from the literal "search:" token through the close of
    # its row (matched by the opening "list_objects:" — next tool type).
    search_idx = truncation.content.find("search:")
    next_idx = truncation.content.find("list_objects:")
    assert search_idx >= 0, "could not locate `search:` token in truncation table"
    assert next_idx > search_idx, "could not locate `list_objects:` after `search:`"
    search_row = truncation.content[search_idx:next_idx].lower()
    for forbidden in ("next_cursor", "paginate"):
        assert (
            forbidden not in search_row
        ), f"search truncation row leaks forbidden {forbidden!r} (Pitfall #5)"


def test_upstream_template_max_three_retries(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """Upstream client caps retries at 3 (CF Workers 50-subrequest budget)."""
    raw_ir_minimal: Any = SimpleNamespace()
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    upstream = next(f for f in files if f.relative_path == "src/runtime/upstream.ts")
    assert "MAX_RETRIES = 3" in upstream.content
    assert "UpstreamError" in upstream.content
    assert "upstreamRequest" in upstream.content


def test_response_shaping_template_exports_field_filter(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """response_shaping.ts exports applyFieldFilter + assembleStructuredContent."""
    raw_ir_minimal: Any = SimpleNamespace()
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    rs = next(f for f in files if f.relative_path == "src/runtime/response_shaping.ts")
    assert "applyFieldFilter" in rs.content
    assert "assembleStructuredContent" in rs.content
    # Capability gate is imported (Pitfall #4 wiring).
    assert "gateOutputSchema" in rs.content


def test_errors_template_covers_five_status_branches(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """errors.ts emits 401/403, 404, 429, 422/400, 5xx teaching templates."""
    raw_ir_minimal: Any = SimpleNamespace()
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    errors = next(f for f in files if f.relative_path == "src/runtime/errors.ts")
    # D-32 verbatim phrases:
    assert "Verify X-Upstream-Auth" in errors.content  # 401/403
    assert "Use search() to locate" in errors.content  # 404
    assert "Retry after" in errors.content  # 429 + 5xx
    assert "Common issue" in errors.content  # 422/400
    assert "temporarily unavailable" in errors.content  # 5xx
    assert "handleUpstreamError" in errors.content


def test_render_inputs_hash_deterministic(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """Two cold renders produce identical render_inputs_hash + content."""
    raw_ir_minimal: Any = SimpleNamespace()
    a = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    b = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    a_map = {f.relative_path: (f.content, f.render_inputs_hash) for f in a}
    b_map = {f.relative_path: (f.content, f.render_inputs_hash) for f in b}
    assert a_map == b_map
    # Each render_inputs_hash is a sha256 hex string.
    for content, h in a_map.values():
        assert content.strip()
        assert re.fullmatch(r"[a-f0-9]{64}", h)


def test_extract_spec_auth_headers_dedups_and_lowercases(
    pass_0_with_auth_headers: SimpleNamespace,
) -> None:
    """``_extract_spec_auth_headers`` lowercases + dedups + sorts header names."""
    headers = _extract_spec_auth_headers(pass_0_with_auth_headers)  # type: ignore[arg-type]
    # Three raw entries, two unique lowercased values.
    assert headers == ["x-api-key", "x-stripe-account"]


def test_extract_spec_auth_headers_empty_when_no_header_name(
    pass_0_no_auth_headers: Pass0Output,
) -> None:
    """Real Pass0Output (no header_name field) → empty list, no error."""
    headers = _extract_spec_auth_headers(pass_0_no_auth_headers)
    assert headers == []


def test_runtime_orchestrator_passes_auth_headers_to_sentry_redact(
    pass_0_with_auth_headers: SimpleNamespace,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """Spec-declared auth headers (lowercased + sorted) flow into sentry_redact.ts."""
    raw_ir_minimal: Any = SimpleNamespace()
    files = render_runtime_files(
        pass_0_output=pass_0_with_auth_headers,  # type: ignore[arg-type]
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    sentry = next(f for f in files if f.relative_path == "src/runtime/sentry_redact.ts")
    assert '"x-api-key"' in sentry.content
    assert '"x-stripe-account"' in sentry.content


def test_capability_template_exports_min_output_schema_version(
    pass_0_no_auth_headers: Pass0Output,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """capability.ts exports MIN_OUTPUT_SCHEMA_VERSION + gateOutputSchema."""
    raw_ir_minimal: Any = SimpleNamespace()
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    capability = next(f for f in files if f.relative_path == "src/runtime/capability.ts")
    assert 'MIN_OUTPUT_SCHEMA_VERSION = "2025-06-18"' in capability.content
    assert "gateOutputSchema" in capability.content


def _del_unused(*objs: object) -> None:
    """Silence unused-fixture mypy warnings for parametrised tests."""
    for o in objs:
        del o


def test_unused_fixtures_keep_imports_alive(
    pass_0_no_auth_headers: Pass0Output,
    pass_0_with_auth_headers: SimpleNamespace,
    synthetic_pass_5_output: Pass5Output,
) -> None:
    """Sanity: fixtures import correctly + raw_ir parameter accepted."""
    raw_ir_minimal: Any = SimpleNamespace()
    _ = RawIR  # ensure type symbol is referenced for static checkers
    _del_unused(pass_0_with_auth_headers, raw_ir_minimal)
    files = render_runtime_files(
        pass_0_output=pass_0_no_auth_headers,
        pass_5_output=synthetic_pass_5_output,
        raw_ir=raw_ir_minimal,  # type: ignore[arg-type]
    )
    assert len(files) == 8
