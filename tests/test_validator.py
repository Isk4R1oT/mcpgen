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


class TestValidateGeneratedCode:
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

    def test_validation_result_structure(self) -> None:
        code = "x = 1"
        result = validate_generated_code(make_server(code))
        assert isinstance(result, ValidationResult)
        assert isinstance(result.syntax_ok, bool)
        assert isinstance(result.imports_ok, bool)
        assert isinstance(result.errors, list)

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
