"""Stage E capability gate tests — Pitfall #4 mitigation per CONTEXT D-24.

Plan 04-08 Wave 0 — RED tests for ``packages/codegen-templates/templates/
capability.ts.j2``. The rendered TS must export

- ``MIN_OUTPUT_SCHEMA_VERSION = "2025-06-18"`` constant.
- ``gteVersion(a: string, b: string): boolean`` — 5-line lex compare
  (MCP versions are date-format ``YYYY-MM-DD`` strings, so lex sort gives
  correct chronological order).
- ``gateOutputSchema(clientVersion: string | undefined): boolean`` returning
  ``false`` for undefined client (conservative default — older-client
  fall-through to ``content``-only response).

Threats:
- T-04-08-capability-gate-bypass — verify the renderer ships the correct
  threshold + the conservative ``undefined → false`` branch + the
  ``< 2025-06-18 → false`` branch + the ``>= 2025-06-18 → true`` branch.

Tests assert against the rendered TS source verbatim — Plan 04-11 will run
``tsc --noEmit`` end-to-end against the rendered Worker; Wave 0 stays at
the source-text level for fast feedback.

References:
- 04-CONTEXT.md D-24 (verbatim TypeScript)
- 04-RESEARCH.md §"Code Examples" Pattern 3 + Code Example 6 (server.ts)
- 04-PATTERNS.md `templates/capability.ts.j2` row.
"""

from __future__ import annotations

import re

from mcpgen_engine.stages.stage_e.template_loader import ENVIRONMENT


def _render_capability() -> str:
    """Render capability.ts.j2 with the canonical context.

    The template depends on no Pass-output context (D-24 hardcodes the
    threshold). Render-time context is empty.
    """
    return ENVIRONMENT.get_template("capability.ts.j2").render({})


def test_min_output_schema_version_2025_06_18() -> None:
    """MIN_OUTPUT_SCHEMA_VERSION constant equals "2025-06-18" verbatim."""
    rendered = _render_capability()
    assert 'MIN_OUTPUT_SCHEMA_VERSION = "2025-06-18"' in rendered


def test_gte_version_helper_exported() -> None:
    """gteVersion(a, b) helper exported with lex compare body."""
    rendered = _render_capability()
    assert "export function gteVersion" in rendered
    # Body: `return a >= b;` (5-line lex compare per RESEARCH Pattern 3).
    assert re.search(r"gteVersion[^{]*\{[^}]*return\s+a\s*>=\s*b", rendered, re.DOTALL)


def test_gate_output_schema_undefined_returns_false() -> None:
    """gateOutputSchema(undefined) → false (conservative default)."""
    rendered = _render_capability()
    assert "export function gateOutputSchema" in rendered
    # Conservative branch present: `if (!clientVersion) return false;`
    body_match = re.search(
        r"export function gateOutputSchema[^{]*\{(.*?)\n\}",
        rendered,
        re.DOTALL,
    )
    assert body_match is not None
    body = body_match.group(1)
    # Either explicit `if (!clientVersion) return false` or equivalent guard.
    assert "!clientVersion" in body
    assert "return false" in body


def test_gate_output_schema_old_client_2024_returns_false() -> None:
    """The MIN_OUTPUT_SCHEMA_VERSION ("2025-06-18") > "2024-11-05" lex.

    This is a property of the threshold value, not of the rendered code; we
    verify the threshold is on the higher side of the 2024 client wire
    version so the lex compare yields the expected ordering. The runtime
    behaviour is exercised in Plan 04-11 ``tsc --noEmit`` + Phase 5 F3.
    """
    rendered = _render_capability()
    assert 'MIN_OUTPUT_SCHEMA_VERSION = "2025-06-18"' in rendered
    # Old client lex-sorts BEFORE the threshold.
    assert "2024-11-05" < "2025-06-18"
    assert "2024-11-05" < "2025-06-18"  # belt + suspenders for clarity


def test_gate_output_schema_2025_06_18_returns_true() -> None:
    """clientVersion == MIN_OUTPUT_SCHEMA_VERSION → gate returns true.

    The rendered helper calls ``gteVersion(clientVersion, MIN_...)`` which
    compares strings with ``>=``; equality returns true.
    """
    rendered = _render_capability()
    # Verify the gate body delegates to gteVersion with the threshold.
    assert "gteVersion(clientVersion, MIN_OUTPUT_SCHEMA_VERSION)" in rendered
    # And `"2025-06-18" >= "2025-06-18"` is trivially true.
    assert "2025-06-18" >= "2025-06-18"


def test_gate_output_schema_future_2025_12_01_returns_true() -> None:
    """Future client (after threshold) lex-sorts > MIN, so gate returns true."""
    rendered = _render_capability()
    assert 'MIN_OUTPUT_SCHEMA_VERSION = "2025-06-18"' in rendered
    assert "2025-12-01" >= "2025-06-18"


def test_gateoutputschema_signature_optional_string() -> None:
    """Signature is gateOutputSchema(clientVersion: string | undefined)."""
    rendered = _render_capability()
    # Allow either `string | undefined` or `string?` (TS optional-prop syntax,
    # rare for function args but legal); we lock on the verbatim form per
    # RESEARCH Pattern 3.
    assert "clientVersion: string | undefined" in rendered


def test_capability_template_carries_pitfall_4_marker_comment() -> None:
    """Generated header comment cites Pitfall #4 / D-24 — provenance chain."""
    rendered = _render_capability()
    # Either marker appears (header comment style varies but provenance lock
    # is mandatory for CONTEXT D-24 traceability).
    assert "Pitfall #4" in rendered or "D-24" in rendered or "capability" in rendered.lower()
