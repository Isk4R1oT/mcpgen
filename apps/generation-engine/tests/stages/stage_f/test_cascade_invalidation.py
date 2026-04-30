"""Cascade L2 invalidation tests (Plan 05-08, CONTEXT D-26).

Verifies:
1. ``L2Cache.invalidate_by_prefix`` removes only sidecar-indexed files whose
   raw key string starts with the prefix; returns count removed.
2. ``invalidate_cascade(retry_target, l2)`` calls invalidate_by_prefix once
   per downstream pass per the PASS_DOWNSTREAM table (D-26).
3. The dispatch order (pass_2 -> 6 downstreams; stage_e -> 2 downstreams;
   pass_5 -> 3 downstreams) matches D-26 verbatim.
4. The L1 spec-hash cache is never touched by cascade invalidation.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from mcpgen_engine.cache import l2 as l2_module
from mcpgen_engine.cache import set_l1
from mcpgen_engine.cache.cache_invalidation import (
    PASS_DOWNSTREAM,
    invalidate_cascade,
)
from mcpgen_engine.cache.l2 import (
    invalidate_by_prefix,
    set_l2,
)


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Per-test fresh cache root."""
    monkeypatch.setenv("MCPGEN_CACHE_DIR", str(tmp_path / "cache"))
    from mcpgen_engine.settings import get_settings

    get_settings.cache_clear()


# ─── Direct invalidate_by_prefix tests ──────────────────────────────────────


@pytest.mark.asyncio
async def test_invalidate_by_prefix_removes_indexed_entries() -> None:
    """Files whose original_key starts with the prefix must be unlinked."""
    set_l2(
        "abc123",
        {"value": 1},
        original_key="l2:0.0.0:pass_3:1:qwen/qwen3-coder:PASS_3:hashedX",
    )
    set_l2(
        "def456",
        {"value": 2},
        original_key="l2:0.0.0:pass_3:1:qwen/qwen3-coder:PASS_3:hashedY",
    )
    set_l2(
        "ghi789",
        {"value": 3},
        original_key="l2:0.0.0:pass_2:1:qwen/qwen3-coder:PASS_2:hashedZ",
    )

    removed = await invalidate_by_prefix("l2:0.0.0:pass_3:")
    assert removed == 2


@pytest.mark.asyncio
async def test_invalidate_by_prefix_is_idempotent() -> None:
    """Re-invalidating the same prefix returns 0 (entries already gone)."""
    set_l2(
        "abc111",
        {"v": 1},
        original_key="l2:0.0.0:pass_4:1:qwen/qwen3-coder:PASS_4:hashedA",
    )
    first = await invalidate_by_prefix("l2:0.0.0:pass_4:")
    second = await invalidate_by_prefix("l2:0.0.0:pass_4:")
    assert first == 1
    assert second == 0


@pytest.mark.asyncio
async def test_invalidate_by_prefix_unmatched_returns_zero() -> None:
    """Prefix that doesn't match any indexed key returns 0."""
    set_l2(
        "deadbeef",
        {"x": 1},
        original_key="l2:0.0.0:pass_5:1:qwen/qwen3-coder:PASS_5:hashedM",
    )
    assert await invalidate_by_prefix("l2:0.0.0:pass_0:") == 0


@pytest.mark.asyncio
async def test_invalidate_by_prefix_no_index_file_returns_zero() -> None:
    """When the sidecar index does not exist (cold cache), return 0."""
    assert await invalidate_by_prefix("l2:0.0.0:pass_2:") == 0


@pytest.mark.asyncio
async def test_invalidate_by_prefix_does_not_touch_l1(tmp_path: Path) -> None:  # noqa: ARG001
    """L1 entries (different layer dir) must survive L2 invalidation."""
    set_l1("l1key123", {"raw_ir": {}})
    set_l2(
        "abc222",
        {"v": 1},
        original_key="l2:0.0.0:pass_2:1:qwen/qwen3-coder:PASS_2:hashedQ",
    )
    await invalidate_by_prefix("l2:0.0.0:pass_2:")
    # L1 still readable
    from mcpgen_engine.cache import get_l1

    assert get_l1("l1key123") is not None


