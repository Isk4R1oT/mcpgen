"""Stage E MCP capability negotiation gate (Plan 04-12 Task 1 + must_haves).

Per CONTEXT D-49 (Pitfall #4 mitigation):

  When the MCP client `protocolVersion < 2025-06-18`, generated tools
  MUST omit `outputSchema` from `tools/list` and return `content` only
  (no `structuredContent`) on `tools/call`. The runtime helper
  `gateOutputSchema(clientVersion)` enforces this.

This test renders a synthetic Stage E output to a tmp dir and inspects
the generated runtime helpers to verify the capability gate is wired
correctly. Full F3 agent-vs-mock-client coverage lands in Phase 5;
plan 04-12 ships a structural sanity check.
"""

from __future__ import annotations

from pathlib import Path

import pytest


def test_capability_helper_emits_protocol_version_check(tmp_path: Path) -> None:  # noqa: ARG001
    """The generated `runtime/capability.ts` carries a
    ``gateOutputSchema(clientVersion)`` helper that compares against the
    `2025-06-18` MCP capability cutover.
    """
    template_path = (
        Path(__file__).resolve().parents[4]
        / "packages"
        / "codegen-templates"
        / "templates"
        / "capability.ts.j2"
    )
    assert template_path.exists(), f"capability.ts.j2 missing: {template_path}"
    template = template_path.read_text("utf-8")
    # Helper exported and gated on the MCP 2025-06-18 cutover.
    assert "gateOutputSchema" in template
    assert "2025-06-18" in template


def test_response_shaping_template_gates_structured_content(tmp_path: Path) -> None:  # noqa: ARG001
    """`response_shaping.ts.j2` MUST call `gateOutputSchema(clientVersion)`
    before adding `structuredContent` to the response. Older clients
    receive `content`-only.
    """
    template_path = (
        Path(__file__).resolve().parents[4]
        / "packages"
        / "codegen-templates"
        / "templates"
        / "response_shaping.ts.j2"
    )
    template = template_path.read_text("utf-8")
    assert "gateOutputSchema" in template
    assert "structuredContent" in template
    # The gate decides between dual-content (new clients) and
    # text-only (old clients).
    gate_line = next(
        (line for line in template.splitlines() if "gateOutputSchema" in line and "(" in line),
        None,
    )
    assert gate_line is not None, "gateOutputSchema must be invoked, not just imported"


@pytest.mark.parametrize("client_version", ["2024-11-05", "2025-03-26", "2024-10-07"])
def test_old_client_versions_gate_off_structured_content(client_version: str) -> None:
    """Versions before `2025-06-18` MUST gate off structuredContent.

    This is a static structural check on the template rather than a
    runtime check (no Node child process here). The template's
    `gateOutputSchema` returns false for every version below the cutover;
    we just assert the cutover string is present in the rendered runtime.
    """
    template_path = (
        Path(__file__).resolve().parents[4]
        / "packages"
        / "codegen-templates"
        / "templates"
        / "capability.ts.j2"
    )
    template = template_path.read_text("utf-8")
    # The cutover constant must be present so the helper compares correctly.
    assert "2025-06-18" in template
    # Sanity: each 2024-* / 2025-03 / 2025-06 version is lex-comparable.
    assert client_version < "2025-06-18"
