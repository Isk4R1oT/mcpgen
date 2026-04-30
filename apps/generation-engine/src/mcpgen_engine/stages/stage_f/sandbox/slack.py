"""Slack test-workspace bot token credentials (CONTEXT D-22).

Slack ships with mock_upstream responses in Phase 5 (Plan 05-07) but the
credential adapter lives here so an operator can flip Slack to real
sandbox by populating ``.env.local`` once Phase 9 onboards real Slack
fixtures.
"""

from __future__ import annotations

import logging

from . import _resolve_credential

log = logging.getLogger(__name__)


def get_credentials(operator_provided: dict[str, str] | None) -> dict[str, str]:
    """Return ``{X-Upstream-Auth: Bearer xoxb-...}`` or ``{}`` if absent."""
    cred = _resolve_credential(
        operator_provided=operator_provided,
        operator_key="slack.test_bot",
        env_var="SLACK_TEST_BOT_TOKEN",
    )
    if cred is None:
        log.warning(
            "Slack sandbox credential not provided "
            "(operator key 'slack.test_bot' / env SLACK_TEST_BOT_TOKEN)"
        )
        return {}
    log.info("Slack sandbox credential resolved (length=%d)", len(cred))
    return {"X-Upstream-Auth": f"Bearer {cred}"}
