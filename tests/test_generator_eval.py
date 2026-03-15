"""DeepEval tests for generator agent — real LLM calls with runtime validation.

Run with: pytest tests/test_generator_eval.py -v
These tests make real API calls to OpenRouter.
"""

from pathlib import Path

import pytest
from deepeval import evaluate
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

from backend.agents.generator_agent import create_generator_agent, build_generation_prompt
from backend.agents.models import (
    AnalysisResult,
    GeneratedServer,
    ToolDefinition,
    ToolParameter,
)
from backend.eval.openrouter_judge import OpenRouterJudge
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
        """Test structural validity of generated server."""
        api_key = get_openrouter_key()

        analysis = sample_analysis()
        prompt = build_generation_prompt(
            analysis,
            auth_type="api_key",
            base_url="https://petstore.swagger.io/v2",
        )

        agent = create_generator_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        result = await agent.run(prompt)
        generated = result.output

        assert isinstance(generated, GeneratedServer)
        assert len(generated.files) >= 1

        filenames = [f.filename for f in generated.files]
        assert "server.py" in filenames

        server_py = next(f for f in generated.files if f.filename == "server.py")
        assert "FastMCP" in server_py.content or "fastmcp" in server_py.content
        assert any("fastmcp" in r.lower() for r in generated.requirements)

    async def test_generated_code_passes_syntax_validation(self) -> None:
        """Syntax + import check."""
        api_key = get_openrouter_key()

        analysis = sample_analysis()
        prompt = build_generation_prompt(
            analysis,
            auth_type="api_key",
            base_url="https://petstore.swagger.io/v2",
        )

        agent = create_generator_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        result = await agent.run(prompt)

        validation = validate_generated_code(result.output)
        assert validation.syntax_ok, f"Syntax errors: {validation.errors}"
        assert validation.imports_ok, f"Import errors: {validation.errors}"

    async def test_generated_code_passes_runtime_validation(self) -> None:
        """Runtime check — fastmcp list discovers tools."""
        api_key = get_openrouter_key()

        analysis = sample_analysis()
        prompt = build_generation_prompt(
            analysis,
            auth_type="api_key",
            base_url="https://petstore.swagger.io/v2",
        )

        agent = create_generator_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        result = await agent.run(prompt)

        validation = validate_generated_code(result.output)
        assert validation.syntax_ok, f"Syntax errors: {validation.errors}"
        assert validation.runtime_ok, f"Runtime errors: {validation.errors}"
        assert len(validation.tools_discovered) > 0, (
            f"No tools discovered. Errors: {validation.errors}"
        )

    async def test_generated_tools_match_analysis(self) -> None:
        """Semantic check — tool names from runtime should match analysis tool names."""
        api_key = get_openrouter_key()

        analysis = sample_analysis()
        expected_tools = {t.tool_name for t in analysis.tools}
        # Add health_check which we ask the generator to include
        expected_tools.add("health_check")

        prompt = build_generation_prompt(
            analysis,
            auth_type="api_key",
            base_url="https://petstore.swagger.io/v2",
        )

        agent = create_generator_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        result = await agent.run(prompt)

        validation = validate_generated_code(result.output)
        discovered = set(validation.tools_discovered)

        # All expected tools from analysis should be in discovered tools
        missing = expected_tools - discovered
        assert len(missing) == 0, (
            f"Missing tools: {missing}. Discovered: {discovered}. Errors: {validation.errors}"
        )

    async def test_generated_code_quality(self) -> None:
        """Use deepeval GEval with OpenRouter judge to assess code quality."""
        api_key = get_openrouter_key()
        judge = OpenRouterJudge(api_key=api_key, model_name="x-ai/grok-code-fast-1")

        analysis = sample_analysis()
        prompt = build_generation_prompt(
            analysis,
            auth_type="api_key",
            base_url="https://petstore.swagger.io/v2",
        )

        agent = create_generator_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        result = await agent.run(prompt)
        server_py = next(f for f in result.output.files if f.filename == "server.py")

        code_quality = GEval(
            name="MCP Server Code Quality",
            criteria=(
                "Assess this Python MCP server code for: "
                "1) Correct use of FastMCP decorators (@mcp.tool). "
                "2) Proper async/await with httpx for HTTP calls. "
                "3) Error handling (try/except around HTTP calls). "
                "4) Auth credentials read from os.environ. "
                "5) Proper type hints on function parameters."
            ),
            threshold=0.7,
            evaluation_params=[
                LLMTestCaseParams.INPUT,
                LLMTestCaseParams.ACTUAL_OUTPUT,
            ],
            model=judge,
        )

        test_case = LLMTestCase(
            input="Generate a FastMCP server with tools for listing pets and getting pet by ID, using API key auth.",
            actual_output=server_py.content,
        )

        results = evaluate([test_case], [code_quality])
        assert results.test_results[0].success, (
            f"Code quality failed: {results.test_results[0].metrics_data}"
        )
