# Phase 4 — Deviations

> Findings from manual gate 04-13 (orchestrator-driven, 2026-04-29). Each deviation is an architectural bug in a Stage E template that did not surface during plan-checker / Wave-0 / E2E test gates because those gates exercise rendered file content + `tsc --noEmit` only, not a live MCP handshake. Manual gate caught what static gates structurally cannot.

**Status:** Phase 4 **PASSED** ✅ as of 2026-04-29 15:28. All 4 deviations drained:
- D-1+D-2+D-3 drained by Plan 04-14 (commits `f67813f`/`6f9038e`/`d3585a4`/`dec9f24`/`acebf5c`) — verified by gate 04-13 re-run #2.
- D-4 surfaced by re-run #2 on 2026-04-29 13:25, then drained by Plan 04-15 (commits `2eb864e`/`68223ad`/`f92117b`/`c8774b5` + `json_schema_to_zod` Rule-1 auto-fix) — verified by gate 04-13 re-run #3 on 2026-04-29 15:28 (outputSchema 9/9 in tools/list response). See `04-13-INSPECTOR-EVIDENCE.md` re-run #3 for transcripts.

---

## D-1 — `server.ts.j2` missing `registerAllTools(server)` call

**Severity:** BLOCKER for Phase 4 SC #5
**Owning template:** `packages/codegen-templates/templates/server.ts.j2` (Plan 04-06)
**Surfacing gate:** Manual MCP handshake (gate 04-13)

### Symptom
After `npx wrangler@4 dev --local --port 8787 &` boots the generated Stripe Worker and a 2025-06-18 client successfully calls `initialize`, `tools/list` returns an empty tools array — none of the 9 generated tool handlers (`search`, `fetch`, `list_collections`, `list_objects`, `upsert`, `delete`, `charges_capture`, `charges_refund`, `subscriptions_cancel`) are visible to the MCP client.

### Root cause
`createServer()` in `src/server.ts` constructs the `McpServer` + `WebStandardStreamableHTTPServerTransport` and returns them to `src/index.ts`'s fetch handler. But `registerAllTools(server)` (defined in `src/tools/index.ts` by Plan 04-10) is NEVER CALLED — neither in `createServer()` nor anywhere in `src/index.ts`. The MCP server has no tools registered at handshake time.

### Why static gates missed it
- `tsc --noEmit` passes — `registerAllTools` is exported and importable; no type error in not-calling it.
- Plan 04-10 unit tests verified `registerAllTools` exists + dispatches correctly when called; they did NOT verify it's wired into the bootstrap path.
- Plan 04-12 E2E fixture acceptance tests compare manifest sha256s + count files — they don't run a live MCP `tools/list` against the rendered server.

### Proposed fix (do NOT apply in this session)
In `server.ts.j2`, after creating the `McpServer`:
```typescript
import { registerAllTools } from "./tools/index.js";
// ... existing createServer() body up to transport construction ...
registerAllTools(server);  // NEW: register all 9 tools before returning
return { server, transport };
```

One-line addition + import. Belongs in a fresh follow-up plan that owns:
1. `server.ts.j2` template edit
2. Wave-0 integration test asserting `tools/list` returns ≥1 tool against a synthetic-fixture rendered server (closes the structural gap that let this slip through)

---

## D-2 — `server.ts.j2` uses per-request transport — needs stateless mode for CF Workers

**Severity:** BLOCKER for Phase 4 SC #5
**Owning template:** `packages/codegen-templates/templates/server.ts.j2` (Plan 04-06)
**Surfacing gate:** Manual MCP handshake — even after D-1 hypothetically fixed, every non-initialize request fails with `Bad Request: Server not initialized`

### Symptom
After `initialize` succeeds and returns `mcp-session-id: <uuid>` in response headers, every subsequent request from the same MCP client (with `Mcp-Session-Id: <uuid>` echoed back per MCP protocol) returns:
```
HTTP/1.1 400 Bad Request
{"jsonrpc":"2.0","error":{"code":-32000,"message":"Bad Request: Server not initialized"},"id":null}
```

### Root cause
`src/index.ts`'s fetch handler calls `createServer()` on EVERY incoming request — creating a fresh `McpServer` + `WebStandardStreamableHTTPServerTransport` per request:
```typescript
async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  // ... auth ...
  const { server, transport } = createServer();  // NEW per-request transport
  await server.connect(transport);
  return transport.handleRequest(req);
}
```

The transport is configured with `sessionIdGenerator: () => crypto.randomUUID()` (stateful mode). In stateful mode the SDK keeps in-memory session state per `mcp-session-id` — but that state lives on the transport instance, which gets discarded after `handleRequest()` returns. The next request with the same session ID hits a freshly-constructed transport with no record of prior `initialize`, so the SDK rejects with `Server not initialized`.

