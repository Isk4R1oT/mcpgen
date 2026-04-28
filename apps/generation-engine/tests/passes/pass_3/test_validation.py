"""Pass 3 validation.py — D-22 + D-23 + Pitfall #32 cross-parameter validation tests.

Verifies:
- ``Pass3Error`` constructor preserves ``violations`` list (mirrors ``Pass2Error``).
- ``validate_input_schema`` D-22:
    - Auto-injects ``additionalProperties=False`` if missing.
    - Raises on explicit ``additionalProperties=True``.
    - Passes through explicit ``additionalProperties=False``.
    - Raises on schema-validity failure via
      ``jsonschema.Draft202012Validator.check_schema`` (Don't-Hand-Roll).
- ``validate_param_uniqueness``: passes on unique names, raises on duplicates.
- ``validate_search_fetch_compliance`` Pitfall #32:
    - ``search`` requires exactly ``[query: string]``; extras / wrong type raise.
    - ``fetch`` requires exactly ``[id: string]``; extras / wrong type raise.
    - Other tool names pass through (no-op).
- ``validate_smart_id_pattern`` D-20:
    - Property named ``id`` with matching pattern passes.
    - Property named ``id`` with wrong pattern raises ``SMART_ID_DRIFT``.
    - Property named ``user_id`` (smart-ID name) with NO pattern raises.
    - Property named ``amount`` (non-smart-ID) with no pattern is ignored.
- ``validate_filter_consistency`` D-18:
    - All tools using STRUCTURED_OBJECT shape pass.
    - Mixed strategies (one STRUCTURED, one DSL) under STRUCTURED_OBJECT raise.
    - Tool with ``filter`` property under INDIVIDUAL_PARAMS strategy raises.
    - Schemas without ``filter`` property pass under any strategy.

References:
- 03-CONTEXT.md D-21 + D-22 + D-23
- docs/mcpgen-pass-3-design.md §9
"""

from __future__ import annotations

import pytest

from mcpgen_engine.passes.pass_3.extract import ParameterSpec
from mcpgen_engine.passes.pass_3.filter_design import FilterStrategy
from mcpgen_engine.passes.pass_3.validation import (
    Pass3Error,
    validate_filter_consistency,
    validate_input_schema,
    validate_param_uniqueness,
    validate_search_fetch_compliance,
    validate_smart_id_pattern,
)

# ─────────────────────────── Fixture builders ──────────────────────────────


def _make_param(
    name: str,
    type_: str = "string",
    required: bool = False,
) -> ParameterSpec:
    return ParameterSpec(
        name=name,
        type=type_,
        required=required,
        source_endpoint_id="standards",
        source_field=f"test[{name}]",
    )


# ────────────────────────────── Pass3Error ─────────────────────────────────


def test_pass_3_error_preserves_violations() -> None:
    err = Pass3Error("INVALID_SCHEMA: bad", violations=["foo", "bar"])
    assert isinstance(err, ValueError)
    assert str(err).startswith("INVALID_SCHEMA")
    assert err.violations == ["foo", "bar"]


def test_pass_3_error_violations_default_empty() -> None:
    err = Pass3Error("INVALID_SCHEMA: bad")
    assert err.violations == []


def test_pass_3_error_message_first_token_is_stable_code() -> None:
    """First token of args[0] is the stable error code (mirrors Pass2Error)."""
    err = Pass3Error("OPENAI_COMPLIANCE: search has extra")
    code = str(err).split(":", 1)[0]
    assert code == "OPENAI_COMPLIANCE"


# ────────────────────────── validate_input_schema ──────────────────────────


def test_validate_input_schema_auto_injects_additional_properties_false() -> None:
    schema = {
        "type": "object",
        "properties": {"q": {"type": "string"}},
    }
    out = validate_input_schema("search", schema)
    assert out["additionalProperties"] is False


