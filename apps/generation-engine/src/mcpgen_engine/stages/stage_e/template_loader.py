"""Stage E — Jinja2 ``Environment`` singleton (CONTEXT D-19).

Single module-level ``Final[Environment]`` shared by every Stage E phase
(scaffold, schemas, runtime, auth, tools, validate). Constructed once at import
time so each phase pays the FileSystemLoader scan cost only once.

Configuration rationale:

- ``loader=FileSystemLoader(packages/codegen-templates/templates)`` —
  templates live in a dedicated workspace package (CONTEXT D-16) so the
  `tsc --noEmit` pre-warmed `node_modules` (CONTEXT D-39) sits next to the
  templates without colliding with the engine source tree.
- ``undefined=StrictUndefined`` — any missing render-context variable raises
  immediately. Rendering 25-30 files with silent `None` substitutions would
  produce a broken tenant Worker; failing fast surfaces the bug at the engine
  boundary (T-04-06-template-injection mitigation).
- ``autoescape=False`` — templates emit TypeScript / TOML / JSON / Markdown
  source code, NOT HTML. Auto-escaping would double-escape backslashes and
  break source-code emission. Per `tojson` filter usage in the templates,
  user-controlled spec data flowing into TS string literals is rendered via
  ``{{ value | tojson }}`` (Jinja2 first-party filter) which produces a
  JSON-escaped string literal — safe against TS-string-injection without
  needing a global autoescape.
- ``keep_trailing_newline=True`` + ``trim_blocks=True`` + ``lstrip_blocks=True``
  — render bytes-deterministic output suitable for sha256 hashing in
  ``StageEManifest`` (GEN-12 cold/warm bit-identity contract; CONTEXT D-36).
- Custom filter ``json_schema_to_zod`` — converts a Pass 5 JSON Schema dict
  to inline TypeScript Zod source code (e.g. ``z.object({id: z.string()})``).
  Required because ``McpServer.registerTool``'s ``outputSchema`` field is typed
  as ``ZodRawShapeCompat | AnySchema`` (both are Zod types) — a plain JS object
  literal fails both TypeScript compilation and the SDK's runtime
  ``getZodSchemaObject`` guard (which throws for non-Zod values). The filter
  converts JSON Schema → Zod so the emitted TypeScript compiles clean and the
  SDK serialises the schema correctly into ``tools/list`` responses.

References:
- 04-CONTEXT.md D-19 (module layout)
- 04-PATTERNS.md `stages/stage_e/template_loader.py` row
- packages/codegen-templates/templates/  (Jinja2 templates location)
- docs/decisions/2026-04-29-stage-e-registertool-migration.md  (D-4 drainage)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Final

from jinja2 import Environment, FileSystemLoader, StrictUndefined


def _json_schema_to_zod(schema: dict[str, Any], depth: int = 0) -> str:
    """Convert a JSON Schema dict to an inline TypeScript Zod expression.

    Supports the subset of JSON Schema types emitted by Pass 5:
      string, number, integer, boolean, null, object (with/without properties),
      array (with/without items).

    Returns a valid TypeScript expression such as::

        z.object({ id: z.string(), score: z.number() }).passthrough()
        z.array(z.object({ id: z.string() }))
        z.unknown()

    Falls back to ``z.unknown()`` for any unrecognised schema shape.
    Recursion is guarded by ``depth`` — deeper than 8 levels always falls back
    to ``z.unknown()`` to prevent stack overflow on pathological specs.
    """
    if not isinstance(schema, dict) or depth > 8:
        return "z.unknown()"

    json_type = schema.get("type")

    if json_type == "string":
        return "z.string()"
    if json_type in ("number", "integer"):
        return "z.number()"
    if json_type == "boolean":
        return "z.boolean()"
    if json_type == "null":
        return "z.null()"

    if json_type == "array":
        items = schema.get("items")
        if isinstance(items, dict):
            return f"z.array({_json_schema_to_zod(items, depth + 1)})"
        return "z.array(z.unknown())"

    if json_type == "object":
        properties = schema.get("properties")
        if not isinstance(properties, dict) or not properties:
            # No properties — open record type.
            return "z.record(z.string(), z.unknown())"
        fields = ", ".join(
            f"{k}: {_json_schema_to_zod(v, depth + 1)}" for k, v in properties.items()
        )
        # passthrough() so extra upstream fields don't cause Zod validation
        # failures in the MCP runtime when the upstream API adds new fields.
        return f"z.object({{{fields}}}).passthrough()"

    # oneOf / anyOf / allOf or unknown type — safe fallback.
    if "oneOf" in schema or "anyOf" in schema or "allOf" in schema:
        return "z.unknown()"

    return "z.unknown()"


# Path resolution from this file:
#   parents[0] = stage_e/
#   parents[1] = stages/
#   parents[2] = mcpgen_engine/
#   parents[3] = src/
#   parents[4] = apps/generation-engine/
#   parents[5] = apps/
#   parents[6] = repo root
# parents[6] is the repo root; templates live at
# `packages/codegen-templates/templates/`.
#
# Docker / Fly override: when the engine runs in a container the source tree
# is collapsed under /app and parents[6] doesn't reach the repo root. Set
# MCPGEN_TEMPLATES_DIR to the absolute templates directory (e.g.
# /pkgs/codegen-templates/templates) to bypass the parents-walk entirely.
def _resolve_templates_dir() -> Path:
    override = os.environ.get("MCPGEN_TEMPLATES_DIR")
    if override is not None and override.strip():
        return Path(override).resolve()
    return Path(__file__).resolve().parents[6] / "packages" / "codegen-templates" / "templates"


_TEMPLATES_DIR: Final[Path] = _resolve_templates_dir()

# S701 (autoescape=False can lead to XSS) is intentionally suppressed at the
# attribute level below — Stage E emits TypeScript / TOML / JSON / Markdown
# SOURCE CODE, not HTML. Auto-escaping would double-escape backslashes and
# break codegen. The rationale is documented in the module docstring above;
# user-controlled spec data flowing into rendered TS string literals is
# JSON-escaped via the explicit `| tojson` filter at each Jinja2 substitution
# site.
ENVIRONMENT: Final[Environment] = Environment(
    loader=FileSystemLoader(_TEMPLATES_DIR),
    autoescape=False,  # noqa: S701 — see docstring; Stage E emits source code, not HTML
    undefined=StrictUndefined,
    keep_trailing_newline=True,
    trim_blocks=True,
    lstrip_blocks=True,
)

# Register the JSON Schema → Zod converter as a Jinja2 filter so templates
# can emit type-safe Zod expressions for outputSchema fields:
#   outputSchema: {{ tool.output_schema | json_schema_to_zod }},
ENVIRONMENT.filters["json_schema_to_zod"] = _json_schema_to_zod
