"""Test fixtures (CLAUDE.md: pure functions, explicit params)."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _sandbox_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Per-test env sandbox; never leaks between tests.

    Per planner revision (no silent None fallback in llm/client.py): we MUST
    set a placeholder OPENROUTER_API_KEY so that any test that imports
    mcpgen_engine.llm.client (directly or transitively via main.py) does not
    crash at module load. Tests that specifically exercise the unset-key path
    delenv it themselves AFTER import.

    monkeypatch handles teardown automatically; no yield needed.
    """
    # Clear other env vars; individual tests opt in by setting them.
    for key in (
        "OPENROUTER_BASE_URL",
        "PRIMARY_MODEL",
        "SENTRY_DSN",
        "SENTRY_RELEASE",
        "ENVIRONMENT",
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "LANGFUSE_OTEL_ENDPOINT",
    ):
        monkeypatch.delenv(key, raising=False)
    # Default placeholder so module load is safe (T-1-09: still never logged; tests that
    # need real fail-fast behavior delenv inside the test body).
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test-PLACEHOLDER")
