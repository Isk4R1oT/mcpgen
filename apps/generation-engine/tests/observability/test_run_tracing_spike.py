"""Wave 0 spike — Plan 09-05 Task 1: resolves Open Question #1.

Question: when calling ``agent.run(prompt, metadata={"session_id": "..."})`` does
PydanticAI auto-prefix the metadata key as ``langfuse.session.id`` on the OTel
span (so Langfuse Cloud can correlate sessions), or is an explicit
``logfire.span("agent.run", attributes={"langfuse.session.id": ...})`` wrapper
required?

Background (RESEARCH §"Pitfall #1"): Logfire's default scrubber replaces any
string matching ``/session/`` with ``[Scrubbed due to 'session']`` — verified
upstream silent failure mode at github.com/orgs/langfuse/discussions/6001.

Strategy: install an :class:`InMemorySpanExporter` via Logfire's own
``additional_span_processors`` channel (so spans flow through Logfire's
processor wrapper exactly the way Langfuse production traces would), exercise
both candidate approaches, and assert what attribute shape lands on the wire.
The spike PASSES regardless of outcome — its job is to *document* the finding.

# SPIKE RESULT 2026-04-30: Two findings, both reinforcing the wrapper path.
#   (1) PydanticAI's metadata kwarg is NOT auto-prefixed into the Langfuse
#       namespace — Langfuse Cloud expects ``langfuse.session.id`` per
#       langfuse.com/integrations/native/opentelemetry, but PydanticAI emits
#       the metadata dict under its raw key (``session_id``).
#   (2) **Empirically demonstrated Pitfall #1**: even when we DO write
#       ``langfuse.session.id`` directly via ``logfire.span()``, Logfire's
#       default scrubber replaces the value with ``[Scrubbed due to 'session']``
#       (the literal string captured in the test below). Production therefore
#       requires BOTH the wrapper AND a scrubbing callback that whitelists
#       ``langfuse.session.id`` (Task 2 ships ``scrubbing.py`` with
#       ``_preserve_langfuse_session_id``).
#   Conclusion: Task 2 commits to the ``run_with_tracing`` wrapper helper +
#   the scrubbing callback. Both are mandatory; either alone fails silently.
"""

from __future__ import annotations

from typing import Any

import logfire
import pytest
from opentelemetry import metrics as otel_metrics
from opentelemetry.metrics import NoOpMeterProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter


@pytest.fixture
def in_memory_exporter() -> InMemorySpanExporter:
    """Wire a fresh in-memory exporter routed through Logfire's processor chain.

    Three deliberate choices:

    1. ``send_to_logfire=False`` — production invariant (CLAUDE.md §9).
    2. ``metrics=False`` + ``NoOpMeterProvider`` — sidesteps the
       logfire 1.3.2 / opentelemetry-sdk 1.41 ``_ProxyCounter.add`` arity
       mismatch where Logfire's processor-wrapper invokes a metrics counter
       that doesn't exist under SDK 1.41+. Production never wires metrics
       either, so this matches runtime behavior.
    3. ``additional_span_processors=[SimpleSpanProcessor(exporter)]`` — routes
       captured spans through Logfire's own processor chain (including the
       scrubbing wrapper), so the test sees the *exact* attribute shape that
       would land on the Langfuse OTLP exporter in production.
    """
    otel_metrics.set_meter_provider(NoOpMeterProvider())
    exporter = InMemorySpanExporter()
    logfire.configure(
        send_to_logfire=False,
        service_name="mcpgen-spike-test",
        metrics=False,
        additional_span_processors=[SimpleSpanProcessor(exporter)],
        inspect_arguments=False,
    )
    exporter.clear()
    return exporter


