"""F2 6-component rubric scoring schema (Phase 5 D-10) + 5-shuffle deterministic
order (D-11).

The 6 paper-rubric components per
``docs/mcpgen-stage-f-design.md`` §4.1 (paper arXiv 2602.14878):

- ``purpose``: clarity of the tool's intended use
- ``guidelines``: when_to_use / when_not_to_use / how_to_use coverage
- ``limitations``: side effects, idempotency, failure modes
- ``parameter_explanation``: high-level overview + param relationships
- ``length_completeness``: length budget compliance + components present
- ``examples``: spec-derived examples (expected score 1-2 in v0; deferred
  to v1.1 per Phase 5 D-10)

All scores are integers 1..5 (Pydantic ``conint``). The reasoning string is a
short judge-side rationale captured for Langfuse trace + debug.

Implementation choice: ``random.Random(seed)`` (stdlib) is used for the
component-order shuffle rather than ``numpy.random.*``. RESEARCH §4.2: numpy
RNG semantics historically shifted across major versions (``RandomState`` ↔
``Generator`` migration, bit-generator default changes); the stdlib RNG is
specified in PEP 506 / CPython source and has no such drift surface. This
matters because the shuffle seed participates in the L2 cache key marker
(D-32) — any silent drift would unreproducibly invalidate cache entries.
"""

from __future__ import annotations

import random
from typing import Final

from pydantic import BaseModel, Field, conint

# Canonical 6-component order. The order is fixed for the *schema*; the prompt
# rendering shuffles a copy of this list per shuffle slot (D-11).
COMPONENTS: Final[list[str]] = [
    "purpose",
    "guidelines",
    "limitations",
    "parameter_explanation",
    "length_completeness",
    "examples",
]


class RubricScore(BaseModel):
    """6-component rubric scoring output from a single F2 judge call.

    Schema mirrors Phase 5 D-10 verbatim. Each score is an integer 1..5;
    out-of-range values raise ``pydantic.ValidationError`` at construction.
    """

    purpose: conint(ge=1, le=5)  # type: ignore[valid-type]
    guidelines: conint(ge=1, le=5)  # type: ignore[valid-type]
    limitations: conint(ge=1, le=5)  # type: ignore[valid-type]
    parameter_explanation: conint(ge=1, le=5)  # type: ignore[valid-type]
    length_completeness: conint(ge=1, le=5)  # type: ignore[valid-type]
    examples: conint(ge=1, le=5)  # type: ignore[valid-type]
    reasoning: str = Field(..., min_length=1, max_length=4000)


def shuffle_components(shuffle_seed: int) -> list[str]:
    """Deterministic shuffle of the 6 rubric components (D-11).

    Same ``shuffle_seed`` always produces the same order. Uses stdlib
    ``random.Random`` (NOT numpy) for cross-version reproducibility — the seed
    participates in the F2 L2 cache key marker per D-32, so any silent RNG
    drift would unreproducibly invalidate cache entries.

    Returns a fresh list each call (does not mutate ``COMPONENTS``).
    """
    # S311 suppression: this is a deterministic test-shuffle of rubric
    # component ordering (D-11 position-bias mitigation). NOT a crypto / token
    # context. The seed is a small integer fed into the L2 cache key marker
    # (D-32), and the cross-CPython-version stability of stdlib's RNG is
    # precisely the reason we picked it over ``numpy.random`` (RESEARCH §4.2).
    rng = random.Random(shuffle_seed)  # noqa: S311
    order = list(COMPONENTS)
    rng.shuffle(order)
    return order
