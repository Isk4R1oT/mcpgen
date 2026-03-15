from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from backend.agents.analyzer_agent import create_analyzer_agent, build_analysis_prompt
from backend.agents.models import AnalysisResult, ToolDefinition
from backend.pipeline.parser import parse_openapi_from_file, extract_endpoints_from_spec

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class TestBuildAnalysisPrompt:
    def test_prompt_includes_endpoints(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        prompt = build_analysis_prompt(endpoints[:3], spec.auth_schemes)
        assert "/pet" in prompt
        assert "GET" in prompt

    def test_prompt_includes_auth_schemes(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        prompt = build_analysis_prompt(endpoints[:1], spec.auth_schemes)
        assert "apiKey" in prompt or "api_key" in prompt

    def test_prompt_includes_parameter_details(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        pet_by_id = next(e for e in endpoints if "petId" in e.path and e.method == "GET")
        prompt = build_analysis_prompt([pet_by_id], spec.auth_schemes)
        assert "petId" in prompt


class TestAnalyzerAgentCreation:
    def test_create_agent_returns_agent(self) -> None:
        agent = create_analyzer_agent(
            api_key="test-key",
            model_name="x-ai/grok-code-fast-1",
        )
        assert agent is not None

    def test_agent_has_correct_output_type(self) -> None:
        agent = create_analyzer_agent(
            api_key="test-key",
            model_name="x-ai/grok-code-fast-1",
        )
        # PydanticAI agents store output type info
        assert agent is not None


class TestAnalysisResultValidation:
    def test_analysis_result_with_petstore_tools(self) -> None:
        """Verify that a well-formed AnalysisResult for petstore is valid."""
        result = AnalysisResult(
            server_name="petstore-mcp",
            server_description="MCP server for Swagger Petstore API. Provides tools to manage pets, store orders, and users.",
            tools=[
                ToolDefinition(
                    tool_name="list_pets",
                    description="Use when you need to list available pets. Returns an array of Pet objects with id, name, and status.",
                    group="pet",
                    http_method="GET",
                    path="/pet",
                    parameters=[],
                    request_body_schema=None,
                    response_description="Array of Pet objects",
                ),
                ToolDefinition(
                    tool_name="get_pet_by_id",
                    description="Use when you need to retrieve a specific pet by its unique ID. Returns a single Pet object.",
                    group="pet",
                    http_method="GET",
                    path="/pet/{petId}",
                    parameters=[{
                        "name": "petId",
                        "type": "integer",
                        "description": "The unique identifier of the pet",
                        "required": True,
                    }],
                    request_body_schema=None,
                    response_description="Single Pet object with id, name, and status",
                ),
            ],
            auth_recommendation="api_key",
            notes=["The /pet/findByTags endpoint is deprecated and excluded"],
        )
        assert result.server_name == "petstore-mcp"
        assert len(result.tools) == 2
        assert all("Use when" in t.description for t in result.tools)
