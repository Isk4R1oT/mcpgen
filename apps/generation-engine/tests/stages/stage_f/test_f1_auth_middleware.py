"""F1 check #6 — auth-middleware ordering tests (Plan 05-03 Task 2).

Behavior block per plan:

- ``middleware.ts`` references ``hostHeaderValidation`` / ``ALLOWED_HOSTS`` as the
  FIRST middleware concern -> ``passed=True``.
- ``middleware.ts`` missing the host-header guard -> ``passed=False``.
- ``middleware.ts`` has the guard but AFTER another auth call -> ``passed=False``.
"""

from __future__ import annotations

from pathlib import Path

from mcpgen_engine.stages.stage_f.f1_checks.auth_middleware import (
    check_auth_middleware,
)


def _write_middleware(tmp_path: Path, content: str) -> Path:
    middleware_dir = tmp_path / "src" / "auth"
    middleware_dir.mkdir(parents=True, exist_ok=True)
    path = middleware_dir / "middleware.ts"
    path.write_text(content, encoding="utf-8")
    return path


def test_host_guard_first_passes(tmp_path: Path) -> None:
    """ALLOWED_HOSTS imported before any auth call satisfies the FIRST invariant."""
    _write_middleware(
        tmp_path,
        (
            'import { ALLOWED_HOSTS } from "../config.js";\n'
            "export async function authMiddleware(req: Request) {\n"
            "  const tenantKey = req.headers.get('Authorization');\n"
            "  if (!tenantKey) return new Response('401', { status: 401 });\n"
            "  void ALLOWED_HOSTS;\n"
            "  return { ctx: { upstreamCredential: 'x' } };\n"
            "}\n"
        ),
    )
    result = check_auth_middleware(tmp_path)
    assert result.passed is True
    assert result.error is None
    assert result.details == "OK"


def test_host_guard_missing_fails(tmp_path: Path) -> None:
    _write_middleware(
        tmp_path,
        (
            "export async function authMiddleware(req: Request) {\n"
            "  return new Response('ok');\n"
            "}\n"
        ),
    )
    result = check_auth_middleware(tmp_path)
    assert result.passed is False
    assert result.error == "AUTH_MIDDLEWARE_MISSING"


def test_host_guard_after_auth_fails(tmp_path: Path) -> None:
    """A ``requireAuth`` call appearing BEFORE the host-header guard is a misorder."""
    _write_middleware(
        tmp_path,
        (
            "import { requireAuth } from './auth.js';\n"
            "// requireAuth used here means it appears before any guard...\n"
            "export const handler = async (r: Request) => {\n"
            "  const x = requireAuth(r);\n"
            '  const y = "ALLOWED_HOSTS";\n'
            "  return new Response(x);\n"
            "};\n"
        ),
    )
    result = check_auth_middleware(tmp_path)
    assert result.passed is False
    assert result.error == "AUTH_MIDDLEWARE_MISSING"
    assert "NOT first" in result.details


def test_file_missing_fails(tmp_path: Path) -> None:
    """Stage E rendering failure path — ``src/auth/middleware.ts`` absent."""
    result = check_auth_middleware(tmp_path)
    assert result.passed is False
    assert result.error == "AUTH_MIDDLEWARE_MISSING"
    assert "file missing" in result.details
