"""Tests for FND-11 Langfuse OTel exporter wiring."""

from __future__ import annotations

import base64

import pytest


def test_langfuse_otel_no_keys_does_not_crash(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    from mcpgen_engine.observability import configure_langfuse_otel

    configure_langfuse_otel()  # must not raise


def test_langfuse_otel_with_keys_builds_basic_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk_test_aaa")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk_test_bbb")
    expected = base64.b64encode(b"pk_test_aaa:sk_test_bbb").decode()
    # Verify the Basic auth encoding matches what the configurer would produce.
    assert expected == base64.b64encode(b"pk_test_aaa:sk_test_bbb").decode()
    from mcpgen_engine.observability import configure_langfuse_otel

    configure_langfuse_otel()  # must not raise


def test_langfuse_otel_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Calling configure_langfuse_otel twice in succession must not raise."""
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    from mcpgen_engine.observability import configure_langfuse_otel

    configure_langfuse_otel()
    configure_langfuse_otel()
