"""Stage E Phase 2 — schemas/ tree renderer.

Renders the three TypeScript files under ``src/schemas/`` of the generated
tenant Worker:

- ``src/schemas/inputs.ts`` — per-tool Zod input schemas with ``.strict()``
  (mirrors Pass 3's ``additionalProperties: false`` contract).
- ``src/schemas/outputs.ts`` — Pitfall #33 dual-export per CONTEXT D-26 / D-55:
  ``richSchemas`` (named, format strings retained) AND ``default`` export
  (conservative, ``stripFormat()`` strips ``format``/``pattern`` keys).
- ``src/schemas/routing.ts`` — Pass 1 routing rules → ``RoutingEntry`` table
  consumed by per-tool handlers (plan 04-10).

The orchestrator (``run()`` ships in plan 04-11) calls ``render_schema_files``
during Stage E phase 2 and forwards the resulting ``GeneratedFile`` list to
``output_writer.write_files_atomically``.

References:
- 04-CONTEXT.md D-26 / D-55 (Pitfall #33 dual-export)
- 04-RESEARCH.md §"Pattern 6: Zod 4 Conservative-Format Fallback" / Code Example 6
- 04-PATTERNS.md `templates/inputs.ts.j2` / `outputs.ts.j2` / `routing.ts.j2`
- packages/ir/python/types.py (``FinalTool`` / ``Pass1Output`` / ``Routing``)
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from mcpgen_ir.types import FinalTool, Pass1Output

from mcpgen_engine.stages.stage_e import StageEError
from mcpgen_engine.stages.stage_e.scaffold import GeneratedFile
from mcpgen_engine.stages.stage_e.template_loader import ENVIRONMENT


def _hash_render_inputs(context: dict[str, Any]) -> str:
    """Deterministic sha256 of the render context (matches scaffold.py)."""
    canonical = json.dumps(context, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _split_endpoint(target_endpoint: str) -> tuple[str, str]:
    """Split a Pass 1 ``"<METHOD> <path>"`` token into ``(method, path)``.

    Pre-condition: every Pass 1 ``Rule.target_endpoint`` string is the
    canonical ``"GET /v1/charges"`` form (method, single space, path). Raises
    ``StageEError`` (`STAGE_E_TEMPLATE_ERROR`) if the format is malformed —
    this would be a contract violation upstream of Stage E.
    """
    parts = target_endpoint.split(" ", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise StageEError(
            f"STAGE_E_TEMPLATE_ERROR: malformed target_endpoint {target_endpoint!r}; "
            f"expected '<METHOD> <path>'"
        )
    method, path = parts
    return method, path


def _build_tool_payloads(final_tools: list[FinalTool]) -> list[dict[str, Any]]:
    """Project FinalTool list into the dict shape consumed by the templates.

    Each payload retains only the fields the templates reference: ``name``,
    ``type``, ``input_schema``, ``output_schema``, ``source_endpoints``. We
    project to dicts so the render context is JSON-serialisable for the
    deterministic ``render_inputs_hash``.
    """
    payloads: list[dict[str, Any]] = []
    for tool in final_tools:
        payloads.append(
            {
                "name": tool.name,
                "type": tool.type.value,
                "input_schema": tool.inputSchema,
                "output_schema": tool.outputSchema,
                "source_endpoints": list(tool.source_endpoints),
            }
        )
    return payloads


def _build_routing_payloads(pass_1_output: Pass1Output) -> list[dict[str, Any]]:
    """Project Pass1Output.routing.rules into the routing-template payload.

    Each rule contributes one ``RoutingEntry`` row keyed
    ``<universal_tool>:<target_endpoint>``. The ``method`` / ``path`` split is
    derived from ``target_endpoint`` so the template emits ``method:`` and
    ``path:`` as separate fields (the per-tool handlers in plan 04-10 build
    the upstream URL by interpolating ``path`` with ``params_mapping``).
    """
    payloads: list[dict[str, Any]] = []
    for rule in pass_1_output.routing.rules:
        method, path = _split_endpoint(rule.target_endpoint)
        payloads.append(
            {
                "universal_tool": rule.universal_tool.value,
                "target_endpoint": rule.target_endpoint,
                "method": method,
                "path": path,
                "params_mapping": dict(rule.params_mapping),
            }
        )
    return payloads


def render_schema_files(
    final_tools: list[FinalTool],
    pass_1_output: Pass1Output,
) -> list[GeneratedFile]:
    """Render the three schemas/ files.

    Returns three ``GeneratedFile`` instances in fixed order (inputs, outputs,
    routing). Every render context is JSON-serialised + sha256-hashed for the
    ``render_inputs_hash`` field — guarantees the same input always produces
    the same hash (cache-key invariant per CONTEXT D-35 / D-36).

    Raises ``StageEError`` (`STAGE_E_TEMPLATE_ERROR`) on Jinja2
    ``UndefinedError`` (StrictUndefined) or malformed Pass 1 routing rules.
    """
    tool_payloads = _build_tool_payloads(final_tools)
    routing_rules = _build_routing_payloads(pass_1_output)
    smart_id = pass_1_output.routing.smart_id.model_dump()

    context_inputs = {"final_tools": tool_payloads}
    context_outputs = {"final_tools": tool_payloads}
    context_routing = {
        "pass_1_routing_rules": routing_rules,
        "smart_id": smart_id,
    }

    template_specs: tuple[tuple[str, str, dict[str, Any]], ...] = (
        ("src/schemas/inputs.ts", "inputs.ts.j2", context_inputs),
        ("src/schemas/outputs.ts", "outputs.ts.j2", context_outputs),
        ("src/schemas/routing.ts", "routing.ts.j2", context_routing),
    )

    files: list[GeneratedFile] = []
    for relative_path, template_name, context in template_specs:
        try:
            template = ENVIRONMENT.get_template(template_name)
            content = template.render(**context)
        except Exception as exc:  # Jinja2 raises UndefinedError, TemplateError
            raise StageEError(
                f"STAGE_E_TEMPLATE_ERROR: rendering {template_name} failed: {exc}"
            ) from exc
        files.append(
            GeneratedFile(
                relative_path=relative_path,
                content=content,
                render_template=template_name,
                render_inputs_hash=_hash_render_inputs(context),
            )
        )

    return files


__all__ = ["render_schema_files"]
