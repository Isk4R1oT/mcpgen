"""Stage E Phase 4 — auth-mode selector + 2-file emitter tests.

Covers Plan 04-09:
- `select_auth_mode(pass_0_output)` deterministic mapper (CONTEXT D-21 + Phase 2 D-22).
- `render_auth_files(auth_mode, pass_0_output)` emits exactly two files
  (`src/auth/middleware.ts` + `src/auth/credentials.ts`) per `auth_mode`.
- Passthrough variant extracts `X-Upstream-Auth` and NEVER persists.
- Stored variant imports AES-256-GCM helpers from `auth_credentials.ts`.
- OAuth variant uses `OAuthProvider` from `@cloudflare/workers-oauth-provider`.

Source-of-truth references:
- `04-CONTEXT.md` D-21 (3 auth modes verbatim) + D-22 (DNS-rebinding rides on SDK transport)
- `02-CONTEXT.md` D-22 (auth recommended_mode mapping verbatim)
- `04-RESEARCH.md` Code Example 8 (passthrough middleware verbatim)
"""

from __future__ import annotations

from mcpgen_ir.types import Pass0Output

from mcpgen_engine.stages.stage_e.auth import (
    render_auth_files,
    select_auth_mode,
)
from mcpgen_engine.stages.stage_e.scaffold import GeneratedFile


def _pass_0_with(scheme: str, recommended_mode: str) -> Pass0Output:
    """Minimal Pass0Output carrying ONE auth_requirement with the given scheme."""
    return Pass0Output.model_validate(
        {
            "tool_plans": [
                {
                    "name": "search",
                    "category": "search",
                    "source_endpoints": ["GET /v1/charges"],
                    "rationale": "Universal search.",
                }
            ],
            "dropped_endpoints": [],
            "composite_candidates": [],
            "auth_requirements": {
                "GET /v1/charges": [
                    {
                        "scheme": scheme,
                        "recommended_mode": recommended_mode,
                        "notes": None,
                    }
                ]
            },
            "target_complexity": "standard",
            "prompt_injection_warnings": [],
        }
    )


# ───────────────────────── select_auth_mode tests ────────────────────────


def test_select_auth_mode_returns_oauth_for_oauth2_requirement() -> None:
    """oauth2 scheme → 'oauth' (CONTEXT D-21)."""
    p0 = _pass_0_with(scheme="oauth2", recommended_mode="oauth_flow")
    assert select_auth_mode(p0) == "oauth"


def test_select_auth_mode_returns_stored_for_aws_signature() -> None:
    """aws_signature scheme → 'stored' (CONTEXT D-21)."""
    p0 = _pass_0_with(scheme="aws_signature", recommended_mode="stored")
    assert select_auth_mode(p0) == "stored"


def test_select_auth_mode_returns_passthrough_for_apikey() -> None:
    """apiKey scheme → 'passthrough' (Phase 2 D-22)."""
    p0 = _pass_0_with(scheme="apiKey", recommended_mode="passthrough")
    assert select_auth_mode(p0) == "passthrough"


def test_select_auth_mode_returns_passthrough_for_basic() -> None:
    """http_basic scheme → 'passthrough' (Phase 2 D-22)."""
    p0 = _pass_0_with(scheme="http_basic", recommended_mode="passthrough")
    assert select_auth_mode(p0) == "passthrough"


def test_select_auth_mode_returns_passthrough_for_bearer_simple() -> None:
    """http_bearer (single token) → 'passthrough' (Phase 2 D-22)."""
    p0 = _pass_0_with(scheme="http_bearer", recommended_mode="passthrough")
    assert select_auth_mode(p0) == "passthrough"


def test_select_auth_mode_returns_passthrough_for_none_scheme() -> None:
    """none scheme → 'passthrough' (default — no upstream auth required)."""
    p0 = _pass_0_with(scheme="none", recommended_mode="passthrough")
    assert select_auth_mode(p0) == "passthrough"


def test_select_auth_mode_oauth_wins_over_stored_when_both_present() -> None:
    """If any endpoint requires oauth2 AND another requires aws_signature → 'oauth'.

    Per CONTEXT D-21 the oauth path is the strongest; spec drift toward OAuth
    makes the worker handle the harder case. (Pitfall: a hybrid spec would
    otherwise default to 'stored' if we walked endpoints in spec order.)
    """
    p0 = Pass0Output.model_validate(
        {
            "tool_plans": [
                {
                    "name": "search",
                    "category": "search",
                    "source_endpoints": ["GET /v1/charges", "GET /v1/aws"],
                    "rationale": "Mixed.",
                }
            ],
            "dropped_endpoints": [],
            "composite_candidates": [],
            "auth_requirements": {
                "GET /v1/aws": [
                    {
                        "scheme": "aws_signature",
                        "recommended_mode": "stored",
                        "notes": None,
                    }
                ],
                "GET /v1/charges": [
                    {
                        "scheme": "oauth2",
                        "recommended_mode": "oauth_flow",
                        "notes": None,
                    }
                ],
            },
            "target_complexity": "standard",
            "prompt_injection_warnings": [],
        }
    )
    assert select_auth_mode(p0) == "oauth"


def test_select_auth_mode_empty_auth_requirements_is_passthrough() -> None:
    """No upstream auth declared → safe default 'passthrough'."""
    p0 = Pass0Output.model_validate(
        {
            "tool_plans": [
                {
                    "name": "search",
                    "category": "search",
                    "source_endpoints": ["GET /v1/charges"],
                    "rationale": "Public endpoint.",
                }
            ],
            "dropped_endpoints": [],
            "composite_candidates": [],
            "auth_requirements": {},
            "target_complexity": "standard",
            "prompt_injection_warnings": [],
        }
    )
    assert select_auth_mode(p0) == "passthrough"


