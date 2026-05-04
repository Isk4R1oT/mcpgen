"""LLM cache warmup - pre-warm OpenRouter prefix cache so the first user
generation isn't cold and idle gaps don't let the cache TTL expire.

# Why this exists

OpenRouter is a proxy; the prefix cache lives on the upstream provider
(AtlasCloud / Ionstream / Parasail). Most providers expire the cache
after ~5 minutes of inactivity. Without warmup the first user request
pays the full uncached price + latency for every pass's system prompt
(~5-15 K tokens, 6 passes).

# Strategy

1. **Startup warmup.** When the engine boots we fire one minimal LLM
   call per pass, each carrying that pass's exact production system
   prompt as the cache prefix. Provider-side cache materializes after
   the first call (best-effort - DeepSeek and a few others take a
   few seconds before `cached_tokens > 0` shows up).

2. **Keep-warm loop.** A background task re-fires the same six calls
   every 4 minutes (one minute under the 5-min TTL most providers ship
   with). Each ping costs ~$0.003, total ~$0.05/hour idle - cheaper
   than the ~$0.50 latency tax a cold cache imposes on every demo
   generation.

3. **On-demand warmup.** A POST /api/v1/warmup endpoint runs the same
   six calls synchronously and returns timing + cache_hit metrics.
   The web app fires this fire-and-forget when the user lands on the
   /generate paste form so the cache is hot by the time they click
   "make it" (5-30 s typically).

# Cache-hit observability

Each warmup call asks OpenRouter to include
`prompt_tokens_details.cached_tokens` in the response (via
`usage.include=true` on the production sampling settings). The runner
logs the value as `llm.warmup.cache_hit cached=<n> total=<n>` so we
can confirm the cache is actually warming up and detect provider
drift (sticky routing miss -> cached_tokens drops to 0).

# What this is NOT

- Not an HTTP-level keep-alive: we don't reuse TCP/TLS sockets across
  calls (httpx/openai-python pool handles that).
- Not a model-loading warmup: most providers keep popular models hot
  in VRAM regardless. Some (cold-start serverless) benefit, but it's
  a side-effect, not the goal.
- Not a substitute for L1/L2 caching inside the engine — those still
  short-circuit pass execution entirely on identical specs.

# References

- docs/mcpgen-model-and-provider-override.md §4 (single Qwen3-Coder
  via OpenRouter, AtlasCloud pin per llm/sampling.py).
- OpenRouter prompt-caching docs:
  https://openrouter.ai/docs/guides/best-practices/prompt-caching
- Anthropic March 2026 TTL drop (1 h -> 5 min) - same pattern applies
  to most providers we proxy through OpenRouter.
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from dataclasses import dataclass
from typing import Final

import structlog
from pydantic_ai import Agent
from pydantic_ai.settings import ModelSettings

from mcpgen_engine.llm.client import MODEL
from mcpgen_engine.llm.sampling import (
    PASS_0_SETTINGS,
    PASS_1_SETTINGS,
    PASS_2_SETTINGS,
    PASS_3_SETTINGS,
    PASS_4_SETTINGS,
    PASS_5_SETTINGS,
)
from mcpgen_engine.passes.pass_0.prompts import PASS_0_SYSTEM_PROMPT
from mcpgen_engine.passes.pass_1.prompts import PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT
from mcpgen_engine.passes.pass_2.prompts import PASS_2_UNIVERSAL_SYSTEM_PROMPT
from mcpgen_engine.passes.pass_3.prompts import PASS_3_SYSTEM_PROMPT
from mcpgen_engine.passes.pass_4.prompts import PASS_4_JUDGE_SYSTEM_PROMPT
from mcpgen_engine.passes.pass_5.prompts import PASS_5_FIELD_RANKING_SYSTEM_PROMPT

_log = structlog.get_logger(__name__)

# 4 minutes = 240 s. The 5-min TTL most providers ship with means a
# 240 s ping interval gives 60 s of slack against clock-drift and
# latency variance. If a provider expires faster (DeepSeek hints at
# ~3 min on cold paths), drop this to 180 s.
KEEPWARM_INTERVAL_S: Final[int] = 240

# Minimal user message for warmup. The point is to refresh the prefix
# cache on the SYSTEM prompt — the user message can be anything short.
# We use a single-token reply hint to keep cost minimal (the provider
# still bills for the full prompt input, but that's the cache we want
# to populate).
_WARMUP_USER_MESSAGE: Final[str] = "ping"


@dataclass(frozen=True, slots=True)
class _WarmupTarget:
    """One warmup target = one (system_prompt, sampling_profile) pair."""

    name: str
    system_prompt: str
    settings: ModelSettings


_TARGETS: Final[tuple[_WarmupTarget, ...]] = (
    _WarmupTarget(name="pass_0", system_prompt=PASS_0_SYSTEM_PROMPT, settings=PASS_0_SETTINGS),
    _WarmupTarget(
        name="pass_1",
        system_prompt=PASS_1_SCHEMA_SYNTH_SYSTEM_PROMPT,
        settings=PASS_1_SETTINGS,
    ),
    _WarmupTarget(
        name="pass_2",
        system_prompt=PASS_2_UNIVERSAL_SYSTEM_PROMPT,
        settings=PASS_2_SETTINGS,
    ),
    _WarmupTarget(name="pass_3", system_prompt=PASS_3_SYSTEM_PROMPT, settings=PASS_3_SETTINGS),
    _WarmupTarget(
        name="pass_4",
        system_prompt=PASS_4_JUDGE_SYSTEM_PROMPT,
        settings=PASS_4_SETTINGS,
    ),
    _WarmupTarget(
        name="pass_5",
        system_prompt=PASS_5_FIELD_RANKING_SYSTEM_PROMPT,
        settings=PASS_5_SETTINGS,
    ),
)


@dataclass(frozen=True, slots=True)
class WarmupResult:
    """Per-target outcome — surfaced via POST /api/v1/warmup."""

    name: str
    elapsed_ms: int
    prompt_tokens: int | None
    cached_tokens: int | None
    error: str | None


async def _warmup_one(target: _WarmupTarget) -> WarmupResult:
    """Fire a single warmup call against one pass's system prompt."""
    started = time.perf_counter()
    # max_tokens=1 minimises the *output* cost; the input is what we
    # actually pay to warm. We override the production settings'
    # max_tokens to 1 so each warmup is as cheap as possible.
    warm_settings = ModelSettings(
        temperature=target.settings.get("temperature", 0.0),
        top_p=target.settings.get("top_p", 1.0),
        max_tokens=1,
        extra_body=target.settings.get("extra_body"),
    )
    agent: Agent[None, str] = Agent(
        MODEL,
        system_prompt=target.system_prompt,
        output_type=str,
    )
    try:
        result = await agent.run(_WARMUP_USER_MESSAGE, model_settings=warm_settings)
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        _log.warning(
            "llm.warmup.target_failed",
            target=target.name,
            elapsed_ms=elapsed_ms,
            error_class=type(exc).__name__,
            error=repr(exc)[:200],
        )
        return WarmupResult(
            name=target.name,
            elapsed_ms=elapsed_ms,
            prompt_tokens=None,
            cached_tokens=None,
            error=type(exc).__name__,
        )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    usage = result.usage()
    # PydanticAI's RunUsage has request_tokens; cached tokens live in
    # the raw provider details which we forward via _extract_cached.
    prompt_tokens = getattr(usage, "request_tokens", None)
    cached = _extract_cached_tokens(result)

    _log.info(
        "llm.warmup.target_complete",
        target=target.name,
        elapsed_ms=elapsed_ms,
        prompt_tokens=prompt_tokens,
        cached_tokens=cached,
    )
    return WarmupResult(
        name=target.name,
        elapsed_ms=elapsed_ms,
        prompt_tokens=prompt_tokens,
        cached_tokens=cached,
        error=None,
    )


