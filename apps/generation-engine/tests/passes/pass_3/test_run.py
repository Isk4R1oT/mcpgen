"""Pass 3 __init__.py — 4-phase orchestrator + Pass3Output assembly tests.

Verifies:
- ``run()`` returns ``Pass3Output`` with one ``input_schemas`` entry per
  ``Pass1Output.tools`` (1:1 mapping by name).
- Every emitted ``input_schemas[name]`` carries
  ``additionalProperties: false`` (D-22).
- ``search`` tool emerges with exactly ``{query: string}`` param (Pitfall #32).
- Smart-ID-typed property (e.g. ``fetch.id``) carries the Pass-1-derived
  ``pattern`` containing the ``spec_slug``.
- ``run()`` logs ``filter_strategy`` (D-18 surfaced).
- ``run()`` logs ``quality_warning_count`` aggregated from the gate.
- ``PASS_3_VERSION`` and ``Pass3Error`` are re-exported.

Mocks ``enrich_all_params`` and ``quality_gate_all_tools`` at the
orchestrator's import surface — keeps tests fast and isolated from the
LLM mock layer (the per-module tests already cover those paths).
"""

from __future__ import annotations

from typing import Any

import pytest
from mcpgen_ir.types import (
    Endpoint,
    Method,
    Pass1Output,
    Pass2Output,
    Pass3Output,
    RawIR,
    Routing1,
    Rule1,
    SmartId,
    SpecFormat,
    Tool1,
    Type,
    UniversalTool,
)

from mcpgen_engine.passes import pass_3
from mcpgen_engine.passes.pass_3 import PASS_3_VERSION, Pass3Error, run
from mcpgen_engine.passes.pass_3.enrich import ParameterEnrichment
from mcpgen_engine.passes.pass_3.extract import ParameterSpec

_FAKE_SPEC_HASH = "a" * 64
_SPEC_TITLE = "Stripe API"
_EXPECTED_SLUG = "stripe-api"


# ─────────────────────────── Fixture builders ──────────────────────────────


def _make_endpoint(path: str, method: Method = Method.GET) -> Endpoint:
    return Endpoint(
        method=method,
        path=path,
        operation_id=None,
        summary="An endpoint.",
        description="An endpoint.",
        parameters=[],
        request_body=None,
        responses={"200": {}},
        tags=[],
        deprecated=False,
    )


def _make_raw_ir(endpoints: list[Endpoint] | None = None) -> RawIR:
    return RawIR(
        spec_format=SpecFormat.openapi_3_1,
        spec_hash=_FAKE_SPEC_HASH,
        endpoints=endpoints or [_make_endpoint("/v1/charges"), _make_endpoint("/v1/customers")],
        schemas={},
        security_schemes={},
        dependency_graph={},
    )


def _make_pass1_output(tools: list[Tool1]) -> Pass1Output:
    smart_id = SmartId(
        format="{server}:{type}:{collection}:{identifier}",
        types=["object"],
        collections=["Charge", "Customer"],
    )
    return Pass1Output(
        tools=tools,
        routing=Routing1(
            smart_id=smart_id,
            rules=[
                Rule1(
                    universal_tool=UniversalTool.search,
                    target_endpoint="GET /v1/charges",
                    params_mapping={},
                )
            ],
        ),
        workflows=[],
        coverage_pct=100.0,
        coverage_proof=[],
    )


def _make_pass2_output() -> Pass2Output:
    """Empty Pass2Output — Pass 3 only carries it for symmetry."""
    return Pass2Output(descriptions={})


def _make_enrichment(name: str = "stub") -> ParameterEnrichment:
    return ParameterEnrichment(
        description=(
            f"WHAT: {name} parameter (string). FORMAT: free-form. "
            f"WHEN: required for invocation. EXAMPLE: see spec. DEFAULT: none."
        ),
        example=None,
        suggested_rename=None,
        inferred_enum=None,
    )


