"""F2 smell scan orchestrator (Phase 5 D-09 / D-12 / D-15).

Single Qwen3-Coder x 5-shuffle x 3-temperature = 15 LLM calls per tool. The
3 temperatures (0.0 / 0.2 / 0.5) live in ``llm/sampling.py`` as
``F2_JUDGE_SETTINGS_T00 / T02 / T05`` (Plan 05-01 D-03); the 5 shuffles
deterministically reorder the 6 rubric components per ``shuffle_components``.

Per-tool aggregation:
- 15 ``RubricScore`` outputs are reduced to 6 component-mean scores.
- The per-tool ``average`` is the mean of the 6 component means.

Per-server aggregation:
- ``overall_score`` is the mean of per-tool averages.
- ``sigma`` is ``numpy.std(per_tool_averages, ddof=0)`` -- the population
  standard deviation, NOT the sample stdev. Rationale per RESEARCH section 4.4:
  the per-tool averages ARE the entire population for THIS server's smell
  evaluation; we are not estimating a population from a sample, so ddof=0
  is correct (Bessel correction would over-estimate variance for small N).
- ``low_confidence_run = sigma < 0.4`` (D-12 -- Pitfall #9 mitigation). When
  set, the retry orchestrator (Plan 05-08) force-enables F3 even on free
  tier -- the discrimination metric IS the safety net for the
  single-judge approach (Override doc section 4 trade-off).

Threshold:
- ``passed = overall_score >= LAUNCH_CRITERIA["F2_SMELL_MIN"]`` -- imported,
  NEVER hardcoded. The Python mirror lives at
  ``mcpgen_engine.launch_criteria`` (the canonical TS source is
  ``packages/contracts/src/launch-criteria.ts``; Phase 1 D-13 +
  Pitfall #29 paired-decision-doc gate prevents drift).

Concurrency:
- Tools fan out via ``asyncio.Semaphore(10)`` mirroring Phase 2/3/4
  patterns. Each tool's 15 calls are sequential within the bounded slot --
  sufficient because OpenRouter / AtlasCloud cost dominates wall-clock,
  not concurrency.

References:
- 05-CONTEXT.md D-09 (15-call iteration), D-12 (sigma >= 0.4 metric), D-15
  (cost target $0.015-0.05), D-16 (untrusted-spec sanitization)
- 05-RESEARCH.md section 4.1 (concrete iteration), section 4.4 (ddof=0
  rationale)
- ``llm/sampling.py`` F2_JUDGE_SETTINGS_T00 / T02 / T05 (Plan 05-01)
- ``mcpgen_engine/launch_criteria.py`` (Plan 05-03 -- Python LAUNCH_CRITERIA
  mirror)
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Final

import httpx
import numpy as np
from pydantic_ai import Agent
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from mcpgen_engine.launch_criteria import LAUNCH_CRITERIA
from mcpgen_engine.llm.sampling import (
    F2_JUDGE_SETTINGS_T00,
    F2_JUDGE_SETTINGS_T02,
    F2_JUDGE_SETTINGS_T05,
)

from .judge_prompts import build_judge_prompt
from .rubric import COMPONENTS, RubricScore

log = logging.getLogger(__name__)

# 3 temperature profiles x 5 shuffles = 15 calls per tool (D-09).
_TEMP_SETTINGS: Final[tuple[Any, Any, Any]] = (
    F2_JUDGE_SETTINGS_T00,
    F2_JUDGE_SETTINGS_T02,
    F2_JUDGE_SETTINGS_T05,
)
_SHUFFLES: Final[int] = 5
_CONCURRENCY: Final[int] = 10
# Sigma threshold for the discrimination metric (D-12 / Pitfall #9). NOT a
# launch criterion -- this is a project-defined "is the judge's signal
# discriminating between tools?" gate, not a quality threshold. Hardcoded
# inline because changing it requires the same paired-decision dance as
# launch criteria (a project-level invariant); the value lives here.
_SIGMA_LOW_CONFIDENCE_THRESHOLD: Final[float] = 0.4


@dataclass(frozen=True)
class ComponentScore:
    """Mean score across 15 evaluations for a single rubric component."""

    component: str
    score: float


@dataclass(frozen=True)
class ToolScore:
    """Per-tool aggregate of 15 rubric evaluations.

    ``components`` lists the 6 component means in canonical ``COMPONENTS``
    order (NOT shuffle order -- the shuffle was per-prompt; aggregation
    re-canonicalises). ``average`` is the mean of the 6 component means.

    ``prompt_injection_warnings_count`` accumulates across all 5 shuffles
    of the same tool (the same description text is scanned each shuffle, so
    the count is 5x the per-shuffle count if any injection patterns exist).
    The retry orchestrator should normalise to per-tool count if needed.
    """

    tool_name: str
    components: list[ComponentScore]
    average: float
    prompt_injection_warnings_count: int


@dataclass(frozen=True)
class F2RunResult:
    """F2 smell-scan output for one server.

    ``low_confidence_run`` is the D-12 discrimination flag -- when ``sigma <
    0.4`` the retry orchestrator (Plan 05-08) force-enables F3 even if the
    operator opted out. ``warnings`` carries human-readable strings for the
    QualityReport.
    """

    tool_scores: list[ToolScore]
    overall_score: float
    sigma: float
    passed: bool
    low_confidence_run: bool
    warnings: list[str]


# WR-09: Per-call retry on transient OpenRouter / network errors. Without
# this, a single 502 / connection drop on the 12th call aborts the entire
# 15-call iteration and loses the per-tool score (~$0.05). CLAUDE.md
# explicitly requires "retries with warnings" for external API calls.
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((httpx.HTTPError, asyncio.TimeoutError)),
    reraise=True,
)
async def _judge_run_with_retry(
    judge_agent: Agent[None, RubricScore],
    prompt: str,
    temp_setting: Any,
) -> RubricScore:
    """Single judge call with bounded exponential backoff on transient errors."""
    result = await judge_agent.run(prompt, model_settings=temp_setting)
    return result.output


async def _score_one_tool(tool: dict[str, Any], judge_agent: Agent[None, RubricScore]) -> ToolScore:
    """Run 5 shuffles x 3 temperatures = 15 calls; return aggregated ToolScore.

    Iteration order (D-09 verbatim):
    ```
    for shuffle_idx in range(5):
        prompt, _ = build_judge_prompt(tool=tool, shuffle_seed=shuffle_idx)
        for temp_setting in (T00, T02, T05):
            score = await judge_agent.run(prompt, model_settings=temp_setting)
            scores.append(score.output)
    ```

    Aggregation: per-component mean across all 15 ``RubricScore`` outputs;
    per-tool ``average`` is the mean of the 6 component means.
    """
    scores: list[RubricScore] = []
    injection_total = 0
    for shuffle_idx in range(_SHUFFLES):
        prompt, injection = build_judge_prompt(tool=tool, shuffle_seed=shuffle_idx)
        injection_total += injection
        for temp_setting in _TEMP_SETTINGS:
            score = await _judge_run_with_retry(judge_agent, prompt, temp_setting)
            scores.append(score)

    component_avgs: list[ComponentScore] = []
    for component in COMPONENTS:
        values = [getattr(score, component) for score in scores]
        component_avgs.append(ComponentScore(component=component, score=float(np.mean(values))))
    average = float(np.mean([c.score for c in component_avgs]))

    return ToolScore(
        tool_name=str(tool.get("name", "<unnamed>")),
        components=component_avgs,
        average=average,
        prompt_injection_warnings_count=injection_total,
    )


async def run_f2(
    *,
    final_tools: Sequence[dict[str, Any]],
    judge_agent: Agent[None, RubricScore],
) -> F2RunResult:
    """Score every tool concurrently; aggregate per-server.

    ``Semaphore(10)`` matches Phase 2/3/4 concurrency patterns. Total wall
    clock for a 10-tool server: ~25-30s mocked (real LLM call latency
    dominates).

    Returns an ``F2RunResult`` carrying per-tool ToolScore + overall score +
    sigma + pass/low-confidence flags + warnings. The retry orchestrator
    (Plan 05-08) consumes this and dispatches per-component retries via
    ``failure_patterns.F2_COMPONENT_TO_RETRY``.

    Threshold: ``LAUNCH_CRITERIA["F2_SMELL_MIN"]`` (= 4.0 today; Phase 1
    D-13 invariant -- never hardcoded).
    """
    sem = asyncio.Semaphore(_CONCURRENCY)

    async def _bounded(tool: dict[str, Any]) -> ToolScore:
        async with sem:
            return await _score_one_tool(tool, judge_agent)

    tool_scores = await asyncio.gather(*[_bounded(t) for t in final_tools])

    per_tool_averages = [t.average for t in tool_scores]
    overall_score = float(np.mean(per_tool_averages))
    # Population stdev (ddof=0) -- the per-tool averages ARE the population
    # for THIS server's smell run; not a sample. RESEARCH section 4.4.
    sigma = float(np.std(per_tool_averages, ddof=0))

    threshold = float(LAUNCH_CRITERIA["F2_SMELL_MIN"])  # type: ignore[arg-type]
    passed = overall_score >= threshold
    low_confidence_run = sigma < _SIGMA_LOW_CONFIDENCE_THRESHOLD

    warnings: list[str] = []
    if low_confidence_run:
        warnings.append(
            "F2 between-tool sigma low (<0.4) - quality assessment may be "
            "unreliable. F3 will be force-triggered to confirm."
        )

    return F2RunResult(
        tool_scores=list(tool_scores),
        overall_score=overall_score,
        sigma=sigma,
        passed=passed,
        low_confidence_run=low_confidence_run,
        warnings=warnings,
    )