def _extract_cached_tokens(run_result: object) -> int | None:
    """Best-effort extraction of `cached_tokens` from a PydanticAI run.

    PydanticAI 0.2.x surfaces OpenAI-compat usage details *flattened*
    into `usage.details` rather than nested under `prompt_tokens_details`.
    We check both shapes plus the Anthropic-flavored
    `cache_read_input_tokens` as a final fallback. None when no shape
    matches (provider doesn't support cache observability or the run
    hadn't completed yet).
    """
    usage = getattr(run_result, "usage", None)
    if callable(usage):
        try:
            usage = usage()
        except Exception:
            usage = None
    if usage is None:
        return None
    details = getattr(usage, "details", None)
    if isinstance(details, dict):
        # PydanticAI 0.2.x flattened shape (verified empirically with
        # Qwen via OpenRouter→AtlasCloud — Apr 2026).
        cached = details.get("cached_tokens")
        if isinstance(cached, int):
            return cached
        # OpenAI nested shape (kept for future SDK / direct-OpenAI runs).
        ptd = details.get("prompt_tokens_details")
        if isinstance(ptd, dict):
            nested = ptd.get("cached_tokens")
            if isinstance(nested, int):
                return nested
        # Anthropic-shape.
        ari = details.get("cache_read_input_tokens")
        if isinstance(ari, int):
            return ari
    return None


