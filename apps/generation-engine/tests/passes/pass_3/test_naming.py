"""Pass 3 — naming.py D-19 normalization tests.

Verifies the deterministic post-LLM parameter naming transform:

- ``normalize_param_name(raw, entity_hint, is_list_filter_context)`` applies the
  D-19 verbatim rules: bare ``id`` / ``status`` qualified with entity hint;
  ``data`` → ``payload``; ``time`` → ``created_at`` only in list-filter context;
  camelCase / PascalCase → snake_case; trailing ``_param`` / ``_arg`` stripped.

- ``normalize_all_param_names(params)`` applies the per-name transform across
  a list of ``ParameterSpec``s, resolving collisions by reverting the SECOND
  occurrence to its raw name; if the raw name itself collides, append a digit
  suffix ``_2`` / ``_3`` / ... .  Pure / immutable (input list unchanged).

References:
- 03-CONTEXT.md D-19 (rules table verbatim)
- docs/mcpgen-pass-3-design.md §1
"""

from __future__ import annotations

from copy import deepcopy

from mcpgen_engine.passes.pass_3.extract import ParameterSpec
from mcpgen_engine.passes.pass_3.naming import (
    normalize_all_param_names,
    normalize_param_name,
)

# ─────────────────────────── Helpers ───────────────────────────────────────


def _spec(name: str, entity_hint: str | None = None) -> ParameterSpec:
    """Build a minimal `ParameterSpec` with only the fields naming.py reads."""
    return ParameterSpec(
        name=name,
        type="string",
        entity_hint=entity_hint,
        source_endpoint_id="GET /test",
        source_field=f"parameters[0].{name}",
    )


# ─────────────────────────── normalize_param_name ───────────────────────────


def test_normalize_camel_case_to_snake() -> None:
    assert normalize_param_name("userId", None) == "user_id"


def test_normalize_pascal_case_to_snake() -> None:
    assert normalize_param_name("UserId", None) == "user_id"


def test_normalize_strips_param_suffix() -> None:
    assert normalize_param_name("query_param", None) == "query"


def test_normalize_strips_arg_suffix() -> None:
    assert normalize_param_name("input_arg", None) == "input"


def test_normalize_data_to_payload() -> None:
    assert normalize_param_name("data", None) == "payload"


def test_normalize_bare_id_with_entity_hint() -> None:
    assert normalize_param_name("id", "charges") == "charges_id"


def test_normalize_bare_id_without_entity_hint_unchanged() -> None:
    # No qualifier possible → keep raw "id".
    assert normalize_param_name("id", None) == "id"


def test_normalize_bare_status_with_entity_hint() -> None:
    assert normalize_param_name("status", "tickets") == "tickets_status"


def test_normalize_bare_status_without_entity_hint_unchanged() -> None:
    assert normalize_param_name("status", None) == "status"


def test_normalize_bare_time_in_list_filter_context() -> None:
    assert normalize_param_name("time", None, is_list_filter_context=True) == "created_at"


def test_normalize_bare_time_no_list_filter_unchanged() -> None:
    assert normalize_param_name("time", None, is_list_filter_context=False) == "time"


def test_normalize_already_snake_case_unchanged() -> None:
    assert normalize_param_name("user_id", "charges") == "user_id"


def test_normalize_entity_hint_with_whitespace_normalized() -> None:
    # Entity hint may originate from endpoint tag like "User Accounts".
    assert normalize_param_name("id", "User Accounts") == "user_accounts_id"


def test_normalize_camel_with_param_suffix_combined() -> None:
    # camelCase + _param suffix in same name.
    assert normalize_param_name("queryStringParam_param", None) == "query_string_param"


# Note: bare "data" rename takes precedence over qualification — there is no
# "data" qualifier rule per D-19; "data" → "payload" verbatim.


def test_normalize_pure_function() -> None:
    # Twice with same args → equal results.
    a = normalize_param_name("UserId", "charges")
    b = normalize_param_name("UserId", "charges")
    assert a == b


# ─────────────────────────── normalize_all_param_names ─────────────────────


def test_normalize_all_unique_names_unchanged() -> None:
    params = [_spec("userId"), _spec("emailAddress"), _spec("createdAt")]
    out = normalize_all_param_names(params)
    assert [p.name for p in out] == ["user_id", "email_address", "created_at"]


def test_normalize_all_collision_reverts_second_to_raw_then_digit() -> None:
    # Both "userId" and "user_id" normalize to "user_id"; second is "user_id"
    # raw name which ALSO collides → digit suffix "user_id_2".
    params = [_spec("userId"), _spec("user_id")]
    out = normalize_all_param_names(params)
    assert [p.name for p in out] == ["user_id", "user_id_2"]


def test_normalize_all_collision_reverts_second_to_raw_when_distinct() -> None:
    # Two camelCase names that normalize to the same snake_case but the second
    # one's raw form is itself unique → fall back to raw.
    # "fooBar" → "foo_bar"; "FooBar" → "foo_bar" (collision); raw "FooBar"
    # is unique → revert.
    params = [_spec("fooBar"), _spec("FooBar")]
    out = normalize_all_param_names(params)
    assert out[0].name == "foo_bar"
    assert out[1].name == "FooBar"


def test_normalize_all_immutable_does_not_mutate_input() -> None:
    params = [_spec("userId"), _spec("emailAddress")]
    snapshot = deepcopy(params)
    normalize_all_param_names(params)
    assert params == snapshot


def test_normalize_all_preserves_order() -> None:
    params = [_spec("zLast"), _spec("aFirst"), _spec("mMiddle")]
    out = normalize_all_param_names(params)
    assert [p.name for p in out] == ["z_last", "a_first", "m_middle"]


def test_normalize_all_returns_new_list() -> None:
    params = [_spec("userId")]
    out = normalize_all_param_names(params)
    assert out is not params


def test_normalize_all_returns_new_parameter_spec_objects() -> None:
    params = [_spec("userId")]
    out = normalize_all_param_names(params)
    # New ParameterSpec — not the same instance.
    assert out[0] is not params[0]


def test_normalize_all_propagates_entity_hint() -> None:
    params = [_spec("id", entity_hint="charges")]
    out = normalize_all_param_names(params)
    assert out[0].name == "charges_id"
    # Other fields preserved.
    assert out[0].entity_hint == "charges"
    assert out[0].type == "string"


def test_normalize_all_list_filter_context_propagates() -> None:
    params = [_spec("time")]
    out = normalize_all_param_names(params, is_list_filter_context=True)
    assert out[0].name == "created_at"


def test_normalize_all_empty_list() -> None:
    assert normalize_all_param_names([]) == []


def test_normalize_all_three_way_collision_appends_increasing_digit() -> None:
    # Three params all colliding to "user_id".
    params = [
        _spec("userId"),
        _spec("user_id"),  # collides → reverts to raw "user_id" (also collides) → "user_id_2"
        _spec("user_id"),  # collides with both above → "user_id_3"
    ]
    out = normalize_all_param_names(params)
    assert [p.name for p in out] == ["user_id", "user_id_2", "user_id_3"]
