"""Observability package — Langfuse OTel + Sentry redaction.

Phase 9 (D-04): converted from single-file `observability.py` module to a
package so `sentry_redaction.py` can land alongside `langfuse_otel.py`.

Backward compat: `from mcpgen_engine.observability import configure_langfuse_otel`
keeps working because we re-export from the package init. New consumers can
also do `from mcpgen_engine.observability import redact_before_send`.
"""

from __future__ import annotations

from .langfuse_otel import configure_langfuse_otel
from .run_tracing import run_with_tracing
from .scrubbing import combined_scrub_callback
from .sentry_redaction import (
    REDACTED,
    REDACTED_HEADERS,
    SENSITIVE_STRING_PATTERNS,
    VARIABLE_AUTH_HEADER_RE,
    redact_before_send,
)

__all__ = [
    "REDACTED",
    "REDACTED_HEADERS",
    "SENSITIVE_STRING_PATTERNS",
    "VARIABLE_AUTH_HEADER_RE",
    "combined_scrub_callback",
    "configure_langfuse_otel",
    "redact_before_send",
    "run_with_tracing",
]
