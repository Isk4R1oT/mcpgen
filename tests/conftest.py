import os

import pytest


@pytest.fixture(autouse=True)
def set_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set required environment variables for all tests."""
    monkeypatch.setenv("SUPABASE_URL", "https://test-project.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4-5")
    monkeypatch.setenv("DOCKER_REGISTRY", "ghcr.io/test-user")
    monkeypatch.setenv("DOCKER_REGISTRY_PUSH_ENABLED", "false")
