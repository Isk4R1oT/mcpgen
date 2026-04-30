"""Plan 09-05 Task 3 — VALIDATION 9-04-01: end-to-end Langfuse session correlation.

Captures the OTel span emitted by ``run_with_tracing`` via an
:class:`InMemorySpanExporter` routed through Logfire's processor chain (the
same chain Langfuse Cloud's OTLP exporter would consume in production), then
asserts that:

- ``langfuse.session.id`` equals the generation_id we passed.
- ``langfuse.tags`` carries the stage label.
- The scrubbing callback (registered via Plan 09-05 Task 2) preserves the
  session id end-to-end (Pitfall #1 mitigated).

The wrapper takes a stub ``Agent`` whose ``run`` returns a sentinel object —
no real LLM call, no network, fast. This is the minimum proof that the wiring
the wrapper installs survives the full Logfire processor pipeline including
the scrubbing wrapper.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import logfire
import pytest
from opentelemetry import metrics as otel_metrics
from opentelemetry.metrics import NoOpMeterProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from mcpgen_engine.observability.run_tracing import run_with_tracing
from mcpgen_engine.observability.scrubbing import combined_scrub_callback


@dataclass
class _StubResult:
    """Stub for PydanticAI ``AgentRunResult`` — only ``output`` is consumed."""

    output: str


class _StubAgent:
    """Minimal async-callable stub.

    PydanticAI's ``Agent.run`` returns an ``AgentRunResult``; our wrapper
    forwards the result unchanged. We mimic the run signature
    (``prompt`` positional + ``model_settings=`` kwarg) so any future tighter
    typing on the wrapper still works.
    """

    def __init__(self, output: str) -> None:
        self._output = output

    async def run(self, prompt: str, *, model_settings: Any) -> _StubResult:  # noqa: ARG002
        return _StubResult(output=self._output)


@pytest.fixture
def in_memory_exporter() -> InMemorySpanExporter:
    """Same fixture shape as test_run_tracing_spike — see that file for rationale."""
    otel_metrics.set_meter_provider(NoOpMeterProvider())
    exporter = InMemorySpanExporter()
    logfire.configure(
        send_to_logfire=False,
        service_name="mcpgen-test-langfuse-session",
        metrics=False,
        scrubbing=logfire.ScrubbingOptions(callback=combined_scrub_callback),
        additional_span_processors=[SimpleSpanProcessor(exporter)],
        inspect_arguments=False,
    )
    exporter.clear()
    return exporter


@pytest.mark.asyncio
async def test_run_with_tracing_emits_langfuse_session_id(
    in_memory_exporter: InMemorySpanExporter,
) -> None:
    """VALIDATION 9-04-01 Test 1: ``langfuse.session.id`` reaches the OTel span."""
    agent: Any = _StubAgent(output="ok")
    session_id = "gen_test_2026Q2"

    result = await run_with_tracing(
        agent,
        "test prompt",
        session_id=session_id,
        stage="pass-2",
        model_settings={},
    )
    assert result.output == "ok"

    spans = in_memory_exporter.get_finished_spans()
    matching = [s for s in spans if s.name == "agent.run"]
    assert matching, f"No agent.run span captured; got {[s.name for s in spans]}"
    span = matching[0]
    attrs = dict(span.attributes or {})

    captured_session = attrs.get("langfuse.session.id")
    assert captured_session == session_id, (
        f"Expected langfuse.session.id={session_id!r} (preserved by scrub callback); "
        f"got {captured_session!r}. If this is the literal scrub marker the "
        f"_preserve_langfuse_session_id callback may have regressed."
    )


@pytest.mark.asyncio
async def test_run_with_tracing_emits_langfuse_tags(
    in_memory_exporter: InMemorySpanExporter,
) -> None:
    """VALIDATION 9-04-01 Test 2: ``langfuse.tags`` carries the stage label."""
    agent: Any = _StubAgent(output="ok")

    await run_with_tracing(
        agent,
        "test prompt",
        session_id="gen_test_2026Q2",
        stage="pass-2",
        model_settings={},
    )

    spans = in_memory_exporter.get_finished_spans()
    matching = [s for s in spans if s.name == "agent.run"]
    assert matching
    attrs = dict(matching[0].attributes or {})
    tags = attrs.get("langfuse.tags")
    # Logfire serializes list[str] span attributes through its JSON encoder
    # (the OTel "complex value" path), so we accept both the JSON-encoded
    # form (`'["pass-2"]'`) and any future plain-tuple/list form Logfire
    # might switch to.
    assert tags in (
        ("pass-2",),
        ["pass-2"],
        '["pass-2"]',
    ), f"Expected langfuse.tags to carry 'pass-2' (any encoding); got {tags!r}"


@pytest.mark.asyncio
async def test_run_with_tracing_returns_agent_result_unchanged(
    in_memory_exporter: InMemorySpanExporter,  # noqa: ARG001 — fixture sets up logfire even if spans unused
) -> None:
    """The wrapper must be transparent — pass through agent.run's return value."""
    agent: Any = _StubAgent(output="passthrough_value")
    result = await run_with_tracing(
        agent,
        "x",
        session_id="gen_x",
        stage="pass-1",
        model_settings={"foo": "bar"},
    )
    assert result.output == "passthrough_value"
