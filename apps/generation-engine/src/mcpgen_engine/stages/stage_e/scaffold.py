"""Stage E Phase 1 — Scaffold (project-level Jinja2 templates).

Renders the 9 project-level scaffold files via Jinja2 templates from
``packages/codegen-templates/templates/``:

- ``package.json``       — Cloudflare Worker package manifest with pinned deps
- ``wrangler.toml``      — Worker config (KV bindings, vars, compat date)
- ``tsconfig.json``      — self-contained TS compiler config (no monorepo extends)
- ``README.md``          — generated server quickstart + Claude Desktop config
- ``.mcpgen.yaml``       — project config consumed by Phase 8 Drift Watcher
- ``.gitignore``         — Node.js + CF Workers ignores
- ``src/index.ts``       — Worker entry (`withSentry` wrapping per @sentry/cloudflare 10)
- ``src/server.ts``      — MCP server bootstrap (SDK v1 ``server.tool(...)``)
- ``src/config.ts``      — server name template + ALLOWED_HOSTS + protocol version

The orchestrator (Plan 04-11 ships ``run()``) calls ``render_scaffold_files()``
in Stage E phase 1 to produce the ``GeneratedFile`` list, then hands them to
``output_writer.write_files_atomically()``.

Source: 04-CONTEXT.md D-17 (file tree) + D-29 (.mcpgen.yaml fields).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Final, Literal

import structlog
from mcpgen_ir.types import (
    Pass0Output,
    Pass1Output,
    RawIR,
)
from pydantic import BaseModel, ConfigDict

from mcpgen_engine.stages.stage_e import StageEError
from mcpgen_engine.stages.stage_e.template_loader import ENVIRONMENT

AuthMode = Literal["passthrough", "stored", "oauth", "none"]

_log = structlog.get_logger(__name__)

# Filename → Jinja2 template name table (CONTEXT D-17 + D-18 project-level 9).
# `.mcpgen.yaml` and `.gitignore` use the `.j2` extension on a different name
# (`mcpgen.yaml.j2`, `gitignore.j2`) because dotfile names are awkward in
# git-tracked template directories.
_SCAFFOLD_TEMPLATES: Final[tuple[tuple[str, str], ...]] = (
    ("package.json", "package.json.j2"),
    ("wrangler.toml", "wrangler.toml.j2"),
    ("tsconfig.json", "tsconfig.json.j2"),
    ("README.md", "README.md.j2"),
    (".mcpgen.yaml", "mcpgen.yaml.j2"),
    (".gitignore", "gitignore.j2"),
    ("src/index.ts", "index.ts.j2"),
    ("src/server.ts", "server.ts.j2"),
    ("src/config.ts", "config.ts.j2"),
)


class GeneratedFile(BaseModel):
    """Intermediate Stage E representation of a single rendered file.

    Carries enough provenance (`render_template`, `render_inputs_hash`) for
    ``output_writer.write_files_atomically()`` to populate ``StageEManifest``
    deterministically.
    """

    model_config = ConfigDict(extra="forbid")

    relative_path: str
    content: str
    render_template: str
    render_inputs_hash: str  # sha256 of canonical-JSON render context


def _hash_render_inputs(context: dict[str, Any]) -> str:
    """Deterministic sha256 of the render context.

    Used by the L2 cache (CONTEXT D-35) AND by ``StageEManifest`` per-file
    provenance (CONTEXT D-34) so cold and warm runs produce bit-identical
    manifests except for ``.mcpgen.yaml`` `generated_at` per CONTEXT D-36.
    """
    canonical = json.dumps(context, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _build_pipeline_versions(versions: dict[str, str]) -> dict[str, str]:
    """Validate the seven required pipeline-version keys (CONTEXT D-29).

    Pre-condition: every key (`pass_0`..`pass_5` + `stage_e`) is non-empty.
    Raises ``StageEError`` with stable code if a key is missing or empty.
    """
    expected = ("pass_0", "pass_1", "pass_2", "pass_3", "pass_4", "pass_5", "stage_e")
    missing = [k for k in expected if not versions.get(k)]
    if missing:
        raise StageEError(f"STAGE_E_TEMPLATE_ERROR: pipeline_versions missing keys: {missing}")
    return {k: versions[k] for k in expected}


def render_scaffold_files(
    spec_slug: str,
    auth_mode: AuthMode,
    pass_0_output: Pass0Output,
    pass_1_output: Pass1Output,
    raw_ir: RawIR,
    pipeline_versions: dict[str, str],
    engine_version: str,
    spec_url: str,
    spec_hash: str,
    generated_at: str,
    upstream_base_url: str,
    tool_count: int,
    dev_local: bool = False,
) -> list[GeneratedFile]:
    """Render the 9 project-level scaffold files.

    All parameters are explicit (CLAUDE.md global rule: "no default parameter
    values — make all parameters explicit"). Pre-conditions:

    - ``spec_slug`` matches Pass 1 server-name slug (e.g. ``"stripe"``).
    - ``auth_mode`` ∈ {"passthrough", "stored", "oauth"}.
    - ``pipeline_versions`` carries all seven required keys.
    - ``generated_at`` is ISO-8601 UTC; the ONE field allowed to differ
      between cold and warm L1 runs (CONTEXT D-36).
    - ``spec_hash`` is sha256(canonical_spec_json) — already computed by
      Stage A.

    Raises ``StageEError`` (`STAGE_E_TEMPLATE_ERROR`) on Jinja2
    ``UndefinedError`` (StrictUndefined) — every render-context variable that
    a template references must be present.
    """
    if auth_mode not in ("passthrough", "stored", "oauth", "none"):
        raise StageEError(f"STAGE_E_TEMPLATE_ERROR: invalid auth_mode {auth_mode!r}")
    if tool_count < 0:
        raise StageEError(f"STAGE_E_TEMPLATE_ERROR: tool_count must be >= 0, got {tool_count}")

    pipeline_versions_validated = _build_pipeline_versions(pipeline_versions)

    # del unused refs: pass_0_output / pass_1_output / raw_ir reserved for Plans
    # 04-07/04-08/04-10 (schemas / runtime / per-tool handlers) — Phase 1 only
    # consumes their counts/identities at the project-scaffold level.
    del pass_0_output, pass_1_output, raw_ir

    # dev_local mode (Plan 04-14 D-3): substitute the {tenant_short_id}
    # placeholder with "local" at codegen time so standalone `wrangler dev`
    # works without Phase 6 dispatch substitution.
    # Production builds (dev_local=False) keep the literal {tenant_short_id}
    # placeholder so Phase 6 can substitute the real tenant prefix at deploy
    # time (CONTEXT D-25 — Pitfall #30 mitigation).
    if dev_local:
        tenant_short_id_placeholder = "local"
        extra_allowed_hosts: list[str] = [
            "localhost:8787",
            "127.0.0.1:8787",
            "localhost",
            "127.0.0.1",
        ]
        _log.warning(
            "stage_e.scaffold.dev_local_build",
            spec_slug=spec_slug,
            allowed_hosts=[f"local-{spec_slug}.mcpgen.dev", *extra_allowed_hosts],
        )
    else:
        tenant_short_id_placeholder = "{tenant_short_id}"
        extra_allowed_hosts = []

    context: dict[str, Any] = {
        "spec_slug": spec_slug,
        "auth_mode": auth_mode,
        "spec_url": spec_url,
        "spec_hash": spec_hash,
        "generated_at": generated_at,
        "engine_version": engine_version,
        "pipeline_versions": pipeline_versions_validated,
        "upstream_base_url": upstream_base_url,
        "mcp_protocol_version": "2025-06-18",
        "tool_count": tool_count,
        # Phase 6 substitutes the `{tenant_short_id}` placeholder at deploy time
        # (CONTEXT D-25 — Pitfall #30 mitigation). Phase 4 emits the literal.
        # dev_local=True substitutes "local" here instead (Plan 04-14 D-3).
        "tenant_short_id_placeholder": tenant_short_id_placeholder,
        # Extra ALLOWED_HOSTS for dev-local mode only (Plan 04-14 D-3).
        # Empty list when dev_local=False — config.ts.j2 Jinja2 loop skips it.
        "extra_allowed_hosts": extra_allowed_hosts,
    }

    # Hash the render context once — every file in this scaffold pass derives
    # from the same context, so they share `render_inputs_hash` (cheap dedup
    # signal for the L2 cache).
    inputs_hash = _hash_render_inputs(context)

    files: list[GeneratedFile] = []
    for relative_path, template_name in _SCAFFOLD_TEMPLATES:
        try:
            template = ENVIRONMENT.get_template(template_name)
            content = template.render(context)
        except Exception as exc:  # Jinja2 raises UndefinedError, TemplateError
            raise StageEError(
                f"STAGE_E_TEMPLATE_ERROR: rendering {template_name} failed: {exc}"
            ) from exc
        files.append(
            GeneratedFile(
                relative_path=relative_path,
                content=content,
                render_template=template_name,
                render_inputs_hash=inputs_hash,
            )
        )

    return files


__all__ = ["AuthMode", "GeneratedFile", "render_scaffold_files"]
