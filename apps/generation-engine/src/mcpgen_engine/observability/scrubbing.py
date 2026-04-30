"""Plan 09-05 Task 2 / D-07: Logfire scrubbing-callback overrides.

Two callbacks chained into a single ``combined_scrub_callback`` registered
via ``logfire.configure(scrubbing=ScrubbingOptions(callback=..., extra_patterns=...))``:

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

Critical implementation detail: Logfire only invokes the callback when its
internal scrubber detects a *pattern* in the attribute path or value. The
default patterns cover ``password``, ``secret``, ``api_key``, ``session``,
etc. — which is enough for ``langfuse.session.id`` (caught via the
``session`` pattern) but NOT for ``spec_yaml`` / ``raw_ir.openapi`` /
``prompt.system`` etc. To make the callback see those keys we add them to
``ScrubbingOptions.extra_patterns`` (see :data:`SPEC_CONTENT_PATTERNS`)
which extends the regex set Logfire applies to attribute path segments.
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

# Regex patterns appended to Logfire's default scrub patterns so the
# scrubber visits the keys above (without these, Logfire's pattern-driven
# scrubber never invokes our callback for ``spec_yaml`` / ``openapi`` /
# ``prompt`` / ``system_prompt`` because none match its built-in patterns
# like ``password`` / ``secret`` / ``api_key`` / ``session``).
SPEC_CONTENT_PATTERNS: tuple[str, ...] = (
    r"spec_yaml",
    r"spec_url_response_body",
    r"raw_ir\.openapi",
    r"openapi",
    r"prompt\.system",
    r"system_prompt",
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
    """Handle spec-content attributes: sha256-marker for >10K chars, passthrough else.

    Triggers when ``match.path`` ends in one of :data:`_SPEC_CONTENT_KEYS`.

    - >10K chars → return ``<spec redacted, sha256:{16-char hex prefix}>``.
    - ≤10K chars → return ``match.value`` unchanged (passthrough — small specs
      contain no sensitive data and the literal scrub marker
      ``[Scrubbed due to 'spec_yaml']`` is strictly less useful than the spec
      itself).
    - non-string → return ``match.value`` unchanged (defensive — non-str under
      a spec key indicates a bug elsewhere; redacting a non-str silently
      destroys diagnostic value).

    Returns ``None`` ONLY when the path is NOT a spec key, so the chain can
    fall through to :func:`_preserve_langfuse_session_id` or the default
    scrubber for non-spec attributes.
    """
    if not match.path:
        return None
    last_segment = match.path[-1]
    if last_segment not in _SPEC_CONTENT_KEYS:
        return None
    value = match.value
    if not isinstance(value, str):
        return value  # passthrough non-str defensively
    if len(value) <= _SPEC_REDACTION_THRESHOLD:
        return value  # passthrough small specs (Logfire's literal marker is worse than the value)
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
