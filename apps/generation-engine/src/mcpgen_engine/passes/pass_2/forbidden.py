"""Pass 2 — forbidden-phrase regex catalogue (4 categories per D-10).

Match in a rendered description -> retry hint "remove forbidden phrases X, Y, Z"
per D-10 + D-13. Single global catalogue in v0 per Open Question #4
(per-tool-type variation deferred to v1 if real generations show high
false-positive rate).

References:
- 03-CONTEXT.md D-10 (4 patterns verbatim) + D-13 (retry policy)
- docs/mcpgen-pass-2-design.md §13
"""

from __future__ import annotations

import re
from typing import Final

# ─────────────────────── 4-category catalogue (D-10 verbatim) ──────────────

_MARKETING_REGEX: Final[re.Pattern[str]] = re.compile(
    r"\b(powerful|elegant|robust|seamless|cutting-edge|state-of-the-art|"
    r"comprehensive|enterprise-grade)\b",
    re.IGNORECASE,
)

_FILLER_REGEX: Final[re.Pattern[str]] = re.compile(
    r"\b(you can use this to|this tool allows you to|this tool enables|" r"simply|just|easily)\b",
    re.IGNORECASE,
)

_TAUTOLOGICAL_REGEX: Final[re.Pattern[str]] = re.compile(
    r"\bthis (search|list|fetch|create|update|delete|upsert) (tool )?"
    r"(searches|lists|fetches|creates|updates|deletes|upserts)\b",
    re.IGNORECASE,
)

_VAGUE_REGEX: Final[re.Pattern[str]] = re.compile(
    r"\b(various|different|appropriate|relevant|several|multiple) "
    r"(kinds|options|things|items|values)\b",
    re.IGNORECASE,
)


# Public dispatch dict — used by tests + the retry-hint builder in
# `validation.py` to format human-readable retry instructions.
FORBIDDEN_REGEXES: Final[dict[str, re.Pattern[str]]] = {
    "marketing": _MARKETING_REGEX,
    "filler": _FILLER_REGEX,
    "tautological": _TAUTOLOGICAL_REGEX,
    "vague": _VAGUE_REGEX,
}


def find_forbidden_phrases(text: str) -> list[str]:
    """Return sorted list of unique lowercased forbidden substrings in ``text``.

    Empty list = no violations. Used by ``validation.py`` to compose retry
    hints and to set ``Pass2Output.flags.forbidden_pattern_violation`` per
    D-13. The lowercase-and-sort contract makes the helper deterministic so
    downstream comparisons (cache keys, retry-prompt diffs) are stable.
    """
    matches: set[str] = set()
    for pattern in FORBIDDEN_REGEXES.values():
        for m in pattern.finditer(text):
            matches.add(m.group(0).lower())
    return sorted(matches)
