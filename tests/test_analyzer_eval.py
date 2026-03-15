"""DeepEval tests for analyzer agent — real LLM calls.

Run with: pytest tests/test_analyzer_eval.py -v -k eval
These tests make real API calls to OpenRouter and are slower.
"""

import os
from pathlib import Path

import pytest
from deepeval import evaluate
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

from backend.agents.analyzer_agent import create_analyzer_agent, build_analysis_prompt
from backend.agents.models import AnalysisResult
from backend.pipeline.parser import parse_openapi_from_file, extract_endpoints_from_spec

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def get_openrouter_key() -> str:
    """Read real API key from .env file, skipping if not available."""
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                key = line.split("=", 1)[1].strip()
                if key and not key.startswith("sk-or-v1-your"):
                    return key
    pytest.skip("Real OPENROUTER_API_KEY not found in .env")
    return ""


@pytest.mark.slow
class TestAnalyzerEval:
    async def test_analyzer_produces_valid_analysis(self) -> None:
        """Test that the analyzer agent produces a valid AnalysisResult for petstore."""
        api_key = get_openrouter_key()

        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        prompt = build_analysis_prompt(endpoints, spec.auth_schemes)

        agent = create_analyzer_agent(
            api_key=api_key,
            model_name="x-ai/grok-code-fast-1",
        )

        result = await agent.run(prompt)
        analysis = result.output

        # Structural validation
        assert isinstance(analysis, AnalysisResult)
        assert len(analysis.tools) > 0
        assert analysis.server_name != ""
        assert analysis.server_description != ""

        # All tools should have snake_case names
        for tool in analysis.tools:
            assert tool.tool_name == tool.tool_name.lower()
            assert " " not in tool.tool_name

    async def test_analyzer_tool_descriptions_quality(self) -> None:
        """Use deepeval GEval to judge the quality of generated tool descriptions."""
        api_key = get_openrouter_key()

        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        prompt = build_analysis_prompt(endpoints[:4], spec.auth_schemes)

        agent = create_analyzer_agent(
            api_key=api_key,
            model_name="x-ai/grok-code-fast-1",
        )

        result = await agent.run(prompt)
        analysis = result.output

        # Build test case for deepeval
        tool_descriptions = "\n".join(
            f"- {t.tool_name}: {t.description}" for t in analysis.tools
        )

        description_quality = GEval(
            name="Tool Description Quality",
            criteria=(
                "Assess whether the tool descriptions are clear, actionable, and "
                "written for an LLM audience. Each description should explain WHEN "
                "to use the tool and WHAT it returns. Descriptions should be specific "
                "to the API domain (petstore in this case)."
            ),
            threshold=0.7,
            evaluation_params=[
                LLMTestCaseParams.INPUT,
                LLMTestCaseParams.ACTUAL_OUTPUT,
            ],
        )

        test_case = LLMTestCase(
            input="Generate MCP server tool descriptions for a Petstore API with endpoints for managing pets, orders, and users.",
            actual_output=tool_descriptions,
        )

        results = evaluate([test_case], [description_quality])
        assert results.test_results[0].success, (
            f"Tool description quality failed: {results.test_results[0].metrics_data}"
        )

    async def test_analyzer_snake_case_naming(self) -> None:
        """Verify all generated tool names follow snake_case convention."""
        api_key = get_openrouter_key()

        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        prompt = build_analysis_prompt(endpoints[:4], spec.auth_schemes)

        agent = create_analyzer_agent(
            api_key=api_key,
            model_name="x-ai/grok-code-fast-1",
        )

        result = await agent.run(prompt)
        analysis = result.output

        for tool in analysis.tools:
            assert tool.tool_name.replace("_", "").isalnum(), (
                f"Tool name '{tool.tool_name}' contains invalid characters"
            )
            assert tool.tool_name == tool.tool_name.lower(), (
                f"Tool name '{tool.tool_name}' is not lowercase"
            )
