"""Wave-0 paired MCP handshake e2e test — closes structural gate gap (D-1 + D-2 + D-3).

Renders a synthetic 3-tool fixture in dev-local mode, spawns ``wrangler dev --local``,
and drives a real MCP handshake (``initialize`` → ``tools/list``) to assert:

- D-1: ``tools/list`` returns ≥1 tool (not empty — empty = D-1 reproduced).
- D-2: A second ``initialize`` + ``tools/list`` succeeds independently (stateless mode).
- D-3: Rendered ``src/config.ts`` does NOT contain ``{tenant_short_id}`` literal.

Marker: ``@pytest.mark.requires_node_modules`` — collected only when
``packages/codegen-templates/node_modules`` is pre-warmed (wrangler binary present).

Plan: 04-14 Task 1 (RED) + Task 3 (GREEN).
"""

from __future__ import annotations

import asyncio
import json
import socket
from pathlib import Path
from typing import cast

import httpx
import pytest
from mcpgen_ir.types import FinalTool, Pass0Output, Pass1Output, Pass5Output, RawIR

from mcpgen_engine.stages.stage_e import run as stage_e_run

# ──────────────────────────────── helpers ─────────────────────────────────────


def _free_port() -> int:
    """Allocate a free TCP port, release it, return the port number.

    Small race-window trade-off: wrangler will fail-fast on EADDRINUSE if hit.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _make_final_tool(
    name: str,
    tool_type: str,
    source_endpoints: list[str],
) -> dict[str, object]:
    return {
        "name": name,
        "type": tool_type,
        "description": {
            "purpose": f"Handshake e2e fixture tool '{name}' — not used at runtime.",
            "when_to_use": [f"When testing {name} in the handshake e2e test."],
            "limitations": ["Synthetic test fixture."],
            "parameter_overview": "Single `query` string parameter — the search query text.",
        },
        "inputSchema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Query."}},
            "required": ["query"],
            "additionalProperties": False,
        },
        "outputSchema": {
            "type": "object",
            "properties": {"id": {"type": "string"}},
            "required": ["id"],
        },
        "annotations": {
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
        "response_config": {
            "pagination": None,
            "field_filtering": None,
            "truncation": {
                "threshold_tokens": 10000,
                "guidance_template": "Synthetic guidance.",
            },
            "has_response_format_param": False,
        },
        "source_endpoints": source_endpoints,
    }


def _synth_3_tool_fixture() -> list[FinalTool]:
    """Minimal 3-tool list: search + fetch + charges_capture (action)."""
    return [
        FinalTool.model_validate(_make_final_tool("search", "universal", ["GET /v1/charges"])),
        FinalTool.model_validate(_make_final_tool("fetch", "universal", ["GET /v1/charges/{id}"])),
        FinalTool.model_validate(
            _make_final_tool("charges_capture", "action", ["POST /v1/charges/{id}/capture"])
        ),
    ]


def _synth_pass_0() -> Pass0Output:
    return Pass0Output.model_validate(
        {
            "tool_plans": [
                {
                    "name": "search",
                    "category": "search",
                    "source_endpoints": ["GET /v1/charges"],
                    "rationale": "Universal search.",
                }
            ],
            "dropped_endpoints": [],
            "composite_candidates": [],
            "auth_requirements": {
                "GET /v1/charges": [
                    {
                        "scheme": "http_bearer",
                        "recommended_mode": "passthrough",
                        "notes": None,
                    }
                ]
            },
            "target_complexity": "standard",
            "prompt_injection_warnings": [],
        }
    )


def _synth_pass_1() -> Pass1Output:
    return Pass1Output.model_validate(
        {
            "tools": [
                {
                    "name": "search",
                    "type": "universal",
                    "source_endpoints": ["GET /v1/charges"],
                },
                {
                    "name": "fetch",
                    "type": "universal",
                    "source_endpoints": ["GET /v1/charges/{id}"],
                },
                {
                    "name": "charges_capture",
                    "type": "action",
                    "source_endpoints": ["POST /v1/charges/{id}/capture"],
                },
            ],
            "routing": {
                "smart_id": {
                    "format": "stripe:{type}:{collection}:{identifier}",
                    "types": ["object"],
                    "collections": ["Charge"],
                },
                "rules": [
                    {
                        "universal_tool": "search",
                        "target_endpoint": "GET /v1/charges",
                        "params_mapping": {"query": "query"},
                    },
                    {
                        "universal_tool": "fetch",
                        "target_endpoint": "GET /v1/charges/{id}",
                        "params_mapping": {"id": "id"},
                    },
                ],
            },
            "workflows": [],
            "coverage_pct": 100.0,
            "coverage_proof": [
                {
                    "endpoint_id": "GET /v1/charges",
                    "mapped_to_universal_tool": "search",
                    "sample_invocation": {
                        "url": "https://api.stripe.com/v1/charges",
                        "method": "GET",
                        "params": {},
                    },
                }
            ],
        }
    )


def _synth_pass_5() -> Pass5Output:
    return Pass5Output.model_validate(
        {"tools": [], "flags": {"server_pagination_strategy": "cursor"}}
    )


def _synth_raw_ir() -> RawIR:
    return RawIR.model_validate(
        {
            "spec_format": "openapi-3.0",
            "spec_hash": "a" * 64,
            "endpoints": [
                {
                    "method": "GET",
                    "path": "/v1/charges",
                    "operation_id": "ListCharges",
                    "summary": "List charges",
                    "description": None,
                    "parameters": [],
                    "request_body": None,
                    "responses": {"200": {"description": "OK"}},
                    "tags": [],
                    "deprecated": False,
                }
            ],
            "schemas": {},
            "security_schemes": {},
            "dependency_graph": {},
        }
    )


def _send_jsonrpc(
    client: httpx.Client,
    port: int,
    method: str,
    params: dict[str, object] | None = None,
    request_id: int = 1,
) -> dict[str, object]:
    """Send a single JSON-RPC 2.0 request to the MCP server's /mcp endpoint."""
    payload: dict[str, object] = {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
    }
    if params is not None:
        payload["params"] = params
    resp = client.post(
        f"http://127.0.0.1:{port}/mcp",
        json=payload,
        headers={
            "Content-Type": "application/json",
            # MCP SDK Streamable HTTP transport requires both media types in Accept.
            # Without this the SDK returns -32000 "Not Acceptable".
            "Accept": "application/json, text/event-stream",
            # DNS-rebinding protection (enableDnsRebindingProtection=true in
            # server.ts) validates the Host header against ALLOWED_HOSTS.
            # "localhost" is in ALLOWED_HOSTS for dev-local builds (D-3).
            # Without this override, httpx sends "127.0.0.1:<port>" which only
            # matches when port==8787 (the only IP:port entry in ALLOWED_HOSTS).
            "Host": "localhost",
            # dev-local auth: dispatch Worker is absent; passthrough middleware
            # only checks header presence (not value). Synthetic dev credentials.
            "Authorization": "Bearer dev-local-token",
            "X-Upstream-Auth": "dev-local-upstream-key",
        },
    )
    content_type = resp.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        # SDK chose SSE transport. Parse the first `data:` line from SSE stream.
        # Format: "event: message\ndata: <json>\n\n"
        for line in resp.text.splitlines():
            if line.startswith("data:"):
                return cast(dict[str, object], json.loads(line[len("data:") :].strip()))
        raise ValueError(f"No data: line in SSE response: {resp.text!r}")
    return cast(dict[str, object], resp.json())


