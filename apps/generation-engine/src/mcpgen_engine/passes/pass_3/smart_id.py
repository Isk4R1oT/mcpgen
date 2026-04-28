"""Pass 3 — Phase: deterministic smart-ID pattern + description builder (D-20).

Constructs the JSON Schema ``pattern`` regex and the canonical D-20 description
string from Pass 1 ``Routing.smart_id`` per Phase 2 D-31. The deploy-time
per-tenant prefix is intentionally NOT included at this layer — Phase 6
dispatch worker prepends it at deploy time, and Phase 4 Stage E template
injects the full pattern at codegen time. Acceptance criterion in 03-08-PLAN.md
asserts no occurrence of the tenant-prefix token here so a literal grep
verifies the invariant; comments avoid using that exact token.

``slugify_spec_title`` is used by Plan 03-09 to derive a single deterministic
``spec_slug`` for the entire ``Pass3Output`` (one slug per server invocation).

Note: ``apps/generation-engine/src/mcpgen_engine/passes/pass_1/routing.py``
already exposes a related ``derive_spec_slug`` and ``build_smart_id_format``
pair with slightly different semantics (Phase 2 fallback ``"unnamed-spec"``,
no defensive ``"spec"`` fallback for empty / all-special input). This module
intentionally re-derives a Pass-3-specific slug so the empty-input contract
matches the Phase 3 acceptance test (``slugify_spec_title("") == "spec"``).
The Pass 1 ``build_smart_id_regex`` helper bakes in a tolerant tenant-prefix
match (``[a-z0-9-]+-``) for the round-trip fixture test (Pitfall #1 / D-56);
the Pass 3 ``build_smart_id_pattern_for_param`` deliberately omits that
match per D-20 because the param-level pattern lands in the agent-facing
JSON Schema BEFORE any deploy-time prefix is known.

References:
- 03-CONTEXT.md D-20 (smart-ID pattern verbatim) + Phase 2 D-31 (format invariant)
- 03-RESEARCH.md §"Architecture Patterns" Pattern 4 (Smart-ID Regex Auto-Gen)
- docs/mcpgen-pass-3-design.md §12
"""

from __future__ import annotations

import re
from typing import Final

from mcpgen_ir.types import SmartId

# Strip everything that isn't lowercase alphanum or dash (post-lowercase).
_NON_ALPHANUM_DASH_REGEX: Final[re.Pattern[str]] = re.compile(r"[^a-z0-9-]+")
# Collapse runs of dashes produced by the previous step.
_MULTIPLE_DASH_REGEX: Final[re.Pattern[str]] = re.compile(r"-+")
# D-32 / Phase 2 invariant — slug is at most 32 chars after collapse + trim.
_MAX_SLUG_LENGTH: Final[int] = 32
# Defensive fallback when the input title yields nothing usable.
_SLUG_FALLBACK: Final[str] = "spec"


# ─────────────────────────── Public API ─────────────────────────────────────


def slugify_spec_title(title: str) -> str:
    """Derive a deterministic ``spec_slug`` from ``RawIR.info.title``.

    Lowercase + replace non-alphanumeric (except dash) with dash + collapse
    multi-dash + strip leading/trailing dash + cap at ``_MAX_SLUG_LENGTH``.

    Examples:
        ``"Stripe API"``         → ``"stripe-api"``
        ``"GitHub REST API v3"`` → ``"github-rest-api-v3"``
        ``"Notion API (Beta)"``  → ``"notion-api-beta"``

    Empty input or input that yields no usable characters returns
    ``"spec"`` so downstream pattern construction never produces an
    empty regex anchor.
    """
    if not title:
        return _SLUG_FALLBACK
    slug = title.lower()
    slug = _NON_ALPHANUM_DASH_REGEX.sub("-", slug)
    slug = _MULTIPLE_DASH_REGEX.sub("-", slug)
    slug = slug.strip("-")
    if len(slug) > _MAX_SLUG_LENGTH:
        slug = slug[:_MAX_SLUG_LENGTH].rstrip("-")
    return slug or _SLUG_FALLBACK


def build_smart_id_pattern_for_param(smart_id: SmartId, spec_slug: str) -> str:
    """Build the JSON Schema regex ``pattern`` for a smart-ID parameter (D-20).

    Format: ``^{spec_slug}:({types_alt}):({collections_alt}):[a-zA-Z0-9_-]+$``
    where ``types_alt`` and ``collections_alt`` are pipe-joined alternations
    of ``re.escape``'d values from ``smart_id.types`` and ``smart_id.collections``.

    The deploy-time per-tenant prefix is NOT included — Phase 6 dispatch
    worker prepends it at deploy time per D-20.

    Empty types / collections degrade to permissive character classes
    (``[a-z_]+`` / ``[A-Za-z_]+``) so Pass 3 still emits a syntactically
    valid pattern even if Pass 1 routing produced an under-specified
    ``SmartId`` (defensive — Pass 1 should always populate at least
    one type and one collection).
    """
    types_alt = "|".join(re.escape(t) for t in smart_id.types) or "[a-z_]+"
    collections_alt = "|".join(re.escape(c) for c in smart_id.collections) or "[A-Za-z_]+"
    return rf"^{re.escape(spec_slug)}:({types_alt}):({collections_alt}):[a-zA-Z0-9_-]+$"


def build_smart_id_description(smart_id: SmartId, spec_slug: str) -> str:
    """Build the canonical D-20 smart-ID parameter description.

    Includes the format string, the available types and collections lists,
    and the plain-identifier fallback hint verbatim per D-20.
    """
    types_list = ", ".join(smart_id.types) if smart_id.types else "any"
    collections_list = ", ".join(smart_id.collections) if smart_id.collections else "any"
    return (
        f"Smart identifier in {spec_slug}:{{type}}:{{collection}}:{{identifier}} format. "
        f"Types: {types_list}. Collections: {collections_list}. "
        f"If you only have a bare upstream ID, prefix with the smart-ID format above; "
        f"the server will route correctly."
    )
