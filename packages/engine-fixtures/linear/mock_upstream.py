"""Linear sandbox mock_upstream adapter (CONTEXT D-22 — Linear in mocked tier).

Phase 5 ships Stripe + GitHub + Notion against real test-mode sandboxes. Linear
is in the mocked-upstream tier per D-22; Phase 9 onboards it to a real Linear
test workspace if ICP traction warrants.

This file is a thin shim: it delegates to the engine-side
``mcpgen_engine.stages.stage_f.mock_upstream.synthesize`` recursive walker
which derives a deterministic response from the spec's response schema
keyed by a per-task seed.
"""

from __future__ import annotations

from typing import Any

from mcpgen_engine.stages.stage_f.mock_upstream import synthesize


def generate_response(*, response_schema: dict[str, Any], seed: int) -> Any:
    """Synthesize a mocked Linear API response from the spec's response schema.

    Args:
        response_schema: a JSON Schema (Draft 2020-12 subset) extracted from
            ``RawIR.endpoints[*].responses[200].schema`` for the matched
            endpoint.
        seed: deterministic seed (typically derived from the golden task id)
            so retries return the same payload across F3 invocations.

    Returns:
        The synthesized JSON-serializable mock response.
    """
    return synthesize(response_schema, seed=seed)
