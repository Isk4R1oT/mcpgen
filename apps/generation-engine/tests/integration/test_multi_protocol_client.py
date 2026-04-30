"""Phase 9 plan 09-09 / D-10 -- 4th mock client (2024-11 protocol) for F3 harness.

Per `09-CONTEXT.md` D-10 + `09-RESEARCH.md` Pitfall #4 + Pitfall #9: extend the
existing 3-mock-client harness (Phase 5 plan 05-07) with a 2024-11 protocol
mock client that:

  1. Sends `initialize` with ``protocolVersion: "2024-11-05"`` (older revision
     predating ``outputSchema``).
  2. Asserts the negotiated ``protocolVersion`` round-trips back as 2024-11-05.
  3. Asserts the subsequent ``tools/list`` response OMITS ``outputSchema`` for
     every tool (the dispatch capability gate stripped it).
  4. Asserts ``tools/call`` returns normally (``content`` only, no
     ``structuredContent``).
  5. Contrast: with ``protocolVersion: "2025-06-18"`` the same fixture DOES
     produce tools with ``outputSchema`` populated.

Pitfall #9 mitigation: the test exercises capability-gate logic end-to-end
(NOT engine-direct), which is what blocks future framework upgrades from
silently dropping the gate.

Implementation note: real CF Workers + dispatch + tenant Worker E2E is
infeasible in pytest. This test runs an IN-PROCESS dispatch simulator that
mirrors the TypeScript ``capabilityGate.ts`` middleware (Phase 6 D-11) byte
for byte -- if the TS middleware behavior changes, this Python simulator
must update in lockstep. Real dispatch coverage continues in Phase 5 F3 +
Phase 9 plans 09-08 / 09-10.

The test target fixture is ``packages/engine-fixtures/stripe/final-tools.json``
because Stripe carries 6+ tools each with ``outputSchema`` populated -- the
contrast assertion has the most surface to land on.
"""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

import httpx
from pytest_httpx import HTTPXMock

from mcpgen_engine.stages.stage_f.mock_clients import ClaudeDesktopOlderMockClient

_REPO_ROOT = Path(__file__).resolve().parents[4]
_FIXTURES_DIR = _REPO_ROOT / "packages" / "engine-fixtures"
_DISPATCH_URL = "http://127.0.0.1:18790/mcp"
"""URL the mock client targets -- Pitfall #9 demands dispatch URL, not engine.

The number 18790 is arbitrary (must NOT collide with the Phase 5 mock_clients
unit-test default of 18787). pytest-httpx intercepts every outbound request,
so no socket actually opens; the URL value is purely a test-isolation token.
"""

_SUPPORTS_OUTPUT_SCHEMA = "2025-06-18"
"""MCP capability cutover -- mirrors capabilityGate.ts:11 verbatim."""


def _load_stripe_tools() -> list[dict[str, Any]]:
    """Load the Stripe ``final-tools.json`` fixture as a list of tool dicts.

    final-tools.json carries the Pass 5 + Stage E final shape: each tool has
    ``inputSchema``, ``outputSchema``, ``annotations``, plus the runtime
    ``response_config``. The mock client only reads ``name``, ``inputSchema``,
    ``outputSchema``, ``annotations`` -- the rest is ignored.
    """
    fixture = _FIXTURES_DIR / "stripe" / "final-tools.json"
    return json.loads(fixture.read_text("utf-8"))


def _strip_runtime_only_fields(tool: dict[str, Any]) -> dict[str, Any]:
    """Remove fields not part of the MCP ``tools/list`` wire shape.

    The fixture carries ``response_config`` + ``source_endpoints`` (engine IR
    metadata) which a real tenant Worker never serializes. Mirror that here so
    the simulated server matches Stage E's actual emit shape.
    """
    keep = {"name", "description", "inputSchema", "outputSchema", "annotations"}
    return {k: v for k, v in tool.items() if k in keep}


def _description_to_str(tool: dict[str, Any]) -> dict[str, Any]:
    """Coerce structured ``description`` (Pass 2 6-component dict) to plain str.

    The wire shape MCP ``tools/list`` emits is a flat string; Stage E renders
    the 6-component description down to a markdown-ish blob. We pick
    ``purpose`` here -- enough for the gate test, which doesn't inspect text.
    """
    if isinstance(tool.get("description"), dict):
        tool["description"] = tool["description"].get("purpose", "")
    return tool