# ──────────────────────────────── tests ───────────────────────────────────────


@pytest.mark.requires_node_modules
@pytest.mark.asyncio
async def test_dev_local_handshake_basic(tmp_path: Path) -> None:
    """Wave-0 paired MCP handshake test.

    Renders a 3-tool fixture in dev-local mode, boots wrangler dev --local,
    and drives:
      1. initialize  → protocolVersion == "2025-06-18"
      2. tools/list  → len(result.tools) >= 1  (closes D-1)
      3. initialize  → second call succeeds fresh (closes D-2 stateless mode)
      4. tools/list  → still returns ≥1 tool (independence confirmed)

    Template content assertions:
      5. src/server.ts contains "registerAllTools(server)"  (D-1 guard)
      6. src/server.ts contains "sessionIdGenerator: undefined"  (D-2 guard)
      7. src/config.ts TS string literals do NOT contain "{tenant_short_id}"  (D-3 guard)
    """
    final_tools = _synth_3_tool_fixture()
    output_dir = tmp_path / "handshake-e2e"

    # Render the generated Worker in dev-local mode.
    await stage_e_run(
        final_tools=final_tools,
        pass_5_output=_synth_pass_5(),
        pass_4_output=None,
        pass_3_output=None,
        pass_2_output=None,
        pass_1_output=_synth_pass_1(),
        pass_0_output=_synth_pass_0(),
        raw_ir=_synth_raw_ir(),
        output_dir=output_dir,
        engine_version="0.1.0",
        spec_url="https://api.stripe.com/openapi/spec3.json",
        spec_slug="stripe",
        dev_local=True,
    )

    # ── Template content assertions (fast, before spawning wrangler) ──────
    server_ts = (output_dir / "src" / "server.ts").read_text(encoding="utf-8")
    assert (
        "registerAllTools(server)" in server_ts
    ), "D-1 regression: server.ts does not call registerAllTools(server)"
    assert (
        "sessionIdGenerator: undefined" in server_ts
    ), "D-2 regression: server.ts does not use stateless transport mode"

    config_ts = (output_dir / "src" / "config.ts").read_text(encoding="utf-8")
    # D-3: the placeholder must not appear in TS string literal values.
    # Comments referencing the placeholder by name are expected and acceptable.
    assert '"{tenant_short_id}-stripe.mcpgen.dev"' not in config_ts, (
        "D-3 regression: config.ts still contains {tenant_short_id}"
        " placeholder in TS string literal (dev-local mode)"
    )

    # ── Boot wrangler dev --local ─────────────────────────────────────────
    port = _free_port()
    proc = await asyncio.create_subprocess_exec(
        "npx",
        "wrangler@4",
        "dev",
        "--local",
        f"--port={port}",
        cwd=str(output_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        # Poll until wrangler is up (max 60s). Any HTTP response means ready:
        # - 405: no matching route (normal for GET /)
        # - 401: auth middleware active (passthrough mode requires API key)
        # - 400/404/200: other valid Worker responses
        wrangler_ready = False
        async with httpx.AsyncClient(timeout=2.0) as poll_client:
            for _ in range(60):
                try:
                    r = await poll_client.get(f"http://127.0.0.1:{port}/")
                    if r.status_code in (200, 400, 401, 404, 405):
                        wrangler_ready = True
                        break
                except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout):
                    pass
                await asyncio.sleep(1)

        assert wrangler_ready, f"wrangler dev did not become ready on port {port} within 60s"

        # ── MCP handshake round 1 ─────────────────────────────────────────
        with httpx.Client(timeout=10.0) as client:
            # 1. initialize
            init_resp = _send_jsonrpc(
                client,
                port,
                "initialize",
                params={
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "test-client", "version": "0.0.1"},
                },
                request_id=1,
            )
            assert "result" in init_resp, f"initialize failed: {init_resp}"
            init_result = cast(dict[str, object], init_resp["result"])
            assert (
                init_result["protocolVersion"] == "2025-06-18"
            ), f"unexpected protocolVersion: {init_result.get('protocolVersion')}"

            # 2. tools/list  — D-1 structural assertion
            list_resp = _send_jsonrpc(client, port, "tools/list", request_id=2)
            assert "result" in list_resp, f"tools/list failed: {list_resp}"
            list_result = cast(dict[str, object], list_resp["result"])
            tools = cast(list[dict[str, object]], list_result.get("tools", []))
            assert len(tools) >= 1, (
                f"D-1 reproduced: tools/list returned empty tools array. "
                f"Full response: {json.dumps(list_resp, indent=2)}"
            )
            # D-4 closure: every tool must have non-null outputSchema after
            # Plan 04-15 migrates templates to server.registerTool().
            # This closes the structural gate-gap at minimum cost — same
            # wrangler spawn, no extra process needed (B-6 from CHECK-FINDINGS).
            for t in tools:
                assert t.get("outputSchema") is not None, (
                    f"D-4 regression: tool {t.get('name')!r} missing outputSchema "
                    "in tools/list response (Plan 04-15 registerTool migration needed)"
                )

            # ── MCP handshake round 2 (stateless mode assertion — D-2) ────
            # A new initialize call MUST succeed without carrying over state
            # from round 1.  In stateful (broken) mode this would fail with
            # "Server not initialized" because the transport instance is gone.
            init2_resp = _send_jsonrpc(
                client,
                port,
                "initialize",
                params={
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "test-client-2", "version": "0.0.1"},
                },
                request_id=3,
            )
            assert "result" in init2_resp, (
                f"D-2 reproduced: second initialize failed. "
                f"Full response: {json.dumps(init2_resp, indent=2)}"
            )

            # 4. tools/list round 2 — independence from round 1
            list2_resp = _send_jsonrpc(client, port, "tools/list", request_id=4)
            assert "result" in list2_resp, f"tools/list (round 2) failed: {list2_resp}"
            list2_result = cast(dict[str, object], list2_resp["result"])
            tools2 = cast(list[dict[str, object]], list2_result.get("tools", []))
            assert (
                len(tools2) >= 1
            ), f"tools/list round 2 returned empty tools array: {json.dumps(list2_resp, indent=2)}"
            # D-4 closure round 2 — same assertion, independence confirmed.
            for t in tools2:
                assert t.get("outputSchema") is not None, (
                    f"D-4 regression (round 2): tool {t.get('name')!r} missing "
                    "outputSchema in tools/list response"
                )

    finally:
        try:
            proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=5)
        except (TimeoutError, ProcessLookupError):
            proc.kill()
