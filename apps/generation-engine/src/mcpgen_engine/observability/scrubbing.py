"""Plan 09-05 Task 2 / D-07: Logfire scrubbing-callback overrides.

Two callbacks chained into a single ``combined_scrub_callback`` registered
via ``logfire.configure(scrubbing=ScrubbingOptions(callback=...))``:

1. :func:`_preserve_langfuse_session_id` — overrides Logfire's default scrub
   of any string matching ``/session/``, which would otherwise replace
   ``langfuse.session.id`` (the attribute Langfuse Cloud needs to correlate
   traces) with the literal ``[Scrubbed due to 'session']``. Pitfall #1 of
   Phase 9 RESEARCH; the Wave 0 spike empirically demonstrated the silent
   failure mode (see ``tests/observability/test_run_tracing_spike.py``).

2. :func:`_scrub_long_spec_attributes` — applies a 10K-character threshold
   redaction to span attributes named after spec content
   (``spec_yaml``, ``spec_url_response_body``, ``raw_ir.openapi``,
   ``prompt.system``). Replaces the value with
   ``<spec redacted, sha256:{16-char prefix}>`` so traces remain debuggable
   (the hash lets engineers correlate redacted traces to a specific spec
   without exposing the spec content). D-07.

Logfire invokes the callback once per match; returning ``match.value``
short-circuits the default scrub for that path. Returning ``None`` lets
the default scrubber proceed with whatever it would have done (typically
replacing the value with ``[Scrubbed due to '<pattern>']``).
"""

from __future__ import annotations

import hashlib
from typing import Any

import logfire

# Span-attribute keys whose values may legitimately contain >10K chars of spec
# content. Match on the LAST path segment because OTel paths are tuples like
# ``("attributes", "spec_yaml")`` or, for nested data,
# ``("attributes", "raw_ir", "openapi")``.
_SPEC_CONTENT_KEYS: frozenset[str] = frozenset(
    {
        "spec_yaml",
        "spec_url_response_body",
        "raw_ir.openapi",
        "openapi",  # nested raw_ir.openapi case
        "prompt.system",
        "system_prompt",  # alias used by some pass orchestrators
    }
)

_SPEC_REDACTION_THRESHOLD = 10_000


def _preserve_langfuse_session_id(match: logfire.ScrubMatch) -> Any:
    """Whitelist ``langfuse.session.id`` and ``langfuse.user.id`` attributes.

    Returns the original ``match.value`` for these two paths — telling
    Logfire's default scrubber to leave them alone. Returns ``None`` for any
    other path (let the default scrubber proceed normally).
    """
    if match.path == ("attributes", "langfuse.session.id"):
        return match.value
    if match.path == ("attributes", "langfuse.user.id"):
        return match.value
    return None


def _scrub_long_spec_attributes(match: logfire.ScrubMatch) -> Any:
    """Replace >10K-char spec content in span attributes with a sha256 marker.

    Triggers when:

    - ``match.path`` ends in one of :data:`_SPEC_CONTENT_KEYS`.
    - ``match.value`` is a ``str`` longer than 10,000 characters.

    Replacement format: ``<spec redacted, sha256:{16-char hex prefix}>``.
    The 16-char prefix is enough entropy to distinguish specs in a single
    trace stream while keeping the marker readable in the Langfuse UI.

    Returns ``None`` for non-matching paths/values so other callbacks (or
    the default scrubber) can take over.
    """
    if not match.path:
        return None
    last_segment = match.path[-1]
    if last_segment not in _SPEC_CONTENT_KEYS:
        return None
    value = match.value
    if not isinstance(value, str):
        return None
    if len(value) <= _SPEC_REDACTION_THRESHOLD:
        return None
    sha = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
    return f"<spec redacted, sha256:{sha}>"


def combined_scrub_callback(match: logfire.ScrubMatch) -> Any:
    """Chain :func:`_scrub_long_spec_attributes` then :func:`_preserve_langfuse_session_id`.

    Order matters: spec scrubbing is checked first so a (theoretical) spec
    attribute named ``langfuse.session.id`` would still be redacted via the
    spec rules. In practice the two address spaces are disjoint (no
    ``langfuse.session.id`` carries 10K+ chars), but the chain is explicit
    so the precedence is auditable.

    Each callback returns ``None`` to fall through to the next. If both
    return ``None`` the default Logfire scrubber proceeds.
    """
    spec_result = _scrub_long_spec_attributes(match)
    if spec_result is not None:
        return spec_result
    return _preserve_langfuse_session_id(match)
