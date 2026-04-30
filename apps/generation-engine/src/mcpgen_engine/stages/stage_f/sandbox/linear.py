"""Linear test-workspace API key credentials (CONTEXT D-22).

Linear ships with mock_upstream responses in Phase 5 (Plan 05-07) but the
credential adapter lives here so an operator can flip Linear to real
sandbox by populating ``.env.local`` once Phase 9 onboards real Linear
fixtures.
"""

from __future__ import annotations

import logging

from . import _resolve_credential

log = logging.getLogger(__name__)


def get_credentials(operator_provided: dict[str, str] | None) -> dict[str, str]:
    """Return ``{X-Upstream-Auth: <Linear API key>}`` or ``{}`` if absent.

    Linear's API expects the raw key in ``Authorization`` (no Bearer prefix
    per Linear docs). We forward via ``X-Upstream-Auth`` and let the
    generated tenant Worker's auth_middleware re-shape it for the upstream
    request.
    """
    cred = _resolve_credential(
        operator_provided=operator_provided,
        operator_key="linear.test_key",
        env_var="LINEAR_TEST_KEY",
    )
    if cred is None:
        log.warning(
            "Linear sandbox credential not provided "
            "(operator key 'linear.test_key' / env LINEAR_TEST_KEY)"
        )
        return {}
    log.info("Linear sandbox credential resolved (length=%d)", len(cred))
    return {"X-Upstream-Auth": cred}