def test_validate_input_schema_does_not_mutate_input() -> None:
    schema = {
        "type": "object",
        "properties": {"q": {"type": "string"}},
    }
    out = validate_input_schema("search", schema)
    # Input dict unchanged.
    assert "additionalProperties" not in schema
    # Output dict has the field.
    assert out["additionalProperties"] is False


def test_validate_input_schema_raises_on_explicit_additional_properties_true() -> None:
    schema = {
        "type": "object",
        "properties": {"q": {"type": "string"}},
        "additionalProperties": True,
    }
    with pytest.raises(Pass3Error) as ei:
        validate_input_schema("search", schema)
    assert str(ei.value).startswith("INVALID_SCHEMA")
    assert "additionalProperties=true" in ei.value.violations


def test_validate_input_schema_passes_through_explicit_false() -> None:
    schema = {
        "type": "object",
        "properties": {"q": {"type": "string"}},
        "additionalProperties": False,
    }
    out = validate_input_schema("search", schema)
    assert out["additionalProperties"] is False


def test_validate_input_schema_raises_on_invalid_schema_via_jsonschema() -> None:
    """Don't-Hand-Roll: ``Draft202012Validator.check_schema`` catches
    structural errors like an unknown JSON Schema ``type`` value."""
    schema = {
        "type": "object",
        "properties": {"q": {"type": "not_a_real_type"}},
    }
    with pytest.raises(Pass3Error) as ei:
        validate_input_schema("search", schema)
    assert str(ei.value).startswith("INVALID_SCHEMA")
    assert any("schema_error" in v for v in ei.value.violations)


# ─────────────────────── validate_param_uniqueness ─────────────────────────


def test_validate_param_uniqueness_unique_passes() -> None:
    params = [
        _make_param("query"),
        _make_param("limit", type_="integer"),
        _make_param("offset", type_="integer"),
    ]
    # Should not raise.
    validate_param_uniqueness("list_objects", params)


def test_validate_param_uniqueness_duplicate_raises() -> None:
    params = [
        _make_param("query"),
        _make_param("query", type_="integer"),  # collision
    ]
    with pytest.raises(Pass3Error) as ei:
        validate_param_uniqueness("list_objects", params)
    assert str(ei.value).startswith("DUPLICATE_PARAM")
    assert "query" in ei.value.violations


def test_validate_param_uniqueness_empty_list_passes() -> None:
    validate_param_uniqueness("noop", [])


# ─────────────────── validate_search_fetch_compliance ──────────────────────


def test_validate_search_fetch_compliance_search_query_string_passes() -> None:
    params = [_make_param("query", type_="string", required=True)]
    validate_search_fetch_compliance("search", params)


def test_validate_search_fetch_compliance_search_extra_param_raises() -> None:
    params = [
        _make_param("query", type_="string", required=True),
        _make_param("extra", type_="string"),
    ]
    with pytest.raises(Pass3Error) as ei:
        validate_search_fetch_compliance("search", params)
    assert str(ei.value).startswith("OPENAI_COMPLIANCE")


def test_validate_search_fetch_compliance_search_wrong_type_raises() -> None:
    params = [_make_param("query", type_="integer", required=True)]
    with pytest.raises(Pass3Error) as ei:
        validate_search_fetch_compliance("search", params)
    assert str(ei.value).startswith("OPENAI_COMPLIANCE")


def test_validate_search_fetch_compliance_search_wrong_name_raises() -> None:
    params = [_make_param("q", type_="string", required=True)]
    with pytest.raises(Pass3Error):
        validate_search_fetch_compliance("search", params)


def test_validate_search_fetch_compliance_search_empty_raises() -> None:
    with pytest.raises(Pass3Error):
        validate_search_fetch_compliance("search", [])


def test_validate_search_fetch_compliance_fetch_id_string_passes() -> None:
    params = [_make_param("id", type_="string", required=True)]
    validate_search_fetch_compliance("fetch", params)