async def warmup_all(*, parallel: bool = True) -> list[WarmupResult]:
    """Run a single warmup pass across all six pass-specific prefixes.

    `parallel=True` (default) fires all six calls concurrently — fastest
    when the provider has spare capacity. Set `parallel=False` for tests
    or debugging when you want deterministic ordering.
    """
    started = time.perf_counter()
    if parallel:
        results = await asyncio.gather(*[_warmup_one(t) for t in _TARGETS])
    else:
        results = [await _warmup_one(t) for t in _TARGETS]

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    cached_total = sum((r.cached_tokens or 0) for r in results)
    prompt_total = sum((r.prompt_tokens or 0) for r in results)
    error_count = sum(1 for r in results if r.error is not None)
    hit_ratio = (cached_total / prompt_total) if prompt_total > 0 else 0.0
    _log.info(
        "llm.warmup.cycle_complete",
        elapsed_ms=elapsed_ms,
        target_count=len(_TARGETS),
        cached_tokens_total=cached_total,
        prompt_tokens_total=prompt_total,
        cache_hit_ratio=round(hit_ratio, 3),
        error_count=error_count,
    )
    return results


_keepwarm_task: asyncio.Task[None] | None = None


async def _keepwarm_loop() -> None:
    """Background loop — re-fire warmup_all() every KEEPWARM_INTERVAL_S.

    Cancelled cleanly on engine shutdown via the FastAPI lifespan hook.
    Errors inside warmup_all are already swallowed per-target so this
    loop never crashes; the worst case is a few logged target_failed
    events.
    """
    while True:
        try:
            await asyncio.sleep(KEEPWARM_INTERVAL_S)
            await warmup_all()
        except asyncio.CancelledError:
            _log.info("llm.warmup.keepwarm_cancelled")
            raise
        except Exception as exc:
            _log.warning(
                "llm.warmup.keepwarm_loop_error",
                error_class=type(exc).__name__,
                error=repr(exc)[:200],
            )


def start_keepwarm_task() -> asyncio.Task[None]:
    """Start the periodic keep-warm task. Idempotent."""
    global _keepwarm_task
    if _keepwarm_task is None or _keepwarm_task.done():
        _keepwarm_task = asyncio.create_task(_keepwarm_loop(), name="llm-keepwarm")
        _log.info("llm.warmup.keepwarm_started", interval_s=KEEPWARM_INTERVAL_S)
    return _keepwarm_task


async def stop_keepwarm_task() -> None:
    """Stop the keep-warm task - called from FastAPI lifespan shutdown."""
    global _keepwarm_task
    task = _keepwarm_task
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError, Exception):
        await task
    _keepwarm_task = None
