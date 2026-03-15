import pytest
from pydantic import ValidationError

from backend.agents.models import (
    AnalysisResult,
    ChatSuggestion,
    GeneratedFile,
    GeneratedServer,
    ToolDefinition,
    ToolParameter,
)


class TestToolParameter:
    def test_create_tool_parameter(self) -> None:
        param = ToolParameter(
            name="pet_id",
            type="integer",
            description="The ID of the pet to retrieve",
            required=True,
        )
        assert param.name == "pet_id"
        assert param.required is True


class TestToolDefinition:
    def test_create_tool_definition(self) -> None:
        tool = ToolDefinition(
            tool_name="get_pet_by_id",
            description="Use when you need to retrieve details of a specific pet by its ID.",
            group="pets",
            http_method="GET",
            path="/pet/{petId}",
            parameters=[
                ToolParameter(
                    name="petId",
                    type="integer",
                    description="The pet ID",
                    required=True,
                )
            ],
            request_body_schema=None,
            response_description="Returns a Pet object with id, name, and status",
        )
        assert tool.tool_name == "get_pet_by_id"
        assert len(tool.parameters) == 1

    def test_tool_name_must_be_snake_case(self) -> None:
        """Tool names should be snake_case for best LLM tokenization."""
        tool = ToolDefinition(
            tool_name="list_all_pets",
            description="List pets",
            group="pets",
            http_method="GET",
            path="/pets",
            parameters=[],
            request_body_schema=None,
            response_description="List of pets",
        )
        assert "_" in tool.tool_name or tool.tool_name.islower()


class TestAnalysisResult:
    def test_create_analysis_result(self) -> None:
        result = AnalysisResult(
            server_name="petstore-mcp",
            server_description="MCP server for the Petstore API",
            tools=[
                ToolDefinition(
                    tool_name="list_pets",
                    description="Use when you need to list available pets.",
                    group="pets",
                    http_method="GET",
                    path="/pets",
                    parameters=[],
                    request_body_schema=None,
                    response_description="Array of Pet objects",
                ),
            ],
            auth_recommendation="api_key",
            notes=["Consider rate limiting for production use"],
        )
        assert result.server_name == "petstore-mcp"
        assert len(result.tools) == 1

    def test_analysis_result_requires_tools(self) -> None:
        result = AnalysisResult(
            server_name="test",
            server_description="test",
            tools=[],
            auth_recommendation="none",
            notes=[],
        )
        assert result.tools == []


class TestGeneratedFile:
    def test_create_generated_file(self) -> None:
        f = GeneratedFile(
            filename="server.py",
            content="from fastmcp import FastMCP\nmcp = FastMCP('test')",
            description="Main MCP server entry point",
        )
        assert f.filename == "server.py"


class TestGeneratedServer:
    def test_create_generated_server(self) -> None:
        server = GeneratedServer(
            files=[
                GeneratedFile(
                    filename="server.py",
                    content="from fastmcp import FastMCP",
                    description="Main server",
                ),
                GeneratedFile(
                    filename="requirements.txt",
                    content="fastmcp>=3.1.0\nhttpx>=0.28",
                    description="Dependencies",
                ),
            ],
            requirements=["fastmcp>=3.1.0", "httpx>=0.28"],
            env_vars=["API_KEY", "BASE_URL"],
            startup_command="python server.py",
        )
        assert len(server.files) == 2
        assert "API_KEY" in server.env_vars

    def test_generated_server_requires_files(self) -> None:
        with pytest.raises(ValidationError):
            GeneratedServer(
                files=[],
                requirements=[],
                env_vars=[],
                startup_command="python server.py",
            )


class TestChatSuggestion:
    def test_chat_suggestion_simple(self) -> None:
        suggestion = ChatSuggestion(
            message="I recommend excluding admin endpoints.",
            config_updates=None,
            endpoint_suggestions=None,
        )
        assert suggestion.message.startswith("I recommend")

    def test_chat_suggestion_with_updates(self) -> None:
        suggestion = ChatSuggestion(
            message="Switching to bearer auth.",
            config_updates={"auth_strategy": {"type": "bearer"}},
            endpoint_suggestions=["get_/pets", "post_/pets"],
        )
        assert suggestion.config_updates is not None
        assert len(suggestion.endpoint_suggestions) == 2
