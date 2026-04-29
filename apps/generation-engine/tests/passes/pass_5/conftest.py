"""Pass 5 — pytest fixtures.

Provides synthetic ``RawIR`` + ``Pass1Output`` combinations exercising every
pagination strategy, plus Stripe golden-fixture-loaded outputs for
cross-plan reuse (consumed by plans 04-02..04-05).

Note: ``Endpoint.parameters`` is ``List[Dict[str, Any]]`` (raw dicts) and
``Endpoint.responses`` is ``Dict[str, Any]`` (raw dicts) — see
``packages/ir/python/types.py`` lines 714-727. We build synthetic Endpoint
instances with hand-rolled dict shapes so test inputs match real Stage A
output exactly.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from mcpgen_ir.types import (
    CoverageProofItem,
    Endpoint,
    Method,
    Pass1Output,
    RawIR,
    Routing1,
    SampleInvocation,
    SmartId,
    SpecFormat,
    Tool1,
    Type,
)
from pytest_httpx import HTTPXMock

from mcpgen_engine.passes.pass_5.output_schema import OutputSchemaSpec

_REPO_ROOT = Path(__file__).resolve().parents[5]
_STRIPE_FIXTURES = _REPO_ROOT / "packages" / "engine-fixtures" / "stripe"

# Deterministic placeholder spec_hash for synthetic RawIR fixtures.
_PLACEHOLDER_SPEC_HASH = "a" * 64


def _load_json(name: str) -> dict[str, Any]:
    path = _STRIPE_FIXTURES / name
    if not path.exists():
        pytest.skip(f"Fixture {path} not yet hand-tuned")
    parsed: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return parsed


# ─────────────────────────── Stripe golden fixtures ─────────────────────────


@pytest.fixture
def stripe_pass_1_output() -> Pass1Output:
    return Pass1Output.model_validate(_load_json("pass-1-output.json"))


@pytest.fixture
def stripe_raw_ir() -> RawIR:
    return RawIR.model_validate(_load_json("ir.json"))


# ─────────────────────────────── Synthetic factories ────────────────────────


def _make_endpoint(
    *,
    method: Method = Method.GET,
    path: str = "/v1/items",
    parameters: list[dict[str, Any]] | None = None,
    response_schema: dict[str, Any] | None = None,
) -> Endpoint:
    """Synthetic Endpoint factory mirroring real Stage A output shape.

    ``Endpoint.parameters`` is ``List[Dict[str, Any]]`` (raw OpenAPI param
    dicts with ``name`` / ``in`` / ``schema``). ``Endpoint.responses`` is
    ``Dict[str, Any]`` keyed by status code with optional ``schema`` /
    ``description`` keys.
    """
    response_obj: dict[str, Any] = {"description": "OK"}
    if response_schema is not None:
        response_obj["schema"] = response_schema
    return Endpoint(
        method=method,
        path=path,
        operation_id=None,
        summary=None,
        description=None,
        parameters=parameters or [],
        request_body=None,
        responses={"200": response_obj},
        tags=[],
        deprecated=False,
    )


def _make_raw_ir(endpoints: list[Endpoint]) -> RawIR:
    return RawIR(
        spec_format=SpecFormat.openapi_3_0,
        spec_hash=_PLACEHOLDER_SPEC_HASH,
        endpoints=endpoints,
        schemas={},
        security_schemes={},
        dependency_graph={},
    )


def _make_pass_1_output(
    *, tools: list[Tool1], coverage_endpoints: list[tuple[str, str]] | None = None
) -> Pass1Output:
    """Build minimal Pass1Output with the given tools.

    ``coverage_endpoints`` is a list of ``(endpoint_id, mapped_universal_tool)``
    tuples; if omitted, derive 1 entry per tool's first source endpoint.
    """
    smart_id = SmartId(
        format="example:{type}:{collection}:{identifier}",
        types=["object"],
        collections=["Item"],
    )
    routing = Routing1(smart_id=smart_id, rules=[])

    if coverage_endpoints is None:
        coverage_endpoints = [(t.source_endpoints[0], t.name) for t in tools if t.source_endpoints]

    coverage_proof = [
        CoverageProofItem(
            endpoint_id=endpoint_id,
            mapped_to_universal_tool=mapped_tool,
            sample_invocation=SampleInvocation(
                url="https://example.com/api",  # type: ignore[arg-type]
                method="GET",
                params={},
            ),
        )
        for endpoint_id, mapped_tool in coverage_endpoints
    ]

    return Pass1Output(
        tools=tools,
        routing=routing,
        workflows=[],
        coverage_pct=100.0 if tools else 0.0,
        coverage_proof=coverage_proof,
    )


def _single_tool_output(*, tool_name: str, source_endpoint: str) -> Pass1Output:
    """Convenience: Pass1Output with one universal tool."""
    tool = Tool1(
        name=tool_name,
        type=Type.universal,
        source_endpoints=[source_endpoint],
    )
    return _make_pass_1_output(tools=[tool])


# ───────────────────────── Pagination-style fixtures ────────────────────────


@pytest.fixture
def spec_with_cursor_pagination() -> tuple[Pass1Output, RawIR]:
    """Cursor pagination via request param + response field."""
    endpoint = _make_endpoint(
        method=Method.GET,
        path="/v1/items",
        parameters=[
            {"name": "cursor", "in": "query", "schema": {"type": "string"}},
            {"name": "limit", "in": "query", "schema": {"type": "integer"}},
        ],
        response_schema={
            "type": "object",
            "properties": {
                "items": {"type": "array"},
                "next_cursor": {"type": "string"},
            },
        },
    )
    pass_1_output = _single_tool_output(tool_name="list_objects", source_endpoint="GET /v1/items")
    return pass_1_output, _make_raw_ir([endpoint])


@pytest.fixture
def spec_with_offset_pagination() -> tuple[Pass1Output, RawIR]:
    """Offset pagination — request param ``offset`` only."""
    endpoint = _make_endpoint(
        method=Method.GET,
        path="/v1/items",
        parameters=[
            {"name": "offset", "in": "query", "schema": {"type": "integer"}},
            {"name": "limit", "in": "query", "schema": {"type": "integer"}},
        ],
        response_schema={"type": "object", "properties": {"items": {"type": "array"}}},
    )
    pass_1_output = _single_tool_output(tool_name="list_objects", source_endpoint="GET /v1/items")
    return pass_1_output, _make_raw_ir([endpoint])


@pytest.fixture
def spec_with_page_number_pagination() -> tuple[Pass1Output, RawIR]:
    """Page-number pagination — requires BOTH ``page`` AND ``per_page``."""
    endpoint = _make_endpoint(
        method=Method.GET,
        path="/v1/items",
        parameters=[
            {"name": "page", "in": "query", "schema": {"type": "integer"}},
            {"name": "per_page", "in": "query", "schema": {"type": "integer"}},
        ],
        response_schema={"type": "object", "properties": {"items": {"type": "array"}}},
    )
    pass_1_output = _single_tool_output(tool_name="list_objects", source_endpoint="GET /v1/items")
    return pass_1_output, _make_raw_ir([endpoint])


@pytest.fixture
def spec_no_pagination() -> tuple[Pass1Output, RawIR]:
    """No pagination signals — only id-fetch / search-by-query."""
    endpoint = _make_endpoint(
        method=Method.GET,
        path="/v1/items/{id}",
        parameters=[
            {"name": "id", "in": "path", "schema": {"type": "string"}},
        ],
        response_schema={"type": "object", "properties": {"id": {"type": "string"}}},
    )
    # Use a `fetch` tool so the orchestrator skips it (not list-shaped).
    pass_1_output = _single_tool_output(tool_name="fetch", source_endpoint="GET /v1/items/{id}")
    return pass_1_output, _make_raw_ir([endpoint])


# ───────────────────────── OpenRouter mock helper (plan 04-03) ──────────────


@pytest.fixture
def httpx_mock_qwen(
    httpx_mock: HTTPXMock,
) -> Callable[[dict[str, Any]], None]:
    """Mock OpenRouter chat-completions responses in PydanticAI tool-calling shape.

    Returns a callable that adds a single mocked response carrying the given
    ``content`` dict as the ``final_result`` tool-call arguments. Used by
    plan 04-03's ``test_field_ranking.py`` for LLM-bearing tests.
    """

    def _add(content: dict[str, Any]) -> None:
        httpx_mock.add_response(
            method="POST",
            url="https://openrouter.ai/api/v1/chat/completions",
            json={
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 1735689600,
                "model": "qwen/qwen3-coder",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {
                                        "name": "final_result",
                                        "arguments": json.dumps(content),
                                    },
                                }
                            ],
                        },
                        "finish_reason": "tool_calls",
                    }
                ],
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 50,
                    "total_tokens": 150,
                },
            },
        )

    return _add


# ───────────────────── OutputSchemaSpec fixtures (plan 04-03) ───────────────


def _make_field_schema(
    *,
    field_type: str = "string",
    description: str | None = None,
    required: bool = False,
) -> dict[str, Any]:
    """Build a per-field schema dict for ``OutputSchemaSpec.fields``."""
    schema: dict[str, Any] = {"type": field_type}
    if description is not None:
        schema["description"] = description
    if required:
        schema["required"] = True
    return schema


@pytest.fixture
def output_schema_spec_under_threshold() -> OutputSchemaSpec:
    """Synthetic OutputSchemaSpec with 5 fields → below 10-field LLM threshold."""
    fields: dict[str, dict[str, Any]] = {
        "id": _make_field_schema(field_type="string", required=True),
        "name": _make_field_schema(field_type="string"),
        "status": _make_field_schema(field_type="string"),
        "created_at": _make_field_schema(field_type="string"),
        "_internal": _make_field_schema(field_type="string"),
    }
    return OutputSchemaSpec(
        tool_name="get_thing",
        fields=fields,
        data_schema={"type": "object", "properties": fields},
        source_endpoint_id="GET /v1/things/{id}",
        wrapping_object_type="Thing",
        inference_low_confidence=False,
    )


@pytest.fixture
def output_schema_spec_over_threshold() -> OutputSchemaSpec:
    """Synthetic OutputSchemaSpec with 15 fields → above 10-field LLM threshold."""
    fields: dict[str, dict[str, Any]] = {
        "id": _make_field_schema(field_type="string", required=True),
        "name": _make_field_schema(field_type="string", required=True),
        "title": _make_field_schema(field_type="string"),
        "status": _make_field_schema(field_type="string"),
        "type": _make_field_schema(field_type="string"),
        "created_at": _make_field_schema(field_type="string"),
        "updated_at": _make_field_schema(field_type="string"),
        "summary": _make_field_schema(field_type="string", description="Primary summary line"),
        "description": _make_field_schema(field_type="string"),
        "metadata": _make_field_schema(field_type="object"),
        "attributes": _make_field_schema(field_type="object"),
        "_internal_id": _make_field_schema(field_type="string"),
        "raw_payload": _make_field_schema(field_type="string"),
        "debug_trace": _make_field_schema(field_type="string"),
        "deprecated_field": _make_field_schema(
            field_type="string", description="deprecated; do not use"
        ),
    }
    return OutputSchemaSpec(
        tool_name="get_complex",
        fields=fields,
        data_schema={"type": "object", "properties": fields},
        source_endpoint_id="GET /v1/complex/{id}",
        wrapping_object_type="ComplexThing",
        inference_low_confidence=False,
    )


@pytest.fixture
def tool1_get_thing() -> Tool1:
    """Synthetic ``Tool1`` matching ``output_schema_spec_under_threshold``."""
    return Tool1(
        name="get_thing",
        type=Type.specialized,
        source_endpoints=["GET /v1/things/{id}"],
    )


@pytest.fixture
def tool1_get_complex() -> Tool1:
    """Synthetic ``Tool1`` matching ``output_schema_spec_over_threshold``."""
    return Tool1(
        name="get_complex",
        type=Type.specialized,
        source_endpoints=["GET /v1/complex/{id}"],
    )


# ───────────────────── Plan 04-05 final-assembly fixtures ───────────────────


@pytest.fixture
def stripe_pass_2_output() -> Any:
    """Stripe Pass 2 fixture (Phase 4 hand-tuned)."""
    from mcpgen_ir.types import Pass2Output

    return Pass2Output.model_validate(_load_json("pass-2-output.json"))


@pytest.fixture
def stripe_pass_3_output() -> Any:
    """Stripe Pass 3 fixture (Phase 4 hand-tuned)."""
    from mcpgen_ir.types import Pass3Output

    return Pass3Output.model_validate(_load_json("pass-3-output.json"))


@pytest.fixture
def stripe_pass_4_output() -> Any:
    """Stripe Pass 4 fixture (Phase 4 hand-tuned)."""
    from mcpgen_ir.types import Pass4Output

    return Pass4Output.model_validate(_load_json("pass-4-output.json"))


@pytest.fixture
def mock_output_schemas_stripe(
    stripe_pass_1_output: Pass1Output, stripe_raw_ir: RawIR
) -> dict[str, OutputSchemaSpec]:
    """Compute output_schemas for every Stripe Pass 1 tool (deterministic)."""
    from mcpgen_engine.passes.pass_5.output_schema import extract_all_output_schemas

    return extract_all_output_schemas(stripe_pass_1_output, stripe_raw_ir)


@pytest.fixture
def mock_field_rankings_stripe(
    stripe_pass_1_output: Pass1Output,
    mock_output_schemas_stripe: dict[str, OutputSchemaSpec],
) -> dict[str, Any]:
    """Synthetic ``FieldRanking`` per Stripe tool — deterministic only.

    Uses the heuristic deterministic ranker so no LLM is involved. Provides
    a complete ``dict[tool_name → FieldRanking]`` matching every Pass 1 tool.
    """
    from mcpgen_engine.passes.pass_5.field_ranking import deterministic_ranking

    return {
        tool.name: deterministic_ranking(mock_output_schemas_stripe[tool.name].fields)
        for tool in stripe_pass_1_output.tools
    }


@pytest.fixture
def mock_truncation_configs_stripe(
    stripe_pass_1_output: Pass1Output,
) -> dict[str, Any]:
    """Compute truncation_configs for every Stripe Pass 1 tool (deterministic)."""
    from mcpgen_engine.passes.pass_5.truncation import build_all_truncation_configs

    return build_all_truncation_configs(stripe_pass_1_output, "cursor")


@pytest.fixture
def synthetic_inconsistent_pagination_pass1() -> Pass1Output:
    """Pass1Output with 2 list_objects-shaped tools that disagree on pagination
    style (used to test ``validate_pagination_consistency``).

    Note: Pass 1 tools whose ``type=universal`` use ``name`` as the universal-tool
    variant. Two distinct list_objects tools are not allowed by the Six-Tool
    Pattern, so we use a workaround: synthesize a ``list_objects`` + a
    ``list_collections`` tool both list-shaped.
    """
    tool_a = Tool1(
        name="list_objects",
        type=Type.universal,
        source_endpoints=["GET /v1/items"],
    )
    tool_b = Tool1(
        name="list_collections",
        type=Type.universal,
        source_endpoints=["GET /v1/collections"],
    )
    return _make_pass_1_output(
        tools=[tool_a, tool_b],
        coverage_endpoints=[
            ("GET /v1/items", "list_objects"),
            ("GET /v1/collections", "list_collections"),
        ],
    )


@pytest.fixture
def make_synthetic_final_tool() -> Callable[..., Any]:
    """Factory for building synthetic ``FinalTool``-shaped IR objects.

    Returns a callable that produces a Pydantic ``Tool2`` (the IR shape used by
    ``Pass5Output.tools``; structurally identical to ``FinalTool``). Optional
    kwargs override defaults so individual tests can inject specific
    ``response_config`` shapes for cross-tool validators.
    """
    from mcpgen_ir.types import (
        Annotations,
        Description,
        FieldFiltering,
        Pagination2,
        ResponseConfig2,
        Style,
        Tool2,
        Truncation,
    )

    def _build(
        *,
        name: str = "list_objects",
        tool_type: Type = Type.universal,
        pagination_style: Style | None = Style.cursor,
        truncation_template: str = "Showing {N} of {Total} objects.",
        threshold_tokens: int = 15_000,
        has_response_format_param: bool = False,
        source_endpoints: list[str] | None = None,
    ) -> Tool2:
        if source_endpoints is None:
            source_endpoints = ["GET /v1/items"]
        pagination_obj = (
            Pagination2(style=pagination_style, default_limit=25, max_limit=100)
            if pagination_style is not None
            else None
        )
        return Tool2(
            name=name,
            type=tool_type,
            description=Description(
                purpose="Synthetic tool used by validation tests in plan 04-05.",
                when_to_use=["test"],
                limitations=[],
                parameter_overview="x" * 60,
            ),
            inputSchema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            outputSchema={"type": "object", "additionalProperties": True},
            annotations=Annotations(
                readOnlyHint=True,
                destructiveHint=False,
                idempotentHint=True,
                openWorldHint=True,
            ),
            response_config=ResponseConfig2(
                pagination=pagination_obj,
                field_filtering=FieldFiltering(
                    always_include=["id"],
                    opt_in=[],
                    always_exclude=[],
                ),
                truncation=Truncation(
                    threshold_tokens=threshold_tokens,
                    guidance_template=truncation_template,
                ),
                has_response_format_param=has_response_format_param,
            ),
            source_endpoints=source_endpoints,
        )

    return _build
