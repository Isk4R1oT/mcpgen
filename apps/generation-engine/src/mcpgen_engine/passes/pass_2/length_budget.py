"""Pass 2 — token-budget enforcement (tiktoken cl100k_base + char-count fallback).

Per D-07 length budgets and Pitfall A4 (tiktoken ~85-95% accurate vs Qwen
native; ±20% retry tolerance covers the gap). Char-count fallback
(``len(text) // 4``) activates if tiktoken import fails (rare — D-07 author
note for M-series Macs).

References:
- 03-CONTEXT.md D-07 (length budgets verbatim) + D-13 (retry policy)
- 03-RESEARCH.md §"Code Examples" Example 2 (verbatim source)
- docs/mcpgen-pass-2-design.md §11
"""

from __future__ import annotations

from typing import Final

# Best-effort import of tiktoken. The cl100k_base encoder is the GPT-4
# tokenizer; it is a stable proxy for Qwen3-Coder budget enforcement (within
# ~85-95% accuracy per D-07 + Pitfall A4). On platforms where the tiktoken
# wheel is unavailable (rare — D-07 calls out M-series Macs occasionally),
# we fall back to a `len(text) // 4` character-count approximation.
try:
    import tiktoken

    _ENCODER: object | None = tiktoken.get_encoding("cl100k_base")
    _USE_TIKTOKEN: bool = True
except (ImportError, OSError):  # pragma: no cover — depends on host env
    _ENCODER = None
    _USE_TIKTOKEN = False


# D-07 verbatim — (min_tokens, target_tokens, max_tokens) per tool type.
LENGTH_BUDGETS: Final[dict[str, tuple[int, int, int]]] = {
    "universal": (200, 300, 400),
    "action": (100, 150, 200),
    "workflow": (150, 200, 300),
    "specialized": (80, 120, 150),
}


def count_tokens(text: str) -> int:
    """Approximate token count for length-budget enforcement.

    Uses tiktoken cl100k_base when available (~85-95% accurate vs Qwen native);
    falls back to ``len(text) // 4`` char-count (~75% accurate). Both are
    within the ±20% retry-tolerance budget per D-07. The ``max(1, ...)`` guard
    keeps the return value strictly positive so callers may divide without a
    ZeroDivisionError on empty strings.
    """
    if _USE_TIKTOKEN and _ENCODER is not None:
        return max(1, len(_ENCODER.encode(text)))  # type: ignore[attr-defined]
    return max(1, len(text) // 4)


def is_within_budget(text: str, tool_type: str) -> tuple[bool, str | None]:
    """Validate token count against the D-07 budget for ``tool_type``.

    Returns ``(True, None)`` when the count lies in ``[min, max]`` (inclusive
    on both ends). Returns ``(False, retry_hint)`` otherwise — the hint is a
    one-sentence retry instruction the orchestrator can splice into the
    next-attempt prompt per D-13.

    Raises ``ValueError`` if ``tool_type`` is not one of the four D-07 keys
    (this is a programmer error — Pass 1 normalises tool types upstream).
    """
    if tool_type not in LENGTH_BUDGETS:
        raise ValueError(
            f"Unknown tool_type: {tool_type!r}; expected one of {sorted(LENGTH_BUDGETS)}"
        )
    min_t, _target_t, max_t = LENGTH_BUDGETS[tool_type]
    n = count_tokens(text)
    if n < min_t:
        return (
            False,
            f"shorter than {min_t}-token min ({n} tokens) — expand with concrete "
            f"spec details while preserving all 5 rubric components",
        )
    if n > max_t:
        return (
            False,
            f"longer than {max_t}-token max ({n} tokens) — shorten while preserving "
            f"all 5 rubric components",
        )
    return True, None
