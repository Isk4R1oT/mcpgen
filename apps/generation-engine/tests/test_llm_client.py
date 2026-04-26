"""Tests for the MODEL singleton (single LLM entrypoint, LiteLLM DELETED)."""

from __future__ import annotations

import importlib

import pytest


def test_get_model_requires_openrouter_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """No silent None fallback: get_model() raises KeyError when env is unset.

    Strategy: set a placeholder before importing so the module can be loaded
    cleanly under conftest's _sandbox_env, then delenv and assert that calling
    get_model() (the FUNCTION, not module load) raises KeyError.
    """
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test-PLACEHOLDER")
    import mcpgen_engine.llm.client as client_mod

    importlib.reload(client_mod)  # loads cleanly under placeholder
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(KeyError):
        client_mod.get_model()


def test_model_uses_qwen3_coder_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test-PLACEHOLDER")
    monkeypatch.delenv("PRIMARY_MODEL", raising=False)
    import mcpgen_engine.llm.client as client_mod

    importlib.reload(client_mod)
    model = client_mod.get_model()
    assert model.model_name == "qwen/qwen3-coder"


def test_primary_model_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test-PLACEHOLDER")
    monkeypatch.setenv("PRIMARY_MODEL", "qwen/qwen3-30b-a3b-instruct")
    import mcpgen_engine.llm.client as client_mod

    importlib.reload(client_mod)
    model = client_mod.get_model()
    assert model.model_name == "qwen/qwen3-30b-a3b-instruct"
