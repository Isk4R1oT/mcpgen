"""Stage E Phase 5 — per-tool-type handler renderer (CONTEXT D-31).

Renders one TypeScript file under ``src/tools/`` per FinalTool plus a
single ``src/tools/index.ts`` registry that wires every per-tool
``register{Pascal}`` function into the MCP server.

Dispatch table (Plan 04-10 must_haves verbatim, mirrors CONTEXT D-31):

    (tool.type, tool.universal_tool) → Jinja2 template name

    universal/search           → tool_search.ts.j2     (NO pagination hints — Pitfall #5)
    universal/fetch            → tool_fetch.ts.j2      (parseSmartId + routing-table lookup)
    universal/list_collections → tool_list_collections.ts.j2
    universal/list_objects     → tool_list_objects.ts.j2
    universal/upsert           → tool_upsert.ts.j2     (smart routing single vs batch)
    universal/delete           → tool_delete.ts.j2     (REQUIRES confirm=true)
    action / *                 → tool_action.ts.j2     (one render per action tool)
    workflow / *               → tool_workflow.ts.j2   (sequential + partial-failure aggregation)
    specialized / *            → tool_specialized.ts.j2

For ``Type.universal`` tools, the Pass 1 ``UniversalTool`` is encoded as
the FinalTool ``name`` per Six-Tool Pattern (`pass_3/__init__.py` reads
the same way). For non-universal tools, the second key element is
``None`` so the dispatch table collapses to one entry per tool family.

Every handler template emits MCP SDK v1 ``registerTool(name, config, cb)``
form (accepts ``outputSchema`` per ``mcp.d.ts:150-157``). The deprecated
5-arg ``server.tool(name, desc, schema, annotations, cb)`` overload was
removed by Plan 04-15 (D-4 drainage) because it silently drops
``outputSchema``. See ``docs/decisions/2026-04-29-stage-e-registertool-migration.md``.
Successful returns route through
``runtime/response_shaping.ts::assembleStructuredContent`` which gates
``structuredContent`` on the client ``protocolVersion`` (Pitfall #4 / D-24).
Errors route through ``runtime/errors.ts::handleUpstreamError`` which renders
the D-32 teaching error templates.

Source: CONTEXT D-31 / D-32 / D-50; RESEARCH §"Code Examples" Code
Example 7; PATTERNS `templates/tool_*.ts.j2` + `stages/stage_e/tools.py` rows.
"""

from __future__ import annotations

from typing import Any, Final

import structlog
from mcpgen_ir.types import FinalTool, Pass1Output, Type

from mcpgen_engine.stages.stage_e import StageEError
from mcpgen_engine.stages.stage_e.scaffold import GeneratedFile, _hash_render_inputs
from mcpgen_engine.stages.stage_e.template_loader import ENVIRONMENT

# CONTEXT D-31 dispatch table — frozen at import time.
# Key shape: (tool_type_value, universal_tool_or_none).
# For universal tools the second slot is the FinalTool name (which IS the
# canonical universal-tool identifier per Six-Tool Pattern).
# For non-universal tools (action / workflow / specialized) the second slot
# is None so each tool family maps to a single template.
_TEMPLATE_BY_TOOL_TYPE: Final[dict[tuple[str, str | None], str]] = {
    ("universal", "search"): "tool_search.ts.j2",
    ("universal", "fetch"): "tool_fetch.ts.j2",
    ("universal", "list_collections"): "tool_list_collections.ts.j2",
    ("universal", "list_objects"): "tool_list_objects.ts.j2",
    ("universal", "upsert"): "tool_upsert.ts.j2",
    ("universal", "delete"): "tool_delete.ts.j2",
    ("action", None): "tool_action.ts.j2",
    ("workflow", None): "tool_workflow.ts.j2",
    ("specialized", None): "tool_specialized.ts.j2",
}

_log = structlog.get_logger(__name__)


def _to_pascal(name: str) -> str:
    """snake_case → PascalCase (used for register{Pascal} function names).

    `charges_capture` → `ChargesCapture`. Empty parts are skipped so a
    trailing underscore (illegal per FinalTool.name regex but defensive)
    cannot produce a malformed identifier.
    """
    return "".join(part.capitalize() for part in name.split("_") if part)


def _to_title(name: str) -> str:
    """snake_case → "Title Case" (Pass 4 deterministic title generation).

    `charges_capture` → "Charges Capture". This mirrors Pass 4 D-31's
    deterministic title rule (Pass 4 LLM polish is a Pro post-MVP feature).
    """
    return " ".join(part.capitalize() for part in name.split("_") if part)


