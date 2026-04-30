"""Stripe test-mode credentials (CONTEXT D-22).

Stripe ships with hand-tuned golden tasks in Phase 5 (D-43). Operator
provisions a test-mode key (``sk_test_...``) under STRIPE_TEST_KEY in
``.env.local`` or via the ``stripe.test_key`` operator-provided slot.
The key never leaves the F3 subprocess — pass-through ``X-Upstream-Auth``
header is the ONLY transport.
"""

from __future__ import annotations

import logging

from . import _resolve_credential

log = logging.getLogger(__name__)


def get_credentials(operator_provided: dict[str, str] | None) -> dict[str, str]:
    """Return ``{X-Upstream-Auth: Bearer sk_test_...}`` or ``{}`` if absent.

    Logs presence + length only — NEVER the credential value (CONTEXT D-22
    + Pitfall #12 + Phase 5 RESEARCH §3.4 — gitleaks gate enforces source
    code; this is the runtime invariant).
    """
    cred = _resolve_credential(
        operator_provided=operator_provided,
        operator_key="stripe.test_key",
        env_var="STRIPE_TEST_KEY",
    )
    if cred is None:
        log.warning(
            "Stripe sandbox credential not provided "
            "(operator key 'stripe.test_key' / env STRIPE_TEST_KEY)"
        )
        return {}
    log.info("Stripe sandbox credential resolved (length=%d)", len(cred))
    return {"X-Upstream-Auth": f"Bearer {cred}"}
