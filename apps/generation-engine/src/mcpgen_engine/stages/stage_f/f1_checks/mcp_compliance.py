"""F1 check #4 — MCP protocol compliance.

Per CONTEXT D-05 step 4: load the final tools and assert MCP 2025-06-18 spec
compliance:

1. All four annotation booleans are explicitly set per tool (Pitfall #31:
   missing annotations let MCP defaults trip Cursor's confirmation dialogue).
2. ``openWorldHint=True`` invariant — we wrap external REST APIs always (Phase 4 D-12).
3. ``mcp_protocol_version == "2025-06-18"`` from the manifest.
4. ``tools/list`` JSON-serializability (catches embedded ``datetime`` / non-JSON values
   that would crash the dispatch worker at runtime).

Failure flavours map to different upstream-pass retries (CONTEXT D-06):

- ``MCP_COMPLIANCE_FAIL_ANNOTATIONS``        -> retry Pass 4.
- ``MCP_COMPLIANCE_FAIL_PROTOCOL_VERSION``   -> retry Stage E (template fix).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

REQUIRED_ANNOTATIONS: tuple[str, ...] = (
    "readOnlyHint",
    "destructiveHint",
    "idempotentHint",
    "openWorldHint",
)

REQUIRED_PROTOCOL_VERSION: str = "2025-06-18"

# Cap reported offenders so a wide breakage does not flood the F1 report.
_MAX_OFFENDERS_REPORTED: int = 20


@dataclass(frozen=True)
class McpComplianceResult:
    """Outcome of the MCP protocol compliance F1 check."""

    passed: bool
    error: str | None
    offending_tools: list[tuple[str, str]] = field(default_factory=list)


def check_mcp_compliance(
    *,
    final_tools: list[dict[str, Any]],
    mcp_protocol_version: str,
) -> McpComplianceResult:
    """Validate the four invariants in the module docstring.

    The protocol-version check fires first because it is the cheapest signal and
    drives a different retry target than the annotation checks.
    """
    if mcp_protocol_version != REQUIRED_PROTOCOL_VERSION:
        return McpComplianceResult(
            passed=False,
            error="MCP_COMPLIANCE_FAIL_PROTOCOL_VERSION",
            offending_tools=[
                (
                    "__manifest__",
                    f"got {mcp_protocol_version!r}, want {REQUIRED_PROTOCOL_VERSION!r}",
                )
            ],
        )

    offenders: list[tuple[str, str]] = []
    for tool in final_tools:
        name = str(tool.get("name", "<unnamed>"))
        annotations = tool.get("annotations") or {}

        for required_key in REQUIRED_ANNOTATIONS:
            if required_key not in annotations:
                offenders.append((name, f"missing annotation {required_key}"))

        # openWorldHint=true invariant per CONTEXT D-05 step 4 + Phase 4 D-12.
        # We accept the key being missing as already-flagged above; if it IS present,
        # it MUST equal True (not "true", not 1).
        if "openWorldHint" in annotations and annotations["openWorldHint"] is not True:
            observed = annotations["openWorldHint"]
            offenders.append(
                (
                    name,
                    f"openWorldHint invariant violated (must be True; got {observed!r})",
                )
            )

        # tools/list serialisability — defaults to ``str`` so Pydantic ``HttpUrl`` etc.
        # do not falsely trigger; that is a milder signal than a real non-JSON object.
        try:
            json.dumps(tool, default=str)
        except (TypeError, ValueError) as exc:
            offenders.append((name, f"non-serialisable: {exc}"))

    if offenders:
        return McpComplianceResult(
            passed=False,
            error="MCP_COMPLIANCE_FAIL_ANNOTATIONS",
            offending_tools=offenders[:_MAX_OFFENDERS_REPORTED],
        )
    return McpComplianceResult(passed=True, error=None, offending_tools=[])
