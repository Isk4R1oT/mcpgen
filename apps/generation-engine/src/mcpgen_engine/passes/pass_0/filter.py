"""Pass 0 Stage 0a — deterministic endpoint filter.

Pure-function batch transform that partitions a list of `Endpoint` into
`(kept, dropped)` using only the `DropReason` enum locked in D-23. No LLM calls.

Drop rules (priority order, first match wins):

1. ``options.explicit_excludes`` glob match → ``DropReason.USER_EXCLUDED`` (D-24)
2. ``options.explicit_includes`` glob match → keep, regardless of any other rule
   (User Override Flow per D-24); other-rule drops are bypassed
3. ``ep.deprecated == True`` → ``DropReason.DEPRECATED``
4. ``ep.method`` in ``OPTIONS``/``HEAD`` → ``DropReason.METHOD_NOT_SUPPORTED``
5. Path patterns (case-insensitive prefix / substring matches):
   - ``/internal/``, ``/admin/``, ``/v1/test_helpers/``, ``/v1/sandbox/`` — INTERNAL
     (Pitfall G — Stripe `/v1/test_helpers` 42-op cluster)
   - ``x-internal: true`` vendor extension (passed via ``extensions_by_endpoint``)
     → ``DropReason.INTERNAL``
6. Exact health-check paths (``/healthz``, ``/health``, ``/ping``, ``/status``)
   → ``DropReason.HEALTH_CHECK``
7. Path contains ``/webhooks/`` or vendor flag ``x-webhook: true`` → WEBHOOK
8. Path matches OAuth flow patterns (``/oauth/``, ``/authorize``, ``/token``)
   → ``DropReason.AUTH_FLOW``

`DropReason.REDUNDANT` and `DropReason.LOW_VALUE` are LLM-assigned (Stage 0b,
Plan 02-06). `DropReason.EXCEEDS_CAP` comes from `validation.enforce_caps`.

Threat mitigation (T-2-13 D-52): no spec-text fields (description, summary)
appear in log lines — only stable structural metrics. Vendor-extension flags
are evaluated as booleans, never as natural-language (T-2-14 acceptance).

References:
- 02-CONTEXT.md D-23 (DropReason enum locked) + D-24 (User Override Flow)
- 02-RESEARCH.md §"Pitfall G" (Stripe `/v1/test_helpers`)
- 02-PATTERNS.md `passes/pass_0/filter.py` row
- docs/mcpgen-pass-0-design.md §"Stage 0a deterministic filter"
"""

from __future__ import annotations

import fnmatch
from collections import Counter
from collections.abc import Mapping
from typing import Final, cast

import structlog
from mcpgen_ir.types import DroppedEndpoint, DropReason, Endpoint, Method, Reason
from pydantic import BaseModel, ConfigDict, Field

# ──────────────────────────── Drop-rule constants ──────────────────────────

# Path *prefix* matches → INTERNAL. Pitfall G adds `/v1/test_helpers/` and
# `/v1/sandbox/` on top of the generic `/internal/` and `/admin/`.
_INTERNAL_PATH_PREFIXES: Final[tuple[str, ...]] = (
    "/internal/",
    "/admin/",
    "/v1/test_helpers/",
    "/v1/sandbox/",
)

# Exact health-check paths. Matched case-insensitively but only as full path
# (NOT prefix — `/health/check` is a real endpoint on some APIs).
_HEALTH_CHECK_PATHS: Final[frozenset[str]] = frozenset(
    {"/healthz", "/health", "/ping", "/status", "/_status", "/livez", "/readyz"}
)

# Path *substring* match → WEBHOOK.
_WEBHOOK_SUBSTRINGS: Final[tuple[str, ...]] = ("/webhooks/", "/webhook/")

# Path *prefix* OR *exact suffix* matches → AUTH_FLOW.
_AUTH_FLOW_PATH_PREFIXES: Final[tuple[str, ...]] = ("/oauth/",)
_AUTH_FLOW_PATH_SUFFIXES: Final[tuple[str, ...]] = ("/authorize", "/token", "/login", "/logout")

# Methods Stage A normally filters out, but defended against here for safety.
_METHODS_NOT_SUPPORTED: Final[frozenset[str]] = frozenset({"OPTIONS", "HEAD"})

# Reasons that are user-overridable (D-24): the user can re-include the
# endpoint via `explicit_includes`. INTERNAL endpoints stay non-overridable
# by default (developer would have to be explicit) but the User Override
# precedence rule above ALWAYS wins anyway — this flag drives the UI hint.
_USER_OVERRIDABLE_REASONS: Final[frozenset[DropReason]] = frozenset(
    {
        DropReason.DEPRECATED,
        DropReason.LOW_VALUE,
        DropReason.REDUNDANT,
    }
)

_log = structlog.get_logger(__name__)


# ──────────────────────────── User-options model ───────────────────────────


class UserOptions(BaseModel):
    """Generation-API options that flow through Pass 0.

    Defined locally (NOT in the frozen IR) because the IR has no end-to-end
    contract for these yet — Plan 02-06 promotes a stable shape to
    `mcpgen_ir.types` once Pass 0 LLM stage finalizes the surface.

    `target_complexity` and `max_tools_override` are consumed by
    ``validation.enforce_caps``; `explicit_includes` / `explicit_excludes` are
    consumed by ``deterministic_filter`` (this module).

    `dev_local` (Plan 04-14 D-3) is a pure passthrough container — Pass 0 filter
    logic does NOT branch on this field.  It flows downstream through pipeline.py
    → stage_e.run() → scaffold.render_scaffold_files() which substitutes the
    ``{tenant_short_id}`` placeholder with ``"local"`` and adds wrangler-dev
    ALLOWED_HOSTS when ``dev_local=True``.  Default ``False`` (3 layers of
    default-off prevent accidental production opt-in — Pitfall #30).
    """

    model_config = ConfigDict(extra="forbid")

    target_complexity: str = "standard"
    max_tools_override: int | None = None
    explicit_includes: list[str] = Field(default_factory=list)
    explicit_excludes: list[str] = Field(default_factory=list)
    dev_local: bool = False


