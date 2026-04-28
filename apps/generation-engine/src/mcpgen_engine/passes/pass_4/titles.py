"""Pass 4 — deterministic title generation per D-31 (no LLM in v0).

Per-type title shape:

- Universal: title-cased name (``search`` → ``"Search"``, ``list_objects`` →
  ``"List Objects"``).
- Action: verb reordering — last token is the verb, leading tokens are the
  object; output is ``"Verb Object"`` with the object's last word lightly
  de-pluralized (``charges_capture`` → ``"Capture Charge"``).
- Workflow: title-cased name; verb is naturally at the start in workflow names
  per D-31 (``schedule_event`` → ``"Schedule Event"``).
- Specialized: title-cased name (``account_balance_summary`` → ``"Account
  Balance Summary"``).

Hard cap: 60 characters; longer titles are truncated to 59 chars + a single
Unicode ellipsis (``…``) for terminal compatibility.

LLM-polish for titles is deferred to Pro post-MVP per D-31.

References:
- 03-CONTEXT.md D-31
- 03-PATTERNS.md `passes/pass_4/titles.py` row
- docs/mcpgen-pass-4-design.md §4
"""

from __future__ import annotations

from typing import Final

from mcpgen_ir.types import Tool1, Type

_MAX_TITLE_LENGTH: Final[int] = 60  # D-31

# Minimum length for safe trailing-`s` de-pluralization on the action object.
# Below this, stripping the `s` produces nonsensical 1-2-char tokens (e.g.
# ``ws`` -> ``w``); we leave such short tokens untouched. ``> 3`` matches the
# original plan note ("avoid stripping `ws` -> `w`").
_MIN_DEPLURALIZE_LEN: Final[int] = 3

_ELLIPSIS: Final[str] = "…"


def generate_title(tool: Tool1) -> str:
    """Generate a human-readable title for ``tool`` per D-31."""
    parts = tool.name.split("_")

    if tool.type == Type.action and len(parts) >= 2:
        title = _action_title(parts)
    else:
        # Universal / workflow / specialized OR action with single token →
        # straight title-case ("schedule_event" → "Schedule Event").
        title = " ".join(p.capitalize() for p in parts)

    if len(title) > _MAX_TITLE_LENGTH:
        # Truncate with a single Unicode ellipsis (one char) for terminal compat
        title = title[: _MAX_TITLE_LENGTH - 1].rstrip() + _ELLIPSIS
    return title


def _action_title(parts: list[str]) -> str:
    """Apply D-31 verb reordering for action tools.

    ``["charges", "capture"]`` → ``"Capture Charge"`` (object de-pluralized
    when its last segment ends in ``s`` AND has more than ``_MIN_DEPLURALIZE_LEN``
    characters).
    """
    verb = parts[-1]
    obj_parts = parts[:-1]
    obj = " ".join(p.capitalize() for p in obj_parts)

    last_obj_segment = obj_parts[-1] if obj_parts else ""
    should_depluralize = (
        bool(last_obj_segment)
        and last_obj_segment.endswith("s")
        and len(last_obj_segment) > _MIN_DEPLURALIZE_LEN
    )
    if should_depluralize:
        last_word_capitalized = last_obj_segment.capitalize()
        # Only strip the trailing `s` from the LAST capitalized word in `obj`
        if obj.endswith(last_word_capitalized):
            obj = obj[: -len(last_word_capitalized)] + last_word_capitalized[:-1]

    return f"{verb.capitalize()} {obj}".strip()
