from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_key: str

    # OpenRouter
    openrouter_api_key: str
    openrouter_model: str

    # Database
    database_url: str = ""

    # Docker
    docker_registry: str
    docker_registry_push_enabled: bool

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
