import pytest

from backend.agents.models import GeneratedFile, GeneratedServer
from backend.pipeline.validator import validate_generated_code, ValidationResult


def make_server(server_code: str) -> GeneratedServer:
    return GeneratedServer(
        files=[
            GeneratedFile(filename="server.py", content=server_code, description="Main server"),
        ],
        requirements=["fastmcp>=3.1.0", "httpx>=0.28"],
        env_vars=["API_KEY"],
        startup_command="python server.py",
    )


class TestSyntaxValidation:
    def test_valid_python_passes_syntax(self) -> None:
        code = '''
import os

def hello():
    return "world"

if __name__ == "__main__":
    print(hello())
'''
        result = validate_generated_code(make_server(code))
        assert result.syntax_ok is True

    def test_invalid_python_fails_syntax(self) -> None:
        code = '''
def hello(
    # missing closing paren
    return "world"
'''
        result = validate_generated_code(make_server(code))
        assert result.syntax_ok is False
        assert len(result.errors) > 0
        assert any("SyntaxError" in e for e in result.errors)

    def test_multiple_files_validated(self) -> None:
        server = GeneratedServer(
            files=[
                GeneratedFile(filename="server.py", content="x = 1", description="Main"),
                GeneratedFile(filename="utils.py", content="y = 2", description="Utils"),
            ],
            requirements=[],
            env_vars=[],
            startup_command="python server.py",
        )
        result = validate_generated_code(server)
        assert result.syntax_ok is True


class TestImportValidation:
    def test_valid_imports_pass(self) -> None:
        code = '''
import os
import json

def main():
    return json.dumps({"ok": True})
'''
        result = validate_generated_code(make_server(code))
        assert result.syntax_ok is True
        assert result.imports_ok is True

    def test_invalid_imports_fail(self) -> None:
        code = '''
import nonexistent_module_xyz_123

def main():
    pass
'''
        result = validate_generated_code(make_server(code))
        assert result.syntax_ok is True
        assert result.imports_ok is False


class TestRuntimeValidation:
    def test_valid_fastmcp_server_discovers_tools(self) -> None:
        """A proper FastMCP server should have tools discovered at runtime."""
        code = '''
import os
from fastmcp import FastMCP

mcp = FastMCP(name="test_server")

@mcp.tool
def hello(name: str) -> str:
    """Say hello."""
    return f"Hello, {name}!"

@mcp.tool
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
'''
        result = validate_generated_code(make_server(code))
        assert result.syntax_ok is True
        assert result.imports_ok is True
        assert result.runtime_ok is True, f"Runtime errors: {result.errors}"
        assert len(result.tools_discovered) == 2
        assert "hello" in result.tools_discovered
        assert "add" in result.tools_discovered

    def test_fastmcp_server_with_async_tools(self) -> None:
        """Async tools should also be discovered."""
        code = '''
import os
from typing import Annotated
from fastmcp import FastMCP

mcp = FastMCP(name="async_test")

@mcp.tool
async def fetch_data(url: Annotated[str, "URL to fetch"]) -> dict:
    """Fetch data from a URL."""
    return {"url": url, "status": "ok"}

@mcp.tool
def health_check() -> dict:
    """Check server health."""
    return {"status": "ok"}

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
'''
        result = validate_generated_code(make_server(code))
        assert result.syntax_ok is True
        assert result.runtime_ok is True, f"Runtime errors: {result.errors}"
        assert "fetch_data" in result.tools_discovered
        assert "health_check" in result.tools_discovered

    def test_no_mcp_instance_fails_runtime(self) -> None:
        """Code without a FastMCP instance should fail runtime check."""
        code = '''
import os

def hello():
    return "world"
'''
        result = validate_generated_code(make_server(code))
        assert result.syntax_ok is True
        # Runtime should fail — no FastMCP server, no tools
        assert result.tools_discovered == []


class TestValidationResultStructure:
    def test_result_has_all_fields(self) -> None:
        code = "x = 1"
        result = validate_generated_code(make_server(code))
        assert isinstance(result, ValidationResult)
        assert isinstance(result.syntax_ok, bool)
        assert isinstance(result.imports_ok, bool)
        assert isinstance(result.runtime_ok, bool)
        assert isinstance(result.tools_discovered, list)
        assert isinstance(result.errors, list)
