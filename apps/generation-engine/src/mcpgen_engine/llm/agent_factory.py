"""PydanticAI agent factory wrapping the MODEL singleton.

All Pass 0/1 LLM call sites import `make_agent` from here. Sampling and
`extra_body` propagation happen at `.run()` time via `model_settings=`
keyword passed by the caller — typically `PASS_0_SETTINGS` or
`PASS_1_SETTINGS` from `sampling.py` (D-05 + D-06).

Forbidden (Pitfall A): constructing OpenAIModel / OpenAIProvider /
OpenRouterModel anywhere in this file. The singleton MODEL is the only
legal model construction site (`llm/client.py`).
"""

from __future__ import annotations

from pydantic import BaseModel
from pydantic_ai import Agent

from .client import MODEL


# PEP 695 type-parameter form (Python 3.12+) — equivalent to
# `T = TypeVar("T", bound=BaseModel)` + `def make_agent(...) -> Agent[None, T]`
# but satisfies ruff UP047 which the pre-commit autofix hook rewrites.
def make_agent[T: BaseModel](
    *,
    output_type: type[T],
    system_prompt: str,
) -> Agent[None, T]:
    """Create a PydanticAI agent bound to the singleton MODEL.

    Sampling / extra_body must be passed at `.run()` time via
    `model_settings=` (use the PASS_0_SETTINGS / PASS_1_SETTINGS constants
    from `sampling.py` — never construct ModelSettings inline at call sites).
    """
    return Agent(
        model=MODEL,
        output_type=output_type,
        system_prompt=system_prompt,
    )
