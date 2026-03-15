"""Tests for the LLM endpoint extractor agent."""

import pytest

from backend.agents.extractor_agent import (
    ExtractionResult,
    ExtractedEndpoint,
    create_extractor_agent,
    build_extraction_prompt,
)


class TestBuildExtractionPrompt:
    def test_prompt_includes_text(self) -> None:
        text = "GET /users - list all users"
        prompt = build_extraction_prompt(text, "markdown")
        assert "GET /users" in prompt

    def test_prompt_truncates_long_text(self) -> None:
        text = "x" * 20000
        prompt = build_extraction_prompt(text, "html")
        assert "truncated" in prompt.lower()
        assert len(prompt) < 15000

    def test_prompt_includes_source_type(self) -> None:
        prompt = build_extraction_prompt("test", "pdf")
        assert "pdf" in prompt


class TestExtractionResultModel:
    def test_create_extraction_result(self) -> None:
        result = ExtractionResult(
            title="Users API",
            base_url="https://api.example.com",
            auth_type="bearer",
            endpoints=[
                ExtractedEndpoint(
                    method="GET",
                    path="/users",
                    summary="List all users",
                    parameters=[],
                    request_body=None,
                    response_description="Array of User objects",
                    tag="users",
                ),
                ExtractedEndpoint(
                    method="POST",
                    path="/users",
                    summary="Create a user",
                    parameters=[],
                    request_body={"name": "string", "email": "string"},
                    response_description="Created User object",
                    tag="users",
                ),
            ],
        )
        assert len(result.endpoints) == 2
        assert result.title == "Users API"
        assert result.auth_type == "bearer"

    def test_empty_endpoints(self) -> None:
        result = ExtractionResult(
            title="Empty API",
            base_url=None,
            auth_type=None,
            endpoints=[],
        )
        assert len(result.endpoints) == 0


class TestExtractorAgentCreation:
    def test_create_agent(self) -> None:
        agent = create_extractor_agent(
            api_key="test-key",
            model_name="x-ai/grok-code-fast-1",
        )
        assert agent is not None
