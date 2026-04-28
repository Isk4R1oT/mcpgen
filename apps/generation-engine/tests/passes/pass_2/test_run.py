"""Pass 2 __init__.py — 4-phase orchestrator + Pass2Output assembly tests.

Verifies:
- Returns Pass2Output with description_hash set on every Descriptions entry (D-14).
- description_hash matches diff.description_hash for the same Description.
- Empty pass_1_output.tools → empty Pass2Output.descriptions, no errors.
- Tool keys mirror pass_1_output.tools.name 1:1.
- Logs structural counts (no spec content per D-52).

Mocks both ``author_all_tools`` and ``quality_gate_all_tools`` at the
orchestrator's import surface — keeps tests fast and isolated from the
LLM mock layer (the per-module tests already cover those paths).
"""

from __future__ import annotations

import pytest
from mcpgen_ir.types import (
    Description,
    Endpoint,
    Method,
    Pass1Output,
    Pass2Output,
    RawIR,
    Routing1,
    Rule1,
    SmartId,
    SpecFormat,
    Tool1,
    Type,
    UniversalTool,
)

from mcpgen_engine.passes import pass_2
from mcpgen_engine.passes.pass_2 import PASS_2_VERSION, run
from mcpgen_engine.passes.pass_2.authoring import AuthoredToolResult, Pass2WarningSet
from mcpgen_engine.passes.pass_2.diff import description_hash

_FAKE_SPEC_HASH = "a" * 64


# ─────────────────────────── Fixture builders ──────────────────────────────


def _make_description(purpose_suffix: str = "") -> Description:
    return Description(
        purpose=("Search for charges by amount, currency, customer, or status." + purpose_suffix),
        when_to_use=["finding charges by attribute"],
        when_not_to_use=None,
        how_to_use=None,
        limitations=["best-effort match"],
        parameter_overview=("Accepts a free-form query string; returns ranked smart-id results."),
    )


def _make_tool(
    name: str = "search",
    type_: Type = Type.universal,
    source_endpoints: list[str] | None = None,
) -> Tool1:
    return Tool1(
        name=name,
        type=type_,
        source_endpoints=source_endpoints or ["GET /v1/charges"],
    )


def _make_endpoint(path: str = "/v1/charges") -> Endpoint:
    return Endpoint(
        method=Method.GET,
        path=path,
        operation_id=None,
        summary="Get charges.",
        description="Get charges.",
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
        endpoints=endpoints or [_make_endpoint()],
        schemas={},
        security_schemes={},
        dependency_graph={},
    )


