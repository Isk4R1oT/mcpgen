"""Tests for evaluation metrics framework."""

import pytest

from backend.agents.models import (
    AnalysisResult,
    GeneratedFile,
    GeneratedServer,
    ToolDefinition,
    ToolParameter,
)
from backend.eval.metrics import (
    EvaluationReport,
    check_auth_from_env,
    check_error_handling,
    check_health_check,
    check_no_hardcoded_secrets,
    check_syntax,
    check_type_hints,
    run_automated_metrics,
)


def make_server(code: str) -> GeneratedServer:
    return GeneratedServer(
        files=[GeneratedFile(filename="server.py", content=code, description="Main")],
        requirements=["fastmcp>=3.1.0"],
        env_vars=["API_KEY"],
        startup_command="python server.py",
    )


def sample_analysis() -> AnalysisResult:
    return AnalysisResult(
        server_name="test_mcp",
        server_description="Test server",
        tools=[
            ToolDefinition(
                tool_name="get_item",
                description="Use when you need to get an item.",
                group="items",
                http_method="GET",
                path="/items/{id}",
                parameters=[ToolParameter(name="id", type="integer", description="Item ID", required=True)],
                request_body_schema=None,
                response_description="Item object",
            ),
        ],
        auth_recommendation="api_key",
        notes=[],
    )


GOOD_SERVER = '''
import os
from typing import Annotated
import httpx
from fastmcp import FastMCP

mcp = FastMCP(name="test_mcp")
BASE_URL = os.environ.get("BASE_URL", "https://api.example.com")
API_KEY = os.environ.get("API_KEY", "")
headers = {"Authorization": API_KEY}

@mcp.tool
async def get_item(item_id: Annotated[int, "The item ID"]) -> dict:
    """Use when you need to get an item by ID. Returns the item object."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{BASE_URL}/items/{item_id}", headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        return {"error": f"HTTP {e.response.status_code}", "detail": e.response.text[:200]}
    except httpx.RequestError as e:
        return {"error": "request_failed", "detail": str(e)}

@mcp.tool
def health_check() -> dict:
    """Check server health."""
    return {"status": "ok", "server": "test_mcp"}

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
'''


class TestSyntaxMetric:
    def test_valid_code_passes(self) -> None:
        result = check_syntax(make_server("x = 1"))
        assert result.passed is True
        assert result.score == 1.0

    def test_invalid_code_fails(self) -> None:
        result = check_syntax(make_server("def f(\n  return"))
        assert result.passed is False
        assert result.score == 0.0


class TestNoHardcodedSecrets:
    def test_clean_code_passes(self) -> None:
        code = 'API_KEY = os.environ.get("API_KEY", "")'
        result = check_no_hardcoded_secrets(make_server(code))
        assert result.passed is True

    def test_hardcoded_key_fails(self) -> None:
        code = 'api_key = "sk-1234567890abcdefghijklmnop"'
        result = check_no_hardcoded_secrets(make_server(code))
        assert result.passed is False


class TestAuthFromEnv:
    def test_no_auth_params_passes(self) -> None:
        result = check_auth_from_env(make_server(GOOD_SERVER))
        assert result.passed is True

    def test_auth_as_tool_param_fails(self) -> None:
        code = '''
from fastmcp import FastMCP
mcp = FastMCP(name="test")

@mcp.tool
def get_data(api_key: str, query: str) -> dict:
    """Get data."""
    return {}
'''
        result = check_auth_from_env(make_server(code))
        assert result.passed is False
        assert "api_key" in result.details


class TestHealthCheck:
    def test_health_check_present(self) -> None:
        result = check_health_check(make_server(GOOD_SERVER))
        assert result.passed is True

    def test_health_check_missing(self) -> None:
        code = '''
from fastmcp import FastMCP
mcp = FastMCP(name="test")

@mcp.tool
def hello() -> str:
    """Say hello."""
    return "hello"

if __name__ == "__main__":
    mcp.run()
'''
        result = check_health_check(make_server(code))
        assert result.passed is False


class TestErrorHandling:
    def test_good_error_handling(self) -> None:
        result = check_error_handling(make_server(GOOD_SERVER))
        assert result.score >= 0.5
        assert result.passed is True

    def test_no_error_handling(self) -> None:
        code = '''
import httpx
from fastmcp import FastMCP
mcp = FastMCP(name="test")

@mcp.tool
async def get_data() -> dict:
    """Get data."""
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.example.com/data")
        return response.json()
'''
        result = check_error_handling(make_server(code))
        assert result.score < 0.5


class TestTypeHints:
    def test_fully_annotated(self) -> None:
        result = check_type_hints(make_server(GOOD_SERVER))
        assert result.score >= 0.5

    def test_no_annotations(self) -> None:
        code = '''
def hello(name):
    return f"Hello, {name}"

def add(a, b):
    return a + b
'''
        result = check_type_hints(make_server(code))
        assert result.score == 0.0


class TestEvaluationReport:
    def test_report_composite_score(self) -> None:
        report = EvaluationReport()
        report.metrics = run_automated_metrics(make_server(GOOD_SERVER), sample_analysis())
        assert report.composite_score > 0.0
        assert isinstance(report.summary, dict)

    def test_report_summary_by_dimension(self) -> None:
        report = EvaluationReport()
        report.metrics = run_automated_metrics(make_server(GOOD_SERVER), sample_analysis())
        summary = report.summary
        assert "Security" in summary
        assert "Code Correctness" in summary
        assert "Completeness" in summary