def _select_template(tool: FinalTool) -> str:
    """Resolve (tool_type, universal_tool) → template name via D-31 table.

    Raises ``StageEError`` if no template matches — this is a contract
    violation upstream (Pass 1 produced an unexpected ``Type`` value or a
    universal tool whose name is not one of the canonical Six-Tool Pattern
    identifiers).
    """
    tool_type_value = tool.type.value
    if tool.type == Type.universal:
        # Per Six-Tool Pattern, `tool.name` IS the canonical universal-tool
        # identifier (search / fetch / list_collections / list_objects /
        # upsert / delete). Pass 3 / 5 follow the same convention.
        key: tuple[str, str | None] = (tool_type_value, tool.name)
    else:
        key = (tool_type_value, None)
    if key not in _TEMPLATE_BY_TOOL_TYPE:
        raise StageEError(
            f"STAGE_E_TEMPLATE_ERROR: no handler template for tool_type={key!r} "
            f"(tool name={tool.name!r}); upstream Pass 1 contract violation"
        )
    return _TEMPLATE_BY_TOOL_TYPE[key]


def _build_tool_context(tool: FinalTool, register_function_name: str) -> dict[str, Any]:
    """Project FinalTool into the dict shape consumed by handler templates.

    Every value is JSON-serialisable so the render context can be sha256
    hashed deterministically (CONTEXT D-35 / D-36 cold/warm bit-identity).
    """
    annotations_dict = tool.annotations.model_dump()
    return {
        "tool": {
            "name": tool.name,
            "type": tool.type.value,
            "title": _to_title(tool.name),
            "description_text": tool.description.purpose,
            "input_schema": tool.inputSchema,
            "output_schema": tool.outputSchema,
            "annotations": annotations_dict,
            "source_endpoints": list(tool.source_endpoints),
            "response_config": tool.response_config.model_dump(),
        },
        "register_function_name": register_function_name,
    }


def render_tool_handler(tool: FinalTool, pass_1_output: Pass1Output) -> tuple[str, str, str]:
    """Render one per-tool-type handler.

    Returns ``(relative_path, content, template_name)``:

    - ``relative_path``  e.g. ``"src/tools/search.ts"``
    - ``content``        rendered TypeScript source
    - ``template_name``  e.g. ``"tool_search.ts.j2"``

    The ``pass_1_output`` is currently held in the signature for forward
    compatibility (action / workflow templates may surface routing-rule
    detail in a follow-up); v1 templates consume only the FinalTool's own
    fields plus the canonical runtime imports.
    """
    template_name = _select_template(tool)
    register_function_name = f"register{_to_pascal(tool.name)}"
    context = _build_tool_context(tool, register_function_name)

    # `pass_1_output` reserved for forward use — referenced here so callers
    # cannot pass nonsense and so static checkers see the value flow.
    _ = pass_1_output

    try:
        template = ENVIRONMENT.get_template(template_name)
        content = template.render(**context)
    except Exception as exc:  # Jinja2 UndefinedError, TemplateError
        raise StageEError(
            f"STAGE_E_TEMPLATE_ERROR: rendering {template_name} failed for tool "
            f"{tool.name!r}: {exc}"
        ) from exc

    relative_path = f"src/tools/{tool.name}.ts"
    return relative_path, content, template_name


def render_all_tool_handlers(
    final_tools: list[FinalTool],
    pass_1_output: Pass1Output,
) -> list[GeneratedFile]:
    """Render N per-tool TS files plus ``src/tools/index.ts`` registry.

    Returns ``len(final_tools) + 1`` ``GeneratedFile`` objects. Order:

    1. One per-tool file in input order (preserves Pass 5 ordering).
    2. ``src/tools/index.ts`` last — it imports every per-tool register
       function and exports ``registerAllTools(server)``.

    Raises ``StageEError`` on any Jinja2 ``StrictUndefined`` failure or
    on an unmapped (tool_type, universal_tool) pair.
    """
    files: list[GeneratedFile] = []
    index_entries: list[dict[str, str]] = []

    for tool in final_tools:
        relative_path, content, template_name = render_tool_handler(tool, pass_1_output)
        register_function_name = f"register{_to_pascal(tool.name)}"
        per_tool_inputs_hash = _hash_render_inputs(
            _build_tool_context(tool, register_function_name)
        )
        files.append(
            GeneratedFile(
                relative_path=relative_path,
                content=content,
                render_template=template_name,
                render_inputs_hash=per_tool_inputs_hash,
            )
        )
        index_entries.append({"name": tool.name, "register_function_name": register_function_name})

    # tools/index.ts registry — imports + registerAllTools dispatcher.
    index_context: dict[str, Any] = {"tools": index_entries}
    try:
        index_template = ENVIRONMENT.get_template("tools_index.ts.j2")
        index_content = index_template.render(**index_context)
    except Exception as exc:  # Jinja2 UndefinedError, TemplateError
        raise StageEError(
            f"STAGE_E_TEMPLATE_ERROR: rendering tools_index.ts.j2 failed: {exc}"
        ) from exc

    files.append(
        GeneratedFile(
            relative_path="src/tools/index.ts",
            content=index_content,
            render_template="tools_index.ts.j2",
            render_inputs_hash=_hash_render_inputs(index_context),
        )
    )

    _log.info(
        "stage_e.tools.render_complete",
        tool_count=len(final_tools),
        file_count=len(files),
    )
    return files


__all__ = [
    "_TEMPLATE_BY_TOOL_TYPE",
    "render_all_tool_handlers",
    "render_tool_handler",
]