def _patch_enrich_and_gate(
    monkeypatch: pytest.MonkeyPatch,
    *,
    quality_warnings: dict[str, bool] | None = None,
) -> None:
    """Patch enrich_all_params + quality_gate_all_tools at the orchestrator
    import surface so tests don't hit the LLM stack."""

    async def fake_enrich(
        normalized: dict[str, list[ParameterSpec]],
        tool_types_by_name: dict[str, str],  # noqa: ARG001
    ) -> dict[str, list[tuple[ParameterSpec, ParameterEnrichment]]]:
        return {
            name: [(p, _make_enrichment(p.name)) for p in params]
            for name, params in normalized.items()
        }

    async def fake_gate(
        input_schemas: dict[str, dict[str, Any]],
        pass_1_output: Pass1Output,  # noqa: ARG001
    ) -> dict[str, bool]:
        if quality_warnings is None:
            return {name: False for name in input_schemas}
        return dict(quality_warnings)

    monkeypatch.setattr(pass_3, "enrich_all_params", fake_enrich)
    monkeypatch.setattr(pass_3, "quality_gate_all_tools", fake_gate)


# ─────────────────────── Module-level re-exports ───────────────────────────


def test_pass_3_version_is_string_one() -> None:
    assert PASS_3_VERSION == "1"


def test_run_is_exported() -> None:
    assert hasattr(pass_3, "run")
    assert callable(run)


def test_pass_3_error_is_exported() -> None:
    assert hasattr(pass_3, "Pass3Error")
    assert Pass3Error is pass_3.Pass3Error


# ───────────────────── run() — happy path / shape ──────────────────────────