This is fundamentally incompatible with serverless runtimes (CF Workers, Lambda, etc.) where each request is a fresh isolate with no shared in-memory state.

### Why static gates missed it
- `tsc --noEmit` doesn't validate runtime statefulness assumptions.
- E2E fixture tests verify Stage E rendering produces correct file content — not that the rendered server completes a multi-request MCP session.
- The MCP-Bench-style F3 agent eval (Phase 5) WOULD have caught this on the first multi-turn test conversation, but Phase 5 hasn't run yet.

### Proposed fix (do NOT apply in this session)
Switch to stateless mode in `server.ts.j2` — MCP SDK explicitly supports this (`webStandardStreamableHttp.d.ts:46` — "If not provided, session management is disabled (stateless mode)"). Stateless mode is what's recommended for serverless deployments per the SDK's own example block.

```typescript
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,  // stateless: appropriate for CF Workers
  enableDnsRebindingProtection: true,
  allowedHosts: ALLOWED_HOSTS,
  allowedOrigins: ALLOWED_HOSTS.map((h) => `https://${h}`),
});
```

Per SDK docs §"In stateless mode" — every request is treated as a fresh handshake; no in-memory tracking. This trades multi-turn-tool-loop efficiency (negligible for our HTTP wrapper use case) for serverless compatibility.

Owning template fix + paired Wave-0 test asserting full handshake (initialize → tools/list → tools/call) succeeds against a rendered server.

---

## D-3 — `config.ts.j2` keeps `{tenant_short_id}` placeholder literal — standalone runs hit Host-header validation

**Severity:** WARNING (operational footgun, not a deploy blocker)
**Owning template:** `packages/codegen-templates/templates/config.ts.j2` (Plan 04-06)
**Surfacing gate:** Manual `wrangler dev --local` standalone run before Phase 6 dispatch wiring exists

### Symptom
The generated Worker's `ALLOWED_HOSTS` literal value is:
```typescript
export const ALLOWED_HOSTS: string[] = [
  "{tenant_short_id}-stripe.mcpgen.dev",  // unsubstituted placeholder
];
```

The MCP SDK's DNS-rebinding mitigation (`StreamableHTTPServerTransport.allowedHosts`) does an exact-string comparison against the request's `Host` header. With the literal placeholder still present, no real Host header value can match — the server returns:
```json
{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host header: <whatever>"},"id":null}
```

Worse: passing the literal placeholder back as Host header (e.g., `curl -H 'Host: {tenant_short_id}-stripe.mcpgen.dev'`) causes a generic 500 because the SDK fails to parse `{` and `}` as valid hostname characters.

### Why this is intended (per design) but still a deviation
Per CONTEXT D-25 (the Pitfall #30 mitigation), the `{tenant_short_id}` placeholder is INTENTIONALLY left literal in `config.ts` — Phase 6 dispatch Worker substitutes the real tenant prefix at deploy time. Two tenants wrapping the same upstream (e.g., `acme-stripe` vs `widget-co-stripe`) get distinct `server.name` values that way, satisfying tool-name uniqueness.

The deviation: standalone `wrangler dev` for QA / debugging / first-week-of-launch dogfooding has NO SUBSTITUTION PATH — operators expecting the manual-gate flow per the plan's `how-to-verify` (e.g., the orchestrator did) will hit the placeholder and see opaque "Invalid Host header" failures unless they happen to know to sed-substitute the placeholder themselves.

### Why static gates missed it
- The placeholder is correct + intentional from a codegen perspective.
- E2E tests render the file and verify its content matches MANIFEST sha256 — they don't boot it.
- The plan's `how-to-verify` block in 04-13-PLAN.md does NOT include a placeholder-substitution step, suggesting the planner didn't think through standalone bootability.

### Proposed fix (do NOT apply in this session)
Two options for the follow-up plan:

A) **Add a `dev-local` build mode** to Stage E that, when enabled, substitutes `{tenant_short_id}` with `local` at codegen time. The runtime template stays placeholder-bearing for production deploys. CLI flag `mcpgen init --dev-local` toggles this.

B) **Document the placeholder-substitution step** in the README.md.j2 generated by Plan 04-06 (currently unstructured) so operators know to `sed -i 's/{tenant_short_id}/local/g' src/config.ts` before running `wrangler dev`.

Recommended: (A) — silent substitution at codegen time is less footgun-prone than relying on operators to read README.

---

## Disposition

| Deviation | Severity | Owning template | Status |
|---|---|---|---|
| D-1 missing registerAllTools | BLOCKER | server.ts.j2 (04-06) | ✅ DRAINED 2026-04-29 by Plan 04-14 commit `6f9038e` |
| D-2 stateless mode | BLOCKER | server.ts.j2 (04-06) | ✅ DRAINED 2026-04-29 by Plan 04-14 commit `6f9038e` |
| D-3 placeholder UX | WARNING | config.ts.j2 (04-06) | ✅ DRAINED 2026-04-29 by Plan 04-14 commit `d3585a4` (`--dev-local` build mode option A from §D-3 proposed fix) |
| D-4 outputSchema missing | BLOCKER | per-tool `tool_*.ts.j2` (Plan 04-10) | ✅ DRAINED 2026-04-29 by Plan 04-15 commit `68223ad` (registerTool migration) + `json_schema_to_zod` Rule-1 auto-fix; verified by gate 04-13 re-run #3 on 2026-04-29 15:28 (outputSchema 9/9 in tools/list) |

---

## D-4 — `tool_*.ts.j2` registers tools via deprecated SDK v1 5-arg `server.tool()` form which DROPS `outputSchema`

**Severity:** BLOCKER for Phase 4 SC #1 + SC #5 (full client-discoverable schema)
**Owning template:** `packages/codegen-templates/templates/tool_*.ts.j2` (Plan 04-10)
**Surfacing gate:** Gate 04-13 re-run on 2026-04-29 13:25 — `tools/list` response shape inspection

### Symptom
After Plan 04-14 drained D-1 + D-2 + D-3 and the live MCP `tools/list` request finally became reachable, inspection of the returned JSON shows every tool entry has keys:
```json
{"name": "...", "description": "...", "inputSchema": {...}, "annotations": {...}, "execution": {...}}
```
**`outputSchema` is absent from every tool entry**, regardless of client `protocolVersion` (verified for both 2025-06-18 and 2024-11-05 clients in the re-run). Pass 5's fixture for Stripe contains non-null `outputSchema` for all 9 tools (`packages/engine-fixtures/stripe/final-tools.json`), so Pass 5 is doing its job — Stage E codegen is silently dropping the field at registration time.

### Root cause
The SDK v1 5-arg `server.tool(name, description, paramsSchema, annotations, cb)` overload (per CONTEXT D-04 invariant — "STAY ON v1, NOT v2 `registerTool`") is **deprecated** in `@modelcontextprotocol/sdk` 1.29+ and does NOT accept an `outputSchema` parameter. Reference: `node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.d.ts:117-146` — the deprecated `tool()` overloads end at the 5-arg form (with `annotations` as the last positional arg before the callback); they have no slot for `outputSchema`.

The non-deprecated path is `McpServer.registerTool(name, config, cb)` where `config` is an object containing `inputSchema`, `outputSchema`, `annotations`, `_meta`, `description`, `title`. Reference: `mcp.d.ts:150-157`.

### Why static gates missed it
- Plan 04-10's per-tool unit tests verify each `tool_*.ts` ends with the SDK v1 5-arg form (per CONTEXT D-04 invariant) — they assert the WRONG thing (form compliance) instead of the RIGHT thing (outputSchema reaches the wire).
- `tsc --noEmit` passes — `server.tool()` accepts the 5-arg form (it's deprecated but valid TypeScript).
- Plan 04-12 E2E fixture acceptance tests verify rendered file content sha256 matches MANIFEST — the manifest hash captures the absence of `outputSchema` references in tool registration, but the test never compared the SHAPE of `tools/list` response against the fixture's `outputSchema` field.
- Original gate 04-13 was BLOCKED by D-2 from ever reaching `tools/list`, so the absence wasn't observable.
- Original gate's Section 4 verified dual `content` + `structuredContent` only at the **handler return value** layer (static evidence from `assembleStructuredContent`), not at the **registration metadata** layer.

### Why CONTEXT D-04 invariant is wrong (or needs amendment)
CONTEXT D-04 says: "STAY ON v1 (NOT v2 `registerTool`)". The intent was to avoid the v1 → v2 API migration. But the rationale is moot in SDK 1.29+ where `registerTool` is the **only** way to register a tool with `outputSchema` — the "v1 vs v2" framing in the original D-04 was based on an out-of-date SDK version (likely 1.x.0–1.5).

The mitigation IS to switch to `registerTool` for any tool that has an `outputSchema` (which is all 9 in Pass 5 output today). This is not a v1/v2 break — it's the modern v1 API.

### Proposed fix (do NOT apply in this session)
Update `packages/codegen-templates/templates/tool_*.ts.j2` (9 templates) AND `tools_index.ts.j2` to use `server.registerTool(name, { description, inputSchema: ..., outputSchema: ..., annotations: ... }, cb)` shape instead of the 5-arg form. Specifically:

```typescript
// BEFORE (current — drops outputSchema):
server.tool(
  "fetch",
  "Fetch the full Stripe object addressed by a smart ID...",
  z.object({ id: z.string()..., properties: z.array(z.string()).optional() }).shape,
  {"destructiveHint": false, "idempotentHint": true, "openWorldHint": true, "readOnlyHint": true},
  async (args, extra) => { ... }
);

// AFTER (preserves outputSchema):
server.registerTool(
  "fetch",
  {
    description: "Fetch the full Stripe object addressed by a smart ID...",
    inputSchema: z.object({ id: z.string()..., properties: z.array(z.string()).optional() }).shape,
    outputSchema: z.object({ id: z.string(), object_type: z.string(), data: z.unknown(), metadata: z.object({...}) }).shape,
    annotations: {"destructiveHint": false, "idempotentHint": true, "openWorldHint": true, "readOnlyHint": true},
  },
  async (args, extra) => { ... }
);
```

The template needs to:
1. Accept the Pass 5 `outputSchema` JSON Schema dict and convert to a Zod schema (or pass through if already Zod-shaped).
2. Switch the registration call from `server.tool(...)` to `server.registerTool(name, configObject, cb)`.
3. Update CONTEXT D-04 to amend the invariant: "Use the SDK v1 modern `registerTool(name, config, cb)` API; do NOT use the deprecated 5-arg `tool(name, desc, schema, annotations, cb)` overload."
4. Verify with a Wave-0 test that `tools/list` response shape includes `outputSchema` for at least one tool (paired sibling to Plan 04-14's `test_dev_local_handshake_basic` — same wrangler-spawn pattern, additional assertion).

Owner: follow-up plan 04-15 (recommended) OR Phase 10 carry-forward.
Estimated scope: ~9 template files + 1 SDK migration unit test + amend CONTEXT D-04.

### Why this is a BLOCKER (not WARNING)
Phase 4 SC #1 says: "Pass 5 emits non-null `outputSchema` for every tool (MCP 2025-06-18)". Pass 5 DOES emit it (verified in fixture), but Stage E DROPS it before clients can see it. The success criterion's intent is end-to-end client visibility (tools/list advertises outputSchema, client validates response against it) — not just internal Pass 5 plumbing. Without D-4 fixed, structured-content-aware MCP clients (Claude Code, Cursor, Inspector itself, ChatGPT Deep Research) cannot validate tool responses against their declared schema, defeating the SC #1 + SC #5 contract.

### Workaround until fixed
Tool handlers DO return dual `content` + `structuredContent` at the response level (verified by template inspection + Plan 04-08 unit tests), so a client willing to introspect the response shape rather than declared schema metadata gets the structured data. But this is fragile — well-behaved clients SHOULD validate against `outputSchema` from `tools/list` and may reject responses if the schema is missing.

---

## Updated Disposition Summary

**Phase 4 status: PASSED ✅** as of 2026-04-29 15:28

| As of date | Open BLOCKERS | Open WARNINGS | Closed |
|---|---|---|---|
| 2026-04-29 03:30 (gate 04-13 initial) | D-1, D-2 | D-3 | (none) |
| 2026-04-29 13:25 (gate 04-13 re-run #2 after Plan 04-14) | D-4 | (none) | D-1, D-2, D-3 |
| 2026-04-29 15:28 (gate 04-13 re-run #3 after Plan 04-15) | (none) | (none) | D-1, D-2, D-3, **D-4** |

**Does Phase 4 ship now?** ✅ Yes. All 5 Success Criteria met: Pass 5 emits non-null outputSchema for every tool AND it reaches `tools/list` clients via SDK `registerTool` form (SC #1); Stage E produces 32 TS files (SC #2); generated Worker passes `tsc --noEmit`, has DNS-rebinding + Sentry-redact (SC #3); bundle 289.85 KiB ≪ 950 KiB ceiling (SC #4); generated Stripe MCP completes initialize → tools/list → tools/call with dual-shape return (SC #5).

**Phase 5 carry-forward:** Pitfall #4 (capability gate at HANDLER LEVEL) was clarified during re-run #3 — the gate operates on `tools/call` response shape, NOT on `tools/list` metadata. Plan 04-08's unit test verifies the handler-level gate; live runtime verification requires multi-turn agent eval (Phase 5 F3 mocked clients per Pitfall #31 mitigation). Captured here for Phase 5 planner context.

---

*Original gate captured 2026-04-29 03:30; D-1+D-2+D-3 drained by Plan 04-14 (commits `f67813f`/`6f9038e`/`d3585a4`/`dec9f24`/`acebf5c`); re-run #2 on 2026-04-29 13:25 surfaced D-4.*
*All gate runs validated against `/tmp/mcpgen-stripe-test/` — raw `stage_e.run()` output of the Stripe fixture.*
