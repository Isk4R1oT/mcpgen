"""Stage E Phase 3 — runtime/ tree renderer with auth-header injection.

Renders the 8 runtime helper files into ``src/runtime/`` via Jinja2
templates from ``packages/codegen-templates/templates/``:

- ``smart_id.ts``         — four-part smart-ID parser/builder
- ``pagination.ts``       — clamp + defaults per Pass 5 strategy flag
- ``truncation.ts``       — D-07 frozen table mirrored from Pass 5 templates.py
- ``upstream.ts``         — hand-rolled fetch + bounded exponential retry
- ``response_shaping.ts`` — field filter + capability-gated structuredContent
- ``errors.ts``           — D-32 teaching error templates (5 status branches)
- ``capability.ts``       — Pitfall #4 (D-24): outputSchema gate by protocolVersion
- ``sentry_redact.ts``    — Pitfall #12 (D-23): Sentry beforeSend redaction

The orchestrator (Plan 04-11 ships ``run()``) calls
``render_runtime_files()`` in Stage E phase 3 to produce the
``GeneratedFile`` list, then hands them to
``output_writer.write_files_atomically()``.

**Auth-header injection (Pitfall #12 mitigation):** the spec-declared auth
headers from ``Pass0Output.auth_requirements[*].header_name`` are extracted,
lowercased, deduplicated, and sorted into the ``auth_headers`` Jinja2
context variable consumed by ``sentry_redact.ts.j2``'s
``REDACT_HEADERS`` Set. The current ``packages/ir/python/types.py``
``AuthRequirement1`` model does NOT carry ``header_name`` (forward-looking
IR extension for Phase 7+); this implementation reads it via ``getattr``
so the engine works today (returns ``[]``) and will pick up spec-declared
headers automatically once the IR is extended.

Source: 04-CONTEXT.md D-23 + D-24 + D-32; 04-RESEARCH.md §"Code Examples"
Pattern 3 + Pattern 5; Plan 04-08 truths block.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Final

import structlog
from mcpgen_ir.types import Pass0Output, Pass5Output, RawIR

from mcpgen_engine.stages.stage_e import StageEError
from mcpgen_engine.stages.stage_e.scaffold import GeneratedFile
from mcpgen_engine.stages.stage_e.template_loader import ENVIRONMENT

_log = structlog.get_logger(__name__)

# Per CONTEXT D-23: top-level body keys universally redacted regardless of
# spec. Pitfall #12 mitigation — credentials commonly land in these fields.
_REDACT_BODY_KEYS: Final[tuple[str, ...]] = (
    "password",
    "secret",
    "api_key",
    "apikey",
    "token",
    "client_secret",
)

# Filename → Jinja2 template name table for the 8 runtime helpers.
_RUNTIME_TEMPLATES: Final[tuple[tuple[str, str], ...]] = (
    ("src/runtime/smart_id.ts", "smart_id.ts.j2"),
    ("src/runtime/pagination.ts", "pagination.ts.j2"),
    ("src/runtime/truncation.ts", "truncation.ts.j2"),
    ("src/runtime/upstream.ts", "upstream.ts.j2"),
    ("src/runtime/response_shaping.ts", "response_shaping.ts.j2"),
    ("src/runtime/errors.ts", "errors.ts.j2"),
    ("src/runtime/capability.ts", "capability.ts.j2"),
    ("src/runtime/sentry_redact.ts", "sentry_redact.ts.j2"),
)


def _hash_render_inputs(context: dict[str, Any]) -> str:
    """Deterministic sha256 of the render context (mirrors scaffold.py)."""
    canonical = json.dumps(context, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _extract_spec_auth_headers(pass_0_output: Pass0Output) -> list[str]:
    """Lowercase + dedup + sort spec-declared auth header names.

    Per CONTEXT D-23: the spec-declared ``securitySchemes`` may surface
    custom auth header names (e.g. ``X-API-Key``, ``X-Stripe-Account``)
    that must land in ``REDACT_HEADERS`` so Sentry events strip them.

    Reads ``pass_0_output.auth_requirements[endpoint_id]`` (Dict[str,
    List[AuthRequirement]]) and pulls ``header_name`` from each
    requirement via ``getattr``. The current IR's ``AuthRequirement1``
    does NOT carry ``header_name`` (Phase 7+ extension); this returns
    ``[]`` for the current schema and picks up headers automatically
    once the IR is extended.
    """
    names: set[str] = set()
    auth_reqs = getattr(pass_0_output, "auth_requirements", None)
    if not auth_reqs:
        return []
    for reqs in auth_reqs.values():
        if not reqs:
            continue
        for req in reqs:
            hn = getattr(req, "header_name", None)
            if hn is not None and isinstance(hn, str) and hn:
                names.add(hn.lower())
    return sorted(names)


def _resolve_pagination_strategy(pass_5_output: Pass5Output) -> str:
    """Read ``flags.server_pagination_strategy`` with a "none" default."""
    flags = getattr(pass_5_output, "flags", None)
    if flags is None:
        return "none"
    if not isinstance(flags, dict):
        return "none"
    raw = flags.get("server_pagination_strategy", "none")
    return str(raw) if raw is not None else "none"


def render_runtime_files(
    pass_0_output: Pass0Output,
    pass_5_output: Pass5Output,
    raw_ir: RawIR,
) -> list[GeneratedFile]:
    """Render the 8 runtime helper files.

    Pre-conditions:
      - ``pass_0_output`` carries ``auth_requirements`` (used for
        spec-declared auth-header extraction).
      - ``pass_5_output.flags.server_pagination_strategy`` ∈
        ``{"cursor", "offset", "page-number", "none"}`` (per CONTEXT D-08).
      - ``raw_ir`` is reserved for future per-tool runtime customisation
        (Plan 04-10) — not consumed in v1 runtime/ rendering.

    Raises ``StageEError`` (`STAGE_E_TEMPLATE_ERROR`) on any Jinja2
    ``UndefinedError`` (StrictUndefined) — every render-context variable
    that a template references must be present.
    """
    auth_headers = _extract_spec_auth_headers(pass_0_output)
    pagination_strategy = _resolve_pagination_strategy(pass_5_output)

    # raw_ir is plumbed through for forward-compat; v1 runtime/ rendering
    # is universal across tools (per-tool customisation lands in Plan 04-10).
    del raw_ir

    context: dict[str, Any] = {
        "auth_headers": auth_headers,
        "pagination_strategy": pagination_strategy,
        "redact_body_keys": list(_REDACT_BODY_KEYS),
    }
    inputs_hash = _hash_render_inputs(context)

    files: list[GeneratedFile] = []
    for relative_path, template_name in _RUNTIME_TEMPLATES:
        try:
            template = ENVIRONMENT.get_template(template_name)
            content = template.render(context)
        except Exception as exc:
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

    _log.info(
        "stage_e.runtime.render_complete",
        file_count=len(files),
        spec_auth_header_count=len(auth_headers),
        pagination_strategy=pagination_strategy,
    )
    return files


__all__ = ["render_runtime_files"]
