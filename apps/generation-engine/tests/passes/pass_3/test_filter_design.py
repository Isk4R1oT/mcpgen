"""Pass 3 — Phase 3 (filter_design.py) deterministic A/B/C selection tests.

Verifies the contract that downstream Pass 3 phases consume:

- `FilterStrategy` enum has exactly 3 values: STRUCTURED_OBJECT="A",
  DSL_STRING="B", INDIVIDUAL_PARAMS="C" (D-18 verbatim).
- `STRUCTURED_OBJECT_OPERATORS` is a frozen 9-tuple matching Pass 3 design
  §11.1 verbatim (T-03-AP mitigation — LLM cannot extend it).
- `detect_filter_strategy(raw_ir, extracted)` is deterministic and applies
  the D-18 decision tree: native-query-language hint → DSL_STRING; else
  ≤4 simple filters → INDIVIDUAL_PARAMS; else → STRUCTURED_OBJECT (default).
- `emit_filter_schema(strategy, params)` returns the JSON Schema fragment
  for the chosen strategy (A: structured object, B: DSL string, C:
  per-param object with `_individual_params_marker`).
- `_has_native_query_language` matches "JQL" / "GraphQL where clause" /
  "SQL filter" case-insensitively in endpoint descriptions (the IR has
  no `extensions` attribute per Plan 02-02 frozen IR — defensive lookup
  yields False for x-query-language signal until Phase 4).
- Logging emits ONLY structural counts (T-03-spec-content-leak — never
  the matched description text).

These are pure-function tests — no LLM, no I/O, no httpx mocks needed.

References:
- 03-CONTEXT.md D-18 (filter-design selection rule verbatim)
- 03-RESEARCH.md §"Architecture Patterns" Pattern 3
- docs/mcpgen-pass-3-design.md §4 + §11.1 + §11.3
"""

from __future__ import annotations

import pytest
from mcpgen_ir.types import (
    Endpoint,
    Method,
    RawIR,
    SpecFormat,
)

from mcpgen_engine.passes.pass_3.extract import ParameterSpec
from mcpgen_engine.passes.pass_3.filter_design import (
    _INDIVIDUAL_PARAMS_THRESHOLD,
    STRUCTURED_OBJECT_OPERATORS,
    FilterStrategy,
    _has_native_query_language,
    _is_simple_filter_param,
    detect_filter_strategy,
    emit_filter_schema,
)

# ─────────────────────────── Test fixtures (synthetic) ──────────────────────


def _make_endpoint(
    description: str | None = None,
    method: Method = Method.GET,
    path: str = "/v1/items",
) -> Endpoint:
    """Build a minimal valid `Endpoint` with optional description."""
    return Endpoint(
        method=method,
        path=path,
        description=description,
        parameters=[],
        request_body=None,
        responses={"200": {"description": "ok"}},
        tags=[],
        deprecated=False,
    )


def _make_raw_ir(endpoints: list[Endpoint] | None = None) -> RawIR:
    """Build a minimal valid `RawIR` for tests."""
    return RawIR(
        spec_format=SpecFormat.openapi_3_0,
        spec_hash="0" * 64,
        endpoints=endpoints or [],
        schemas={},
        security_schemes={},
        dependency_graph={},
    )


def _make_filter_param(
    name: str = "filter",
    type_: str = "string",
    pattern: str | None = None,
    enum: list[str] | None = None,
    default: object | None = None,
    description: str | None = None,
) -> ParameterSpec:
    """Build a ParameterSpec with `is_filter=True` and minimal other fields."""
    return ParameterSpec(
        name=name,
        type=type_,
        pattern=pattern,
        enum=enum,
        default=default,
        is_filter=True,
        source_endpoint_id="GET /v1/items",
        source_field=f"parameters[0].{name}",
        description=description,
    )


# ──────────────────────────── Enum + constants ──────────────────────────────