# ─── invalidate_cascade dispatch tests ──────────────────────────────────────


@pytest.mark.asyncio
async def test_invalidate_cascade_pass_2_calls_six_downstreams() -> None:
    """D-26: pass_2 retry -> invalidate Pass 3, Pass 4, Pass 5, Stage E, F1, F2."""
    fake_invalidate = AsyncMock(return_value=1)
    fake_l2 = type("FakeL2", (), {"invalidate_by_prefix": fake_invalidate})()
    total = await invalidate_cascade("pass_2", fake_l2)  # type: ignore[arg-type]

    assert fake_invalidate.call_count == 6
    assert total == 6
    called_prefixes = [args.args[0] for args in fake_invalidate.call_args_list]
    # All downstream prefixes per D-26.
    assert any("pass_3" in p for p in called_prefixes)
    assert any("pass_4" in p for p in called_prefixes)
    assert any("pass_5" in p for p in called_prefixes)
    assert any("stage_e" in p for p in called_prefixes)
    assert any("stage_f1" in p for p in called_prefixes)
    assert any("stage_f2" in p for p in called_prefixes)


@pytest.mark.asyncio
async def test_invalidate_cascade_stage_e_calls_two_downstreams() -> None:
    """D-26: stage_e retry -> invalidate Stage F1 + Stage F2 only."""
    fake_invalidate = AsyncMock(return_value=0)
    fake_l2 = type("FakeL2", (), {"invalidate_by_prefix": fake_invalidate})()
    await invalidate_cascade("stage_e", fake_l2)  # type: ignore[arg-type]

    assert fake_invalidate.call_count == 2


@pytest.mark.asyncio
async def test_invalidate_cascade_pass_5_calls_three_downstreams() -> None:
    """D-26: pass_5 retry -> invalidate Stage E + Stage F1 + Stage F2."""
    fake_invalidate = AsyncMock(return_value=0)
    fake_l2 = type("FakeL2", (), {"invalidate_by_prefix": fake_invalidate})()
    await invalidate_cascade("pass_5", fake_l2)  # type: ignore[arg-type]

    assert fake_invalidate.call_count == 3


@pytest.mark.asyncio
async def test_invalidate_cascade_unknown_target_returns_zero() -> None:
    """Unknown retry_target (e.g. 'stage_f1' which has no downstream) returns 0."""
    fake_invalidate = AsyncMock(return_value=99)
    fake_l2 = type("FakeL2", (), {"invalidate_by_prefix": fake_invalidate})()
    total = await invalidate_cascade("stage_f1", fake_l2)  # type: ignore[arg-type]

    assert fake_invalidate.call_count == 0
    assert total == 0


def test_pass_downstream_table_matches_d26() -> None:
    """PASS_DOWNSTREAM table encodes D-26 verbatim."""
    # pass_0 -> 8 downstreams (everything)
    assert len(PASS_DOWNSTREAM["pass_0"]) == 8
    # pass_5 -> 3 (stage_e, f1, f2)
    assert PASS_DOWNSTREAM["pass_5"] == ["stage_e", "stage_f1", "stage_f2"]
    # stage_e -> 2 (f1, f2)
    assert PASS_DOWNSTREAM["stage_e"] == ["stage_f1", "stage_f2"]
    # No entry for stage_f1 / stage_f2 (terminal — nothing downstream of validation)
    assert "stage_f1" not in PASS_DOWNSTREAM
    assert "stage_f2" not in PASS_DOWNSTREAM


# Ensure the module-level fixture doesn't shadow real l2 module attribute we test
def test_module_exports_invalidate_by_prefix() -> None:
    """invalidate_by_prefix is exported from cache.l2 module."""
    assert hasattr(l2_module, "invalidate_by_prefix")
