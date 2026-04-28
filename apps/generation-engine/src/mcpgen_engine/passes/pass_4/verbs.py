"""Pass 4 — D-29 / Appendix B action verb pattern table + matcher (deterministic, no LLM).

High-confidence patterns return ``read_only / destructive / idempotent`` triples.
Medium-confidence patterns return ``confidence='medium'`` and route to LLM
judgment in Plan 03-11.

Conservative-default invariant (D-29): when no pattern matches OR confidence is
``'medium'`` and LLM judgment fails, caller falls back to ``(False, True, False)``
— i.e. not read_only, destructive, not idempotent. UX safety > optimization.

Threats addressed:
- T-03-VP (verb misclassification): high-confidence table is intentionally
  narrow + verbatim from D-29; ambiguous verbs (``_send``/``_lock``/``_publish``)
  are routed to LLM review rather than guessed deterministically.
- D-27: ``VerbMatchResult`` never carries ``openWorldHint`` (added at IR
  construction site in Plan 03-11).

References:
- 03-CONTEXT.md D-29 (verbatim)
- 03-RESEARCH.md §"Architecture Patterns" Pattern 6 (verbatim source)
- docs/mcpgen-pass-4-design.md Appendix B
"""

from __future__ import annotations

import re
from typing import Final, Literal

from pydantic import BaseModel, ConfigDict


class VerbMatchResult(BaseModel):
    """Internal Pass 4 verb-match result.

    - ``confidence='high'`` → caller uses returned booleans directly.
    - ``confidence='medium'`` → caller routes to LLM judgment (Plan 03-11);
      booleans are ``None``.
    - ``confidence='none'`` → no match; caller falls back to D-29 conservative
      defaults; booleans + ``matched_pattern`` are ``None``.

    ``openWorldHint`` is NEVER set here (D-27 invariant — added at IR
    construction site in Plan 03-11).
    """

    model_config = ConfigDict(extra="forbid")
    confidence: Literal["high", "medium", "none"]
    read_only: bool | None = None
    destructive: bool | None = None
    idempotent: bool | None = None
    matched_pattern: str | None = None


# D-29 / Appendix B — verbatim verb pattern table.
# - High-confidence: returns the 3 booleans directly.
# - Medium-confidence: returns only confidence='medium'; caller routes to LLM.
#
# Iteration order is the dict insertion order (Python 3.7+) — this is the
# deterministic-order invariant the matcher relies on. High-confidence groups
# come BEFORE medium-confidence groups so an unambiguous high match never gets
# pre-empted by a medium overlap (see test_match_returns_first_pattern_when_*).
ACTION_VERB_PATTERNS: Final[dict[str, dict[str, object]]] = {
    # HIGH CONFIDENCE — destructive verbs (not idempotent)
    r".*_(refund|reverse|undo)$": {
        "readOnly": False,
        "destructive": True,
        "idempotent": False,
        "confidence": "high",
    },
    # HIGH CONFIDENCE — destructive verbs (idempotent — re-application is no-op)
    r".*_(cancel|void|revoke)$": {
        "readOnly": False,
        "destructive": True,
        "idempotent": True,
        "confidence": "high",
    },
    r".*_(archive|soft_delete)$": {
        "readOnly": False,
        "destructive": True,
        "idempotent": True,
        "confidence": "high",
    },
    # HIGH CONFIDENCE — non-destructive state changes (not idempotent)
    r".*_(capture|charge|pay)$": {
        "readOnly": False,
        "destructive": False,
        "idempotent": False,
        "confidence": "high",
    },
    # HIGH CONFIDENCE — non-destructive state changes (idempotent)
    r".*_(unlock|enable|activate)$": {
        "readOnly": False,
        "destructive": False,
        "idempotent": True,
        "confidence": "high",
    },
    r".*_(approve|confirm)$": {
        "readOnly": False,
        "destructive": False,
        "idempotent": True,
        "confidence": "high",
    },
    # MEDIUM CONFIDENCE — needs LLM review (booleans intentionally omitted)
    r".*_(send|dispatch|notify)$": {"confidence": "medium"},
    r".*_(lock|freeze|disable)$": {"confidence": "medium"},
    r".*_(publish|finalize|submit)$": {"confidence": "medium"},
}

# Pre-compile patterns at module load (perf — these are matched per tool).
# Invariant: order matches ``ACTION_VERB_PATTERNS.items()`` (dict insertion order).
_COMPILED_PATTERNS: Final[list[tuple[re.Pattern[str], dict[str, object]]]] = [
    (re.compile(pattern), spec) for pattern, spec in ACTION_VERB_PATTERNS.items()
]


def match_verb_pattern(tool_name: str) -> VerbMatchResult:
    """Iterate compiled patterns; return the first match (high or medium).

    If no pattern matches, returns ``confidence='none'`` so the caller can fall
    back to D-29 conservative defaults (not read_only, destructive, not
    idempotent).
    """
    for pattern, spec in _COMPILED_PATTERNS:
        if not pattern.match(tool_name):
            continue
        confidence = spec.get("confidence")
        if confidence == "high":
            return VerbMatchResult(
                confidence="high",
                read_only=bool(spec["readOnly"]),
                destructive=bool(spec["destructive"]),
                idempotent=bool(spec["idempotent"]),
                matched_pattern=pattern.pattern,
            )
        if confidence == "medium":
            return VerbMatchResult(
                confidence="medium",
                matched_pattern=pattern.pattern,
            )
        # Unknown confidence value in a hand-edited table → fail loud rather
        # than silently emit a degraded annotation.
        msg = f"verb pattern {pattern.pattern!r} has unrecognized confidence {confidence!r}"
        raise ValueError(msg)
    return VerbMatchResult(confidence="none")
