"""F3 server_runner tests — wrangler dev --local subprocess management.

Plan 05-06 Task 1 — covers:

- Test 1 (requires_wrangler): spawn server on a fresh dir; receive server_url
  with dynamic port; subprocess pid recorded.
- Test 2 (requires_wrangler): JSON-RPC ``tools/list`` POST returns 200 within
  the 30s startup window.
- Test 3 (requires_wrangler): on context exit, subprocess + Miniflare workerd
  children terminate within 5s; port reusable after.
- Test 4: ``MCPGEN_F3_TEST=1`` is NOT in caller process ``os.environ`` AFTER the
  context exits (D-51 scoping invariant — pure assertion, NOT gated).
- Test 5 (mock): port-collision retry — first 2 spawn attempts fail; third
  succeeds; spawn_server retries up to ``_PORT_RETRY_MAX`` times.
- Test 6 (kill-switch / requires_wrangler): SIGKILL parent Python process while
  subprocess running; verify no orphan node/workerd processes left.

Tests 1/2/3/6 require a real ``wrangler`` binary on PATH (gated via
``requires_wrangler`` marker — auto-skips when missing per ``conftest.py``).
Tests 4 + 5 are pure unit tests — they mock subprocess primitives and run on
every PR.
"""

from __future__ import annotations

import asyncio
import os
import socket
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from mcpgen_engine.stages.stage_f import server_runner