def test_filter_strategy_enum_values() -> None:
    """FilterStrategy values are exactly A/B/C per D-18."""
    assert FilterStrategy.STRUCTURED_OBJECT.value == "A"
    assert FilterStrategy.DSL_STRING.value == "B"
    assert FilterStrategy.INDIVIDUAL_PARAMS.value == "C"
    # Exactly 3 members, no more.
    assert len(list(FilterStrategy)) == 3


def test_structured_object_operators_frozen_enum() -> None:
    """Operator tuple is FROZEN per D-18 / Pass 3 design §11.1 verbatim.

    T-03-AP mitigation: this exact tuple is what `emit_filter_schema(A, ...)`
    embeds in the JSON Schema enum. Extending it requires a paired
    `docs/decisions/` entry.
    """
    assert STRUCTURED_OBJECT_OPERATORS == (
        "Equal",
        "NotEqual",
        "GreaterThan",
        "LessThan",
        "GreaterThanOrEqual",
        "LessThanOrEqual",
        "Contains",
        "In",
        "NotIn",
    )


def test_individual_params_threshold_is_4() -> None:
    """≤4 filter params trigger INDIVIDUAL_PARAMS per D-18."""
    assert _INDIVIDUAL_PARAMS_THRESHOLD == 4


# ──────────────────────────── Detection — DSL hint ──────────────────────────


def test_detect_strategy_dsl_when_description_mentions_jql() -> None:
    """Endpoint description containing 'JQL' triggers DSL_STRING."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Use JQL syntax to query issues")])
    result = detect_filter_strategy(raw_ir, {})
    assert result == FilterStrategy.DSL_STRING


def test_detect_strategy_dsl_when_description_mentions_graphql_where() -> None:
    """Endpoint description containing 'GraphQL where clause' triggers DSL_STRING."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Filter using a GraphQL where clause")])
    result = detect_filter_strategy(raw_ir, {})
    assert result == FilterStrategy.DSL_STRING


def test_detect_strategy_dsl_when_description_mentions_sql_filter() -> None:
    """Endpoint description containing 'SQL filter' triggers DSL_STRING."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Provide an SQL filter expression")])
    result = detect_filter_strategy(raw_ir, {})
    assert result == FilterStrategy.DSL_STRING


def test_detect_strategy_dsl_case_insensitive() -> None:
    """Lowercase 'sql filter' still matches the DSL hint regex."""
    raw_ir = _make_raw_ir([_make_endpoint(description="provide a sql filter expression")])
    result = detect_filter_strategy(raw_ir, {})
    assert result == FilterStrategy.DSL_STRING


def test_detect_strategy_dsl_when_any_endpoint_hints() -> None:
    """If ANY endpoint description hints at native query language → DSL_STRING."""
    raw_ir = _make_raw_ir(
        [
            _make_endpoint(description="Plain CRUD endpoint", path="/v1/a"),
            _make_endpoint(description="Use JQL syntax", path="/v1/b"),
            _make_endpoint(description="Another plain endpoint", path="/v1/c"),
        ]
    )
    result = detect_filter_strategy(raw_ir, {})
    assert result == FilterStrategy.DSL_STRING


# ──────────────────────────── Detection — INDIVIDUAL ────────────────────────


def test_detect_strategy_individual_when_few_simple_filters() -> None:
    """≤4 filter params with simple-equality types → INDIVIDUAL_PARAMS."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Plain CRUD")])
    extracted = {
        "list_objects": [
            _make_filter_param(name="status", type_="string"),
            _make_filter_param(name="created_after", type_="integer"),
            _make_filter_param(name="archived", type_="boolean"),
        ],
    }
    result = detect_filter_strategy(raw_ir, extracted)
    assert result == FilterStrategy.INDIVIDUAL_PARAMS


