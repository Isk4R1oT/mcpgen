"""Supabase client singleton."""

from supabase import create_client, Client

from backend.config import Settings


_client: Client | None = None


def get_supabase_client() -> Client:
    """Get or create Supabase client singleton."""
    global _client
    if _client is None:
        settings = Settings()
        _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client


def reset_client() -> None:
    """Reset the client (for testing)."""
    global _client
    _client = None