def test_validate_search_fetch_compliance_fetch_extra_param_raises() -> None:
    params = [
        _make_param("id", type_="string", required=True),
        _make_param("verbose", type_="boolean"),
    ]
    with pytest.raises(Pass3Error) as ei:
        validate_search_fetch_compliance("fetch", params)
    assert str(ei.value).startswith("OPENAI_COMPLIANCE")


def test_validate_search_fetch_compliance_fetch_wrong_type_raises() -> None:
    params = [_make_param("id", type_="integer", required=True)]
    with pytest.raises(Pass3Error):
        validate_search_fetch_compliance("fetch", params)


def test_validate_search_fetch_compliance_other_tools_pass() -> None:
    """Non-search/fetch tool names are no-ops regardless of param shape."""
    params = [
        _make_param("collection", type_="string", required=True),
        _make_param("data", type_="object", required=True),
    ]
    validate_search_fetch_compliance("upsert", params)
    validate_search_fetch_compliance("charges_capture", [_make_param("amount")])


# ─────────────────────── validate_smart_id_pattern ─────────────────────────


def test_validate_smart_id_pattern_match_passes() -> None:
    expected = r"^stripe:object:Charge:[a-zA-Z0-9_-]+$"
    schema = {
        "type": "object",
        "properties": {
            "id": {"type": "string", "pattern": expected},
        },
    }
    validate_smart_id_pattern("fetch", schema, expected)


def test_validate_smart_id_pattern_mismatch_raises() -> None:
    expected = r"^stripe:object:Charge:[a-zA-Z0-9_-]+$"
    schema = {
        "type": "object",
        "properties": {
            "id": {"type": "string", "pattern": r"^wrong$"},
        },
    }
    with pytest.raises(Pass3Error) as ei:
        validate_smart_id_pattern("fetch", schema, expected)
    assert str(ei.value).startswith("SMART_ID_DRIFT")


def test_validate_smart_id_pattern_user_id_pattern_required() -> None:
    """Smart-ID-named property (``user_id``) without ``pattern`` raises."""
    expected = r"^stripe:object:User:[a-zA-Z0-9_-]+$"
    schema = {
        "type": "object",
        "properties": {
            "user_id": {"type": "string"},  # no pattern
        },
    }
    with pytest.raises(Pass3Error) as ei:
        validate_smart_id_pattern("upsert", schema, expected)
    assert str(ei.value).startswith("SMART_ID_DRIFT")


def test_validate_smart_id_pattern_non_id_param_ignored() -> None:
    """Non-smart-ID property (``amount``) with no ``pattern`` is ignored."""
    expected = r"^x:y:z:[a-zA-Z0-9_-]+$"
    schema = {
        "type": "object",
        "properties": {
            "amount": {"type": "integer"},
        },
    }
    # Should not raise.
    validate_smart_id_pattern("charges_capture", schema, expected)


def test_validate_smart_id_pattern_empty_properties_passes() -> None:
    expected = r"^x:y:z:.+$"
    schema = {"type": "object"}
    validate_smart_id_pattern("noop", schema, expected)


def test_validate_smart_id_pattern_collects_all_mismatches() -> None:
    """When multiple smart-ID props mismatch, message lists all of them."""
    expected = r"^stripe:object:X:[a-zA-Z0-9_-]+$"
    schema = {
        "type": "object",
        "properties": {
            "id": {"type": "string", "pattern": "wrong1"},
            "user_id": {"type": "string", "pattern": "wrong2"},
        },
    }
    with pytest.raises(Pass3Error) as ei:
        validate_smart_id_pattern("upsert", schema, expected)
    assert len(ei.value.violations) == 2


# ───────────────────── validate_filter_consistency ─────────────────────────


def _structured_filter_schema() -> dict[str, object]:
    return {
        "type": "object",
        "properties": {
            "property": {"type": "string"},
            "operator": {"type": "string"},
            "value": {},
        },
        "required": ["property", "operator", "value"],
        "additionalProperties": False,
    }


