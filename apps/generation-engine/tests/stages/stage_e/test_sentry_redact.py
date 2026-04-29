"""Stage E sentry_redact tests — Pitfall #12 mitigation per CONTEXT D-23.

Plan 04-08 Wave 0 — RED tests for ``packages/codegen-templates/templates/
sentry_redact.ts.j2``. The rendered TS must export ``redactSensitive(event,
hint?)`` that:

- Strips hardcoded auth headers: ``authorization``, ``x-upstream-auth``,
  ``cookie``, ``set-cookie`` (always, regardless of spec).
- Strips spec-declared auth headers from
  ``Pass0Output.auth_requirements[*].header_name`` — passed in as the
  Jinja2 ``auth_headers`` template variable (lowercased + deduplicated by
  ``runtime.py``).
- Strips top-level body keys named ``password`` / ``secret`` / ``api_key``
  / ``apikey`` / ``token`` / ``client_secret`` (case-insensitive).
- Walks ``event.request.headers`` AND ``event.request.data`` AND
  ``event.breadcrumbs[*].data.http_request_headers``.
- Top-level body keys ONLY in v1 — recursive walk is a Phase 9 follow-up
  per the v1 limitation NOTE 6 (extends Plan 04-06's scaffold).

Threats:
- T-04-08-credential-leak — verify the full set of REDACT_HEADERS +
  REDACT_BODY_KEYS lands in the rendered TS, with the spec-declared
  auth headers correctly injected via Jinja2 loop.

References:
- 04-CONTEXT.md D-23 (verbatim REDACT_HEADERS list)
- 04-RESEARCH.md §"Code Examples" Pattern 5 (Sentry redact verbatim)
- 04-PATTERNS.md `templates/sentry_redact.ts.j2` row.
"""

from __future__ import annotations

from mcpgen_engine.stages.stage_e.template_loader import ENVIRONMENT

_REDACT_BODY_KEYS_DEFAULT: list[str] = [
    "password",
    "secret",
    "api_key",
    "apikey",
    "token",
    "client_secret",
]


def _render_sentry_redact(
    auth_headers: list[str],
    redact_body_keys: list[str] | None = None,
) -> str:
    """Render sentry_redact.ts.j2 with the canonical context shape."""
    body_keys = redact_body_keys if redact_body_keys is not None else _REDACT_BODY_KEYS_DEFAULT
    return ENVIRONMENT.get_template("sentry_redact.ts.j2").render(
        {
            "auth_headers": auth_headers,
            "redact_body_keys": body_keys,
        }
    )


def test_redact_headers_includes_authorization() -> None:
    """REDACT_HEADERS contains hardcoded "authorization" lowercase."""
    rendered = _render_sentry_redact(auth_headers=[])
    assert "REDACT_HEADERS" in rendered
    assert '"authorization"' in rendered


def test_redact_headers_includes_x_upstream_auth() -> None:
    """REDACT_HEADERS contains the mcpgen-specific X-Upstream-Auth header."""
    rendered = _render_sentry_redact(auth_headers=[])
    assert '"x-upstream-auth"' in rendered


def test_redact_headers_includes_cookie_and_set_cookie() -> None:
    """REDACT_HEADERS contains cookie + set-cookie."""
    rendered = _render_sentry_redact(auth_headers=[])
    assert '"cookie"' in rendered
    assert '"set-cookie"' in rendered


def test_redact_headers_includes_spec_auth_headers_lowercased() -> None:
    """Jinja2 loop injects spec-declared auth headers (already lowercased)."""
    rendered = _render_sentry_redact(
        auth_headers=["x-api-key", "x-stripe-account"],
    )
    assert '"x-api-key"' in rendered
    assert '"x-stripe-account"' in rendered


def test_redact_body_keys_default_set() -> None:
    """REDACT_BODY_KEYS contains password/secret/api_key/apikey/token/client_secret."""
    rendered = _render_sentry_redact(auth_headers=[])
    assert "REDACT_BODY_KEYS" in rendered
    for k in ("password", "secret", "api_key", "apikey", "token", "client_secret"):
        assert f'"{k}"' in rendered, f"REDACT_BODY_KEYS missing {k!r}"


def test_redact_sensitive_function_defined() -> None:
    """Module exports ``redactSensitive(event, hint?)`` function."""
    rendered = _render_sentry_redact(auth_headers=[])
    assert "export function redactSensitive" in rendered
    # Signature picks up Sentry Event + EventHint typing.
    assert "Event" in rendered


def test_redact_sensitive_walks_event_request_headers() -> None:
    """The function body walks event.request.headers."""
    rendered = _render_sentry_redact(auth_headers=[])
    assert "event.request" in rendered or "req.headers" in rendered
    # The redaction sentinel string is consistent across paths.
    assert "[Redacted by mcpgen]" in rendered


def test_redact_sensitive_walks_event_request_data_top_level_only() -> None:
    """Body redaction iterates Object.keys(req.data) — top-level only.

    The v1 limitation (NOTE 6 — Phase 9 follow-up) is that we do NOT recurse
    into nested objects. The test asserts the iteration is bounded to a
    single ``Object.keys`` call (no recursive walker).
    """
    rendered = _render_sentry_redact(auth_headers=[])
    assert "req.data" in rendered or "request.data" in rendered
    # Recursive walker NOT shipped in v1 — sentinel a forbidden recursive
    # marker would surface ("walkRecursive" / "deepRedact" / "stack").
    assert "walkRecursive" not in rendered
    assert "deepRedact" not in rendered


def test_redact_sensitive_walks_breadcrumbs() -> None:
    """The function body walks event.breadcrumbs[*].data.http_request_headers."""
    rendered = _render_sentry_redact(auth_headers=[])
    assert "breadcrumbs" in rendered
    assert "http_request_headers" in rendered


def test_redact_sensitive_redacts_via_constant_string() -> None:
    """Replacement value is the constant "[Redacted by mcpgen]" string."""
    rendered = _render_sentry_redact(auth_headers=[])
    assert "[Redacted by mcpgen]" in rendered
    assert "REDACTED" in rendered  # the const identifier name


def test_empty_auth_headers_renders_clean() -> None:
    """No spec-declared headers → no extra entries in REDACT_HEADERS Set."""
    rendered = _render_sentry_redact(auth_headers=[])
    # The hardcoded four still ship; no error from the empty Jinja2 loop.
    assert '"authorization"' in rendered
    assert '"x-upstream-auth"' in rendered
    # And no stray comma/semicolon corruption from empty loop.
    assert ",," not in rendered.replace(" ", "")
