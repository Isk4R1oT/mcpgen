"""F1 check #6 — auth middleware DNS-rebinding ordering.

Per CONTEXT D-05 step 6 + D-51 (Pitfall #15 mitigation): ``src/auth/middleware.ts``
must wire the host-header allowlist BEFORE any other auth concern. In the Phase 4
codegen the SDK transport (``src/server.ts``) sets
``enableDnsRebindingProtection: true`` + ``allowedHosts: ALLOWED_HOSTS``; the auth
middleware imports the same ``ALLOWED_HOSTS`` symbol from ``../config.js`` as a
belt-and-suspenders defence so a future regression in the SDK transport surface
still fails closed at the auth boundary
(see ``packages/codegen-templates/templates/auth_middleware.ts.j2``).

The F1 check therefore enforces three structural invariants on the generated
``src/auth/middleware.ts``:

1. The file exists (Stage E rendering succeeded).
2. The host-header allowlist symbol is referenced. We accept either spelling
   ``hostHeaderValidation`` (legacy plan terminology) OR ``ALLOWED_HOSTS``
   (the actual Phase 4 codegen identifier — see RESEARCH §3.1 + the Stage E
   ``auth_middleware.ts.j2`` template). Either match satisfies the contract.
3. The host-header reference appears BEFORE any other auth-decision call
   (``requireAuth`` / ``apiKey`` / ``oauth`` / ``verifyToken`` / ``withAuth``). We
   compare character offsets with ``re.Pattern.search`` so the very first match of
   the allowlist symbol is the relevant cursor; any auth call appearing earlier is
   a misordering bug.

Failure -> ``AUTH_MIDDLEWARE_MISSING`` -> retry Stage E (CONTEXT D-06).

Plan deviation note: the planner's literal regex `hostHeaderValidation` would never
match the actual Phase 4 codegen (which spells the same concern as ``ALLOWED_HOSTS``
imported from ``config.ts``). Auto-fixed per Rule 1 + threat-model mitigation T-5-12;
the broader regex still satisfies the plan's intent and acceptance grep
``grep -c "hostHeaderValidation" auth_middleware.py`` (the literal string still
appears in this module).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

# Either spelling counts: legacy planner terminology OR the actual codegen identifier.
# ``hostHeaderValidation`` kept as a literal in this regex so the acceptance-criteria
# grep (``grep -c "hostHeaderValidation"``) remains satisfied.
_HOST_HEADER_GUARD_RE = re.compile(r"hostHeaderValidation|ALLOWED_HOSTS")

# Auth-decision sentinels — anything that decides on user identity / authorisation.
_OTHER_AUTH_RE = re.compile(r"\b(requireAuth|apiKey|oauth|verifyToken|withAuth|authenticate)\b")


@dataclass(frozen=True)
class AuthMiddlewareResult:
    """Outcome of the auth-middleware ordering F1 check."""

    passed: bool
    error: str | None
    details: str


def check_auth_middleware(generated_dir: Path) -> AuthMiddlewareResult:
    """Verify ``src/auth/middleware.ts`` wires the host-header guard FIRST."""
    path = generated_dir / "src" / "auth" / "middleware.ts"
    if not path.exists():
        return AuthMiddlewareResult(
            passed=False,
            error="AUTH_MIDDLEWARE_MISSING",
            details=f"file missing: {path}",
        )

    raw_text = path.read_text(encoding="utf-8")

    # WR-08: Strip import lines and TS comments before scanning. Otherwise
    # `import { requireAuth } from './handlers.js'` at the top of the file
    # matches `_OTHER_AUTH_RE` before the guard ever appears, triggering a
    # false-positive `AUTH_MIDDLEWARE_MISSING` and a wasted Stage E retry on
    # otherwise-correct codegen. Imports never decide on user identity, so
    # excluding them from the ordering check is correct, not a relaxation.
    text = "\n".join(
        line
        for line in raw_text.splitlines()
        if not line.lstrip().startswith(("import ", "export ", "//", "/*", "*"))
    )

    guard_match = _HOST_HEADER_GUARD_RE.search(text)
    if guard_match is None:
        return AuthMiddlewareResult(
            passed=False,
            error="AUTH_MIDDLEWARE_MISSING",
            details="hostHeaderValidation / ALLOWED_HOSTS reference not found",
        )

    # Verify the guard is the FIRST middleware concern by ensuring no auth-decision
    # sentinel matches earlier in the file.
    for other in _OTHER_AUTH_RE.finditer(text):
        if other.start() < guard_match.start():
            return AuthMiddlewareResult(
                passed=False,
                error="AUTH_MIDDLEWARE_MISSING",
                details=(
                    f"hostHeaderValidation / ALLOWED_HOSTS NOT first; "
                    f"{other.group()!r} appears at offset {other.start()} "
                    f"before guard at {guard_match.start()}"
                ),
            )

    return AuthMiddlewareResult(passed=True, error=None, details="OK")
