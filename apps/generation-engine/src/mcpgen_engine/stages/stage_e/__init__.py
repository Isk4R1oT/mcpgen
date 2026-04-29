"""Stage E — Codegen (deterministic Jinja2 emitter, NO LLM).

Stage E renders Pass 5's `FinalTool[]` plus the upstream pass outputs into a
complete Cloudflare Workers TypeScript project (~25-30 files for a 10-tool
server) via 100% deterministic Jinja2 templates. Cost: $0 LLM, ~5-12s wall
clock per server (CONTEXT D-13).

Pipeline (CONTEXT D-20, full ``run()`` ships in plan 04-11):

1. Phase 1 — Scaffold: 9 project-level files via ``scaffold.py`` (plan 04-06).
2. Phase 2 — Schemas: 3 Zod 4 schema files via ``schemas.py`` (plan 04-07).
3. Phase 3 — Runtime: 8 helper files via ``runtime.py`` (plan 04-08).
4. Phase 4 — Auth: 2 auth files via ``auth.py`` (plan 04-09).
5. Phase 5 — Tool handlers: N+1 files via ``tools.py`` (plan 04-10).
6. Phase 6 — Validate: ``tsc --noEmit`` + ``wrangler dry-run`` via
   ``validate.py`` (plan 04-11).

Stable error codes (user-facing; surfaced via SSE pipeline events). Plan
04-12's ``_stable_error_code()`` is the authoritative mapper — this module
ONLY raises the typed exceptions:

- ``STAGE_E_TS_ERROR``         → :class:`StageETsError`           (plan 04-11).
- ``STAGE_E_BUNDLE_TOO_LARGE`` → :class:`StageEBundleTooLargeError` (plan 04-11; D-28).
- ``STAGE_E_TEMPLATE_ERROR``   — Jinja2 ``StrictUndefined`` raised on a missing
                                 render-context variable (any phase).
- ``STAGE_E_OUTPUT_WRITE_FAILED`` — atomic file write failed (any phase).
- ``STAGE_E_FAILED``           — bare :class:`StageEError` umbrella for everything else.

References:
- 04-CONTEXT.md D-13..D-32 (Stage E contract)
- 04-RESEARCH.md §"Stage E template inventory + reconciliation"
- docs/mcpgen-stage-e-design.md §1 (native MCP, NOT Code Mode) + §9 (pipeline)
- packages/ir/src/types.ts → packages/ir/python/types.py (StageEManifest)
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

import structlog
from mcpgen_ir.types import (
    FinalTool,
    Pass0Output,
    Pass1Output,
    Pass2Output,
    Pass3Output,
    Pass4Output,
    Pass5Output,
    RawIR,
    StageEManifest,
)

# Bumped manually whenever any Jinja2 template changes (CONTEXT D-35
# `template_version` for L2 cache invalidation). Initial version "1".
STAGE_E_VERSION: Final[str] = "1"

_log = structlog.get_logger(__name__)


class StageEError(ValueError):
    """Raised by Stage E on emit/validate failures. Message is user-facing."""


__all__ = [
    "STAGE_E_VERSION",
    "StageEError",
    "run",
]


# ────────────────────────── Stage E full run() orchestrator ──────────────────────────
#
# Imports below land AFTER the StageEError export above so submodules can
# `from mcpgen_engine.stages.stage_e import StageEError` without a circular
# import. Each phase module raises StageEError subclasses; the orchestrator
# does NOT catch them — they bubble up to the pipeline.py SSE emitter.


from mcpgen_engine.stages.stage_e.auth import (  # noqa: E402
    AuthMode,
    render_auth_files,
    select_auth_mode,
)
from mcpgen_engine.stages.stage_e.output_writer import (  # noqa: E402
    write_files_atomically,
)
from mcpgen_engine.stages.stage_e.runtime import (  # noqa: E402
    render_runtime_files,
)
from mcpgen_engine.stages.stage_e.scaffold import (  # noqa: E402
    render_scaffold_files,
)
from mcpgen_engine.stages.stage_e.schemas import (  # noqa: E402
    render_schema_files,
)
from mcpgen_engine.stages.stage_e.tools import (  # noqa: E402
    render_all_tool_handlers,
)
from mcpgen_engine.stages.stage_e.validate import (  # noqa: E402
    capture_bundle_size_kb,
    ensure_codegen_node_modules,
    gate_bundle_size,
    run_tsc_no_emit,
)


def _default_pipeline_versions() -> dict[str, str]:
    """Per-pass version table — Phase 4/Stage E manifest field (CONTEXT D-29).

    All passes currently pin to ``"1"``; bumping a pass's internal version
    will require touching this table OR (preferred) refactoring each pass
    init to expose its constant without triggering LLM-client side effects
    (today ``mcpgen_engine.passes.pass_2`` import requires
    ``OPENROUTER_API_KEY`` at import time, which is incompatible with
    Stage E's no-LLM contract).
    """
    return {
        "pass_0": "1",
        "pass_1": "1",
        "pass_2": "1",
        "pass_3": "1",
        "pass_4": "1",
        "pass_5": "1",
        "stage_e": STAGE_E_VERSION,
    }


def _derive_upstream_base_url(spec_url: str) -> str:
    """Best-effort upstream base URL for the generated Worker.

    The full Pass 0 / spec extraction lives upstream; for Stage E v1 we
    derive it from the spec_url scheme + host (e.g.
    ``https://api.stripe.com/openapi/spec3.json`` →
    ``https://api.stripe.com``). Phase 7+ may surface this from
    ``RawIR.servers`` instead. Safe fallback: empty string (the generated
    Worker will fail at runtime with a clear error).
    """
    from urllib.parse import urlparse

    try:
        parsed = urlparse(spec_url)
    except ValueError as exc:
        _log.warning("stage_e.upstream_base_url.parse_failed", error=str(exc))
        return ""
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return ""


async def run(
    final_tools: list[FinalTool],
    pass_5_output: Pass5Output,
    pass_4_output: Pass4Output | None,
    pass_3_output: Pass3Output | None,
    pass_2_output: Pass2Output | None,
    pass_1_output: Pass1Output,
    pass_0_output: Pass0Output,
    raw_ir: RawIR,
    output_dir: Path,
    *,
    engine_version: str,
    spec_url: str,
    spec_slug: str,
    auth_mode_override: AuthMode | None = None,
    dev_local: bool = False,
) -> StageEManifest:
    """Stage E full 6-phase orchestrator.

    Renders the complete generated tenant Worker tree under ``output_dir``,
    runs ``tsc --noEmit`` against the rendered TS, captures the bundle size
    via ``wrangler deploy --dry-run``, and returns a populated
    ``StageEManifest``.

    Pre-conditions:
      - ``ensure_codegen_node_modules()`` is reachable (engine startup hook
        in ``main.py`` pre-warms the dir; lazy-fallback runs ``pnpm install``
        on first call).
      - ``output_dir`` is writable; existing contents are NOT cleared
        (caller's responsibility — Plan 04-12 wires the CLI flow).

    The ``pass_2_output`` / ``pass_3_output`` / ``pass_4_output`` parameters
    are accepted for forward-compat per plan 04-11 truths block but are not
    consumed by the v1 renderers (each renderer reads only the IR fields
    materialised on ``FinalTool``). Passing ``None`` is supported and is
    the canonical call shape today.

    Raises (subclasses of :class:`StageEError`):
      - ``StageETsError``               on tsc --noEmit failure.
      - ``StageEBundleTooLargeError``   when gzipped bundle > 950 KiB.
      - ``StageEError`` (umbrella)      on Jinja2 ``StrictUndefined`` /
                                        atomic file-write failure / any
                                        other Stage E contract violation.
    """
    start = time.monotonic()

    # Phase 0 housekeeping: pre-warmed node_modules (idempotent — already
    # ready if the engine startup hook fired). Done eagerly so a missing
    # install fails fast before we render 25 files we'd then have to
    # reconcile against a broken validate phase.
    hoisted_nm = ensure_codegen_node_modules()

    # Auth mode: explicit override > deterministic Pass 0 selection.
    auth_mode = auth_mode_override or select_auth_mode(pass_0_output)

    pipeline_versions = _default_pipeline_versions()
    upstream_base_url = _derive_upstream_base_url(spec_url)
    generated_at = datetime.now(tz=UTC).isoformat()

    # ── Phase 1 — Scaffold (9 project-level files) ──────────────────────
    scaffold_files = render_scaffold_files(
        spec_slug=spec_slug,
        auth_mode=auth_mode,
        pass_0_output=pass_0_output,
        pass_1_output=pass_1_output,
        raw_ir=raw_ir,
        pipeline_versions=pipeline_versions,
        engine_version=engine_version,
        spec_url=spec_url,
        spec_hash=raw_ir.spec_hash,
        generated_at=generated_at,
        upstream_base_url=upstream_base_url,
        tool_count=len(final_tools),
        dev_local=dev_local,
    )

    # ── Phase 2 — Schemas (3 files) ──────────────────────────────────────
    schema_files = render_schema_files(final_tools, pass_1_output)

    # ── Phase 3 — Runtime (8 files) ──────────────────────────────────────
    runtime_files = render_runtime_files(pass_0_output, pass_5_output, raw_ir)

    # ── Phase 4 — Auth (2 files) ─────────────────────────────────────────
    auth_files = render_auth_files(auth_mode, pass_0_output)

    # ── Phase 5 — Tool handlers (N + 1 files) ────────────────────────────
    tool_files = render_all_tool_handlers(final_tools, pass_1_output)

    # Forward-compat: pass_2/3/4 are accepted but not consumed by v1
    # renderers. Bind to `_` to make the intent explicit + silence linters.
    _ = pass_2_output, pass_3_output, pass_4_output

    all_files = [
        *scaffold_files,
        *schema_files,
        *runtime_files,
        *auth_files,
        *tool_files,
    ]

    # ── Atomic write — single failure boundary for the partial-write
    # cleanup case. Plan 04-06's ``write_files_atomically`` returns a
    # placeholder manifest with ``bundle_size_kb=0`` + ``ts_compile_passed=False``;
    # Phase 6 below replaces those fields. ───────────────────────────────
    placeholder_manifest = write_files_atomically(output_dir, all_files)

    # ── Phase 6 — Validate (tsc --noEmit + wrangler dry-run + bundle gate)
    tsc_warning_count = await run_tsc_no_emit(output_dir, hoisted_node_modules=hoisted_nm)
    bundle_kb_raw = await capture_bundle_size_kb(output_dir, hoisted_node_modules=hoisted_nm)
    final_size, _warnings = await gate_bundle_size(bundle_kb_raw, raw_ir)

    # Update manifest with Phase 6 results. The placeholder manifest is
    # immutable (Pydantic ``BaseModel``); copy with the validate-phase
    # fields populated.
    manifest = placeholder_manifest.model_copy(
        update={
            "bundle_size_kb": final_size,
            "ts_compile_passed": True,  # tsc raised on any error path
            "ts_compile_warning_count": tsc_warning_count,
        }
    )

    elapsed_ms = int((time.monotonic() - start) * 1000)
    _log.info(
        "stage_e.run.complete",
        file_count=len(all_files),
        bundle_size_kb=final_size,
        tsc_passed=True,
        tsc_warning_count=tsc_warning_count,
        auth_mode=auth_mode,
        elapsed_ms=elapsed_ms,
    )
    return manifest
