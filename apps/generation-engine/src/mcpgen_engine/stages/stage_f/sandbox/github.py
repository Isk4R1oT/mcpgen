"""GitHub test-org PAT credentials (CONTEXT D-22).

GitHub ships with hand-tuned golden tasks in Phase 5 (D-43). Operator
provisions a fine-grained PAT (``ghp_...`` or ``github_pat_...``) under
GITHUB_TEST_PAT in ``.env.local`` or via the ``github.test_pat`` operator-
provided slot. The PAT never leaves the F3 subprocess.
"""

from __future__ import annotations

import logging

from . import _resolve_credential

log = logging.getLogger(__name__)


def get_credentials(operator_provided: dict[str, str] | None) -> dict[str, str]:
    """Return ``{X-Upstream-Auth: Bearer ghp_...}`` or ``{}`` if absent."""
    cred = _resolve_credential(
        operator_provided=operator_provided,
        operator_key="github.test_pat",
        env_var="GITHUB_TEST_PAT",
    )
    if cred is None:
        log.warning(
            "GitHub sandbox credential not provided "
            "(operator key 'github.test_pat' / env GITHUB_TEST_PAT)"
        )
        return {}
    log.info("GitHub sandbox credential resolved (length=%d)", len(cred))
    return {"X-Upstream-Auth": f"Bearer {cred}"}
