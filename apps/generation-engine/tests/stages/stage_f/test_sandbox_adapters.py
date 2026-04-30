"""F3 sandbox adapter tests (Plan 05-06 Task 3).

Covers the 4-test invariant from the plan:

1. Operator-provided dict beats env var (precedence).
2. Env var fallback when operator dict is None.
3. Returns {} + warning log when neither source has the credential.
4. NEVER logs the credential value (caplog substring search) — the only
   safety invariant that survives merge conflicts.
"""

from __future__ import annotations

import logging

import pytest

from mcpgen_engine.stages.stage_f.sandbox import (
    github,
    linear,
    notion,
    slack,
    stripe,
)

# Each entry: (module, operator_key, env_var, sample_value, expected_format)
_ADAPTERS = [
    (stripe, "stripe.test_key", "STRIPE_TEST_KEY", "sk_test_xxx_abcdef", "Bearer "),
    (github, "github.test_pat", "GITHUB_TEST_PAT", "ghp_xxx_abcdef", "Bearer "),
    (notion, "notion.test_token", "NOTION_TEST_TOKEN", "secret_abcdef", "Bearer "),
    (linear, "linear.test_key", "LINEAR_TEST_KEY", "lin_api_xxx_abcdef", ""),  # raw key
    (slack, "slack.test_bot", "SLACK_TEST_BOT_TOKEN", "xoxb-1234-abcdef", "Bearer "),
]


@pytest.mark.parametrize(("module", "op_key", "env_var", "value", "prefix"), _ADAPTERS)
def test_operator_provided_beats_env(
    module: object,
    op_key: str,
    env_var: str,
    value: str,
    prefix: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When operator_provided has the key, env var is NOT consulted."""
    monkeypatch.setenv(env_var, "wrong_env_value")
    headers = module.get_credentials({op_key: value})  # type: ignore[attr-defined]
    assert headers["X-Upstream-Auth"] == f"{prefix}{value}"


@pytest.mark.parametrize(("module", "op_key", "env_var", "value", "prefix"), _ADAPTERS)
def test_env_var_fallback(
    module: object,
    op_key: str,
    env_var: str,
    value: str,
    prefix: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When operator_provided is None, env var is consulted."""
    del op_key  # unused
    monkeypatch.setenv(env_var, value)
    headers = module.get_credentials(None)  # type: ignore[attr-defined]
    assert headers["X-Upstream-Auth"] == f"{prefix}{value}"


@pytest.mark.parametrize(("module", "op_key", "env_var", "value", "prefix"), _ADAPTERS)
def test_missing_credential_returns_empty_dict(
    module: object,
    op_key: str,
    env_var: str,
    value: str,
    prefix: str,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Neither source provides the credential → empty dict + WARNING log."""
    del op_key, value, prefix  # unused
    monkeypatch.delenv(env_var, raising=False)
    with caplog.at_level(logging.WARNING):
        headers = module.get_credentials(None)  # type: ignore[attr-defined]
    assert headers == {}
    assert any("not provided" in record.getMessage() for record in caplog.records)


@pytest.mark.parametrize(("module", "op_key", "env_var", "value", "prefix"), _ADAPTERS)
def test_credential_value_never_logged(
    module: object,
    op_key: str,
    env_var: str,
    value: str,
    prefix: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """No log record at any level contains the literal credential value."""
    del env_var, prefix  # unused (env-var path tested above)
    with caplog.at_level(logging.DEBUG):
        module.get_credentials({op_key: value})  # type: ignore[attr-defined]
    for record in caplog.records:
        assert (
            value not in record.getMessage()
        ), f"Adapter leaked credential value in log: {record.getMessage()!r}"


def test_resolve_credential_precedence(monkeypatch: pytest.MonkeyPatch) -> None:
    """Shared helper: operator dict wins; env fallback; None when both absent."""
    from mcpgen_engine.stages.stage_f.sandbox import _resolve_credential

    monkeypatch.setenv("FOO_VAR", "from_env")
    assert (
        _resolve_credential(
            operator_provided={"foo": "from_op"},
            operator_key="foo",
            env_var="FOO_VAR",
        )
        == "from_op"
    )
    assert (
        _resolve_credential(
            operator_provided=None,
            operator_key="foo",
            env_var="FOO_VAR",
        )
        == "from_env"
    )
    monkeypatch.delenv("FOO_VAR")
    assert (
        _resolve_credential(
            operator_provided=None,
            operator_key="foo",
            env_var="FOO_VAR",
        )
        is None
    )
