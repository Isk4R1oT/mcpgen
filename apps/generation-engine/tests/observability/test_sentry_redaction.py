"""CTRL-08 / D-04 — pytest unit tests for `redact_before_send`.

Covers 6 canonical leak vectors via shared cross-language fixture
(`tests/fixtures/leak-vectors.json`) consumed in parallel by vitest in
packages/contracts.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from mcpgen_engine.observability import (
    REDACTED,
    REDACTED_HEADERS,
    SENSITIVE_STRING_PATTERNS,
    VARIABLE_AUTH_HEADER_RE,
    configure_langfuse_otel,
    redact_before_send,
)

_REPO_ROOT = Path(__file__).resolve().parents[4]
_FIXTURE_PATH = _REPO_ROOT / "tests" / "fixtures" / "leak-vectors.json"


def test_1_strips_authorization_bearer_header() -> None:
    event = {"request": {"headers": {"Authorization": "Bearer x"}}}
    out = redact_before_send(event, {})
    assert out is not None
    assert out["request"]["headers"]["Authorization"] == REDACTED


def test_2_case_insensitive_header_match() -> None:
    event = {"request": {"headers": {"authorization": "Bearer x"}}}
    out = redact_before_send(event, {})
    assert out is not None
    assert out["request"]["headers"]["authorization"] == REDACTED


def test_3_variable_auth_header_regex_strips_x_custom_token() -> None:
    event = {
        "request": {
            "headers": {
                "X-Custom-Token": "tok_xyz",
                "X-Service-Auth": "auth_xyz",
                "X-Whatever-Secret": "sec_xyz",
                "X-Safe-Header": "keep-me",
            }
        }
    }
    out = redact_before_send(event, {})
    assert out is not None
    h = out["request"]["headers"]
    assert h["X-Custom-Token"] == REDACTED
    assert h["X-Service-Auth"] == REDACTED
    assert h["X-Whatever-Secret"] == REDACTED
    assert h["X-Safe-Header"] == "keep-me"


def test_4_spec_body_redacted_when_url_contains_v1_generate() -> None:
    event = {
        "request": {
            "url": "https://api.example.com/v1/generate",
            "data": {"spec": "openapi: 3.0.0"},
        }
    }
    out = redact_before_send(event, {})
    assert out is not None
    assert out["request"]["data"] == "[REDACTED:spec]"


def test_4b_spec_body_redacted_when_data_is_string() -> None:
    event = {
        "request": {
            "url": "https://api.example.com/v1/generate",
            "data": "openapi: 3.0.0",
        }
    }
    out = redact_before_send(event, {})
    assert out is not None
    assert out["request"]["data"] == "[REDACTED:spec]"


def test_5_extra_spec_openapi_yaml_raw_ir_redacted() -> None:
    event = {
        "extra": {
            "spec": "openapi: 3.0.0",
            "openapi_yaml": "paths: {}",
            "raw_ir": "{}",
            "keep_me": "safe",
        }
    }
    out = redact_before_send(event, {})
    assert out is not None
    assert out["extra"]["spec"] == "[REDACTED:spec]"
    assert out["extra"]["openapi_yaml"] == "[REDACTED:spec]"
    assert out["extra"]["raw_ir"] == "[REDACTED:spec]"
    assert out["extra"]["keep_me"] == "safe"


def test_6_message_bearer_pattern_replaced() -> None:
    event = {"message": "Bearer FAKE_LEAK_TOKEN expired"}
    out = redact_before_send(event, {})
    assert out is not None
    assert "FAKE_LEAK_TOKEN" not in out["message"]
    assert REDACTED in out["message"]


def test_6_message_sk_live_pattern_replaced() -> None:
    # Suffix MUST be pure alphanumeric to match /sk_live_[A-Za-z0-9]{16,}/.
    event = {"message": "leaked sk_live_FAKELEAKXYZAAAAAAAAAAAAAAAA in stack"}
    out = redact_before_send(event, {})
    assert out is not None
    assert "sk_live_FAKELEAKXYZAAAAAAAAAAAAAAAA" not in out["message"]
    assert REDACTED in out["message"]


def test_6_message_ghp_pattern_replaced() -> None:
    event = {"message": "leaked ghp_FAKELEAKXYZAAAAAAAAAAAAAAAA in error"}
    out = redact_before_send(event, {})
    assert out is not None
    assert "ghp_FAKELEAKXYZAAAAAAAAAAAAAAAA" not in out["message"]
    assert REDACTED in out["message"]


def test_7_empty_event_does_not_raise() -> None:
    out = redact_before_send({}, {})
    assert out == {}


def test_8_cross_language_equivalence_fixture() -> None:
    """Loads the shared `tests/fixtures/leak-vectors.json` and runs every vector
    through the Python redactor. Mirrors the vitest table-driven test in
    `packages/contracts/src/sentry-redaction.test.ts`.
    """
    raw = json.loads(_FIXTURE_PATH.read_text())
    vectors = raw["vectors"]
    assert len(vectors) == 6, "expected exactly 6 leak vectors"

    for vector in vectors:
        name = vector["name"]
        # Deep-copy to avoid cross-vector mutation contamination.
        input_event = copy.deepcopy(vector["input_event"])
        out = redact_before_send(input_event, {})
        serialized = json.dumps(out)
        for leak in vector["expected_no_match"]:
            assert (
                leak not in serialized
            ), f"vector {name} — leaked string '{leak}' still present in: {serialized}"


def test_9_configure_langfuse_otel_still_works(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: package-ification of `observability.py` must not break the
    Phase 1 `configure_langfuse_otel` import path.
    """
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    configure_langfuse_otel()  # must not raise


def test_constants_redacted_headers_set() -> None:
    expected = {
        "authorization",
        "x-upstream-auth",
        "cookie",
        "set-cookie",
        "stripe-account",
        "stripe-signature",
        "x-webhook-signature",
    }
    assert frozenset(expected) == REDACTED_HEADERS


def test_constants_variable_auth_header_re() -> None:
    assert VARIABLE_AUTH_HEADER_RE.match("x-custom-token")
    assert VARIABLE_AUTH_HEADER_RE.match("x-service-auth")
    assert VARIABLE_AUTH_HEADER_RE.match("x-whatever-secret")
    assert VARIABLE_AUTH_HEADER_RE.match("x-data-key")
    assert not VARIABLE_AUTH_HEADER_RE.match("x-safe-header")


def test_constants_sensitive_string_patterns_count() -> None:
    assert len(SENSITIVE_STRING_PATTERNS) == 5
