"""F2 between-tool sigma discrimination metric tests (Phase 5 D-12 / Pitfall #9).

Plan 05-05 Task 2 -- verifies the discrimination safety net for the
single-judge approach:

- sigma uses ``numpy.std(..., ddof=0)`` -- population stdev, NOT sample stdev
  (RESEARCH section 4.4: per-tool averages ARE the population for THIS server).
- sigma < 0.4 -> ``low_confidence_run = True`` and warning surfaced.
- Plan 05-08 retry orchestrator force-triggers F3 when low_confidence_run.

Mocking strategy: per-tool fixed scores via patched ``_score_one_tool``.
Lets us drive synthetic per-tool averages directly without 15x mocked LLM
calls per tool.
"""

from __future__ import annotations

import inspect
from unittest.mock import AsyncMock, MagicMock

import pytest

from mcpgen_engine.stages.stage_f import f2_smell
from mcpgen_engine.stages.stage_f.f2_smell import (
    ComponentScore,
    ToolScore,
    run_f2,
)
from mcpgen_engine.stages.stage_f.rubric import COMPONENTS


def _tool_score(name: str, average: float) -> ToolScore:
    """Build a ToolScore with the given uniform average (component scores
    all set to ``average`` so the per-tool mean equals ``average``)."""
    components = [ComponentScore(component=c, score=average) for c in COMPONENTS]
    return ToolScore(
        tool_name=name,
        components=components,
        average=average,
        prompt_injection_warnings_count=0,
    )


@pytest.mark.asyncio
async def test_sigma_zero_when_all_tools_identical(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """All 5 tools score 3.0 -> sigma = 0.0 -> low_confidence_run = True."""
    averages = [3.0, 3.0, 3.0, 3.0, 3.0]

    async def fake_score(tool: dict[str, object], _agent: object) -> ToolScore:
        return _tool_score(str(tool["name"]), averages.pop(0))

    monkeypatch.setattr(f2_smell, "_score_one_tool", fake_score)

    tools = [{"name": f"t{i}", "description": {}} for i in range(5)]
    agent = MagicMock()
    agent.run = AsyncMock()
    result = await run_f2(final_tools=tools, judge_agent=agent)

    assert result.sigma == 0.0
    assert result.low_confidence_run is True


@pytest.mark.asyncio
async def test_sigma_above_threshold_when_tools_diverse(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Per-tool averages [4.5, 3.5, 4.0, 5.0, 3.0] -> sigma ~= 0.71 (population)
    -> low_confidence_run = False."""
    averages = [4.5, 3.5, 4.0, 5.0, 3.0]

    async def fake_score(tool: dict[str, object], _agent: object) -> ToolScore:
        return _tool_score(str(tool["name"]), averages.pop(0))

    monkeypatch.setattr(f2_smell, "_score_one_tool", fake_score)

    tools = [{"name": f"t{i}", "description": {}} for i in range(5)]
    agent = MagicMock()
    agent.run = AsyncMock()
    result = await run_f2(final_tools=tools, judge_agent=agent)

    # Population stdev of [4.5, 3.5, 4.0, 5.0, 3.0] is ~0.7071 (sqrt(0.5))
    assert 0.65 < result.sigma < 0.75
    assert result.low_confidence_run is False
    # The warning list must NOT contain the low-confidence string
    assert all("sigma low" not in w for w in result.warnings)


@pytest.mark.asyncio
async def test_sigma_uses_ddof_zero_not_sample_stdev(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sanity check -- ddof=0 (population) vs ddof=1 (sample) differ measurably
    for small N. Verify the population value is reported.

    Population stdev of [4.0, 5.0]: ((1.0)/2)^0.5 = 0.5
    Sample stdev    of [4.0, 5.0]: ((1.0)/1)^0.5 ~= 0.7071
    A difference of ~0.21 -- clearly distinguishable.
    """
    averages = [4.0, 5.0]

    async def fake_score(tool: dict[str, object], _agent: object) -> ToolScore:
        return _tool_score(str(tool["name"]), averages.pop(0))

    monkeypatch.setattr(f2_smell, "_score_one_tool", fake_score)

    tools = [{"name": "t0", "description": {}}, {"name": "t1", "description": {}}]
    agent = MagicMock()
    agent.run = AsyncMock()
    result = await run_f2(final_tools=tools, judge_agent=agent)

    assert abs(result.sigma - 0.5) < 0.01  # population (ddof=0)
    assert abs(result.sigma - 0.7071) > 0.05  # NOT the sample (ddof=1) value


def test_source_uses_ddof_zero() -> None:
    """Source-code grep -- ``ddof=0`` is explicit in f2_smell.py (D-12)."""
    src = inspect.getsource(f2_smell)
    assert "ddof=0" in src


@pytest.mark.asyncio
async def test_low_sigma_below_threshold_surfaces_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """sigma < 0.4 AND overall < 4.0 -- both flags surface in the result."""
    averages = [3.0, 3.1, 3.0, 3.05, 3.0]  # sigma ~= 0.04 < 0.4 ; mean ~= 3.03 < 4.0

    async def fake_score(tool: dict[str, object], _agent: object) -> ToolScore:
        return _tool_score(str(tool["name"]), averages.pop(0))

    monkeypatch.setattr(f2_smell, "_score_one_tool", fake_score)

    tools = [{"name": f"t{i}", "description": {}} for i in range(5)]
    agent = MagicMock()
    agent.run = AsyncMock()
    result = await run_f2(final_tools=tools, judge_agent=agent)

    assert result.low_confidence_run is True
    assert result.passed is False
    assert any("sigma low" in w.lower() for w in result.warnings)
