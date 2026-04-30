"""Plan 05-07 Task 2 -- mock_upstream synthesizer (CONTEXT D-22, RESEARCH §5.8)."""

from __future__ import annotations

from typing import Any

from mcpgen_engine.stages.stage_f.mock_upstream import synthesize


def test_string_is_deterministic_for_same_seed() -> None:
    a = synthesize({"type": "string"}, seed=1)
    b = synthesize({"type": "string"}, seed=1)
    assert isinstance(a, str)
    assert a == b


def test_object_walks_properties() -> None:
    schema: dict[str, Any] = {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "amount": {"type": "integer"},
        },
    }
    out = synthesize(schema, seed=1)
    assert isinstance(out, dict)
    assert "id" in out
    assert "amount" in out
    assert isinstance(out["id"], str)
    assert isinstance(out["amount"], int)


def test_string_format_date_time_returns_known_value() -> None:
    # RESEARCH §5.8 hardcoded sentinel; mocking layer must keep the value
    # stable across runs so smoke tests can grep for it.
    out = synthesize({"type": "string", "format": "date-time"}, seed=42)
    assert out == "2026-04-29T12:00:00Z"


def test_string_format_uri_returns_known_value() -> None:
    out = synthesize({"type": "string", "format": "uri"}, seed=42)
    assert out == "https://example.com/test"


def test_string_format_email_returns_known_value() -> None:
    out = synthesize({"type": "string", "format": "email"}, seed=42)
    assert out == "test@example.com"


def test_string_enum_constrains_output() -> None:
    schema = {"type": "string", "enum": ["a", "b", "c"]}
    out = synthesize(schema, seed=1)
    assert out in {"a", "b", "c"}


def test_examples_short_circuits_synthesis() -> None:
    schema = {
        "type": "string",
        "format": "date-time",
        "examples": ["from-spec-only"],
    }
    out = synthesize(schema, seed=1)
    assert out == "from-spec-only"


def test_array_generates_items() -> None:
    schema = {
        "type": "array",
        "items": {"type": "string"},
    }
    out = synthesize(schema, seed=1)
    assert isinstance(out, list)
    assert 1 <= len(out) <= 5
    assert all(isinstance(x, str) for x in out)


def test_nested_object() -> None:
    schema = {
        "type": "object",
        "properties": {
            "user": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "active": {"type": "boolean"},
                },
            },
        },
    }
    out = synthesize(schema, seed=1)
    assert isinstance(out, dict)
    assert "user" in out
    assert isinstance(out["user"], dict)
    assert "id" in out["user"]
    assert isinstance(out["user"]["active"], bool)


def test_integer_within_bounds() -> None:
    schema = {"type": "integer", "minimum": 5, "maximum": 7}
    out = synthesize(schema, seed=1)
    assert isinstance(out, int)
    assert 5 <= out <= 7


def test_unspecified_type_returns_none() -> None:
    out = synthesize({}, seed=1)
    assert out is None