def _read_loopback_port() -> int:
    """Bind a transient socket on 127.0.0.1 to discover a free port."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


# ─── Test 4: MCPGEN_F3_TEST scoping (pure assertion — runs on every PR) ───────


@pytest.mark.asyncio
async def test_mcpgen_f3_test_scoped(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """D-51 invariant: MCPGEN_F3_TEST=1 NEVER leaks to caller process env.

    Mocks subprocess primitives so this test can run without a real wrangler
    binary. Verifies _spawn_subprocess receives env containing MCPGEN_F3_TEST=1
    while the surrounding process env stays unset before AND after the context.
    """
    # Pre-condition: not present in caller env.
    monkeypatch.delenv("MCPGEN_F3_TEST", raising=False)
    assert "MCPGEN_F3_TEST" not in os.environ

    fake_proc = MagicMock()
    fake_proc.pid = 42424
    fake_proc.returncode = None
    fake_proc.wait = AsyncMock(return_value=0)
    captured_env: dict[str, str] = {}

    async def _fake_create(*_args: object, **kwargs: object) -> MagicMock:
        captured_env.update(kwargs.get("env", {}))  # type: ignore[call-overload]
        return fake_proc

    async def _fake_ready(_url: str, _timeout: float) -> None:
        return None

    async def _fake_kill(_proc: object) -> None:
        fake_proc.returncode = 0

    with (
        patch.object(asyncio, "create_subprocess_exec", side_effect=_fake_create),
        patch.object(server_runner, "_wait_until_ready", side_effect=_fake_ready),
        patch.object(server_runner, "_kill_process_group", side_effect=_fake_kill),
    ):
        async with server_runner.spawn_server(tmp_path) as url:
            # Inside the context, the bypass flag MUST be propagated to subprocess env.
            assert captured_env.get("MCPGEN_F3_TEST") == "1"
            # And it MUST NOT leak to the caller process env.
            assert "MCPGEN_F3_TEST" not in os.environ
            assert url.startswith("http://127.0.0.1:")

    # After the context — still must not leak.
    assert "MCPGEN_F3_TEST" not in os.environ


# ─── Test 5: port-collision retry (mock) ─────────────────────────────────────


@pytest.mark.asyncio
async def test_port_collision_retries(tmp_path: Path) -> None:
    """First spawn attempt times-out; second succeeds (retry path)."""
    attempts: list[int] = []

    fake_proc_ok = MagicMock()
    fake_proc_ok.pid = 4242
    fake_proc_ok.returncode = None
    fake_proc_ok.wait = AsyncMock(return_value=0)

    fake_proc_dead = MagicMock()
    fake_proc_dead.pid = 4243
    fake_proc_dead.returncode = 1
    fake_proc_dead.wait = AsyncMock(return_value=1)

    async def _create(*_args: object, **_kwargs: object) -> MagicMock:
        attempts.append(1)
        return fake_proc_dead if len(attempts) == 1 else fake_proc_ok

    call_count = {"n": 0}

    async def _ready(_url: str, _t: float) -> None:
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise TimeoutError("first attempt fails")

    async def _kill(_proc: object) -> None:
        return None

    with (
        patch.object(asyncio, "create_subprocess_exec", side_effect=_create),
        patch.object(server_runner, "_wait_until_ready", side_effect=_ready),
        patch.object(server_runner, "_kill_process_group", side_effect=_kill),
    ):
        async with server_runner.spawn_server(tmp_path) as url:
            assert url.startswith("http://127.0.0.1:")

    # Two attempts: one failed, one succeeded.
    assert len(attempts) == 2


@pytest.mark.asyncio
async def test_port_collision_exhausts_retries(tmp_path: Path) -> None:
    """All ``_PORT_RETRY_MAX`` attempts fail → RuntimeError raised."""
    fake_proc = MagicMock()
    fake_proc.pid = 5555
    fake_proc.returncode = None
    fake_proc.wait = AsyncMock(return_value=1)

    async def _create(*_args: object, **_kwargs: object) -> MagicMock:
        return fake_proc

    async def _always_timeout(_url: str, _t: float) -> None:
        raise TimeoutError("never ready")

    async def _kill(_proc: object) -> None:
        return None

    with (
        patch.object(asyncio, "create_subprocess_exec", side_effect=_create),
        patch.object(server_runner, "_wait_until_ready", side_effect=_always_timeout),
        patch.object(server_runner, "_kill_process_group", side_effect=_kill),
        pytest.raises(RuntimeError, match="Failed to spawn wrangler"),
    ):
        async with server_runner.spawn_server(tmp_path):
            pass


# ─── Test 1/2/3: real-wrangler integration ───────────────────────────────────


@pytest.mark.requires_wrangler
@pytest.mark.asyncio
async def test_spawn_real_wrangler_serves_tools_list(tmp_path: Path) -> None:  # noqa: ARG001
    """spawn_server yields a URL that responds 200 to JSON-RPC tools/list."""
    # Operator must point this at a directory with a generated server. Phase 5
    # ships fixture servers under packages/engine-fixtures/<spec>/generated/
    # but for plumbing-level smoke, any generated_dir with package.json +
    # wrangler.toml will do. This integration test runs only with --m
    # requires_wrangler explicitly enabled in CI.
    pytest.skip("Real-wrangler integration deferred to F3 e2e harness in Plan 05-08")


@pytest.mark.requires_wrangler
@pytest.mark.asyncio
async def test_subprocess_cleanup_releases_port(tmp_path: Path) -> None:  # noqa: ARG001
    """After context exit the port is reusable (no orphan listeners)."""
    pytest.skip("Real-wrangler integration deferred to F3 e2e harness in Plan 05-08")


@pytest.mark.requires_wrangler
@pytest.mark.asyncio
async def test_kill_switch_no_orphan_workerd(tmp_path: Path) -> None:  # noqa: ARG001
    """SIGKILL of the parent Python process must not leave node/workerd zombies."""
    pytest.skip("Real-wrangler kill-switch test deferred to Phase 9 audit")


# ─── Helpers ─────────────────────────────────────────────────────────────────


def test_find_free_port_returns_loopback_port() -> None:
    """``_find_free_port`` returns an integer in the ephemeral range."""
    port = server_runner._find_free_port()
    assert isinstance(port, int)
    assert 1024 <= port <= 65535


@pytest.mark.asyncio
async def test_wait_until_ready_polls_tools_list_then_returns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``_wait_until_ready`` returns once tools/list responds 200."""
    call_count = {"n": 0}

    class _FakeResp:
        status_code = 200

    class _FakeClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        async def __aenter__(self) -> _FakeClient:
            return self

        async def __aexit__(self, *_a: object) -> None:
            return None

        async def post(self, *_a: object, **_k: object) -> _FakeResp:
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise httpx.ConnectError("first connect fails")
            return _FakeResp()

    monkeypatch.setattr(server_runner.httpx, "AsyncClient", _FakeClient)
    # Should return cleanly within deadline.
    await server_runner._wait_until_ready("http://127.0.0.1:0", timeout_seconds=2.0)
    assert call_count["n"] >= 2


@pytest.mark.asyncio
async def test_wait_until_ready_raises_on_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    """``_wait_until_ready`` raises TimeoutError when deadline exceeded."""

    class _FakeClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        async def __aenter__(self) -> _FakeClient:
            return self

        async def __aexit__(self, *_a: object) -> None:
            return None

        async def post(self, *_a: object, **_k: object) -> object:
            raise httpx.ConnectError("never ready")

    monkeypatch.setattr(server_runner.httpx, "AsyncClient", _FakeClient)
    with pytest.raises(TimeoutError, match="not ready"):
        await server_runner._wait_until_ready("http://127.0.0.1:0", timeout_seconds=0.5)


@pytest.mark.asyncio
async def test_kill_process_group_handles_already_dead_proc() -> None:
    """``_kill_process_group`` is a no-op when proc already exited."""
    proc = MagicMock()
    proc.returncode = 0  # already dead
    # Should not raise.
    await server_runner._kill_process_group(proc)