# ───────────────────────── render_auth_files tests ───────────────────────


def _render(auth_mode: str, p0: Pass0Output | None = None) -> list[GeneratedFile]:
    p0 = p0 or _pass_0_with(scheme="http_bearer", recommended_mode="passthrough")
    return render_auth_files(auth_mode=auth_mode, pass_0_output=p0)  # type: ignore[arg-type]


def test_render_auth_files_emits_two_files_in_passthrough_mode() -> None:
    """passthrough → middleware.ts + credentials.ts (no more, no less)."""
    files = _render("passthrough")
    paths = {f.relative_path for f in files}
    assert paths == {"src/auth/middleware.ts", "src/auth/credentials.ts"}


def test_render_auth_files_emits_two_files_in_stored_mode() -> None:
    """stored → middleware.ts + credentials.ts."""
    p0 = _pass_0_with(scheme="aws_signature", recommended_mode="stored")
    files = _render("stored", p0)
    paths = {f.relative_path for f in files}
    assert paths == {"src/auth/middleware.ts", "src/auth/credentials.ts"}


def test_render_auth_files_emits_two_files_in_oauth_mode() -> None:
    """oauth → middleware.ts + credentials.ts."""
    p0 = _pass_0_with(scheme="oauth2", recommended_mode="oauth_flow")
    files = _render("oauth", p0)
    paths = {f.relative_path for f in files}
    assert paths == {"src/auth/middleware.ts", "src/auth/credentials.ts"}


def test_passthrough_middleware_extracts_x_upstream_auth() -> None:
    """Passthrough variant references `X-Upstream-Auth` header (Code Example 8)."""
    files = _render("passthrough")
    middleware = next(f for f in files if f.relative_path == "src/auth/middleware.ts")
    assert "X-Upstream-Auth" in middleware.content


def test_passthrough_middleware_never_persists_credentials() -> None:
    """T-04-09-passthrough-creds-persist mitigation — grep-asserted no persistence."""
    files = _render("passthrough")
    middleware = next(f for f in files if f.relative_path == "src/auth/middleware.ts")
    forbidden = ("KV.put", "caches.put", ".STORAGE.put", "localStorage", "sessionStorage")
    for token in forbidden:
        assert token not in middleware.content, (
            f"Persistence sentinel {token!r} found in passthrough middleware:\n"
            f"{middleware.content}"
        )


def test_stored_middleware_imports_decryption_helper_from_credentials() -> None:
    """Stored variant imports decryptCredential from auth_credentials.ts."""
    p0 = _pass_0_with(scheme="aws_signature", recommended_mode="stored")
    files = _render("stored", p0)
    middleware = next(f for f in files if f.relative_path == "src/auth/middleware.ts")
    assert "decryptCredential" in middleware.content
    assert "credentials" in middleware.content  # import path mention


def test_stored_credentials_uses_aes_gcm_with_subtle_crypto() -> None:
    """Stored credentials.ts uses AES-256-GCM via crypto.subtle (T-04-09-stored-creds-leak)."""
    p0 = _pass_0_with(scheme="aws_signature", recommended_mode="stored")
    files = _render("stored", p0)
    credentials = next(f for f in files if f.relative_path == "src/auth/credentials.ts")
    assert "AES-GCM" in credentials.content
    assert "crypto.subtle" in credentials.content


def test_oauth_middleware_uses_oauth_provider_from_workers_oauth_provider() -> None:
    """OAuth variant constructs OAuthProvider from @cloudflare/workers-oauth-provider."""
    p0 = _pass_0_with(scheme="oauth2", recommended_mode="oauth_flow")
    files = _render("oauth", p0)
    middleware = next(f for f in files if f.relative_path == "src/auth/middleware.ts")
    assert "OAuthProvider" in middleware.content
    assert "@cloudflare/workers-oauth-provider" in middleware.content


def test_render_auth_files_carries_render_template_provenance() -> None:
    """Each emitted GeneratedFile records its source template name."""
    files = _render("passthrough")
    for f in files:
        assert f.render_template in (
            "auth_middleware.ts.j2",
            "auth_credentials.ts.j2",
        )
        assert f.render_inputs_hash, "render_inputs_hash must be non-empty"


def test_render_auth_files_deterministic_hash() -> None:
    """Two renders of the same (auth_mode, pass_0) produce identical hashes."""
    a = _render("passthrough")
    b = _render("passthrough")
    a_map = {f.relative_path: f.render_inputs_hash for f in a}
    b_map = {f.relative_path: f.render_inputs_hash for f in b}
    assert a_map == b_map


def test_render_auth_files_passthrough_middleware_references_allowed_hosts() -> None:
    """Pitfall #15 belt-and-suspenders: middleware imports ALLOWED_HOSTS from config."""
    files = _render("passthrough")
    middleware = next(f for f in files if f.relative_path == "src/auth/middleware.ts")
    assert "ALLOWED_HOSTS" in middleware.content


def test_render_auth_files_no_unsubstituted_jinja_markers() -> None:
    """Strict-Undefined hygiene — rendered output never contains `{{` or `{%`."""
    for mode in ("passthrough", "stored", "oauth"):
        p0 = _pass_0_with(
            scheme={"passthrough": "http_bearer", "stored": "aws_signature", "oauth": "oauth2"}[
                mode
            ],
            recommended_mode={
                "passthrough": "passthrough",
                "stored": "stored",
                "oauth": "oauth_flow",
            }[mode],
        )
        files = _render(mode, p0)
        for f in files:
            assert "{{" not in f.content, f"Unsubstituted `{{{{`` in {mode}/{f.relative_path}"
            assert "{%" not in f.content, f"Unsubstituted `{{%` in {mode}/{f.relative_path}"
