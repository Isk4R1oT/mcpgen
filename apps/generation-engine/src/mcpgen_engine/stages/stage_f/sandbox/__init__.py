"""F3 sandbox adapters (CONTEXT D-22).

Each adapter exposes ``get_credentials(operator_provided)`` returning the
header dict that ``test_agent_harness._execute_mcp_tool_call`` will forward
as the upstream auth header (default: pass-through ``X-Upstream-Auth``).

Phase 5 ships hand-tuned credential adapters for **Stripe / GitHub / Notion
/ Linear / Slack** — these are the 5 sandbox APIs covered by the Phase 5 F3
fixtures (D-22). Linear + Slack are presently mocked at the response layer
(``mock_upstream.py`` lands in Plan 05-07) but the credential adapters live
here for symmetry: an operator can flip them on later by populating
``.env.local`` without code changes.

Resolution order:

1. **Operator-provided dict** (passed through the engine's HTTP API per
   D-22): ``operator_provided[<adapter_key>]`` wins if present.
2. **Environment variable** (``.env.local`` convention): falls back to the
   adapter-specific env var (``STRIPE_TEST_KEY``, ``GITHUB_TEST_PAT``, ...).
3. **Neither**: return ``{}`` and log a warning at INFO level — the F3
   caller decides whether to skip the task or run against the mocked
   upstream.

⚠ **Security invariants** (NEVER violate):

- The credential VALUE is NEVER logged. Adapters log presence + length only.
- Credentials are passed via per-tool-call HTTP headers; never persisted in
  the engine DB, central artifact store, or Sentry breadcrumbs.
- ``.env.local`` is gitignored and gitleaks-gated (Plan 05-02).
- The tenant Worker (production) NEVER sees ``MCPGEN_F3_TEST=1`` so the
  pass-through path remains unchanged from production behaviour.
"""

from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)


def _resolve_credential(
    *,
    operator_provided: dict[str, str] | None,
    operator_key: str,
    env_var: str,
) -> str | None:
    """Look up a sandbox credential without ever logging the value.

    ``operator_provided`` takes precedence over the env var so a single F3
    invocation can override on a per-request basis (e.g. an operator
    routing two parallel Stripe accounts at the same Phase 5 fixture).
    """
    if operator_provided and operator_key in operator_provided:
        return operator_provided[operator_key]
    return os.environ.get(env_var) or None
