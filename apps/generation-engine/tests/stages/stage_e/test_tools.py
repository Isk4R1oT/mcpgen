"""Stage E Phase 5 — per-tool-type handler renderer tests (Plan 04-10 + 04-15).

Wave 0 RED tests for ``stages/stage_e/tools.py`` orchestrator and the
nine per-tool-type Jinja2 templates plus the ``tools_index.ts.j2``
registry rendered into ``src/tools/`` of the generated tenant Worker.

Coverage:

- Dispatch table ``_TEMPLATE_BY_TOOL_TYPE`` selects the correct template
  for every (tool_type, universal_tool) key (CONTEXT D-31).
- ``render_all_tool_handlers`` emits ``N + 1`` files (N per-tool plus
  ``src/tools/index.ts``) when given N FinalTools.
- Every rendered template uses the SDK v1 ``registerTool(name, config, cb)``
  form (Plan 04-15 D-4 drainage — canonical form that accepts outputSchema).
  The deprecated 5-arg ``server.tool(name, description, schema, annotations, cb)``
  overload is no longer used (it silently drops outputSchema).
- Every rendered template embeds ``outputSchema:`` in the registerTool config
  (the Pass 5-generated JSON Schema dict — non-optional per FinalTool type).
- ``tools/index.ts`` imports every per-tool register function and
  registers them in ``registerAllTools(server)``.
- ``tool_delete`` requires ``args.confirm === true`` per Pass 4
  ``destructiveHint=true`` invariant.
- Action and workflow templates instantiate one file per matching tool.
- Capability gating runs through ``assembleStructuredContent`` from
  ``runtime/response_shaping.ts`` (Pitfall #4 / D-24 wiring).

References:
- 04-CONTEXT.md D-31 (per-tool-type templates verbatim) + D-32 (errors)
  + D-04 (v1 SDK invariant — paraphrased in RESEARCH §"Code Examples").
- 04-RESEARCH.md Code Example 7 (`tool_fetch.ts.j2` shape).
- 04-PATTERNS.md `templates/tool_search.ts.j2` row + `tools.py` row.
"""

from __future__ import annotations

from mcpgen_ir.types import FinalTool, Pass1Output

from mcpgen_engine.stages.stage_e.scaffold import GeneratedFile
from mcpgen_engine.stages.stage_e.tools import (
    _TEMPLATE_BY_TOOL_TYPE,
    render_all_tool_handlers,
    render_tool_handler,
)

# ─────────────── Dispatch table tests (CONTEXT D-31) ───────────────


