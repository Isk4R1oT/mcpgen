import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from backend.agents.models import GeneratedServer


@dataclass
class ValidationResult:
    syntax_ok: bool
    imports_ok: bool
    runtime_ok: bool
    tools_discovered: list[str]
    errors: list[str] = field(default_factory=list)


def validate_generated_code(server: GeneratedServer) -> ValidationResult:
    """Validate generated MCP server code.

    Four-phase validation:
    1. Syntax check: compile() each .py file
    2. Import check: verify all imported modules exist
    3. Runtime check: use `fastmcp list` to verify tools register
    """
    errors: list[str] = []

    # Phase 1: Syntax check
    syntax_ok = _check_syntax(server, errors)
    if not syntax_ok:
        return ValidationResult(
            syntax_ok=False, imports_ok=False, runtime_ok=False,
            tools_discovered=[], errors=errors,
        )

    # Phase 2: Import check
    imports_ok = _check_imports(server, errors)

    # Phase 3: Runtime check — actually load the FastMCP server and list tools
    runtime_ok = False
    tools_discovered: list[str] = []
    runtime_ok, tools_discovered = _check_runtime(server, errors)

    return ValidationResult(
        syntax_ok=syntax_ok,
        imports_ok=imports_ok,
        runtime_ok=runtime_ok,
        tools_discovered=tools_discovered,
        errors=errors,
    )


def _check_syntax(server: GeneratedServer, errors: list[str]) -> bool:
    """Phase 1: compile() each .py file to catch SyntaxError."""
    ok = True
    for f in server.files:
        if not f.filename.endswith(".py"):
            continue
        try:
            compile(f.content, f.filename, "exec")
        except SyntaxError as e:
            ok = False
            errors.append(f"SyntaxError in {f.filename}:{e.lineno}: {e.msg}")
    return ok


def _check_imports(server: GeneratedServer, errors: list[str]) -> bool:
    """Phase 2: verify all imported modules are available."""
    ok = True
    for f in server.files:
        if not f.filename.endswith(".py"):
            continue
        for line in f.content.splitlines():
            stripped = line.strip()
            if not (stripped.startswith("import ") or stripped.startswith("from ")):
                continue
            module_name = _extract_module_name(stripped)
            if not module_name:
                continue
            if _is_local_module(module_name, server):
                continue
            if _is_stdlib_or_installed(module_name):
                continue
            ok = False
            errors.append(f"Unknown module in {f.filename}: {module_name}")
    return ok


def _check_runtime(
    server: GeneratedServer,
    errors: list[str],
) -> tuple[bool, list[str]]:
    """Phase 3: write files to tmpdir, run `fastmcp list server.py --json`
    to verify tools actually register in the FastMCP server."""
    tools: list[str] = []

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)

        # Write all generated files
        for f in server.files:
            (tmp_path / f.filename).write_text(f.content)

        # Write a minimal requirements so imports resolve
        # (we don't pip install — we rely on current venv)

        server_file = "server.py"
        if not any(f.filename == "server.py" for f in server.files):
            server_file = server.files[0].filename

        # Try fastmcp list first (most reliable)
        ok, tools = _try_fastmcp_list(tmp_path, server_file, errors)
        if ok:
            return True, tools

        # Fallback: try importing and listing tools via Python script
        ok, tools = _try_python_import(tmp_path, server_file, errors)
        return ok, tools


def _try_fastmcp_list(
    tmp_path: Path,
    server_file: str,
    errors: list[str],
) -> tuple[bool, list[str]]:
    """Run `fastmcp list server.py --json` and parse the output."""
    try:
        # Find fastmcp binary in the same venv as current Python
        python_dir = Path(sys.executable).parent
        fastmcp_bin = python_dir / "fastmcp"
        if not fastmcp_bin.exists():
            # Try as a module
            fastmcp_cmd = [sys.executable, "-m", "fastmcp"]
        else:
            fastmcp_cmd = [str(fastmcp_bin)]

        result = subprocess.run(
            [*fastmcp_cmd, "list", server_file, "--json"],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(tmp_path),
            env={**_get_clean_env(), "PYTHONPATH": str(tmp_path)},
        )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            # Filter out warnings (RequestsDependencyWarning etc.)
            error_lines = [
                line for line in stderr.splitlines()
                if not line.strip().startswith("warnings.warn")
                and "Warning:" not in line
                and "warn(" not in line
            ]
            meaningful_stderr = "\n".join(error_lines).strip()
            if meaningful_stderr:
                errors.append(f"fastmcp list failed: {meaningful_stderr[:500]}")
            return False, []

        # Parse JSON output
        stdout = result.stdout.strip()
        if not stdout:
            errors.append("fastmcp list returned empty output")
            return False, []

        try:
            data = json.loads(stdout)
        except json.JSONDecodeError:
            # fastmcp list might output non-JSON text, try to extract tool names
            tools = _parse_tool_names_from_text(stdout)
            if tools:
                return True, tools
            errors.append(f"Could not parse fastmcp list output: {stdout[:300]}")
            return False, []

        # Extract tool names from JSON
        tools = []
        if isinstance(data, dict) and "tools" in data:
            for t in data["tools"]:
                if isinstance(t, dict):
                    tools.append(t.get("name", "unknown"))
                elif isinstance(t, str):
                    tools.append(t)
        elif isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    tools.append(item.get("name", "unknown"))

        if tools:
            return True, tools

        errors.append("fastmcp list returned no tools")
        return False, []

    except subprocess.TimeoutExpired:
        errors.append("fastmcp list timed out (30s)")
        return False, []
    except FileNotFoundError:
        errors.append("fastmcp CLI not found")
        return False, []
    except Exception as e:
        errors.append(f"fastmcp list error: {e}")
        return False, []


