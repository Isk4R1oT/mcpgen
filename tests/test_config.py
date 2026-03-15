import pytest

from backend.config import Settings


class TestSettings:
    def test_settings_loads_from_env(self) -> None:
        settings = Settings()
        assert settings.supabase_url == "https://test-project.supabase.co"
        assert settings.supabase_key == "test-supabase-key"
        assert settings.openrouter_api_key == "test-openrouter-key"
        assert settings.openrouter_model == "anthropic/claude-sonnet-4-5"

    def test_settings_docker_defaults(self) -> None:
        settings = Settings()
        assert settings.docker_registry == "ghcr.io/test-user"
        assert settings.docker_registry_push_enabled is False

    def test_settings_app_defaults(self) -> None:
        settings = Settings()
        assert settings.app_host == "0.0.0.0"
        assert settings.app_port == 8000

    def test_settings_requires_supabase_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("SUPABASE_URL")
        with pytest.raises(Exception):
            Settings(_env_file=None)

    def test_settings_requires_supabase_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("SUPABASE_KEY")
        with pytest.raises(Exception):
            Settings(_env_file=None)

    def test_settings_requires_openrouter_api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("OPENROUTER_API_KEY")
        with pytest.raises(Exception):
            Settings(_env_file=None)