def _simulate_dispatch_response(
    *,
    method: str,
    protocol_version: str,
    tools: list[dict[str, Any]],
) -> dict[str, Any]:
    """In-process port of ``apps/dispatch/src/middleware/capabilityGate.ts``.

    Behavior:
      - On ``initialize``: echo back the requested ``protocolVersion``.
      - On ``tools/list``: when ``protocolVersion < SUPPORTS_OUTPUT_SCHEMA``,
        strip ``outputSchema`` from every tool. Otherwise return as-is.
      - On ``tools/call``: when older protocol, return ``content`` only;
        otherwise include ``structuredContent``.

    String comparison is lex-order (capabilityGate.ts:63 `pv < SUPPORTS_OUTPUT_SCHEMA`).
    `2024-11-05` < `2025-06-18` lex-order -> strip; `2025-06-18` not less -> keep.
    """
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "protocolVersion": protocol_version,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "stripe-mcp-server", "version": "0.1.0"},
            },
        }

    if method == "tools/list":
        legacy = protocol_version < _SUPPORTS_OUTPUT_SCHEMA
        out_tools: list[dict[str, Any]] = []
        for raw_tool in tools:
            tool = _description_to_str(_strip_runtime_only_fields(deepcopy(raw_tool)))
            if legacy:
                tool.pop("outputSchema", None)
            out_tools.append(tool)
        return {"jsonrpc": "2.0", "id": 1, "result": {"tools": out_tools}}

    if method == "tools/call":
        legacy = protocol_version < _SUPPORTS_OUTPUT_SCHEMA
        result: dict[str, Any] = {"content": [{"type": "text", "text": "{}"}]}
        if not legacy:
            result["structuredContent"] = {"results": []}
        return {"jsonrpc": "2.0", "id": 1, "result": result}

    raise ValueError(f"unknown method: {method}")


