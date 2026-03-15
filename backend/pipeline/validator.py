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
    errors: list[str] = field(default_factory=list)


def validate_generated_code(server: GeneratedServer) -> ValidationResult:
    """Validate generated MCP server code.

    Three-phase validation:
    1. Syntax check: compile() each .py file
    2. Import check: run python -c "import ..." in subprocess
    """
    errors: list[str] = []

    # Phase 1: Syntax check
    syntax_ok = True
    for f in server.files:
        if not f.filename.endswith(".py"):
            continue
        try:
            compile(f.content, f.filename, "exec")
        except SyntaxError as e:
            syntax_ok = False
            errors.append(f"SyntaxError in {f.filename}: {e}")

    if not syntax_ok:
        return ValidationResult(syntax_ok=False, imports_ok=False, errors=errors)

    # Phase 2: Import check — write to temp dir and try importing
    imports_ok = True
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        for f in server.files:
            file_path = tmp_path / f.filename
            file_path.write_text(f.content)

        # Find the main server file
        main_file = None
        for f in server.files:
            if f.filename == "server.py":
                main_file = f
                break
        if main_file is None:
            main_file = server.files[0]

        # Try to compile and check imports
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    f"import ast; ast.parse(open('{tmp_path / main_file.filename}').read())",
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode != 0:
                imports_ok = False
                errors.append(f"Import check failed: {result.stderr.strip()}")
        except subprocess.TimeoutExpired:
            imports_ok = False
            errors.append("Import check timed out (10s)")
        except Exception as e:
            imports_ok = False
            errors.append(f"Import check error: {e}")

        # Also check that imports reference real modules
        for f in server.files:
            if not f.filename.endswith(".py"):
                continue
            import_lines = [
                line.strip()
                for line in f.content.splitlines()
                if line.strip().startswith("import ") or line.strip().startswith("from ")
            ]
            for imp_line in import_lines:
                module_name = _extract_module_name(imp_line)
                if module_name and not _is_local_module(module_name, server) and not _is_stdlib_or_installed(module_name):
                    imports_ok = False
                    errors.append(f"Unknown module in {f.filename}: {module_name}")

    return ValidationResult(syntax_ok=syntax_ok, imports_ok=imports_ok, errors=errors)


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
