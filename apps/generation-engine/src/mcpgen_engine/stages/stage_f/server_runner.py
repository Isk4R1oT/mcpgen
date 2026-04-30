"""F3 wrangler dev --local subprocess management (CONTEXT D-18, D-51).

Spawns the generated tenant Worker via ``wrangler dev --local`` so the F3 test
agent (real Sonnet) can drive it over JSON-RPC HTTP. Miniflare 3 (workerd) is
the local emulation surface — it serves the MCP transport without a real
Cloudflare deploy.

Subprocess gotchas (RESEARCH §5.4):

1. **Process-group SIGTERM cascade** — Node's ``wrangler dev`` spawns child
   Miniflare workerd processes. ``proc.terminate()`` does NOT always cascade.
   We open the subprocess with ``start_new_session=True`` (POSIX setsid) and
   send ``SIGTERM`` to the process group. After the 5s grace window any
   surviving processes are sent ``SIGKILL``.
2. **Startup latency** - Cold start ~3-5s with Phase 4 D-39 pre-warmed
   ``packages/codegen-templates/node_modules``; budget allows 30s.
3. **Port collisions** - ``socket.bind(('', 0))`` returns a free port but the
   bind/release race can lose it. We retry up to ``_PORT_RETRY_MAX`` times,
   re-discovering a port for each attempt.
4. **MCPGEN_F3_TEST=1 scoping** (D-51) - the bypass flag for
   ``hostHeaderValidation`` MUST live ONLY inside the wrangler subprocess env.
   We assert post-context that the caller process env is untouched
   (security invariant - never trust env propagation; verify it).
5. **Health check** - ``wrangler dev`` does NOT expose ``/health``; we poll
   the MCP transport directly via JSON-RPC ``tools/list`` POST. First 200
   means MCP is up.

DO NOT collapse this module with the F1 ``ts_compile`` subprocess — F1's
``tsc --noEmit`` is single-shot and short-lived. F3's wrangler dev is a
long-running server that must survive 10 sequential agent turns per task
times 10 tasks per server.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import socket
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

# Knobs are module-level constants so tests + retry orchestration can read
# them without importing private callables.
_STARTUP_TIMEOUT: float = 30.0  # seconds — wrangler cold start budget
_CLEANUP_TIMEOUT: float = 5.0  # seconds — SIGTERM → SIGKILL grace window
_PORT_RETRY_MAX: int = 3  # port-collision attempts before giving up


def _find_free_port() -> int:
    """Bind a transient socket on 127.0.0.1:0 to discover a free port.

    Small race window between bind/release and subprocess listen — Phase 5
    accepts retry-on-conflict instead of holding the socket open
    (RESEARCH §5.4 #3 — race window <100ms in practice).
    """
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


async def _wait_until_ready(server_url: str, timeout_seconds: float) -> None:
    """Poll ``tools/list`` JSON-RPC until 200 response or deadline.

    Raises ``TimeoutError`` when the deadline is exceeded — caller is expected
    to terminate the subprocess and either retry on a new port or give up.
    """
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    headers = {
        "Content-Type": "application/json",
        # MCP Streamable HTTP requires both content types in Accept.
        "Accept": "application/json, text/event-stream",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, connect=2.0)) as client:
        while asyncio.get_event_loop().time() < deadline:
            try:
                resp = await client.post(server_url, json=body, headers=headers)
                if resp.status_code == 200:
                    return
            except (httpx.ConnectError, httpx.ReadError, httpx.TimeoutException):
                # Server not yet listening — retry after a short pause.
                pass
            await asyncio.sleep(0.5)
    raise TimeoutError(f"Server at {server_url} not ready within {timeout_seconds}s")


async def _kill_process_group(proc: asyncio.subprocess.Process) -> None:
    """Send SIGTERM to the subprocess group; escalate to SIGKILL on timeout.

    Cascades to Miniflare workerd children when subprocess was opened with
    ``start_new_session=True`` (POSIX setsid). On platforms without
    ``os.killpg`` (Windows), falls back to ``proc.terminate()``.
    """
    if proc.returncode is not None:
        return
    try:
        if hasattr(os, "killpg") and hasattr(os, "getpgid"):
            try:
                pgid = os.getpgid(proc.pid)
                os.killpg(pgid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                # Subprocess gone or pgroup not reachable; fall back to direct terminate.
                proc.terminate()
        else:
            proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=_CLEANUP_TIMEOUT)
        except TimeoutError:
            # Escalate to SIGKILL — group first, then proc.
            if hasattr(os, "killpg") and hasattr(os, "getpgid"):
                try:
                    pgid = os.getpgid(proc.pid)
                    os.killpg(pgid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    proc.kill()
            else:
                proc.kill()
            await proc.wait()
    except ProcessLookupError:
        # Subprocess vanished mid-cleanup — nothing to do.
        return


@asynccontextmanager
async def spawn_server(generated_dir: Path) -> AsyncIterator[str]:
    """Spawn ``wrangler dev --local --port {N}`` and yield the server URL.

    D-51 invariant: ``MCPGEN_F3_TEST=1`` lives ONLY in the subprocess env,
    NEVER in the caller process env. We pass a fresh dict (``{**os.environ,
    "MCPGEN_F3_TEST": "1"}``) to ``create_subprocess_exec`` and assert the
    caller env stays unchanged on context exit.

    Retries up to ``_PORT_RETRY_MAX`` on startup timeout / OSError; each
    retry picks a fresh port to dodge collisions.

    Args:
        generated_dir: Path to the generated tenant Worker project (must
            contain ``package.json`` + ``wrangler.toml``).

    Yields:
        The base URL of the running server (``http://127.0.0.1:{port}``).

    Raises:
        RuntimeError: All ``_PORT_RETRY_MAX`` spawn attempts failed.
    """
    # Subprocess-only env — caller process env unchanged.
    env_for_subprocess = {**os.environ, "MCPGEN_F3_TEST": "1"}
    last_error: Exception | None = None
    proc: asyncio.subprocess.Process | None = None
    server_url: str | None = None

    for _attempt in range(_PORT_RETRY_MAX):
        port = _find_free_port()
        candidate_url = f"http://127.0.0.1:{port}"
        try:
            proc = await asyncio.create_subprocess_exec(
                "npx",
                "wrangler",
                "dev",
                "--local",
                "--port",
                str(port),
                "--ip",
                "127.0.0.1",
                cwd=str(generated_dir),
                env=env_for_subprocess,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                # POSIX-only: setsid → new process group for cascade kill.
                start_new_session=True,
            )
        except OSError as exc:
            last_error = exc
            continue

        try:
            await _wait_until_ready(candidate_url, _STARTUP_TIMEOUT)
            server_url = candidate_url
            break
        except TimeoutError as exc:
            await _kill_process_group(proc)
            last_error = exc
            proc = None
            continue

    if proc is None or server_url is None:
        raise RuntimeError(
            f"Failed to spawn wrangler after {_PORT_RETRY_MAX} attempts: {last_error}"
        )

    try:
        yield server_url
    finally:
        await _kill_process_group(proc)
        # D-51 invariant — verify caller env never picked up the bypass flag.
        # Assertion (not log) so a future refactor that accidentally mutates
        # os.environ trips a hard error in tests + production.
        assert (
            "MCPGEN_F3_TEST" not in os.environ
        ), "DNS bypass flag leaked to parent process — security violation (D-51)"
