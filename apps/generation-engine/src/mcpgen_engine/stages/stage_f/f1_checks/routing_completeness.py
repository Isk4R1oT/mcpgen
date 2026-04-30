"""F1 check #5 — routing completeness.

Per CONTEXT D-05 step 5: every entry in ``Pass1Output.routing.rules[*].target_endpoint``
and every step's endpoint inside ``Pass1Output.workflows[*].steps[*].endpoint`` must
correspond to a real upstream endpoint in ``RawIR.endpoints``. The endpoint identity is
``f"{method} {path}"`` (e.g. ``"GET /v1/customers"``); ``RawIR.Endpoint`` has no ``id``
field so this normalised string is the join key.

Failure -> ``ROUTING_INCOMPLETE`` -> retry Pass 1 (CONTEXT D-06).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class RoutingCompletenessResult:
    """Outcome of the routing completeness F1 check."""

    passed: bool
    error: str | None
    missing: list[str] = field(default_factory=list)


def _index_endpoints(raw_ir: dict[str, Any]) -> set[str]:
    """Build the set of ``"<METHOD> <PATH>"`` strings from RawIR endpoints."""
    keys: set[str] = set()
    for ep in raw_ir.get("endpoints", []) or []:
        method = str(ep.get("method", "")).upper().strip()
        path = str(ep.get("path", "")).strip()
        if method and path:
            keys.add(f"{method} {path}")
    return keys


def _normalise(target: str) -> str:
    """Normalise a routing target to ``METHOD PATH`` (uppercase verb, single space)."""
    parts = target.strip().split(maxsplit=1)
    if len(parts) != 2:
        return target.strip()
    return f"{parts[0].upper()} {parts[1]}"


def check_routing_completeness(
    *,
    pass_1_output: dict[str, Any],
    raw_ir: dict[str, Any],
) -> RoutingCompletenessResult:
    """Verify every routing target points at a real RawIR endpoint."""
    valid = _index_endpoints(raw_ir)
    missing: list[str] = []

    routing = pass_1_output.get("routing", {}) or {}
    for rule in routing.get("rules", []) or []:
        target = _normalise(str(rule.get("target_endpoint", "")))
        if target not in valid:
            missing.append(target)

    for workflow in pass_1_output.get("workflows", []) or []:
        for step in workflow.get("steps", []) or []:
            endpoint = _normalise(str(step.get("endpoint", "")))
            if endpoint not in valid:
                missing.append(endpoint)

    if missing:
        return RoutingCompletenessResult(passed=False, error="ROUTING_INCOMPLETE", missing=missing)
    return RoutingCompletenessResult(passed=True, error=None, missing=[])
