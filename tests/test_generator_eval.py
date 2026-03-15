"""DeepEval tests for generator agent — real LLM calls.

Run with: pytest tests/test_generator_eval.py -v
These tests make real API calls to OpenRouter.
"""

import os
from pathlib import Path

import pytest

from backend.agents.generator_agent import create_generator_agent, build_generation_prompt
from backend.agents.models import (
    AnalysisResult,
    GeneratedServer,
    ToolDefinition,
    ToolParameter,
)
from backend.pipeline.validator import validate_generated_code


FIXTURES_DIR = Path(__file__).parent / "fixtures"


def get_openrouter_key() -> str:
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                key = line.split("=", 1)[1].strip()
                if key and not key.startswith("sk-or-v1-your"):
                    return key
    pytest.skip("Real OPENROUTER_API_KEY not found in .env")
    return ""


def sample_analysis() -> AnalysisResult:
    return AnalysisResult(
        server_name="petstore_mcp",
        server_description="MCP server for the Petstore API",
        tools=[
            ToolDefinition(
                tool_name="list_pets",
                description="Use when you need to list available pets.",
                group="pet",
                http_method="GET",
                path="/pet",
                parameters=[
                    ToolParameter(
                        name="status",
                        type="string",
                        description="Filter by status",
                        required=False,
                    ),
                ],
                request_body_schema=None,
                response_description="Array of Pet objects",
            ),
            ToolDefinition(
                tool_name="get_pet_by_id",
                description="Use when you need to get a pet by ID.",
                group="pet",
                http_method="GET",
                path="/pet/{petId}",
                parameters=[
                    ToolParameter(
                        name="petId",
                        type="integer",
                        description="Pet ID",
                        required=True,
                    ),
                ],
                request_body_schema=None,
                response_description="Pet object",
            ),
        ],
        auth_recommendation="api_key",
        notes=[],
    )


@pytest.mark.slow
class TestGeneratorEval:
    async def test_generator_produces_valid_server(self) -> None:
        """Test that the generator produces a syntactically valid MCP server."""
        api_key = get_openrouter_key()

        analysis = sample_analysis()
        prompt = build_generation_prompt(
            analysis,
            auth_type="api_key",
            base_url="https://petstore.swagger.io/v2",
        )

        agent = create_generator_agent(
            api_key=api_key,
            model_name="x-ai/grok-code-fast-1",
        )

        result = await agent.run(prompt)
        generated = result.output

        # Structural validation
        assert isinstance(generated, GeneratedServer)
        assert len(generated.files) >= 1

        # Must have server.py
        filenames = [f.filename for f in generated.files]
        assert "server.py" in filenames

        # Server code must contain FastMCP
        server_py = next(f for f in generated.files if f.filename == "server.py")
        assert "FastMCP" in server_py.content or "fastmcp" in server_py.content

        # Requirements should include fastmcp
        assert any("fastmcp" in r.lower() for r in generated.requirements)

    async def test_generated_code_passes_validation(self) -> None:
        """Test that generated code passes syntax and import validation."""
        api_key = get_openrouter_key()

        analysis = sample_analysis()
        prompt = build_generation_prompt(
            analysis,
            auth_type="api_key",
            base_url="https://petstore.swagger.io/v2",
        )

        agent = create_generator_agent(
            api_key=api_key,
            model_name="x-ai/grok-code-fast-1",
        )

        result = await agent.run(prompt)
        generated = result.output

        validation = validate_generated_code(generated)
        assert validation.syntax_ok, f"Syntax errors: {validation.errors}"