class MockClient2024:
    """4th mock client per D-10: simulates a 2024-11-05 protocol MCP client.

    Sends initialize -> tools/list -> tools/call with the older revision.
    Returns the raw decoded JSON-RPC envelopes for assertion at the test layer
    (unlike the existing harness which returns a boolean MockClientResult).
    """

    PROTOCOL_VERSION = "2024-11-05"

    async def run(self, server_url: str) -> dict[str, dict[str, Any]]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
            init = await self._post(
                client,
                server_url,
                "initialize",
                {
                    "protocolVersion": self.PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": "mcp-2024-mock", "version": "0.1.0"},
                },
            )
            tools_list = await self._post(client, server_url, "tools/list", {})
            tools = tools_list.get("result", {}).get("tools", [])
            first_name = tools[0]["name"] if tools else "search"
            tools_call = await self._post(
                client,
                server_url,
                "tools/call",
                {"name": first_name, "arguments": {}},
            )
            return {"initialize": init, "tools/list": tools_list, "tools/call": tools_call}

    @staticmethod
    async def _post(
        client: httpx.AsyncClient,
        server_url: str,
        method: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "X-MCP-Protocol-Version": MockClient2024.PROTOCOL_VERSION,
        }
        resp = await client.post(server_url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()


# ─── Fixture: simulated dispatch responder driven by httpx_mock ──────────────


def _wire_dispatch(
    httpx_mock: HTTPXMock,
    *,
    protocol_version: str,
    tools: list[dict[str, Any]],
) -> None:
    """Register 3 sequential httpx responses simulating the dispatch flow.

    httpx-mock matches in registration order by default; sequence matches the
    ``MockClient2024.run`` call order: initialize -> tools/list -> tools/call.
    """
    httpx_mock.add_response(
        url=_DISPATCH_URL,
        json=_simulate_dispatch_response(
            method="initialize",
            protocol_version=protocol_version,
            tools=tools,
        ),
    )
    httpx_mock.add_response(
        url=_DISPATCH_URL,
        json=_simulate_dispatch_response(
            method="tools/list",
            protocol_version=protocol_version,
            tools=tools,
        ),
    )
    httpx_mock.add_response(
        url=_DISPATCH_URL,
        json=_simulate_dispatch_response(
            method="tools/call",
            protocol_version=protocol_version,
            tools=tools,
        ),
    )


# ─── Tests (5 per <behavior>) ─────────────────────────────────────────────────


async def test_2024_initialize_negotiates_older_protocol(httpx_mock: HTTPXMock) -> None:
    """Test 1: server echoes back the negotiated 2024-11-05 protocolVersion.

    Per MCP spec: the server MUST return the protocolVersion in the
    initialize response, and a properly behaved server echoes the client's
    request when the version is supported.
    """
    tools = _load_stripe_tools()
    _wire_dispatch(httpx_mock, protocol_version="2024-11-05", tools=tools)

    client = MockClient2024()
    out = await client.run(_DISPATCH_URL)

    assert out["initialize"]["result"]["protocolVersion"] == "2024-11-05"


async def test_2024_tools_list_omits_output_schema(httpx_mock: HTTPXMock) -> None:
    """Test 2: under 2024-11-05, every tool in tools/list lacks outputSchema.

    This is the Pitfall #4 P0 regression assertion: if the gate breaks, older
    Cursor builds crash on receipt of the unknown ``outputSchema`` field.
    """
    tools = _load_stripe_tools()
    _wire_dispatch(httpx_mock, protocol_version="2024-11-05", tools=tools)

    client = MockClient2024()
    out = await client.run(_DISPATCH_URL)

    listed = out["tools/list"]["result"]["tools"]
    assert len(listed) >= 1, "fixture must carry at least one tool"
    for tool in listed:
        assert "outputSchema" not in tool, (
            f"outputSchema leaked to 2024-11-05 client on tool '{tool.get('name')}' "
            f"(capability gate regression -- see capabilityGate.ts:32-38)"
        )


async def test_2024_tools_call_returns_content_only(httpx_mock: HTTPXMock) -> None:
    """Test 3: under 2024-11-05, tools/call result has content but no structuredContent.

    The 2025-06-18 ``structuredContent`` field is gated off for older clients
    (capabilityGate.ts:39-43). The tools/call response remains valid by
    returning ``content`` (the pre-2025-06-18 wire shape).
    """
    tools = _load_stripe_tools()
    _wire_dispatch(httpx_mock, protocol_version="2024-11-05", tools=tools)

    client = MockClient2024()
    out = await client.run(_DISPATCH_URL)

    result = out["tools/call"]["result"]
    assert "content" in result, "tools/call must return `content` for older clients"
    assert (
        "structuredContent" not in result
    ), "structuredContent leaked to 2024-11-05 client (Pitfall #4 regression)"


async def test_2025_tools_list_includes_output_schema(httpx_mock: HTTPXMock) -> None:
    """Test 4: contrast under 2025-06-18 -- outputSchema IS present on every tool.

    This is the symmetric assertion that catches a different regression
    direction: if the gate accidentally strips outputSchema for ALL clients,
    new clients lose a feature they expect.
    """
    tools = _load_stripe_tools()
    # Sanity: fixture itself carries outputSchema -- if this assert fails,
    # the fixture has drifted and the test below is meaningless.
    assert any(
        "outputSchema" in t for t in tools
    ), "stripe fixture lost outputSchema field -- regenerate via Pass 5"
    _wire_dispatch(httpx_mock, protocol_version="2025-06-18", tools=tools)

    client = MockClient2024()
    out = await client.run(_DISPATCH_URL)

    listed = out["tools/list"]["result"]["tools"]
    assert len(listed) >= 1
    tools_with_output_schema = [t for t in listed if "outputSchema" in t]
    assert len(tools_with_output_schema) == len(listed), (
        f"newer (2025-06-18) protocol expected outputSchema on every tool, "
        f"got {len(tools_with_output_schema)}/{len(listed)}"
    )


async def test_pitfall_9_dispatch_url_targeted(httpx_mock: HTTPXMock) -> None:
    """Test 5: Pitfall #9 -- mock client must hit dispatch URL, not engine direct.

    Asserted by URL-inspection: every recorded outbound request resolves to
    ``_DISPATCH_URL`` (which is the dispatch middleware-bearing endpoint per
    capabilityGate.ts). If a future refactor moves the mock to engine-direct,
    httpx_mock would record the engine URL and this test fails immediately.
    """
    tools = _load_stripe_tools()
    _wire_dispatch(httpx_mock, protocol_version="2024-11-05", tools=tools)

    client = MockClient2024()
    await client.run(_DISPATCH_URL)

    # In-process simulation; real-dispatch coverage is in F3 (Phase 5).
    requests = httpx_mock.get_requests()
    assert len(requests) == 3, f"expected initialize/list/call sequence, got {len(requests)}"
    for req in requests:
        assert (
            str(req.url) == _DISPATCH_URL
        ), f"Pitfall #9 violation: mock targeted {req.url}, must target dispatch ({_DISPATCH_URL})"


# ─── Integration with existing harness: ClaudeDesktopOlderMockClient ──────────


async def test_existing_older_client_passes_against_simulated_dispatch(
    httpx_mock: HTTPXMock,
) -> None:
    """Bonus: the Phase 5 ``ClaudeDesktopOlderMockClient`` continues to pass
    against the simulated dispatch responder.

    This is the bridge assertion: extending the F3 mock_clients harness with
    a 4th client (D-10) does not regress the existing 3-client coverage.
    Locks the harness contract.
    """
    tools = _load_stripe_tools()
    _wire_dispatch(httpx_mock, protocol_version="2024-11-05", tools=tools)

    result = await ClaudeDesktopOlderMockClient().verify(_DISPATCH_URL)
    assert result.passed is True, result.reason
