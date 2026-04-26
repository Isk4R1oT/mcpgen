"""FND-11: Langfuse v4 OTel exporter wiring via Logfire's OTel forwarder.

Empty-key safe (Phase 1 default); Phase 9 fills LANGFUSE_PUBLIC_KEY and
LANGFUSE_SECRET_KEY per env.

Architecture: per docs/mcpgen-model-and-provider-override.md §2.5 + RESEARCH
Pattern 9, we use `logfire.configure(send_to_logfire=False)` so PydanticAI agent
traces flow through Logfire's OTel SDK while we attach our own OTLP HTTP
exporter pointing at Langfuse Cloud (or local Langfuse).

Idempotent: safe to call multiple times — logfire.configure is itself idempotent
and we only register a TracerProvider when both Langfuse keys are set, so a
second call without keys is a no-op.
"""

from __future__ import annotations

import base64
import os

import logfire
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def configure_langfuse_otel() -> None:
    """Wire Logfire → OTel → Langfuse. No-op if LANGFUSE_PUBLIC_KEY/SECRET_KEY are unset."""
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "")
    endpoint = os.environ.get(
        "LANGFUSE_OTEL_ENDPOINT",
        "https://cloud.langfuse.com/api/public/otel/v1/traces",
    )

    # Logfire: do not forward to Logfire SaaS; we use it only for OTel SDK init.
    logfire.configure(send_to_logfire=False, service_name="mcpgen-generation-engine")

    if not (public_key and secret_key):
        # Phase 1 default — no Langfuse credentials → no exporter wired; spans drop locally.
        return

    token = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
    headers = {"Authorization": f"Basic {token}"}
    provider = TracerProvider()
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, headers=headers))
    )
    trace.set_tracer_provider(provider)
