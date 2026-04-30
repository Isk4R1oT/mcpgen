"""3 mock MCP clients run BEFORE F3 agent harness (CONTEXT D-21).

These are STRUCTURAL approximations -- Cursor / Claude Desktop / ChatGPT internal
logic is opaque (closed-source IDEs); Phase 9 owns real-client smoke. Phase 5
verifies the wire-format compliance that REAL clients would key on.

Pitfalls mitigated:
  #4  -- older clients see ``outputSchema`` -> ``ClaudeDesktopOlderMockClient``
        verifies Phase 4 D-24 capability negotiation runtime.
  #31 -- Cursor read-only confirmation prompts -> ``CursorMockClient`` asserts
        all 4 annotations explicit + ``readOnlyHint=true`` on read tools +
        ``openWorldHint=true`` invariant.
  #32 -- ChatGPT Deep Research drift -> ``ChatGPTDeepResearchMockClient`` deep-
        equals tools/list ``search`` / ``fetch`` schemas against canonical
        fixtures shipped in ``packages/engine-fixtures/_canonical/`` (Plan 05-02).

CRITICAL: No LLM calls here -- pure JSON-RPC over httpx. Mock clients run in
parallel before the F3 agent harness so Pitfall #4 / #31 / #32 get caught for
~3 seconds of socket time, not a full $1-3 F3 agent run (CONTEXT D-21).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx


@dataclass(frozen=True)
class MockClientResult:
    """Outcome of a single mock client structural verification.

    ``client_name`` is one of ``cursor`` / ``claude_desktop_older`` /
    ``chatgpt_deep_research``. ``passed`` is False on any wire-format violation;
    ``reason`` is a short human string + ``details`` carries deep-diff data
    (e.g. drifted property names) for the retry orchestrator (Plan 05-08).
    """

    client_name: str
    passed: bool
    reason: str
    details: dict[str, Any]


async def _jsonrpc_request(
    server_url: str,
    method: str,
    params: dict[str, Any] | None,
    *,
    protocol_version: str,
    session_id: str | None,
) -> dict[str, Any]:
    """Single JSON-RPC POST + JSON parse.

    Mock clients are intentionally minimal -- no session lifecycle, no SSE
    streaming, no retries. The generated tenant Worker (Stage E) is the unit
    under test; if the response is malformed, surface it immediately.

    ``protocol_version`` is unused at the transport layer (servers infer it
    from the ``initialize`` payload), but tracked here so callers stay honest
    about which client identity they are simulating.
    """
    body: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params or {},
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "X-MCP-Protocol-Version": protocol_version,
    }
    if session_id is not None:
        headers["Mcp-Session-Id"] = session_id
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
        resp = await client.post(server_url, json=body, headers=headers)
        resp.raise_for_status()
        parsed: dict[str, Any] = resp.json()
        return parsed


@lru_cache(maxsize=1)
def _canonical_dir() -> Path:
    """Resolve ``packages/engine-fixtures/_canonical/`` relative to this file.

    Walks up from this module's path until ``packages/engine-fixtures/_canonical``
    appears -- works in worktrees and the main repo. Cached because hundreds of
    F3 invocations each run the same lookup.
    """
    path = Path(__file__).resolve()
    for _ in range(10):
        cand = path.parent / "packages" / "engine-fixtures" / "_canonical"
        if cand.exists():
            return cand
        path = path.parent
    raise FileNotFoundError(
        "packages/engine-fixtures/_canonical/ not found via parent walk; "
        "ChatGPTDeepResearchMockClient cannot verify search/fetch shapes."
    )


def _annotations_complete(annotations: dict[str, Any]) -> str | None:
    """Return the first missing annotation key, or None if all 4 are present."""
    for required in ("readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"):
        if required not in annotations:
            return required
    return None


class CursorMockClient:
    """Pitfall #31: read-only tools must NOT trigger Cursor confirmation prompts.

    Cursor's confirmation logic is opaque -- this client verifies the
    structural invariants per CONTEXT D-21: all 4 annotations explicit;
    ``openWorldHint=true`` (architectural invariant per Pass 4); read tools
    (``search``, ``fetch``, ``list_*``) marked ``readOnlyHint=true``. Real
    Cursor smoke ships in Phase 9.
    """

    async def verify(self, server_url: str) -> MockClientResult:
        await _jsonrpc_request(
            server_url,
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "cursor-mock", "version": "0.1.0"},
            },
            protocol_version="2025-06-18",
            session_id=None,
        )
        tools_resp = await _jsonrpc_request(
            server_url,
            "tools/list",
            {},
            protocol_version="2025-06-18",
            session_id=None,
        )
        for tool in tools_resp.get("result", {}).get("tools", []):
            ann = tool.get("annotations") or {}
            tool_name: str = tool.get("name", "")
            missing = _annotations_complete(ann)
            if missing is not None:
                return MockClientResult(
                    "cursor",
                    False,
                    f"missing annotation {missing}",
                    {"tool": tool_name, "missing": missing},
                )
            if ann.get("openWorldHint") is not True:
                return MockClientResult(
                    "cursor",
                    False,
                    "openWorldHint invariant violated (must be true)",
                    {"tool": tool_name, "actual": ann.get("openWorldHint")},
                )
            # Pitfall #31 trigger: a read tool not marked readOnlyHint=true
            # makes Cursor pop a "Approve?" prompt on every call.
            is_read_tool = tool_name in ("search", "fetch") or tool_name.startswith("list_")
            if is_read_tool and ann.get("readOnlyHint") is not True:
                return MockClientResult(
                    "cursor",
                    False,
                    "read tool not marked readOnlyHint",
                    {"tool": tool_name, "actual": ann.get("readOnlyHint")},
                )
        return MockClientResult("cursor", True, "OK", {})


class ClaudeDesktopOlderMockClient:
    """Pitfall #4: 2024-11-05 client must NOT see outputSchema or structuredContent.

    Older Claude Desktop clients ship with the MCP 2024-11-05 protocol revision
    which predates ``outputSchema`` (2025-06-18) and ``structuredContent``.
    Phase 4 D-24 ships server-side capability negotiation; this mock client
    asserts the runtime gate actually works -- by sending
    ``protocolVersion=2024-11-05`` during initialize and asserting the
    subsequent ``tools/list`` and ``tools/call`` responses are downgraded.
    """

    async def verify(self, server_url: str) -> MockClientResult:
        await _jsonrpc_request(
            server_url,
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "claude-desktop-older-mock", "version": "0.1.0"},
            },
            protocol_version="2024-11-05",
            session_id=None,
        )
        tools_resp = await _jsonrpc_request(
            server_url,
            "tools/list",
            {},
            protocol_version="2024-11-05",
            session_id=None,
        )
        tools = tools_resp.get("result", {}).get("tools", [])
        for tool in tools:
            if "outputSchema" in tool:
                return MockClientResult(
                    "claude_desktop_older",
                    False,
                    "outputSchema leaked to 2024-11-05 client",
                    {"tool": tool.get("name")},
                )
        # Spot-check ONE tool/call to verify structuredContent is absent. We
        # send empty arguments -- the upstream call may 4xx, but the transport
        # behavior (no structuredContent for older protocol) is what we test.
        if tools:
            first = tools[0]
            call_resp = await _jsonrpc_request(
                server_url,
                "tools/call",
                {"name": first.get("name"), "arguments": {}},
                protocol_version="2024-11-05",
                session_id=None,
            )
            result = call_resp.get("result") or {}
            if "structuredContent" in result:
                return MockClientResult(
                    "claude_desktop_older",
                    False,
                    "structuredContent leaked to 2024-11-05 client",
                    {"tool": first.get("name")},
                )
        return MockClientResult("claude_desktop_older", True, "OK", {})


class ChatGPTDeepResearchMockClient:
    """Pitfall #32: search/fetch must match canonical OpenAI shapes exactly.

    OpenAI ChatGPT Deep Research integration depends on exact-match
    ``search(query: string)`` + ``fetch(id: string)`` JSON Schemas. Any drift
    -- extra params, renamed keys, additional ``required`` -- breaks the
    integration. Plan 05-02 hand-shipped immutable canonical fixtures in
    ``packages/engine-fixtures/_canonical/``; this mock deep-equals the
    runtime tools/list response against them.

    Action-only APIs lacking ``search`` / ``fetch`` skip cleanly (no drift to
    catch). Drift -> ``MockClientResult(passed=False, details={missing,
    extra, retry_target})``; the retry orchestrator (Plan 05-08) maps the
    drift to a Pass 1 OR Pass 3 retry target.
    """

    async def verify(self, server_url: str) -> MockClientResult:
        await _jsonrpc_request(
            server_url,
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "chatgpt-deep-research-mock", "version": "0.1.0"},
            },
            protocol_version="2025-06-18",
            session_id=None,
        )
        canonical_dir = _canonical_dir()
        canonical_search = json.loads((canonical_dir / "search_signature.json").read_text())
        canonical_fetch = json.loads((canonical_dir / "fetch_signature.json").read_text())
        tools_resp = await _jsonrpc_request(
            server_url,
            "tools/list",
            {},
            protocol_version="2025-06-18",
            session_id=None,
        )
        tools = {t["name"]: t for t in tools_resp.get("result", {}).get("tools", [])}
        for tool_name, canonical, retry_target in (
            ("search", canonical_search, "pass_1"),
            ("fetch", canonical_fetch, "pass_1"),
        ):
            if tool_name not in tools:
                # Action-only API: no search/fetch -- nothing to verify.
                continue
            actual = tools[tool_name].get("inputSchema", {})
            if actual != canonical:
                canonical_keys = set(canonical.get("properties", {}))
                actual_keys = set(actual.get("properties", {}))
                diff = {
                    "missing": sorted(canonical_keys - actual_keys),
                    "extra": sorted(actual_keys - canonical_keys),
                    "retry_target": retry_target,
                }
                return MockClientResult(
                    "chatgpt_deep_research",
                    False,
                    f"{tool_name} input schema drift",
                    diff,
                )
        return MockClientResult("chatgpt_deep_research", True, "OK", {})
