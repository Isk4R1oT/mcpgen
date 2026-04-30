"""Plan 09-05 Task 3 — VALIDATION 9-04-02: end-to-end Logfire spec-scrub via callback chain.

Exercises the combined scrubbing callback (registered via
``logfire.configure(scrubbing=ScrubbingOptions(callback=combined_scrub_callback))``)
against two vectors emitted within a single span:

- ``langfuse.session.id`` — preserved.
- ``spec_yaml`` (>10K chars) — replaced with sha256 marker.

The two callbacks chain correctly: spec scrub fires for the long string,
session-id whitelist fires for the namespaced attr, and unrelated values
flow through to the default scrubber unchanged.
"""

from __future__ import annotations

import re
from typing import Any

import logfire
import pytest
from opentelemetry import metrics as otel_metrics
from opentelemetry.metrics import NoOpMeterProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from mcpgen_engine.observability.scrubbing import (
    SPEC_CONTENT_PATTERNS,
    combined_scrub_callback,
)


@pytest.fixture
def in_memory_exporter() -> InMemorySpanExporter:
    otel_metrics.set_meter_provider(NoOpMeterProvider())
    exporter = InMemorySpanExporter()
    logfire.configure(
        send_to_logfire=False,
        service_name="mcpgen-test-spec-scrub",
        metrics=False,
        scrubbing=logfire.ScrubbingOptions(
            callback=combined_scrub_callback,
            extra_patterns=list(SPEC_CONTENT_PATTERNS),
        ),
        additional_span_processors=[SimpleSpanProcessor(exporter)],
        inspect_arguments=False,
    )
    exporter.clear()
    return exporter


def test_long_spec_yaml_replaced_with_sha256_marker(
    in_memory_exporter: InMemorySpanExporter,
) -> None:
    """VALIDATION 9-04-02 Test 3: a 10001-char spec_yaml gets sha256 marker."""
    big_spec = "openapi: 3.0.0\n" + "x" * 10_000  # 10015 chars total
    span_ctx = logfire.span("pipeline.stage_a")
    with span_ctx as active_span:
        active_span.set_attribute("spec_yaml", big_spec)

    spans = in_memory_exporter.get_finished_spans()
    matching = [s for s in spans if s.name == "pipeline.stage_a"]
    assert matching, "No pipeline.stage_a span captured"
    attrs: dict[str, Any] = dict(matching[0].attributes or {})

    captured = attrs.get("spec_yaml")
    assert captured is not None, "spec_yaml attribute missing from span"
    marker_re = re.compile(r"^<spec redacted, sha256:[a-f0-9]{16}>$")
    assert isinstance(captured, str), f"Expected str marker; got {type(captured)}"
    assert marker_re.match(captured), (
        f"Expected sha256 marker; got {captured!r}. "
        f"If this is the raw spec content, _scrub_long_spec_attributes may have regressed."
    )


def test_session_id_preserved_and_long_spec_scrubbed_in_same_span(
    in_memory_exporter: InMemorySpanExporter,
) -> None:
    """VALIDATION 9-04-02 Test 4: combined chain handles both vectors in one span.

    This is the headline assertion — proves that the callback chain doesn't
    accidentally swap precedence or cross-contaminate the two redaction paths.
    """
    big_spec = "openapi: 3.0.0\ninfo:\n  title: x\n" + ("data:\n  - " + "y" * 200) * 60
    assert len(big_spec) > 10_000, "Test fixture must exceed 10K chars"
    session_id = "gen_combined_2026Q2"

    span_ctx = logfire.span("agent.run")
    with span_ctx as active_span:
        active_span.set_attribute("langfuse.session.id", session_id)
        active_span.set_attribute("spec_yaml", big_spec)

    spans = in_memory_exporter.get_finished_spans()
    matching = [s for s in spans if s.name == "agent.run"]
    assert matching
    attrs: dict[str, Any] = dict(matching[0].attributes or {})

    # 1. langfuse.session.id preserved verbatim.
    assert (
        attrs.get("langfuse.session.id") == session_id
    ), f"Expected session id preserved; got {attrs.get('langfuse.session.id')!r}"

    # 2. spec_yaml redacted with sha256 marker.
    captured_spec = attrs.get("spec_yaml")
    marker_re = re.compile(r"^<spec redacted, sha256:[a-f0-9]{16}>$")
    assert isinstance(captured_spec, str)
    assert marker_re.match(captured_spec), f"Expected sha256 marker for spec; got {captured_spec!r}"


def test_short_spec_yaml_passes_through_unchanged(
    in_memory_exporter: InMemorySpanExporter,
) -> None:
    """A small spec_yaml (under 10K chars) is NOT redacted — passes through."""
    small_spec = "openapi: 3.0.0\ninfo:\n  title: tiny\n"
    span_ctx = logfire.span("pipeline.stage_a")
    with span_ctx as active_span:
        active_span.set_attribute("spec_yaml", small_spec)

    spans = in_memory_exporter.get_finished_spans()
    matching = [s for s in spans if s.name == "pipeline.stage_a"]
    assert matching
    attrs: dict[str, Any] = dict(matching[0].attributes or {})

    # Small spec passes through scrubbing unchanged. (Note: the default
    # Logfire scrubber may still touch it for other patterns, but our
    # _scrub_long_spec_attributes callback returns None for sub-threshold
    # values, allowing the default chain to proceed normally.)
    assert (
        attrs.get("spec_yaml") == small_spec
    ), f"Expected small spec to pass through; got {attrs.get('spec_yaml')!r}"