def test_detect_strategy_individual_at_threshold_4() -> None:
    """Exactly 4 simple filter params → INDIVIDUAL_PARAMS (boundary)."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Plain CRUD")])
    extracted = {
        "list_objects": [
            _make_filter_param(name="status", type_="string"),
            _make_filter_param(name="archived", type_="boolean"),
            _make_filter_param(name="amount", type_="number"),
            _make_filter_param(name="count", type_="integer"),
        ],
    }
    result = detect_filter_strategy(raw_ir, extracted)
    assert result == FilterStrategy.INDIVIDUAL_PARAMS


# ──────────────────────────── Detection — STRUCTURED (default) ─────────────


def test_detect_strategy_structured_when_many_filters() -> None:
    """5+ filter params → STRUCTURED_OBJECT (over threshold)."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Plain CRUD")])
    extracted = {
        "list_objects": [_make_filter_param(name=f"f{i}", type_="string") for i in range(5)],
    }
    result = detect_filter_strategy(raw_ir, extracted)
    assert result == FilterStrategy.STRUCTURED_OBJECT


def test_detect_strategy_structured_when_filter_has_pattern() -> None:
    """Filter param with `pattern` constraint is NOT simple → STRUCTURED_OBJECT."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Plain CRUD")])
    extracted = {
        "list_objects": [
            _make_filter_param(name="status", type_="string"),
            _make_filter_param(name="email", type_="string", pattern=r"\d+"),
        ],
    }
    result = detect_filter_strategy(raw_ir, extracted)
    assert result == FilterStrategy.STRUCTURED_OBJECT


def test_detect_strategy_structured_when_no_filter_params() -> None:
    """Empty extracted (no filter params at all) → STRUCTURED_OBJECT (default).

    The empty case shouldn't trigger INDIVIDUAL because there are no simple
    filters to lift; default to the safe per-D-18 fallback.
    """
    raw_ir = _make_raw_ir([_make_endpoint(description="Plain CRUD")])
    result = detect_filter_strategy(raw_ir, {})
    assert result == FilterStrategy.STRUCTURED_OBJECT


def test_detect_strategy_structured_when_complex_object_filter() -> None:
    """Filter param of type 'object' is NOT simple → STRUCTURED_OBJECT."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Plain CRUD")])
    extracted = {
        "list_objects": [
            _make_filter_param(name="filter", type_="object"),
        ],
    }
    result = detect_filter_strategy(raw_ir, extracted)
    assert result == FilterStrategy.STRUCTURED_OBJECT


def test_detect_strategy_structured_when_array_filter() -> None:
    """Filter param of type 'array' is NOT simple → STRUCTURED_OBJECT."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Plain CRUD")])
    extracted = {
        "list_objects": [
            _make_filter_param(name="tags", type_="array"),
        ],
    }
    result = detect_filter_strategy(raw_ir, extracted)
    assert result == FilterStrategy.STRUCTURED_OBJECT


def test_detect_strategy_ignores_non_filter_params() -> None:
    """Non-filter params (is_filter=False) are NOT counted toward the threshold."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Plain CRUD")])
    non_filter = ParameterSpec(
        name="limit",
        type="integer",
        is_filter=False,
        source_endpoint_id="GET /v1/items",
        source_field="parameters[0].limit",
    )
    # 6 non-filter params + 0 filter params → STRUCTURED (no filter to detect).
    extracted = {"list_objects": [non_filter] * 6}
    result = detect_filter_strategy(raw_ir, extracted)
    assert result == FilterStrategy.STRUCTURED_OBJECT


