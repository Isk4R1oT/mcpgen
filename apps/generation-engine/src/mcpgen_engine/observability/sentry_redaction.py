"""CTRL-08 / D-04: Python equivalent of `redactBeforeSend` from
`packages/contracts/src/sentry-redaction.ts`.

Cross-language equivalence enforced by `tests/fixtures/leak-vectors.json`,
consumed by both vitest (TS) and pytest (here). Any change to the redaction
contract requires updating BOTH languages in lockstep.

5 steps in order (mirroring TS verbatim):
  1. Header denylist + variable auth header regex
  2. Body redaction when `request['url']` contains `/v1/generate` AND
     `request['data']` is dict/str (spec content)
  3. `event['extra'].{spec, openapi_yaml, raw_ir}`
  4. Free-form `event['message']` string-pattern scrub
     (Bearer / sk_live / sk_test / ghp_ / JWT)

Safe with empty events: `redact_before_send({}, {})` returns `{}` without raising.
"""

from __future__ import annotations

import re
from typing import Any

REDACTED_HEADERS: frozenset[str] = frozenset(
    {
        "authorization",
        "x-upstream-auth",
        "cookie",
        "set-cookie",
        "stripe-account",
        "stripe-signature",
        "x-webhook-signature",
    }
)

VARIABLE_AUTH_HEADER_RE: re.Pattern[str] = re.compile(
    r"^x-.*-(auth|token|key|secret)$", re.IGNORECASE
)

SENSITIVE_STRING_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"Bearer\s+\S+"),
    re.compile(r"sk_live_[A-Za-z0-9]{16,}"),
    re.compile(r"sk_test_[A-Za-z0-9]{16,}"),
    re.compile(r"ghp_[A-Za-z0-9]{16,}"),
    re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),
)

REDACTED: str = "[REDACTED]"

_EXTRA_REDACT_KEYS: tuple[str, ...] = ("spec", "openapi_yaml", "raw_ir")


def redact_before_send(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any] | None:
    """Sentry `before_send` hook. Mutates `event` in place and returns it.

    Returns the (possibly mutated) event. Returning None would drop the event;
    we never drop in Phase 1+.

    Args:
        event: Sentry SDK event dict (free-form structure per sentry-sdk).
        _hint: Sentry SDK hint dict (unused, accepted for API compat).

    Returns:
        The mutated event dict.
    """
    request = event.get("request")
    if isinstance(request, dict):
        # Step 1 — headers (lowercase compare + variable regex).
        headers = request.get("headers")
        if isinstance(headers, dict):
            for key in list(headers.keys()):
                lk = str(key).lower()
                if lk in REDACTED_HEADERS or VARIABLE_AUTH_HEADER_RE.match(lk):
                    headers[key] = REDACTED

        # Step 2 — body redaction when path is /v1/generate (spec content).
        url = request.get("url")
        data = request.get("data")
        if isinstance(url, str) and "/v1/generate" in url and isinstance(data, dict | str):
            request["data"] = "[REDACTED:spec]"

    # Step 3 — extra spec / openapi_yaml / raw_ir.
    extra = event.get("extra")
    if isinstance(extra, dict):
        for k in _EXTRA_REDACT_KEYS:
            if k in extra:
                extra[k] = "[REDACTED:spec]"

    # Step 4 — free-form message string-pattern scrub.
    msg = event.get("message")
    if isinstance(msg, str):
        for pattern in SENSITIVE_STRING_PATTERNS:
            msg = pattern.sub(REDACTED, msg)
        event["message"] = msg

    return event
