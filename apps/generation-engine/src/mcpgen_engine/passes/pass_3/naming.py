"""Pass 3 — Phase: deterministic parameter naming normalization (D-19, no LLM).

Applies AFTER LLM enrichment so the LLM sees the original spec names.
Collisions resolved by reverting the second occurrence to its original
raw name (D-19 verbatim); if the raw name itself collides, an increasing
digit suffix is appended.

Pure / immutable — never mutates the input list; returns new
``ParameterSpec`` objects with the rewritten ``name`` field.

References:
- 03-CONTEXT.md D-19 (rules table verbatim)
- 03-PATTERNS.md ``passes/pass_3/naming.py`` row
- docs/mcpgen-pass-3-design.md §1
"""

from __future__ import annotations

import re
from typing import Final

from mcpgen_engine.passes.pass_3.extract import ParameterSpec

# Insert ``_`` between ``[a-z0-9]`` followed by ``[A-Z]`` so ``userId`` becomes
# ``user_Id`` before the ``.lower()`` step yields ``user_id``.
_CAMEL_CASE_REGEX: Final[re.Pattern[str]] = re.compile(r"([a-z0-9])([A-Z])")

# Trailing ``_param`` / ``_arg`` suffix (D-19) — applied after the camel→snake
# normalization so a name like ``queryStringParam_param`` collapses cleanly.
_PARAM_SUFFIX_REGEX: Final[re.Pattern[str]] = re.compile(r"_(?:param|arg)$")

# Bare ambiguous names (D-19) qualified with the entity hint when present.
_AMBIGUOUS_BARE_NAMES: Final[frozenset[str]] = frozenset({"id", "status"})

# D-19 fixed renames.
_DATA_RENAME: Final[str] = "payload"
_TIME_RENAME: Final[str] = "created_at"


# ─────────────────────────── Public API ─────────────────────────────────────


def normalize_param_name(
    raw: str,
    entity_hint: str | None,
    is_list_filter_context: bool = False,
) -> str:
    """Apply D-19 rules in order to produce a normalized snake_case name.

    Args:
        raw: original param name as it appears in the spec.
        entity_hint: entity name from endpoint ``tags[0]`` or path segment;
            used to qualify ambiguous bare names (``id`` / ``status``).
        is_list_filter_context: when True, bare ``time`` is renamed to
            ``created_at`` per D-19; otherwise ``time`` is preserved.

    Returns:
        normalized snake_case name (lowercase ASCII).
    """
    # Step 1: camelCase / PascalCase → snake_case.
    name = _CAMEL_CASE_REGEX.sub(r"\1_\2", raw).lower()
    # Step 2: strip ``_param`` / ``_arg`` suffix.
    name = _PARAM_SUFFIX_REGEX.sub("", name)
    # Step 3: bare ``data`` → ``payload``.
    if name == "data":
        return _DATA_RENAME
    # Step 4: bare ``time`` → ``created_at`` only in list-filter context.
    if name == "time" and is_list_filter_context:
        return _TIME_RENAME
    # Step 5: bare ``id`` / ``status`` qualified with entity hint when present.
    if name in _AMBIGUOUS_BARE_NAMES and entity_hint:
        return f"{_to_snake(entity_hint)}_{name}"
    return name


def normalize_all_param_names(
    params: list[ParameterSpec],
    is_list_filter_context: bool = False,
) -> list[ParameterSpec]:
    """Apply ``normalize_param_name`` to every param; resolve collisions.

    Returns a NEW list of NEW ``ParameterSpec`` objects (immutable transform —
    does NOT mutate input list nor input items).

    Collision rule (D-19): if two params normalize to the same name, the
    SECOND occurrence reverts to its original raw name. If the raw name
    itself already collides with a previously-seen name, append a digit
    suffix ``_2``, ``_3``, ... until uniqueness is reached.

    Iteration order preserved so downstream consumers can rely on stable
    parameter ordering.
    """
    seen: set[str] = set()
    out: list[ParameterSpec] = []
    for param in params:
        candidate = normalize_param_name(
            param.name,
            param.entity_hint,
            is_list_filter_context=is_list_filter_context,
        )
        if candidate in seen:
            # Collision: try the raw name first.
            candidate = param.name
            if candidate in seen:
                # Raw also collides — append an increasing digit suffix.
                idx = 2
                while f"{candidate}_{idx}" in seen:
                    idx += 1
                candidate = f"{candidate}_{idx}"
        seen.add(candidate)
        out.append(param.model_copy(update={"name": candidate}))
    return out


# ─────────────────────────── Helpers ────────────────────────────────────────


def _to_snake(text: str) -> str:
    """Lower-case + collapse whitespace runs to ``_`` (entity-hint normalizer)."""
    return re.sub(r"\s+", "_", text.strip()).lower()
