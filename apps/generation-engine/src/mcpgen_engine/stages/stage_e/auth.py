"""Stage E Phase 4 — auth middleware + credentials renderer (3 modes).

Renders exactly two files per Stage E run:

- ``src/auth/middleware.ts``  (rendered from ``auth_middleware.ts.j2``)
- ``src/auth/credentials.ts`` (rendered from ``auth_credentials.ts.j2``)

The rendered shape is gated by ``auth_mode`` ∈ {"passthrough", "stored",
"oauth"}; the Jinja2 templates carry one conditional branch per mode.

Mode selection lives in :func:`select_auth_mode` (deterministic, no LLM)
which walks every endpoint's ``auth_requirements`` and applies the Phase 2
D-22 mapping verbatim:

- Any ``oauth2`` requirement → ``oauth`` (oauth wins over stored even when
  the spec mixes both — the worker handles the harder case).
- Any ``aws_signature`` requirement → ``stored`` (HMAC needs a per-tenant
  DEK).
- Anything else (``apiKey``, ``http_basic``, ``http_bearer``, ``none``,
  empty map) → ``passthrough`` (default).

DNS-rebinding (Pitfall #15) mitigation rides on
``StreamableHTTPServerTransport({enableDnsRebindingProtection: true,
allowedHosts: ALLOWED_HOSTS})`` already wired in ``server.ts.j2`` (Plan
04-06). The middleware emitted here imports ``ALLOWED_HOSTS`` from
``../config.js`` as a belt-and-suspenders layer; F1 (Phase 5) verifies
both surfaces.

The OAuth variant uses ``@cloudflare/workers-oauth-provider`` v0.2.x
(verified pin lives in ``packages/codegen-templates/package.json`` per
Plan 04-06; rationale + npm-pack inspection in
``docs/decisions/2026-04-28-oauth-provider-pin.md``).

References:

- 04-CONTEXT.md D-21 (3 auth modes verbatim) + D-22 (DNS-rebinding rides on
  SDK transport).
- 02-CONTEXT.md D-22 (auth recommended_mode mapping verbatim).
- 04-RESEARCH.md Code Example 8 (passthrough middleware verbatim) +
  Pattern 4 + §"Open Questions" Q4.
- docs/mcpgen-stage-e-design.md §5 (3 auth modes).
"""

from __future__ import annotations

from typing import Any, Final, Literal

import structlog
from mcpgen_ir.types import Pass0Output

from mcpgen_engine.stages.stage_e.scaffold import GeneratedFile, _hash_render_inputs
from mcpgen_engine.stages.stage_e.template_loader import ENVIRONMENT

AuthMode = Literal["passthrough", "stored", "oauth"]

# Filename → Jinja2 template name table (Phase 4 — 2 files).
_AUTH_TEMPLATES: Final[tuple[tuple[str, str], ...]] = (
    ("src/auth/middleware.ts", "auth_middleware.ts.j2"),
    ("src/auth/credentials.ts", "auth_credentials.ts.j2"),
)

_log = structlog.get_logger(__name__)


def select_auth_mode(pass_0_output: Pass0Output) -> AuthMode:
    """Deterministic auth-mode selector per CONTEXT D-21 + Phase 2 D-22 mapping.

    Walks every ``auth_requirements`` entry. Decision precedence:

    1. ``oauth2`` anywhere → ``"oauth"`` (the worker handles the harder case).
    2. ``aws_signature`` anywhere → ``"stored"``.
    3. Default → ``"passthrough"`` (apiKey / http_basic / http_bearer / none /
       empty map).

    Rationale for oauth-wins-over-stored: a hybrid spec mixing both schemes
    forces a decision. We default to the more capable mode so the resulting
    Worker can handle every endpoint.

    Pre-condition: ``pass_0_output`` is a validated ``Pass0Output``; the
    Pydantic ``Scheme`` enum guarantees ``scheme`` ∈ {apiKey, oauth2,
    http_basic, http_bearer, aws_signature, none}.
    """
    has_oauth2 = False
    has_aws = False
    for reqs in pass_0_output.auth_requirements.values():
        for req in reqs:
            scheme_value = req.scheme.value
            if scheme_value == "oauth2":
                has_oauth2 = True
            elif scheme_value == "aws_signature":
                has_aws = True
    if has_oauth2:
        return "oauth"
    if has_aws:
        return "stored"
    return "passthrough"


def render_auth_files(
    auth_mode: AuthMode,
    pass_0_output: Pass0Output,
) -> list[GeneratedFile]:
    """Render ``src/auth/middleware.ts`` + ``src/auth/credentials.ts``.

    Both templates branch on the ``auth_mode`` Jinja2 variable; each branch
    emits exactly the surface required for that mode.

    Pre-condition: ``auth_mode`` ∈ {"passthrough", "stored", "oauth"};
    callers normally derive it via :func:`select_auth_mode` against the
    same ``pass_0_output``.

    The ``pass_0_output`` parameter is reserved for future per-mode
    template enrichment (e.g., dynamic auth-header allowlisting in stored
    mode); Phase 4 keeps the surface minimal.
    """
    if auth_mode not in ("passthrough", "stored", "oauth"):
        raise ValueError(f"STAGE_E_TEMPLATE_ERROR: invalid auth_mode {auth_mode!r}")

    # `pass_0_output` is currently held in the signature for future wiring
    # (auth-header allowlist, scope hints) — Phase 4 emits the structural
    # template only. The render context is intentionally minimal so the
    # render_inputs_hash stays stable across cold/warm runs.
    _ = pass_0_output  # silence unused-arg lint

    context: dict[str, Any] = {"auth_mode": auth_mode}
    inputs_hash = _hash_render_inputs(context)

    files: list[GeneratedFile] = []
    for relative_path, template_name in _AUTH_TEMPLATES:
        try:
            template = ENVIRONMENT.get_template(template_name)
            content = template.render(context)
        except Exception as exc:  # Jinja2 UndefinedError, TemplateError
            raise ValueError(
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

    _log.info("stage_e.auth.render_complete", auth_mode=auth_mode)
    return files


__all__ = ["AuthMode", "render_auth_files", "select_auth_mode"]