def test_detect_strategy_aggregates_filters_across_tools() -> None:
    """`detect_filter_strategy` sees server-scope (all tools) per D-18 invariant."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Plain CRUD")])
    extracted = {
        "list_objects_a": [
            _make_filter_param(name="f1", type_="string"),
            _make_filter_param(name="f2", type_="string"),
            _make_filter_param(name="f3", type_="string"),
        ],
        "list_objects_b": [
            _make_filter_param(name="f4", type_="string"),
            _make_filter_param(name="f5", type_="string"),  # → 5 total → STRUCTURED
        ],
    }
    result = detect_filter_strategy(raw_ir, extracted)
    assert result == FilterStrategy.STRUCTURED_OBJECT


# ──────────────────────────── Determinism ────────────────────────────────


def test_detect_strategy_pure_function() -> None:
    """Same inputs → same output across multiple calls (deterministic)."""
    raw_ir = _make_raw_ir([_make_endpoint(description="Use JQL syntax")])
    a = detect_filter_strategy(raw_ir, {})
    b = detect_filter_strategy(raw_ir, {})
    c = detect_filter_strategy(raw_ir, {})
    assert a == b == c == FilterStrategy.DSL_STRING


# ──────────────────────────── _has_native_query_language helper ─────────────


def test_has_native_query_language_false_for_empty_endpoints() -> None:
    """No endpoints → False."""
    assert _has_native_query_language(_make_raw_ir([])) is False


def test_has_native_query_language_false_for_unrelated_descriptions() -> None:
    """Plain CRUD descriptions don't trip the regex."""
    raw_ir = _make_raw_ir(
        [
            _make_endpoint(description="Returns a list of charges", path="/v1/a"),
            _make_endpoint(description="Creates a customer", path="/v1/b"),
        ]
    )
    assert _has_native_query_language(raw_ir) is False


def test_has_native_query_language_true_for_jql_mention() -> None:
    raw_ir = _make_raw_ir([_make_endpoint(description="JQL is the query language")])
    assert _has_native_query_language(raw_ir) is True


# ──────────────────────────── _is_simple_filter_param helper ────────────────


def test_is_simple_filter_param_string_type() -> None:
    p = _make_filter_param(name="x", type_="string")
    assert _is_simple_filter_param(p) is True


def test_is_simple_filter_param_integer_type() -> None:
    p = _make_filter_param(name="x", type_="integer")
    assert _is_simple_filter_param(p) is True


def test_is_simple_filter_param_boolean_type() -> None:
    p = _make_filter_param(name="x", type_="boolean")
    assert _is_simple_filter_param(p) is True


def test_is_simple_filter_param_number_type() -> None:
    p = _make_filter_param(name="x", type_="number")
    assert _is_simple_filter_param(p) is True


def test_is_simple_filter_param_object_type_rejected() -> None:
    p = _make_filter_param(name="x", type_="object")
    assert _is_simple_filter_param(p) is False


def test_is_simple_filter_param_array_type_rejected() -> None:
    p = _make_filter_param(name="x", type_="array")
    assert _is_simple_filter_param(p) is False


def test_is_simple_filter_param_pattern_disqualifies() -> None:
    p = _make_filter_param(name="x", type_="string", pattern=r"\d+")
    assert _is_simple_filter_param(p) is False


# ──────────────────────────── emit_filter_schema — A ────────────────────────


def test_emit_filter_schema_structured_object_shape() -> None:
    """Strategy A returns a 3-property object (property/operator/value) with frozen enum."""
    schema = emit_filter_schema(FilterStrategy.STRUCTURED_OBJECT, [])
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    assert set(schema["properties"]) == {"property", "operator", "value"}
    assert schema["properties"]["operator"]["enum"] == list(STRUCTURED_OBJECT_OPERATORS)
    assert set(schema["required"]) == {"property", "operator", "value"}


def test_emit_filter_schema_structured_object_operators_frozen() -> None:
    """The emitted operator enum matches the FROZEN tuple verbatim (T-03-AP)."""
    schema = emit_filter_schema(FilterStrategy.STRUCTURED_OBJECT, [])
    assert schema["properties"]["operator"]["enum"] == [
        "Equal",
        "NotEqual",
        "GreaterThan",
        "LessThan",
        "GreaterThanOrEqual",
        "LessThanOrEqual",
        "Contains",
        "In",
        "NotIn",
    ]


def test_emit_filter_schema_structured_object_ignores_extracted_params() -> None:
    """Strategy A schema does not depend on extracted_filter_params."""
    a = emit_filter_schema(FilterStrategy.STRUCTURED_OBJECT, [])
    b = emit_filter_schema(
        FilterStrategy.STRUCTURED_OBJECT,
        [_make_filter_param(name="status"), _make_filter_param(name="archived")],
    )
    assert a == b


