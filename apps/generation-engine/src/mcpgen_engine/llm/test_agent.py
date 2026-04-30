"""F3 test-agent Anthropic client — the documented Override doc §7.3 exception.

Per ``docs/mcpgen-model-and-provider-override.md`` §0 + §7.3 + Phase 1 D-13 +
Phase 5 CONTEXT D-02 + RESEARCH.md §6.1: the F3 test agent uses real
Anthropic Sonnet to simulate production agent behavior (real Cursor /
Claude Desktop / ChatGPT Deep Research). The F3 *LLM judge* evaluating the
agent's trajectory still uses Qwen3-Coder via the standard ``make_agent``
factory.

Two distinct roles — DO NOT collapse:

- **test AGENT** (this module) → Sonnet  ← simulates a real client / user
- **LLM JUDGE** (``f3_agent_eval.py``) → Qwen ← evaluates the agent's
  trajectory; lives in the standard generation-pipeline cost / latency budget

DO NOT use this client for any other phase, for the F2 judge, or for any
generation-pipeline pass. Adding a second site that imports ``AsyncAnthropic``
breaks the Override doc §0 single-model invariant.

Sonnet model pin (per RESEARCH.md §6.1 — CONTEXT D-02 had a typo):

- ``claude-sonnet-4-5-20250929`` — frozen snapshot for reproducibility
  (matches Anthropic's documented ``Sonnet 4.5`` snapshot).
- The CONTEXT D-02 string ``claude-sonnet-4-(alias)-(date)`` conflated the
  alias ``claude-sonnet-4-6`` with the 4.5 snapshot date — that combination
  is NOT a valid snapshot per Anthropic docs
  (``platform.claude.com/docs/en/about-claude/models/overview`` verified
  2026-04-29). Pinning the bare alias ``claude-sonnet-4-6`` today would
  auto-float and risk F3 result drift (Pitfall #2 anti-pattern at the F3
  layer — pinning floating tags). Quarterly model review can re-evaluate.

Cost: Sonnet 4.x = $3 / M input + $15 / M output. F3 server eval ~$1-1.50
(matches CONTEXT D-44).
"""

from __future__ import annotations

import os

from anthropic import AsyncAnthropic

# Pin the snapshot, not the alias.
SONNET_MODEL_ID: str = "claude-sonnet-4-5-20250929"

# Module-load tolerance: tests / pipelines that don't actually call F3 should
# still be able to import this module without a real ANTHROPIC_API_KEY. Tests
# that DO need Sonnet are gated behind the ``requires_anthropic`` pytest
# marker (registered in ``apps/generation-engine/pyproject.toml`` and routed
# via ``conftest.py::pytest_collection_modifyitems``).
_API_KEY_PLACEHOLDER: str = "sk-ant-test-PLACEHOLDER"
_api_key = os.environ.get("ANTHROPIC_API_KEY") or _API_KEY_PLACEHOLDER

# T-5-01 mitigation: api_key read from env only, never logged or echoed.
# `max_retries=2` per RESEARCH.md §6.1 — Anthropic SDK exponential backoff
# on 429 / 5xx. Phase 5 layers `tenacity` outside this client for per-task
# retry on local `wrangler dev` flakes.
ANTHROPIC: AsyncAnthropic = AsyncAnthropic(
    api_key=_api_key,
    max_retries=2,
)
