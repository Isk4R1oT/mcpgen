"""Engine settings loaded from environment variables (CLAUDE.md: no Any, strict typing).

Per CLAUDE.md global rules ("no default parameter values"), function and method
signatures avoid defaults. This module uses pydantic-settings, where class-attribute
defaults are the documented idiom for environment-variable defaults — these are
data declarations, NOT positional/keyword function defaults.

The single field WITHOUT a default (`openrouter_api_key`) is intentional: engine
startup MUST fail at construction time if the key is unset (T-1-09 fail-fast).
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class EngineSettings(BaseSettings):
    """All required engine env vars."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # OpenRouter (LLM provider) — only required field. Empty default would mask Pitfall #27.
    openrouter_api_key: str
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    primary_model: str = "qwen/qwen3-coder"

    # Sentry (FND-10 / D-19) — empty in Phase 1, filled per env in Phase 9.
    sentry_dsn: str = ""
    sentry_release: str = ""
    environment: str = "development"

    # Langfuse OTel exporter (FND-11) — empty in Phase 1; populated in Phase 9.
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_otel_endpoint: str = "https://cloud.langfuse.com/api/public/otel/v1/traces"

    # DB (used in Phase 2+).
    database_url: str = ""