# ──────────────────────────── emit_filter_schema — B ────────────────────────


def test_emit_filter_schema_dsl_string_shape() -> None:
    """Strategy B returns a string schema with descriptive text."""
    schema = emit_filter_schema(FilterStrategy.DSL_STRING, [])
    assert schema["type"] == "string"
    assert "description" in schema
    # Description should mention native-query-language hints (JQL/GraphQL/SQL).
    assert any(hint in schema["description"] for hint in ("JQL", "GraphQL", "SQL"))


# ──────────────────────────── emit_filter_schema — C ────────────────────────


def test_emit_filter_schema_individual_lifts_simple_params() -> None:
    """Strategy C builds a `properties` map with one entry per simple filter."""
    params = [
        _make_filter_param(
            name="status",
            type_="string",
            enum=["open", "closed"],
            description="The current status of the record.",
        ),
        _make_filter_param(name="archived", type_="boolean", default=False),
        _make_filter_param(name="amount", type_="number"),
    ]
    schema = emit_filter_schema(FilterStrategy.INDIVIDUAL_PARAMS, params)
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    assert schema["_individual_params_marker"] is True
    assert set(schema["properties"]) == {"status", "archived", "amount"}
    # Per-param fields propagate.
    assert schema["properties"]["status"]["type"] == "string"
    assert schema["properties"]["status"]["enum"] == ["open", "closed"]
    assert schema["properties"]["status"]["description"].startswith("The current status")
    assert schema["properties"]["archived"]["default"] is False


def test_emit_filter_schema_individual_skips_non_simple() -> None:
    """Strategy C SKIPS params with `pattern` or non-scalar type."""
    params = [
        _make_filter_param(name="status", type_="string"),
        _make_filter_param(name="email", type_="string", pattern=r".+@.+"),  # not simple
        _make_filter_param(name="meta", type_="object"),  # not simple
    ]
    schema = emit_filter_schema(FilterStrategy.INDIVIDUAL_PARAMS, params)
    assert set(schema["properties"]) == {"status"}


def test_emit_filter_schema_individual_empty_input() -> None:
    """Strategy C with no params → empty properties dict (still well-formed)."""
    schema = emit_filter_schema(FilterStrategy.INDIVIDUAL_PARAMS, [])
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    assert schema["_individual_params_marker"] is True
    assert schema["properties"] == {}


def test_emit_filter_schema_individual_truncates_long_descriptions() -> None:
    """Strategy C bounds per-param descriptions to keep schema lean (≤300 chars)."""
    long_desc = "x" * 500
    params = [_make_filter_param(name="x", type_="string", description=long_desc)]
    schema = emit_filter_schema(FilterStrategy.INDIVIDUAL_PARAMS, params)
    assert len(schema["properties"]["x"]["description"]) == 300


# ──────────────────────────── Logging policy (T-03-spec-content-leak) ───────


def test_detect_strategy_does_not_log_spec_content(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Logging emits ONLY structural fields — never the matched description text.

    D-52 / T-03-spec-content-leak: log fields are `strategy` + `reason` +
    `filter_param_count`; the matched description string ('Use JQL syntax')
    must NEVER appear in the captured log output.
    """
    spec_content = "Use JQL syntax to query records — proprietary jargon abc-123"
    raw_ir = _make_raw_ir([_make_endpoint(description=spec_content)])

    # Trigger the DSL_STRING branch which inspects descriptions.
    result = detect_filter_strategy(raw_ir, {})
    assert result == FilterStrategy.DSL_STRING

    captured = capsys.readouterr()
    log_text = captured.out + captured.err
    # Structural log line is present.
    assert "pass_3.filter_design.detect" in log_text
    # Spec content must NOT appear.
    assert "JQL syntax to query records" not in log_text
    assert "abc-123" not in log_text