def test_template_by_tool_type_dispatch_search(
    final_tool_search: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """(universal, search) dispatches to tool_search.ts.j2."""
    relative_path, _content, template_name = render_tool_handler(
        final_tool_search, pass_1_output_handlers
    )
    assert template_name == "tool_search.ts.j2"
    assert relative_path == "src/tools/search.ts"


def test_template_by_tool_type_dispatch_fetch(
    final_tool_fetch: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """(universal, fetch) dispatches to tool_fetch.ts.j2."""
    relative_path, _content, template_name = render_tool_handler(
        final_tool_fetch, pass_1_output_handlers
    )
    assert template_name == "tool_fetch.ts.j2"
    assert relative_path == "src/tools/fetch.ts"


def test_template_by_tool_type_dispatch_list_collections(
    final_tool_list_collections: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """(universal, list_collections) dispatches to tool_list_collections.ts.j2."""
    _, _content, template_name = render_tool_handler(
        final_tool_list_collections, pass_1_output_handlers
    )
    assert template_name == "tool_list_collections.ts.j2"


def test_template_by_tool_type_dispatch_list_objects(
    final_tool_list_objects: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """(universal, list_objects) dispatches to tool_list_objects.ts.j2."""
    _, _content, template_name = render_tool_handler(
        final_tool_list_objects, pass_1_output_handlers
    )
    assert template_name == "tool_list_objects.ts.j2"


def test_template_by_tool_type_dispatch_upsert(
    final_tool_upsert: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """(universal, upsert) dispatches to tool_upsert.ts.j2."""
    _, _content, template_name = render_tool_handler(final_tool_upsert, pass_1_output_handlers)
    assert template_name == "tool_upsert.ts.j2"


def test_template_by_tool_type_dispatch_delete(
    final_tool_delete: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """(universal, delete) dispatches to tool_delete.ts.j2."""
    _, _content, template_name = render_tool_handler(final_tool_delete, pass_1_output_handlers)
    assert template_name == "tool_delete.ts.j2"


def test_template_by_tool_type_dispatch_action(
    final_tool_action: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """(action, None) dispatches to tool_action.ts.j2."""
    _, _content, template_name = render_tool_handler(final_tool_action, pass_1_output_handlers)
    assert template_name == "tool_action.ts.j2"


def test_template_by_tool_type_dispatch_workflow(
    final_tool_workflow: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """(workflow, None) dispatches to tool_workflow.ts.j2."""
    _, _content, template_name = render_tool_handler(final_tool_workflow, pass_1_output_handlers)
    assert template_name == "tool_workflow.ts.j2"


def test_template_by_tool_type_dispatch_specialized(
    final_tool_specialized: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """(specialized, None) dispatches to tool_specialized.ts.j2."""
    _, _content, template_name = render_tool_handler(final_tool_specialized, pass_1_output_handlers)
    assert template_name == "tool_specialized.ts.j2"


def test_template_by_tool_type_table_has_nine_entries() -> None:
    """Dispatch table covers all 9 tool-type combinations from D-31."""
    expected_keys: set[tuple[str, str | None]] = {
        ("universal", "search"),
        ("universal", "fetch"),
        ("universal", "list_collections"),
        ("universal", "list_objects"),
        ("universal", "upsert"),
        ("universal", "delete"),
        ("action", None),
        ("workflow", None),
        ("specialized", None),
    }
    assert set(_TEMPLATE_BY_TOOL_TYPE.keys()) == expected_keys


# ─────────── render_all_tool_handlers — emits N+1 files ──────────


def test_render_all_tool_handlers_emits_N_plus_one_files(
    final_tools_all_types: list[FinalTool],
    pass_1_output_handlers: Pass1Output,
) -> None:
    """N FinalTools → N per-tool files + 1 tools/index.ts (N+1 total)."""
    files = render_all_tool_handlers(final_tools_all_types, pass_1_output_handlers)
    n = len(final_tools_all_types)
    assert len(files) == n + 1
    paths = {f.relative_path for f in files}
    for tool in final_tools_all_types:
        assert f"src/tools/{tool.name}.ts" in paths
    assert "src/tools/index.ts" in paths


def test_render_all_tool_handlers_returns_generated_files(
    final_tools_all_types: list[FinalTool],
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Every entry is a GeneratedFile with non-empty content + provenance."""
    files = render_all_tool_handlers(final_tools_all_types, pass_1_output_handlers)
    for f in files:
        assert isinstance(f, GeneratedFile)
        assert f.content.strip(), f"empty content for {f.relative_path}"
        assert f.render_template.endswith(".j2")
        assert len(f.render_inputs_hash) == 64


# ───────── MCP SDK v1 registerTool invariant (Plan 04-15 D-4 drainage) ─────────
# The deprecated 5-arg ``server.tool(name, desc, schema, annotations, cb)``
# overload was replaced by ``server.registerTool(name, config, cb)`` in Plan
# 04-15. The config-object form is the canonical SDK v1 (1.6+) API that accepts
# ``outputSchema``. See docs/decisions/2026-04-29-stage-e-registertool-migration.md.


def test_every_handler_uses_v1_register_tool_config_form(
    final_tools_all_types: list[FinalTool],
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Every per-tool template uses ``server.registerTool(`` (canonical SDK v1 form).

    Plan 04-15 D-4 drainage: the deprecated 5-arg ``server.tool()`` overload
    was removed from all templates because it silently drops ``outputSchema``.
    ``registerTool(name, config, cb)`` is the canonical SDK v1 (1.6+) API.
    """
    files = render_all_tool_handlers(final_tools_all_types, pass_1_output_handlers)
    for f in files:
        if f.relative_path == "src/tools/index.ts":
            continue
        assert (
            "server.registerTool(" in f.content
        ), f"{f.relative_path} does not use SDK v1 registerTool(name, config, cb) syntax"


def test_no_handler_uses_deprecated_5arg_server_tool(
    final_tools_all_types: list[FinalTool],
    pass_1_output_handlers: Pass1Output,
) -> None:
    """No per-tool template uses the deprecated 5-arg ``server.tool()`` form.

    The deprecated overload silently drops outputSchema (D-4 root cause).
    All 9 templates must use ``server.registerTool(name, config, cb)`` form.
    """
    files = render_all_tool_handlers(final_tools_all_types, pass_1_output_handlers)
    for f in files:
        if f.relative_path == "src/tools/index.ts":
            continue
        # Only check non-comment lines — header comments may mention old form.
        non_comment_lines = [
            line for line in f.content.splitlines() if not line.lstrip().startswith("//")
        ]
        non_comment_content = "\n".join(non_comment_lines)
        assert "server.tool(" not in non_comment_content, (
            f"{f.relative_path} still uses deprecated 5-arg server.tool() form "
            "(D-4 regression: outputSchema would be silently dropped)"
        )


def test_render_tool_includes_outputschema_in_registertool_call(
    final_tool_fetch: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Rendered tool handler embeds ``outputSchema:`` inside the registerTool config.

    Plan 04-15 must_have: every rendered tool_*.ts contains the Pass 5
    outputSchema JSON Schema dict inline in the ``server.registerTool(name,
    { ..., outputSchema: <json>, ... }, cb)`` call site.
    """
    _, content, _ = render_tool_handler(final_tool_fetch, pass_1_output_handlers)
    assert "server.registerTool(" in content, "fetch handler does not use registerTool form"
    assert (
        "outputSchema:" in content
    ), "fetch handler does not embed outputSchema in registerTool config object"


# ───────── tools/index.ts registry ─────────


def test_tools_index_imports_all_tool_register_functions(
    final_tools_all_types: list[FinalTool],
    pass_1_output_handlers: Pass1Output,
) -> None:
    """tools/index.ts imports register{Pascal} for every tool + exports
    ``registerAllTools(server)``."""
    files = render_all_tool_handlers(final_tools_all_types, pass_1_output_handlers)
    index = next(f for f in files if f.relative_path == "src/tools/index.ts")
    assert "registerAllTools" in index.content
    # PascalCase register-function names — derived from snake_case tool name.
    expected_register_names: list[str] = [
        "registerSearch",
        "registerFetch",
        "registerListCollections",
        "registerListObjects",
        "registerUpsert",
        "registerDelete",
        "registerChargesCapture",
        "registerScheduleEvent",
        "registerAuditLogQuery",
    ]
    for name in expected_register_names:
        assert name in index.content, f"tools/index.ts missing import {name}"


def test_tools_index_imports_relative_paths(
    final_tools_all_types: list[FinalTool],
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Imports use relative `./{tool_name}.js` paths (CF Workers ESM)."""
    files = render_all_tool_handlers(final_tools_all_types, pass_1_output_handlers)
    index = next(f for f in files if f.relative_path == "src/tools/index.ts")
    for tool in final_tools_all_types:
        assert (
            f"./{tool.name}.js" in index.content
        ), f"tools/index.ts missing import path ./{tool.name}.js"


# ───────── Per-handler invariants ─────────


def test_tool_delete_requires_confirm_true(
    final_tool_delete: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """tool_delete handler short-circuits on `args.confirm !== true`
    per Pass 4 destructiveHint=true invariant."""
    _, content, _ = render_tool_handler(final_tool_delete, pass_1_output_handlers)
    assert "args.confirm !== true" in content
    assert "destructive" in content.lower()


def test_tool_fetch_uses_smart_id_parser(
    final_tool_fetch: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """tool_fetch imports parseSmartId from runtime/smart_id.js (D-31)."""
    _, content, _ = render_tool_handler(final_tool_fetch, pass_1_output_handlers)
    assert "parseSmartId" in content
    assert "../runtime/smart_id" in content


def test_action_handler_one_file_per_action_tool(
    final_tool_action: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Each action tool renders ONE TS file under src/tools/<name>.ts."""
    relative_path, content, template_name = render_tool_handler(
        final_tool_action, pass_1_output_handlers
    )
    assert relative_path == f"src/tools/{final_tool_action.name}.ts"
    assert template_name == "tool_action.ts.j2"
    # Action handler uses registerTool (canonical SDK v1 form per Plan 04-15).
    assert "server.registerTool(" in content


def test_workflow_handler_one_file_per_workflow_tool(
    final_tool_workflow: FinalTool,
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Each workflow tool renders ONE TS file under src/tools/<name>.ts."""
    relative_path, content, template_name = render_tool_handler(
        final_tool_workflow, pass_1_output_handlers
    )
    assert relative_path == f"src/tools/{final_tool_workflow.name}.ts"
    assert template_name == "tool_workflow.ts.j2"
    # Conservative aggregation message — failures surface partial state.
    assert "partial" in content.lower() or "step" in content.lower()


# ───────── Capability gate / response shaping wiring ─────────


def test_every_handler_uses_assemble_structured_content(
    final_tools_all_types: list[FinalTool],
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Every successful return path uses assembleStructuredContent (D-24)."""
    files = render_all_tool_handlers(final_tools_all_types, pass_1_output_handlers)
    for f in files:
        if f.relative_path == "src/tools/index.ts":
            continue
        assert "assembleStructuredContent" in f.content, (
            f"{f.relative_path} does not gate structuredContent via the " "Pitfall #4 / D-24 helper"
        )


def test_every_handler_imports_handle_upstream_error(
    final_tools_all_types: list[FinalTool],
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Every handler routes thrown errors through handleUpstreamError
    (CONTEXT D-32 teaching error templates)."""
    files = render_all_tool_handlers(final_tools_all_types, pass_1_output_handlers)
    for f in files:
        if f.relative_path == "src/tools/index.ts":
            continue
        assert (
            "handleUpstreamError" in f.content
        ), f"{f.relative_path} does not wire D-32 teaching error templates"


# ───────── Determinism / hash stability ─────────


def test_render_inputs_hash_is_64_hex_chars(
    final_tools_all_types: list[FinalTool],
    pass_1_output_handlers: Pass1Output,
) -> None:
    """Every GeneratedFile carries a sha256-hex render_inputs_hash."""
    files = render_all_tool_handlers(final_tools_all_types, pass_1_output_handlers)
    for f in files:
        assert len(f.render_inputs_hash) == 64
        int(f.render_inputs_hash, 16)  # raises if not pure hex
