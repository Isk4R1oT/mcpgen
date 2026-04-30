"""Test fixtures (CLAUDE.md: pure functions, explicit params)."""

from __future__ import annotations

import os
import shutil

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
# Phase 5: same priming pattern for ANTHROPIC_API_KEY so that
# test_agent.py module load (AsyncAnthropic constructor reads the env var)
# succeeds without a real key.
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-PLACEHOLDER")


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
    # Phase 5: ANTHROPIC_API_KEY placeholder mirrors the OPENROUTER pattern.
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-PLACEHOLDER")


def _has_real_anthropic_key() -> bool:
    """A real Anthropic key starts with `sk-ant-` and is NOT the placeholder."""
    val = os.environ.get("ANTHROPIC_API_KEY", "")
    return val.startswith("sk-ant-") and not val.endswith("PLACEHOLDER")


def pytest_collection_modifyitems(
    config: pytest.Config,  # noqa: ARG001
    items: list[pytest.Item],
) -> None:
    """Auto-skip integration tests when their paired credential / binary is missing.

    Tests marked with `requires_anthropic` skip when ANTHROPIC_API_KEY is
    unset OR is the placeholder; tests marked with `requires_wrangler` skip
    when the `wrangler` binary is not on PATH. T-5-03 mitigation: skip vs
    fail distinction is enforced here so absent credentials never silently
    pass tests.
    """
    skip_anthropic = pytest.mark.skip(
        reason="ANTHROPIC_API_KEY not set or sk-ant-test-PLACEHOLDER (mocked)"
    )
    skip_wrangler = pytest.mark.skip(reason="wrangler not on PATH")
    wrangler_present = shutil.which("wrangler") is not None
    anthropic_present = _has_real_anthropic_key()
    for item in items:
        if "requires_anthropic" in item.keywords and not anthropic_present:
            item.add_marker(skip_anthropic)
        if "requires_wrangler" in item.keywords and not wrangler_present:
            item.add_marker(skip_wrangler)
