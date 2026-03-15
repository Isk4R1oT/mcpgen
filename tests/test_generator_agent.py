from pathlib import Path

import pytest

from backend.agents.generator_agent import (
    create_generator_agent,
    build_generation_prompt,
)
from backend.agents.models import (
    AnalysisResult,
    GeneratedServer,
    ToolDefinition,
    ToolParameter,
)


def sample_analysis() -> AnalysisResult:
    """Create a sample AnalysisResult for testing."""
    return AnalysisResult(
        server_name="petstore_mcp",
        server_description="MCP server for the Petstore API",
        tools=[
            ToolDefinition(
                tool_name="list_pets",
                description="Use when you need to list available pets. Returns an array of Pet objects.",
                group="pet",
                http_method="GET",
                path="/pet",
                parameters=[
                    ToolParameter(
                        name="status",
                        type="string",
                        description="Filter by pet status (available, pending, sold)",
                        required=False,
                    ),
                ],
                request_body_schema=None,
                response_description="Array of Pet objects with id, name, status",
            ),
            ToolDefinition(
                tool_name="get_pet_by_id",
                description="Use when you need to retrieve a specific pet by its unique ID.",
                group="pet",
                http_method="GET",
                path="/pet/{petId}",
                parameters=[
                    ToolParameter(
                        name="petId",
                        type="integer",
                        description="The unique identifier of the pet",
                        required=True,
                    ),
                ],
                request_body_schema=None,
                response_description="Single Pet object",
            ),
            ToolDefinition(
                tool_name="add_pet",
                description="Use when you need to add a new pet to the store.",
                group="pet",
                http_method="POST",
                path="/pet",
                parameters=[],
                request_body_schema={
                    "type": "object",
                    "required": ["name"],
                    "properties": {
                        "name": {"type": "string"},
                        "status": {"type": "string", "enum": ["available", "pending", "sold"]},
                    },
                },
                response_description="Created Pet object",
            ),
        ],
        auth_recommendation="api_key",
        notes=[],
    )


class TestBuildGenerationPrompt:
    def test_prompt_includes_tool_names(self) -> None:
        analysis = sample_analysis()
        prompt = build_generation_prompt(
            analysis,
            auth_type="api_key",
            base_url="https://petstore.swagger.io/v2",
        )
        assert "list_pets" in prompt
        assert "get_pet_by_id" in prompt
        assert "add_pet" in prompt

    def test_prompt_includes_auth_type(self) -> None:
        analysis = sample_analysis()
        prompt = build_generation_prompt(analysis, auth_type="api_key", base_url="https://example.com")
        assert "API Key" in prompt or "API_KEY" in prompt

    def test_prompt_includes_base_url(self) -> None:
        analysis = sample_analysis()
        prompt = build_generation_prompt(
            analysis, auth_type="none", base_url="https://petstore.swagger.io/v2"
        )
        assert "petstore.swagger.io" in prompt

    def test_prompt_includes_request_body(self) -> None:
        analysis = sample_analysis()
        prompt = build_generation_prompt(analysis, auth_type="none", base_url="https://example.com")
        assert "name" in prompt  # From add_pet request body


class TestGeneratorAgentCreation:
    def test_create_agent(self) -> None:
        agent = create_generator_agent(
            api_key="test-key",
            model_name="x-ai/grok-code-fast-1",
        )
        assert agent is not None
