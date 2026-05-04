"""Single LLM model client per docs/mcpgen-model-and-provider-override.md.

qwen/qwen3-coder via OpenRouter through PydanticAI. LiteLLM is DELETED - any
reference to it is a bug. This module exports MODEL singleton; ALL passes
(Phase 2+) MUST import from here.

NOTE: pydantic-ai 0.2.x exports `OpenAIModel` (NOT `OpenAIChatModel`, which
is the newer 0.5+ API). When pydantic-ai is bumped, this module is the only
place to update — every pass imports MODEL from here.

Fail-fast (Pitfall #27): if OPENROUTER_API_KEY is unset at module load, this
module raises KeyError immediately rather than returning a None sentinel that
would surface a confusing error in some downstream Pass call. Tests that need
to import this module without a real key MUST set
OPENROUTER_API_KEY=sk-or-test-PLACEHOLDER via the conftest `_sandbox_env`
fixture (see tests/conftest.py).
"""

from __future__ import annotations

import os

from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider


def get_model() -> OpenAIModel:
    """Return the Qwen3-Coder model wired to OpenRouter.

    Raises KeyError if OPENROUTER_API_KEY is unset - fail-fast is intentional
    (Pitfall #27 prevention).
    """
    provider = OpenAIProvider(
        base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    return OpenAIModel(
        model_name=os.environ.get("PRIMARY_MODEL", "qwen/qwen3-coder-next"),
        provider=provider,
    )


# Singleton - instantiated at import time. Passes 0-5 (Phase 2+) import this directly.
# T-1-09: api_key is read from env, never logged or echoed.
# Fail-fast (Pitfall #27): if OPENROUTER_API_KEY is unset, get_model() raises KeyError at import.
# Tests that need to import this module without a real key MUST set
# OPENROUTER_API_KEY=sk-or-test-PLACEHOLDER via the existing `_sandbox_env` conftest fixture.
MODEL: OpenAIModel = get_model()