async def test_run_emits_pass_3_output_with_input_schemas_per_tool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """3 tools (1 universal `search`, 1 universal `list_objects`, 1 action)
    → returned Pass3Output has 3 entries."""
    _patch_enrich_and_gate(monkeypatch)
    tools = [
        Tool1(
            name="search",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
        Tool1(
            name="list_objects",
            type=Type.universal,
            source_endpoints=["GET /v1/customers"],
        ),
        Tool1(
            name="charges_capture",
            type=Type.action,
            source_endpoints=["POST /v1/charges"],
        ),
    ]
    raw_ir = _make_raw_ir(
        endpoints=[
            _make_endpoint("/v1/charges"),
            _make_endpoint("/v1/customers"),
            _make_endpoint("/v1/charges", method=Method.POST),
        ]
    )

    output = await run(
        _make_pass2_output(),
        _make_pass1_output(tools),
        raw_ir,
        spec_title=_SPEC_TITLE,
    )
    assert isinstance(output, Pass3Output)
    assert set(output.input_schemas.keys()) == {
        "search",
        "list_objects",
        "charges_capture",
    }


async def test_run_every_schema_has_additional_properties_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """D-22: every schema in input_schemas has ``additionalProperties: false``."""
    _patch_enrich_and_gate(monkeypatch)
    tools = [
        Tool1(
            name="search",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
        Tool1(
            name="fetch",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
        Tool1(
            name="list_objects",
            type=Type.universal,
            source_endpoints=["GET /v1/customers"],
        ),
    ]
    raw_ir = _make_raw_ir()

    output = await run(
        _make_pass2_output(),
        _make_pass1_output(tools),
        raw_ir,
        spec_title=_SPEC_TITLE,
    )
    for name, schema in output.input_schemas.items():
        assert (
            schema["additionalProperties"] is False
        ), f"Tool {name!r} missing additionalProperties:false (D-22)"


async def test_run_search_tool_has_only_query_param(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pitfall #32: search must have exactly ``{query: string}``."""
    _patch_enrich_and_gate(monkeypatch)
    tools = [
        Tool1(
            name="search",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
    ]
    output = await run(
        _make_pass2_output(),
        _make_pass1_output(tools),
        _make_raw_ir(),
        spec_title=_SPEC_TITLE,
    )
    search_props = output.input_schemas["search"]["properties"]
    assert list(search_props.keys()) == ["query"]
    assert search_props["query"]["type"] == "string"


async def test_run_fetch_tool_has_only_id_param(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pitfall #32: fetch must have exactly ``{id: string}``."""
    _patch_enrich_and_gate(monkeypatch)
    tools = [
        Tool1(
            name="fetch",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
    ]
    output = await run(
        _make_pass2_output(),
        _make_pass1_output(tools),
        _make_raw_ir(),
        spec_title=_SPEC_TITLE,
    )
    fetch_props = output.input_schemas["fetch"]["properties"]
    assert list(fetch_props.keys()) == ["id"]
    assert fetch_props["id"]["type"] == "string"


async def test_run_smart_id_param_has_pattern(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """D-20: ``fetch.id`` carries a ``pattern`` field containing the slug."""
    _patch_enrich_and_gate(monkeypatch)
    tools = [
        Tool1(
            name="fetch",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
    ]
    output = await run(
        _make_pass2_output(),
        _make_pass1_output(tools),
        _make_raw_ir(),
        spec_title=_SPEC_TITLE,
    )
    fetch_id = output.input_schemas["fetch"]["properties"]["id"]
    assert "pattern" in fetch_id
    # spec_slug appears in the pattern with re.escape applied (D-20 invariant);
    # the dash gets escaped to ``\-`` so we check for the de-escaped form.
    assert fetch_id["pattern"].startswith("^stripe")
    assert _EXPECTED_SLUG.replace("-", r"\-") in fetch_id["pattern"]


async def test_run_smart_id_param_has_description(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``fetch.id`` carries a description mentioning the smart-ID format."""
    _patch_enrich_and_gate(monkeypatch)
    tools = [
        Tool1(
            name="fetch",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
    ]
    output = await run(
        _make_pass2_output(),
        _make_pass1_output(tools),
        _make_raw_ir(),
        spec_title=_SPEC_TITLE,
    )
    fetch_id = output.input_schemas["fetch"]["properties"]["id"]
    desc = fetch_id["description"]
    # Smart-ID description (D-20) OR standard description (D-21) — both
    # mention the format. Standard description from `standards.py` wins
    # for universal tools.
    assert "Smart" in desc or "smart" in desc


async def test_run_filter_strategy_logged(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """``run.complete`` log record carries ``filter_strategy`` (D-18)."""
    _patch_enrich_and_gate(monkeypatch)
    tools = [
        Tool1(
            name="list_objects",
            type=Type.universal,
            source_endpoints=["GET /v1/customers"],
        ),
    ]
    await run(
        _make_pass2_output(),
        _make_pass1_output(tools),
        _make_raw_ir(),
        spec_title=_SPEC_TITLE,
    )
    captured = capsys.readouterr()
    log_text = captured.out + captured.err
    assert "pass_3.run.complete" in log_text
    assert "filter_strategy" in log_text


async def test_run_warning_count_aggregated(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Quality gate failures are aggregated and surfaced in the log."""
    _patch_enrich_and_gate(
        monkeypatch,
        quality_warnings={"search": True, "fetch": False, "list_objects": True},
    )
    tools = [
        Tool1(
            name="search",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
        Tool1(
            name="fetch",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
        Tool1(
            name="list_objects",
            type=Type.universal,
            source_endpoints=["GET /v1/customers"],
        ),
    ]
    await run(
        _make_pass2_output(),
        _make_pass1_output(tools),
        _make_raw_ir(),
        spec_title=_SPEC_TITLE,
    )
    captured = capsys.readouterr()
    log_text = captured.out + captured.err
    # 2 warnings (search + list_objects) per the patched gate output.
    assert "quality_warning_count=2" in log_text


async def test_run_empty_tools_returns_empty_schemas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_enrich_and_gate(monkeypatch)
    output = await run(
        _make_pass2_output(),
        _make_pass1_output([]),
        _make_raw_ir(),
        spec_title=_SPEC_TITLE,
    )
    assert output.input_schemas == {}


async def test_run_uses_default_slug_when_spec_title_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When ``spec_title`` is None, falls back to ``"spec"`` slug."""
    _patch_enrich_and_gate(monkeypatch)
    tools = [
        Tool1(
            name="fetch",
            type=Type.universal,
            source_endpoints=["GET /v1/charges"],
        ),
    ]
    output = await run(
        _make_pass2_output(),
        _make_pass1_output(tools),
        _make_raw_ir(),
        spec_title=None,
    )
    fetch_id = output.input_schemas["fetch"]["properties"]["id"]
    assert "spec" in fetch_id["pattern"]


# ─────────────────────────── Module re-exports ─────────────────────────────


def test_run_callable_imported_via_package() -> None:
    """Downstream pipeline can ``from mcpgen_engine.passes import pass_3``
    and call ``await pass_3.run(...)``."""
    assert hasattr(pass_3, "run")
    assert callable(pass_3.run)
    assert pass_3.run is run


def test_pass_3_init_no_longer_empty_placeholder() -> None:
    """The empty Wave-0 placeholder from Plan 03-01 has been replaced
    by the real orchestrator (defensive smoke check)."""
    src = pytest.importorskip("inspect").getsource(pass_3)
    assert "async def run" in src
    assert "Wave-0 placeholder" not in src
