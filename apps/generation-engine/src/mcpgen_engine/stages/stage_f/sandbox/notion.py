"""Notion test-workspace integration token credentials (CONTEXT D-22).

Notion ships with hand-tuned golden tasks in Phase 5 (D-43). Operator
provisions an integration token (``secret_...``) under NOTION_TEST_TOKEN in
``.env.local`` or via the ``notion.test_token`` operator-provided slot.
"""

from __future__ import annotations

import logging

from . import _resolve_credential

log = logging.getLogger(__name__)


def get_credentials(operator_provided: dict[str, str] | None) -> dict[str, str]:
    """Return ``{X-Upstream-Auth: Bearer secret_...}`` or ``{}`` if absent."""
    cred = _resolve_credential(
        operator_provided=operator_provided,
        operator_key="notion.test_token",
        env_var="NOTION_TEST_TOKEN",
    )
    if cred is None:
        log.warning(
            "Notion sandbox credential not provided "
            "(operator key 'notion.test_token' / env NOTION_TEST_TOKEN)"
        )
        return {}
    log.info("Notion sandbox credential resolved (length=%d)", len(cred))
    return {"X-Upstream-Auth": f"Bearer {cred}"}
