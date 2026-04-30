"""F1 check #3 — smart-ID cross-tenant fuzz.

Per CONTEXT D-05 step 3 (mitigation for Pitfall #1): synthesize 2 tenant prefixes from
the same spec, then verify the parser rejects an ID minted by tenant A when invoked
under tenant B's expected prefix. This is a runtime check that the smart-ID format is
prefix-isolated by construction (Pass 1 D-31 schema-level invariant -> runtime parser
in Stage E).

Pure-Python parser (~10 lines) per RESEARCH §3.6 — avoids spawning a node process to
exercise ``runtime/smart_id.ts``. The Python parser is contractually identical; if
they diverge, the F1 orchestrator integration test (Plan 05-08) catches it via
side-by-side fixture comparison.

Smart-ID format (Pass 1 ``SmartIdSchema``):
``{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}``.

Examples:
  ``abc1-stripe:object:Charge:ch_test``      <- tenant ``abc1-stripe``
  ``xyz2-stripe:object:Charge:ch_test``      <- tenant ``xyz2-stripe``
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Smart-ID format mirror (RESEARCH §3.6). Tenant token allows lowercase alnum + hyphen
# + underscore (matches Pass 1 schema). Type / collection are restricted; identifier
# accepts anything (Stripe-style ``ch_3O5jJ2...``, UUIDs, etc.).
_SMART_ID_RE = re.compile(
    r"^(?P<tenant>[a-z0-9]+(?:[-_][a-z0-9]+)+):"
    r"(?P<type>[a-z_]+):"
    r"(?P<collection>[A-Za-z0-9_]+):"
    r"(?P<id>.+)$"
)


@dataclass(frozen=True)
class SmartIdParseResult:
    """Outcome of a single smart-ID parse attempt."""

    accepted: bool
    tenant: str | None


def parse_smart_id(smart_id: str, *, expected_prefix: str) -> SmartIdParseResult:
    """Parse a smart-ID and verify its tenant prefix matches ``expected_prefix``.

    A mismatch is the cross-tenant leak signal -> ``accepted=False`` with the
    actual tenant returned for diagnostic output.
    """
    match = _SMART_ID_RE.match(smart_id)
    if match is None:
        return SmartIdParseResult(accepted=False, tenant=None)
    tenant = match.group("tenant")
    if tenant != expected_prefix:
        return SmartIdParseResult(accepted=False, tenant=tenant)
    return SmartIdParseResult(accepted=True, tenant=tenant)


@dataclass(frozen=True)
class SmartIdFuzzResult:
    """Outcome of the smart-ID cross-tenant fuzz F1 check."""

    passed: bool
    error: str | None
    details: str


def smart_id_fuzz(
    *,
    spec_slug: str,
    sample_collection: str,
    sample_id: str,
) -> SmartIdFuzzResult:
    """Synthesize 2 tenants from the same spec; verify cross-tenant rejection.

    Pitfall #1 mitigation: a tenant must NEVER accept another tenant's smart-ID.
    The check synthesizes two distinct tenant prefixes, mints an ID under each, then
    feeds them through the parser with each tenant's own ``expected_prefix``:

    1. Tenant A's ID under tenant A's prefix -> MUST accept.
    2. Tenant B's ID under tenant A's prefix -> MUST reject.

    Failure -> ``SMART_ID_CROSS_TENANT_LEAK`` -> retry Pass 1 (CONTEXT D-06).
    """
    tenant_a = f"abc1-{spec_slug}"
    tenant_b = f"xyz2-{spec_slug}"
    id_a = f"{tenant_a}:object:{sample_collection}:{sample_id}"
    id_b = f"{tenant_b}:object:{sample_collection}:{sample_id}"

    own = parse_smart_id(id_a, expected_prefix=tenant_a)
    cross = parse_smart_id(id_b, expected_prefix=tenant_a)

    if not own.accepted or cross.accepted:
        return SmartIdFuzzResult(
            passed=False,
            error="SMART_ID_CROSS_TENANT_LEAK",
            details=(
                f"own_accepted={own.accepted} (want True), "
                f"cross_accepted={cross.accepted} (want False), "
                f"cross_observed_tenant={cross.tenant!r}"
            ),
        )
    return SmartIdFuzzResult(passed=True, error=None, details="OK")