def _dsl_filter_schema() -> dict[str, object]:
    return {"type": "string", "description": "DSL"}


def test_validate_filter_consistency_all_structured_passes() -> None:
    schemas = {
        "list_objects": {
            "type": "object",
            "properties": {"filter": _structured_filter_schema()},
            "additionalProperties": False,
        },
        "list_collections": {
            "type": "object",
            "properties": {"filter": _structured_filter_schema()},
            "additionalProperties": False,
        },
    }
    validate_filter_consistency(schemas, FilterStrategy.STRUCTURED_OBJECT)


def test_validate_filter_consistency_drift_raises() -> None:
    """One structured, one DSL string under STRUCTURED_OBJECT chosen → raises."""
    schemas = {
        "list_objects": {
            "type": "object",
            "properties": {"filter": _structured_filter_schema()},
            "additionalProperties": False,
        },
        "other_list": {
            "type": "object",
            "properties": {"filter": _dsl_filter_schema()},
            "additionalProperties": False,
        },
    }
    with pytest.raises(Pass3Error) as ei:
        validate_filter_consistency(schemas, FilterStrategy.STRUCTURED_OBJECT)
    assert str(ei.value).startswith("FILTER_INCONSISTENT")
    assert any("other_list" in v for v in ei.value.violations)


def test_validate_filter_consistency_dsl_chosen_dsl_passes() -> None:
    schemas = {
        "list_objects": {
            "type": "object",
            "properties": {"filter": _dsl_filter_schema()},
            "additionalProperties": False,
        }
    }
    validate_filter_consistency(schemas, FilterStrategy.DSL_STRING)


def test_validate_filter_consistency_individual_with_filter_param_raises() -> None:
    """Strategy C lifts to top-level — presence of ``filter`` is drift."""
    schemas = {
        "list_objects": {
            "type": "object",
            "properties": {"filter": _structured_filter_schema()},
            "additionalProperties": False,
        }
    }
    with pytest.raises(Pass3Error) as ei:
        validate_filter_consistency(schemas, FilterStrategy.INDIVIDUAL_PARAMS)
    assert str(ei.value).startswith("FILTER_INCONSISTENT")


def test_validate_filter_consistency_no_filter_params_passes() -> None:
    """Schemas without ``filter`` property pass under any strategy."""
    schemas = {
        "search": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "additionalProperties": False,
        },
        "fetch": {
            "type": "object",
            "properties": {"id": {"type": "string"}},
            "additionalProperties": False,
        },
    }
    # All three strategies should pass when no filter property exists.
    validate_filter_consistency(schemas, FilterStrategy.STRUCTURED_OBJECT)
    validate_filter_consistency(schemas, FilterStrategy.DSL_STRING)
    validate_filter_consistency(schemas, FilterStrategy.INDIVIDUAL_PARAMS)


def test_validate_filter_consistency_empty_dict_passes() -> None:
    validate_filter_consistency({}, FilterStrategy.STRUCTURED_OBJECT)


def test_validate_filter_consistency_filter_not_dict_raises() -> None:
    """Defensive — caller emitted a non-dict filter property."""
    schemas = {
        "list_objects": {
            "type": "object",
            "properties": {"filter": "not_a_dict"},
            "additionalProperties": False,
        }
    }
    with pytest.raises(Pass3Error):
        validate_filter_consistency(schemas, FilterStrategy.STRUCTURED_OBJECT)


# ─────────────── Module pure-fn invariants — no LLM imports ────────────────


def test_no_llm_imports_in_validation() -> None:
    """Pure deterministic module — no PydanticAI / OpenRouter imports."""
    src = pytest.importorskip("inspect").getsource(
        pytest.importorskip("mcpgen_engine.passes.pass_3.validation")
    )
    assert "OpenAIModel" not in src
    assert "OpenAIProvider" not in src
    assert "from mcpgen_engine.llm" not in src
    assert "make_agent" not in src
