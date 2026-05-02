"""Wave-0 paired outputSchema handshake e2e test — closes D-4 structural gap.

Renders the full Stripe fixture (9 tools with outputSchema) in dev-local mode,
spawns ``wrangler dev --local``, and drives a real MCP handshake
(``initialize`` → ``tools/list``) to assert:

- Every tool entry in ``tools/list`` has a non-null ``outputSchema`` field
  (the D-4 inverse assertion — closes the structural gate gap).
- Every ``outputSchema`` has ``type == "object"``.
- The ``fetch`` tool's ``outputSchema.properties`` keys match the Pass 5
  fixture's ``outputSchema.properties`` keys (end-to-end fidelity from
  Pass 5 → Stage E → wrangler-served tools/list response).

Marker: ``@pytest.mark.requires_node_modules`` — collected only when
``packages/codegen-templates/node_modules`` is pre-warmed (wrangler binary
present).

Plan: 04-15 Task 1 (RED) + Task 3 (GREEN).
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
# NOTE: These are INLINE-DUPLICATED verbatim from test_handshake_e2e.py per
# Plan 04-15 truth #9. DRY refactor (extract to handshake_helpers.py) is
# intentionally deferred — refactoring an existing passing test while landing a
# fix violates CLAUDE.md §Process "Keep changes minimal and related to the
# current request". Tracked here so future readers know it is intentional, not
# oversight.


def _free_port() -> int:
    """Allocate a free TCP port, release it, return the port number.

    Small race-window trade-off: wrangler will fail-fast on EADDRINUSE if hit.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


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
async def test_outputSchema_present_in_tools_list_for_stripe_fixture(
    tmp_path: Path,
) -> None:
    """Wave-0 outputSchema handshake test — D-4 inverse assertion.

    Renders the full Stripe fixture (9 tools with Pass 5 outputSchemas) in
    dev-local mode, boots wrangler dev --local, and asserts:

    1. fixture invariant: all 9 Stripe FinalTools have non-null outputSchema.
    2. Rendered fetch.ts contains ``server.registerTool(`` (migration verified).
    3. Rendered fetch.ts contains ``outputSchema`` literal.
    4. initialize → protocolVersion == "2025-06-18".
    5. tools/list → len(tools) == 9.
    6. EVERY tool entry has non-null outputSchema (D-4 assertion).
    7. EVERY outputSchema has type == "object".
    8. fetch tool's outputSchema.properties keys match the Pass 5 fixture.
    """
    # ── 1. Load full Stripe fixture set ───────────────────────────────────────
    # Path is relative to this test file: project root is 3 levels up from
    # tests/stages/stage_e/ → apps/generation-engine/tests/stages/stage_e/
    stripe_dir = Path(__file__).parents[5] / "packages" / "engine-fixtures" / "stripe"
    pass_0 = Pass0Output.model_validate(json.loads((stripe_dir / "pass-0-output.json").read_text()))
    pass_1 = Pass1Output.model_validate(json.loads((stripe_dir / "pass-1-output.json").read_text()))
    pass_5 = Pass5Output.model_validate(json.loads((stripe_dir / "pass-5-output.json").read_text()))
    raw_ir = RawIR.model_validate(json.loads((stripe_dir / "ir.json").read_text()))
    final_tools_raw = json.loads((stripe_dir / "final-tools.json").read_text())
    final_tools = [FinalTool.model_validate(t) for t in final_tools_raw]

    # Fixture invariant: all 9 Stripe tools must have outputSchema in the
    # fixture file before any rendering happens (I-2 from 04-15-CHECK-FINDINGS).
    assert all(
        t.outputSchema is not None for t in final_tools
    ), "fixture invariant broken: not all 9 Stripe FinalTools have outputSchema"

    # ── 2. Render with dev_local=True ─────────────────────────────────────────
    output_dir = tmp_path / "stripe-outputschema-e2e"
    await stage_e_run(
        final_tools=final_tools,
        pass_5_output=pass_5,
        pass_4_output=None,
        pass_3_output=None,
        pass_2_output=None,
        pass_1_output=pass_1,
        pass_0_output=pass_0,
        raw_ir=raw_ir,
        output_dir=output_dir,
        engine_version="0.1.0",
        spec_url="https://api.stripe.com/openapi/spec3.json",
        spec_slug="stripe",
        spec_servers=[],
        dev_local=True,
    )

    # ── 3. Template-content guard (cheap pre-checks before wrangler spawn) ────
    fetch_ts = (output_dir / "src" / "tools" / "fetch.ts").read_text(encoding="utf-8")
    assert (
        "server.registerTool(" in fetch_ts
    ), "D-4 regression: tool template uses deprecated server.tool() form"
    assert (
        "outputSchema" in fetch_ts
    ), "D-4 regression: outputSchema not embedded in tool registration"
    # Exclude comment lines (//) from the check — the comment header may still
    # mention "5-arg form" for historical context; only live code lines matter.
    non_comment_lines = [
        line for line in fetch_ts.splitlines() if not line.lstrip().startswith("//")
    ]
    non_comment_content = "\n".join(non_comment_lines)
    assert (
        "server.tool(" not in non_comment_content
    ), "D-4 regression: deprecated 5-arg server.tool() still present in non-comment code"

    # ── 4. Boot wrangler dev ──────────────────────────────────────────────────
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
        # ── 5. Wait for wrangler ready (60s budget) ───────────────────────────
        # Inline-duplicated verbatim from test_handshake_e2e.py:336-347 per
        # Plan 04-15 truth #9 (NO helper extraction this plan).
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

        # ── 6. initialize → tools/list ────────────────────────────────────────
        with httpx.Client(timeout=15.0) as client:
            init_resp = _send_jsonrpc(
                client,
                port,
                "initialize",
                params={
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "outputschema-e2e", "version": "1.0.0"},
                },
                request_id=1,
            )
            assert "result" in init_resp, f"initialize failed: {init_resp}"
            init_result = cast(dict[str, object], init_resp["result"])
            assert (
                init_result["protocolVersion"] == "2025-06-18"
            ), f"unexpected protocolVersion: {init_result.get('protocolVersion')}"

            list_resp = _send_jsonrpc(client, port, "tools/list", request_id=2)
            assert "result" in list_resp, f"tools/list failed: {list_resp}"
            list_result = cast(dict[str, object], list_resp["result"])
            tools = cast(list[dict[str, object]], list_result.get("tools", []))
            assert len(tools) == 9, (
                f"expected 9 Stripe tools, got {len(tools)}: " f"{[t.get('name') for t in tools]}"
            )

            # ── 7. THE D-4 ASSERTION — every tool has non-null outputSchema ───
            missing_outputschema = [t.get("name") for t in tools if t.get("outputSchema") is None]
            assert missing_outputschema == [], (
                f"D-4 reproduced: {len(missing_outputschema)}/{len(tools)} tools "
                f"missing outputSchema in tools/list response. "
                f"Missing: {missing_outputschema}. "
                f"First tool keys: {list(tools[0].keys())}"
            )

            # ── 8. Every outputSchema has type == "object" ────────────────────
            for t in tools:
                output_schema = cast(dict[str, object], t["outputSchema"])
                assert output_schema["type"] == "object", (
                    f"tool {t.get('name')} outputSchema.type != 'object': " f"{output_schema}"
                )

            # ── 9. End-to-end fidelity: fetch tool's properties match fixture ─
            fetch_in_response = next((t for t in tools if t.get("name") == "fetch"), None)
            assert fetch_in_response is not None, "'fetch' tool not found in tools/list response"
            fetch_in_fixture = next((t for t in final_tools if t.name == "fetch"), None)
            assert fetch_in_fixture is not None, "'fetch' tool not found in Stripe fixture"
            # Properties keys should match (set equality — order irrelevant)
            response_output_schema = cast(dict[str, object], fetch_in_response["outputSchema"])
            response_props = set(
                cast(dict[str, object], response_output_schema["properties"]).keys()
            )
            fixture_props = set(
                cast(dict[str, object], fetch_in_fixture.outputSchema["properties"]).keys()
            )
            assert response_props == fixture_props, (
                f"fidelity broken: fetch outputSchema.properties keys differ. "
                f"In response: {response_props}. In fixture: {fixture_props}."
            )

    finally:
        # Same teardown pattern as test_handshake_e2e.py
        try:
            proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=5)
        except (TimeoutError, ProcessLookupError):
            try:
                proc.kill()
                await proc.wait()
            except ProcessLookupError:
                pass