def _make_pass1_output(tools: list[Tool1]) -> Pass1Output:
    smart_id = SmartId(
        format="{server}:{type}:{collection}:{identifier}",
        types=["object"],
        collections=["charge"],
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


def _patch_author_quality(
    monkeypatch: pytest.MonkeyPatch,
    descriptions_per_tool: dict[str, Description],
    quality_warnings: dict[str, bool] | None = None,
    warnings_per_tool: dict[str, Pass2WarningSet] | None = None,
) -> None:
    """Patch author_all_tools + quality_gate_all_tools at the orchestrator
    import surface so tests don't hit the LLM stack."""
    warnings_per_tool = warnings_per_tool or {}
    if quality_warnings is None:
        quality_warnings = {n: False for n in descriptions_per_tool}

    async def fake_author_all_tools(
        pass_1_output: Pass1Output,  # noqa: ARG001 — signature matches real fn
        raw_ir: RawIR,  # noqa: ARG001
    ) -> dict[str, AuthoredToolResult]:
        return {
            name: AuthoredToolResult(
                tool_name=name,
                description=desc,
                warnings=warnings_per_tool.get(name, Pass2WarningSet()),
            )
            for name, desc in descriptions_per_tool.items()
        }

    async def fake_quality_gate_all_tools(
        descriptions: dict[str, Description],
        pass_1_output: Pass1Output,  # noqa: ARG001
        raw_ir: RawIR,  # noqa: ARG001
    ) -> tuple[dict[str, Description], dict[str, bool]]:
        return dict(descriptions), dict(quality_warnings)

    monkeypatch.setattr(pass_2, "author_all_tools", fake_author_all_tools)
    monkeypatch.setattr(pass_2, "quality_gate_all_tools", fake_quality_gate_all_tools)


# ─────────────────────── PASS_2_VERSION constant ───────────────────────────


def test_pass_2_version_is_string_one() -> None:
    assert PASS_2_VERSION == "1"  # noqa: S105 — version string, not a credential


def test_run_is_exported() -> None:
    assert hasattr(pass_2, "run")
    assert callable(run)


# ──────────────────── Pass2Output shape + description_hash ─────────────────


async def test_run_emits_pass_2_output_with_description_hash_on_every_tool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tools = [
        _make_tool(name="search"),
        _make_tool(name="fetch", source_endpoints=["GET /v1/charges/{id}"]),
        _make_tool(name="list_objects", source_endpoints=["GET /v1/charges"]),
    ]
    pass_1_output = _make_pass1_output(tools)
    raw_ir = _make_raw_ir()

    descriptions = {t.name: _make_description(purpose_suffix=f" #{t.name}") for t in tools}
    _patch_author_quality(monkeypatch, descriptions)

    output = await run(pass_1_output, raw_ir)
    assert isinstance(output, Pass2Output)
    assert len(output.descriptions) == 3
    for name in ("search", "fetch", "list_objects"):
        d = output.descriptions[name]
        assert d.description_hash is not None
        assert len(d.description_hash) == 64


async def test_run_description_hash_matches_diff_module(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Consistency: the orchestrator-set hash must equal diff.description_hash."""
    tools = [_make_tool()]
    pass_1_output = _make_pass1_output(tools)
    raw_ir = _make_raw_ir()
    description = _make_description()
    _patch_author_quality(monkeypatch, {tools[0].name: description})

    output = await run(pass_1_output, raw_ir)
    expected_hash = description_hash(description)
    assert output.descriptions[tools[0].name].description_hash == expected_hash


async def test_run_uses_pass_1_output_tools_as_source_of_truth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tools = [
        _make_tool(name="tool_a"),
        _make_tool(name="tool_b", source_endpoints=["GET /v1/x"]),
    ]
    pass_1_output = _make_pass1_output(tools)
    raw_ir = _make_raw_ir([_make_endpoint(), _make_endpoint("/v1/x")])
    descriptions = {t.name: _make_description() for t in tools}
    _patch_author_quality(monkeypatch, descriptions)

    output = await run(pass_1_output, raw_ir)
    assert set(output.descriptions.keys()) == {"tool_a", "tool_b"}


async def test_run_completes_with_zero_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    pass_1_output = _make_pass1_output(tools=[])
    raw_ir = _make_raw_ir()
    _patch_author_quality(monkeypatch, descriptions_per_tool={})

    output = await run(pass_1_output, raw_ir)
    assert isinstance(output, Pass2Output)
    assert output.descriptions == {}


async def test_run_aggregates_warnings_count_in_log(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """1 tool with length_violation + 2 clean → log carries warnings_count=1
    + tool_count=3. structlog default config writes key=value pairs to stdout."""
    tools = [
        _make_tool(name="dirty"),
        _make_tool(name="clean1", source_endpoints=["GET /v1/x"]),
        _make_tool(name="clean2", source_endpoints=["GET /v1/y"]),
    ]
    pass_1_output = _make_pass1_output(tools)
    raw_ir = _make_raw_ir([_make_endpoint(), _make_endpoint("/v1/x"), _make_endpoint("/v1/y")])
    descriptions = {t.name: _make_description() for t in tools}
    warnings_per_tool = {"dirty": Pass2WarningSet(length_violation="too short, expand it")}
    _patch_author_quality(monkeypatch, descriptions, warnings_per_tool=warnings_per_tool)

    await run(pass_1_output, raw_ir)
    captured = capsys.readouterr()
    log_text = captured.out + captured.err
    assert "pass_2.run.complete" in log_text
    assert "tool_count=3" in log_text
    assert "warnings_count=1" in log_text


async def test_run_quality_warnings_aggregated(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """quality_warnings True for one tool → log carries quality_warning_count=1."""
    tools = [_make_tool(name="bad"), _make_tool(name="good", source_endpoints=["GET /v1/x"])]
    pass_1_output = _make_pass1_output(tools)
    raw_ir = _make_raw_ir([_make_endpoint(), _make_endpoint("/v1/x")])
    descriptions = {t.name: _make_description() for t in tools}
    _patch_author_quality(
        monkeypatch,
        descriptions,
        quality_warnings={"bad": True, "good": False},
    )

    await run(pass_1_output, raw_ir)
    captured = capsys.readouterr()
    log_text = captured.out + captured.err
    assert "quality_warning_count=1" in log_text


# ─────────────── Output type-conversion (Description → Descriptions) ───────


async def test_run_converts_description_to_descriptions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pass2Output.descriptions value type is `Descriptions` (NOT `Description`),
    and includes the description_hash field."""
    from mcpgen_ir.types import Descriptions

    tools = [_make_tool()]
    pass_1_output = _make_pass1_output(tools)
    raw_ir = _make_raw_ir()
    description = _make_description()
    _patch_author_quality(monkeypatch, {tools[0].name: description})

    output = await run(pass_1_output, raw_ir)
    value = output.descriptions[tools[0].name]
    assert isinstance(value, Descriptions)
    assert value.description_hash is not None