def _try_python_import(
    tmp_path: Path,
    server_file: str,
    errors: list[str],
) -> tuple[bool, list[str]]:
    """Fallback: run a Python script that imports the server and lists tools."""
    check_script = f"""
import sys
import json
sys.path.insert(0, "{tmp_path}")

# Prevent the server from actually starting
import unittest.mock
with unittest.mock.patch("fastmcp.FastMCP.run"):
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("server", "{tmp_path / server_file}")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        # Find the FastMCP instance
        mcp_instance = None
        for name in dir(mod):
            obj = getattr(mod, name)
            if hasattr(obj, "_tool_manager"):
                mcp_instance = obj
                break

        if mcp_instance is None:
            print(json.dumps({{"error": "No FastMCP instance found"}}))
            sys.exit(1)

        # List tools
        tools = []
        if hasattr(mcp_instance, "_tool_manager") and hasattr(mcp_instance._tool_manager, "_tools"):
            for tool_name in mcp_instance._tool_manager._tools:
                tools.append(tool_name)

        print(json.dumps({{"tools": tools}}))
    except Exception as e:
        print(json.dumps({{"error": str(e)}}))
        sys.exit(1)
"""
    try:
        result = subprocess.run(
            [sys.executable, "-c", check_script],
            capture_output=True,
            text=True,
            timeout=15,
            env=_get_clean_env(),
        )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            if stderr:
                errors.append(f"Python import check failed: {stderr[:500]}")
            return False, []

        try:
            data = json.loads(result.stdout.strip())
        except json.JSONDecodeError:
            errors.append(f"Could not parse import check output: {result.stdout[:300]}")
            return False, []

        if "error" in data:
            errors.append(f"Import check error: {data['error']}")
            return False, []

        tools = data.get("tools", [])
        return len(tools) > 0, tools

    except subprocess.TimeoutExpired:
        errors.append("Python import check timed out (15s)")
        return False, []
    except Exception as e:
        errors.append(f"Python import check error: {e}")
        return False, []


def _parse_tool_names_from_text(text: str) -> list[str]:
    """Try to extract tool names from non-JSON fastmcp list output."""
    tools = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("- ") or line.startswith("* "):
            # Lines like "- tool_name" or "- tool_name: description"
            name = line[2:].split(":")[0].split("(")[0].strip()
            if name and name.replace("_", "").isalnum():
                tools.append(name)
    return tools


def _extract_module_name(import_line: str) -> str | None:
    """Extract the top-level module name from an import statement."""
    line = import_line.strip()
    if line.startswith("from "):
        parts = line.split()
        if len(parts) >= 2:
            return parts[1].split(".")[0]
    elif line.startswith("import "):
        parts = line.split()
        if len(parts) >= 2:
            return parts[1].split(".")[0].rstrip(",")
    return None


def _is_local_module(module_name: str, server: GeneratedServer) -> bool:
    """Check if a module refers to a local file in the generated server."""
    for f in server.files:
        if f.filename.replace(".py", "") == module_name:
            return True
    return False


def _is_stdlib_or_installed(module_name: str) -> bool:
    """Check if a module is in stdlib or installed packages."""
    try:
        __import__(module_name)
        return True
    except ImportError:
        return False


def _get_clean_env() -> dict[str, str]:
    """Get environment with dummy values for required env vars."""
    import os
    env = os.environ.copy()
    env.setdefault("API_KEY", "test-key")
    env.setdefault("BASE_URL", "https://api.example.com")
    env.setdefault("BEARER_TOKEN", "test-token")
    env.setdefault("ACCESS_TOKEN", "test-token")
    env.setdefault("API_KEY_HEADER", "Authorization")
    return env
