"""Test fixtures (CLAUDE.md: pure functions, explicit params)."""

from __future__ import annotations

import os

import pytest

# Module-level env priming: when a test module imports `mcpgen_engine.llm.*`
# at top level (e.g. test_smoke_qwen.py imports `make_agent` which transitively
# constructs the MODEL singleton at import time), the per-test `_sandbox_env`
# autouse fixture below runs too late — it triggers at test SETUP, not at
# module IMPORT. We therefore set the placeholder here at conftest load so
# that downstream test-module imports succeed. Tests that need to verify
# fail-fast behavior on missing key (test_llm_client.py) delenv inside the
# test body and rely on importlib.reload — that path is unchanged.
os.environ.setdefault("OPENROUTER_API_KEY", "sk-or-test-PLACEHOLDER")


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
