"""Pass 4 — Phase 3: consistency validation with auto-fix + IR assembly (D-26 + D-27).

Consistency rules (D-26 Phase 3):
- Rule 1: ``readOnlyHint=True → idempotentHint=True`` (auto-fix: set
  ``idempotentHint=True``; emits a warning via structlog).
- Rule 2: ``destructiveHint=True → readOnlyHint=False`` (auto-fix: set
  ``readOnlyHint=False``; emits a warning).
- Rule 3: all 3 mutable booleans must be present (raise ``Pass4Error``
  with stable code ``MISSING_HINTS`` if any are absent).

IR assembly (D-27 invariant): every ``Annotations`` is constructed with
``openWorldHint=True`` HARDCODED Python-side. The IR Pydantic model
declares ``openWorldHint: Literal[True]`` so any other value (or omission)
raises ``ValidationError`` at construction site.

Threats addressed:
- T-03-OW (D-27): ``assemble_annotations_with_open_world_hint`` is the
  single legal construction site for ``Annotations`` in Pass 4 — every
  emitted ``Annotations`` has ``openWorldHint=True``.
- Pitfall #31 (D-32): the auto-fix rules ensure paired
  ``readOnlyHint``/``idempotentHint`` semantics so Cursor's read-only
  short-circuit treats every read tool consistently.

References:
- 03-CONTEXT.md D-26 (Phase 3) + D-27 (openWorldHint invariant) + D-32
  (Pitfall #31)
- 03-PATTERNS.md ``passes/pass_4/consistency.py`` row + Shared Patterns
  "Error handling"
- docs/mcpgen-pass-4-design.md §5
"""

from __future__ import annotations

import structlog
from mcpgen_ir.types import Annotations

_log = structlog.get_logger(__name__)


# ──────────────────────────────── Errors ───────────────────────────────────


class Pass4Error(ValueError):
    """Stable user-facing error class for Pass 4 validation failures.

    Mirrors ``Pass2Error`` / ``Pass3Error`` shape: the first token of
    ``args[0]`` is treated as the stable error code by downstream layers.
    Additional context is preserved on the ``violations`` instance attribute.
    """

    violations: list[str]

    def __init__(
        self: Pass4Error,
        message: str,
        *,
        violations: list[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.violations = violations or []


# ──────────────────────────── Consistency rules ────────────────────────────


def enforce_consistency_with_autofix(
    annotations: dict[str, dict[str, bool]],
) -> dict[str, dict[str, bool]]:
    """Apply D-26 Phase 3 auto-fix rules; raise on missing required hints.

    Rule order matters:
    1. Rule 3 (presence check): raise if any of the 3 booleans is missing.
    2. Rule 2 (``destructive=True → readOnly=False``): runs FIRST so that a
       conflicting ``readOnly=True`` is cleared before Rule 1 fires.
    3. Rule 1 (``readOnly=True → idempotent=True``): only fires when Rule 2
       did not zero out ``readOnly``.

    Returns a NEW dict (does not mutate input). Logs a structured warning
    on every auto-fix application.
    """
    out: dict[str, dict[str, bool]] = {}
    required = {"readOnlyHint", "destructiveHint", "idempotentHint"}
    for tool_name, triple in annotations.items():
        # Rule 3: presence check.
        missing = required - set(triple)
        if missing:
            sorted_missing = sorted(missing)
            raise Pass4Error(
                f"MISSING_HINTS: tool '{tool_name}' missing {sorted_missing}",
                violations=[f"missing: {sorted_missing}"],
            )

        ro = bool(triple["readOnlyHint"])
        dest = bool(triple["destructiveHint"])
        idem = bool(triple["idempotentHint"])

        # Rule 2: destructive overrides readOnly (apply BEFORE Rule 1).
        if dest and ro:
            _log.warning(
                "pass_4.consistency.autofix_destructive_overrides_read_only",
                tool_name=tool_name,
            )
            ro = False

        # Rule 1: readOnly implies idempotent.
        if ro and not idem:
            _log.warning(
                "pass_4.consistency.autofix_read_only_implies_idempotent",
                tool_name=tool_name,
            )
            idem = True

        out[tool_name] = {
            "readOnlyHint": ro,
            "destructiveHint": dest,
            "idempotentHint": idem,
        }
    return out


# ──────────────────────────── IR assembly ──────────────────────────────────


def assemble_annotations_with_open_world_hint(
    triples: dict[str, dict[str, bool]],
) -> dict[str, Annotations]:
    """Construct final ``Annotations`` with ``openWorldHint=True`` hardcoded.

    D-27 invariant: ``Annotations.openWorldHint`` is declared as
    ``Literal[True]`` in the IR. Any value other than ``True`` raises
    ``ValidationError`` at construction site. This function is the SOLE
    legal construction site for ``Annotations`` in Pass 4 — single point of
    enforcement for the openWorldHint invariant.
    """
    out: dict[str, Annotations] = {}
    for tool_name, triple in triples.items():
        out[tool_name] = Annotations(
            readOnlyHint=triple["readOnlyHint"],
            destructiveHint=triple["destructiveHint"],
            idempotentHint=triple["idempotentHint"],
            openWorldHint=True,  # D-27 invariant — Pydantic Literal[True] enforces
        )
    return out
