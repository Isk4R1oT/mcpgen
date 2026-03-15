"""Tests for chat agent — clarification assistant during wizard."""

from pathlib import Path

import pytest

from backend.agents.chat_agent import create_chat_agent, build_chat_prompt
from backend.agents.models import ChatSuggestion
from backend.pipeline.parser import parse_openapi_from_file, extract_endpoints_from_spec

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class TestBuildChatPrompt:
    def test_prompt_includes_user_message(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        prompt = build_chat_prompt(
            user_message="Should I include the delete endpoints?",
            endpoints=endpoints[:3],
            current_config={"selected_endpoints": ["get_/pet"], "auth_strategy": {"type": "none"}},
            chat_history=[],
        )
        assert "delete" in prompt.lower()

    def test_prompt_includes_endpoint_context(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        prompt = build_chat_prompt(
            user_message="What does list pets do?",
            endpoints=endpoints[:3],
            current_config={},
            chat_history=[],
        )
        assert "/pet" in prompt

    def test_prompt_includes_chat_history(self) -> None:
        prompt = build_chat_prompt(
            user_message="And what about auth?",
            endpoints=[],
            current_config={},
            chat_history=[
                {"role": "user", "content": "Which endpoints should I pick?"},
                {"role": "assistant", "content": "I recommend starting with GET endpoints."},
            ],
        )
        assert "Which endpoints" in prompt
        assert "recommend" in prompt


class TestChatAgentCreation:
    def test_create_agent(self) -> None:
        agent = create_chat_agent(
            api_key="test-key",
            model_name="x-ai/grok-code-fast-1",
        )
        assert agent is not None


class TestChatSuggestionModel:
    def test_simple_message(self) -> None:
        suggestion = ChatSuggestion(
            message="I recommend including all GET endpoints for read-only access.",
            config_updates=None,
            endpoint_suggestions=None,
        )
        assert len(suggestion.message) > 0

    def test_with_config_update(self) -> None:
        suggestion = ChatSuggestion(
            message="Switching to bearer auth since the API uses OAuth2.",
            config_updates={"auth_strategy": {"type": "bearer"}},
            endpoint_suggestions=None,
        )
        assert suggestion.config_updates is not None

    def test_with_endpoint_suggestions(self) -> None:
        suggestion = ChatSuggestion(
            message="You should also include the store endpoints.",
            config_updates=None,
            endpoint_suggestions=["get_/store/inventory", "post_/store/order"],
        )
        assert len(suggestion.endpoint_suggestions) == 2