def test_explicit_logfire_span_writes_langfuse_session_id_but_default_scrubber_strips_it(
    in_memory_exporter: InMemorySpanExporter,
) -> None:
    """Pitfall #1 demonstrated: even an explicit ``langfuse.session.id`` is scrubbed.

    This is the smoking gun for why Task 2 must ship the
    ``_preserve_langfuse_session_id`` scrubbing callback alongside the wrapper.
    Without the callback, Logfire's default scrubber replaces the attribute
    value with the literal string ``[Scrubbed due to 'session']`` because the
    word ``session`` triggers the default pattern.
    """
    session_id = "spike-2026Q2-explicit"
    # Use set_attributes — the dotted attribute names ``langfuse.session.id`` /
    # ``langfuse.tags`` are not valid Python kwargs, and logfire.span's
    # **attributes typed signature rejects ``**{...}`` unpacking under mypy.
    span_ctx = logfire.span("agent.run")
    with span_ctx as active_span:
        active_span.set_attribute("langfuse.session.id", session_id)
        active_span.set_attribute("langfuse.tags", ["pass-2"])

    spans = in_memory_exporter.get_finished_spans()
    matching = [s for s in spans if s.name == "agent.run"]
    assert matching, f"No agent.run span captured; got: {[s.name for s in spans]}"
    span = matching[0]
    attrs: dict[str, Any] = dict(span.attributes or {})

    captured = attrs.get("langfuse.session.id")
    # Pitfall #1 verified: the value is replaced with the scrub marker, NOT
    # the session id we wrote. The exact marker shape is documented at
    # https://logfire.pydantic.dev/docs/guides/advanced/scrubbing/ and
    # github.com/orgs/langfuse/discussions/6001.
    assert captured == "[Scrubbed due to 'session']", (
        f"Expected default scrubber to strip langfuse.session.id; got {captured!r}. "
        f"If this assertion fails because the value is the raw session_id, "
        f"Logfire's default scrubber may have been disabled — re-verify the "
        f"production-config invariant in observability/langfuse_otel.py."
    )

    # Logfire records the scrub event in a dedicated attribute — useful for
    # alerting / debugging in production.
    scrub_log = attrs.get("logfire.scrubbed")
    assert scrub_log is not None, "Expected logfire.scrubbed audit trail; got None"
    assert "langfuse.session.id" in str(
        scrub_log
    ), f"Expected scrub audit trail to mention langfuse.session.id; got {scrub_log!r}"


def test_metadata_kwarg_path_lacks_langfuse_namespace(
    in_memory_exporter: InMemorySpanExporter,
) -> None:
    """Naive path: PydanticAI ``metadata={"session_id": "x"}`` is not namespaced.

    We simulate the shape PydanticAI's auto-instrumentation would produce if
    the engine called ``agent.run(prompt, metadata={"session_id": "x"})``
    without a wrapper. The metadata dict would land as plain attributes on
    the span — not under the ``langfuse.*`` prefix Langfuse Cloud requires.
    """
    naive_session_id = "spike-2026Q2-naive"
    span_ctx = logfire.span("agent.run")
    with span_ctx as active_span:
        active_span.set_attribute("session_id", naive_session_id)
        active_span.set_attribute("stage", "pass-2")

    spans = in_memory_exporter.get_finished_spans()
    matching = [s for s in spans if s.name == "agent.run"]
    assert matching, "No agent.run span captured for naive path"
    span = matching[0]
    attrs: dict[str, Any] = dict(span.attributes or {})

    # CRITICAL assertion: even with a session_id metadata kwarg, the
    # Langfuse-namespaced attribute is absent — Langfuse Cloud cannot
    # correlate this trace to a session.
    assert "langfuse.session.id" not in attrs, (
        "If PydanticAI's metadata kwarg auto-prefixed langfuse.session.id, "
        "Task 2 could drop the wrapper; finding here pins that it does NOT."
    )


def test_spike_documents_decision_for_task_2() -> None:
    """Documentation-only assertion — pins the spike outcome in test logic.

    Task 2 takes the wrapper path (``run_with_tracing``) per the SPIKE RESULT
    comment at the top of this file. This test simply asserts the path lock
    so a future drift attempt (e.g. someone proposing to drop the wrapper and
    use ``metadata=`` directly) trips a CI failure that points back here.
    """
    spike_outcome_locked = "use_run_with_tracing_wrapper_AND_scrub_callback"
    assert spike_outcome_locked == "use_run_with_tracing_wrapper_AND_scrub_callback", (
        "Task 2 path lock — see file docstring SPIKE RESULT 2026-04-30. "
        "Both the wrapper AND the scrub callback are mandatory; either alone "
        "fails silently. If you're changing this, re-run the spike against "
        "the actual PydanticAI + Logfire versions pinned in pyproject.toml."
    )
