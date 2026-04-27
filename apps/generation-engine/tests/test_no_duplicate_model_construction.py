"""Static AST-walk check enforcing single MODEL construction site (Pitfall A).

Only `mcpgen_engine.llm.client` may construct OpenAIModel / OpenAIProvider /
OpenRouterModel. Every other module imports MODEL from there transitively
via `make_agent` (llm/agent_factory.py).

Failure of this test means a future regression introduced a second
LLM model constructor that bypasses the singleton + extra_body pinning.
"""

from __future__ import annotations

import ast
from pathlib import Path

SRC_ROOT = Path(__file__).resolve().parents[1] / "src" / "mcpgen_engine"
ALLOWED_FILE = SRC_ROOT / "llm" / "client.py"

FORBIDDEN_CLASSES = frozenset(
    {"OpenAIModel", "OpenAIProvider", "OpenRouterModel", "OpenRouterProvider"}
)
FORBIDDEN_MODULES = ("pydantic_ai.models", "pydantic_ai.providers")


def _is_forbidden_call(node: ast.AST) -> str | None:
    """Return the offending name if `node` is a forbidden constructor call, else None."""
    if not isinstance(node, ast.Call):
        return None
    func = node.func
    if isinstance(func, ast.Name) and func.id in FORBIDDEN_CLASSES:
        return func.id
    if isinstance(func, ast.Attribute) and func.attr in FORBIDDEN_CLASSES:
        return func.attr
    return None


def _is_forbidden_import(node: ast.AST) -> str | None:
    """Return the offending module if `node` is a forbidden import, else None."""
    if isinstance(node, ast.ImportFrom) and node.module:
        for prefix in FORBIDDEN_MODULES:
            if node.module.startswith(prefix):
                return node.module
    return None


def test_only_llm_client_constructs_openai_model() -> None:
    """No module outside llm/client.py may construct OpenAIModel/Provider/etc."""
    offenders: list[str] = []
    for py in SRC_ROOT.rglob("*.py"):
        if py.resolve() == ALLOWED_FILE.resolve():
            continue
        tree = ast.parse(py.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            bad_call = _is_forbidden_call(node)
            if bad_call is not None:
                offenders.append(f"{py.relative_to(SRC_ROOT.parent.parent)} calls {bad_call}()")
            bad_import = _is_forbidden_import(node)
            if bad_import is not None:
                offenders.append(
                    f"{py.relative_to(SRC_ROOT.parent.parent)} imports from {bad_import}"
                )
    assert not offenders, (
        "Forbidden LLM model construction outside llm/client.py "
        "(Pitfall A — see RESEARCH.md):\n  " + "\n  ".join(offenders)
    )