# ──────────────────────────────── Public API ───────────────────────────────


def deterministic_filter(
    endpoints: list[Endpoint],
    options: UserOptions,
    extensions_by_endpoint: Mapping[str, Mapping[str, object]] | None = None,
) -> tuple[list[Endpoint], list[DroppedEndpoint]]:
    """Stage 0a: rule-based partition into kept + dropped.

    The orchestrator passes ``extensions_by_endpoint`` (keyed by ``"METHOD path"``)
    when the parser captured vendor flags such as ``x-internal`` / ``x-webhook``.
    The frozen IR ``Endpoint`` model carries no ``extensions`` field, so this is
    plumbed alongside as a separate map. Default empty → no extension-based
    drops. Pure: returns new lists in input order.
    """

    extensions_by_endpoint = extensions_by_endpoint or {}

    kept: list[Endpoint] = []
    dropped: list[DroppedEndpoint] = []
    drop_count_by_reason: Counter[str] = Counter()

    for ep in endpoints:
        ep_extensions = extensions_by_endpoint.get(_endpoint_id(ep), {})
        reason = drop_reason_for(ep, options, ep_extensions)
        if reason is None:
            kept.append(ep)
            continue

        dropped.append(
            DroppedEndpoint(
                method=_method_str(ep.method),
                path=ep.path,
                reason=Reason(reason.value),
                can_user_override=reason in _USER_OVERRIDABLE_REASONS,
            )
        )
        drop_count_by_reason[reason.value] += 1

    _log.info(
        "pass_0.filter.complete",
        kept_count=len(kept),
        dropped_count=len(dropped),
        dropped_count_by_reason=dict(drop_count_by_reason),
    )
    return kept, dropped


def drop_reason_for(
    ep: Endpoint,
    options: UserOptions,
    extensions: Mapping[str, object],
) -> DropReason | None:
    """Return the drop reason for ``ep`` or ``None`` to keep it.

    Pure function — no I/O, no logging. Order matters: `USER_EXCLUDED` runs
    before `explicit_includes`, but `explicit_includes` overrides every drop
    reason BELOW it (D-24). `USER_EXCLUDED` is the one rule the user cannot
    accidentally bypass.
    """

    method_str = _method_str(ep.method)

    # 1. USER_EXCLUDED — user explicitly removes this endpoint.
    if _matches_any_glob(ep.path, options.explicit_excludes):
        return DropReason.USER_EXCLUDED

    # 2. USER OVERRIDE — user explicitly keeps this endpoint, bypass other rules.
    if _matches_any_glob(ep.path, options.explicit_includes):
        return None

    # 3. DEPRECATED — `deprecated: true` in spec.
    if ep.deprecated:
        return DropReason.DEPRECATED

    # 4. METHOD_NOT_SUPPORTED — OPTIONS / HEAD never become tools.
    if method_str in _METHODS_NOT_SUPPORTED:
        return DropReason.METHOD_NOT_SUPPORTED

    # 5. INTERNAL — path patterns + x-internal vendor flag.
    if _has_internal_path(ep.path) or _is_truthy(extensions.get("x-internal")):
        return DropReason.INTERNAL

    # 6. HEALTH_CHECK — exact path match against the known set.
    if ep.path.lower() in _HEALTH_CHECK_PATHS:
        return DropReason.HEALTH_CHECK

    # 7. WEBHOOK — substring match OR x-webhook vendor flag.
    if _has_webhook_path(ep.path) or _is_truthy(extensions.get("x-webhook")):
        return DropReason.WEBHOOK

    # 8. AUTH_FLOW — OAuth dance endpoints.
    if _is_auth_flow_path(ep.path):
        return DropReason.AUTH_FLOW

    return None


# ─────────────────────────────── Helpers ───────────────────────────────────


def _endpoint_id(ep: Endpoint) -> str:
    """Stable identifier matching Stage A `_endpoint_id` shape."""
    return f"{_method_str(ep.method)} {ep.path}"


def _method_str(method: Method | str) -> str:
    """Coerce ``Endpoint.method`` (Method enum) to its uppercase string form."""
    if isinstance(method, Method):
        return cast(str, method.value)
    return str(method).upper()


def _has_internal_path(path: str) -> bool:
    lower = path.lower()
    return any(lower.startswith(prefix) for prefix in _INTERNAL_PATH_PREFIXES)


def _has_webhook_path(path: str) -> bool:
    lower = path.lower()
    return any(sub in lower for sub in _WEBHOOK_SUBSTRINGS)


def _is_auth_flow_path(path: str) -> bool:
    lower = path.lower()
    if any(lower.startswith(prefix) for prefix in _AUTH_FLOW_PATH_PREFIXES):
        return True
    return any(lower.endswith(suffix) for suffix in _AUTH_FLOW_PATH_SUFFIXES)


def _matches_any_glob(path: str, patterns: list[str]) -> bool:
    """``True`` iff ``path`` matches at least one fnmatch glob in ``patterns``."""
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def _is_truthy(value: object) -> bool:
    """Strict-bool truthiness for vendor-extension flags.

    Vendor extensions can carry arbitrary types in the wild; we only honour
    explicit ``True`` (or string ``"true"``/``"True"``) to avoid drift on
    accidental-string values.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == "true"
    return False
