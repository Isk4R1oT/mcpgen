# Runbook: Multi-client smoke (Cursor / Claude Desktop / ChatGPT Deep Research)

**References:**

- 09-CONTEXT.md D-11 (manual half of D-10/D-11 — automated mock client lives in
  `apps/generation-engine/tests/integration/test_multi_protocol_client.py`,
  this runbook covers the real-client half)
- 09-RESEARCH.md §"Manual-Only Verifications" + §"Pitfall #4" + §"Pitfall #33"
- `.planning/research/PITFALLS.md` §#4 (outputSchema breaking 2024-spec clients)
- `.planning/research/PITFALLS.md` §#33 (Zod schema coercion quirks with MCP `outputSchema`)
- `apps/dispatch/src/middleware/capabilityGate.ts` (Phase 6 D-11 — the gate
  this runbook ultimately validates against three real MCP clients)

## When to use

- **Pre-launch (Phase 10, sprint week W7):** runs ONCE before public launch as
  the final acceptance gate. Estimated 60 min one-time operator work.
- **Quarterly post-launch:** repeat after any major MCP SDK / tenant Worker
  template change, OR when a client (Cursor / Claude Desktop / ChatGPT)
  publishes a major-version release.
- **Spot-check after a Pitfall-#4 incident:** if Sentry / BetterStack flags an
  older-client crash on `outputSchema`, re-run the corresponding section.

This runbook is the **manual half** of D-10/D-11. The automated half (4th mock
client at protocolVersion 2024-11-05) ships in plan 09-09 Task 1; running it
catches structural regressions in CI. THIS runbook catches semantic regressions
that only show up in real client UIs (confirmation prompts, screen rendering,
agent-loop convergence).

## Pre-requisites

1. **5 popular APIs deployed locally** via `mcpgen init`. Local-mode (Phases
   1-9 per `project_local_compute.md`) — no cloud deploy required:
   - Stripe (`https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json`)
   - GitHub (`https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json`)
   - Notion (`https://developers.notion.com/openapi.json`)
   - Linear (`https://developers.linear.app/openapi.json` — or local fixture)
   - Slack (`https://api.slack.com/specs/openapi/v2/slack_web.json`)
2. **Each generated MCP server runs** at `http://localhost:18787/mcp` (Stripe),
   `:18788/mcp` (GitHub), `:18789/mcp` (Notion), `:18790/mcp` (Linear),
   `:18791/mcp` (Slack). Use `wrangler dev --local --port=PORT` per server.
3. **Test mode credentials** for each API in `.env.local` (Stripe test key,
   GitHub PAT scoped to a fresh test org, Notion integration token on a test
   workspace, Linear API key on a sandbox workspace, Slack bot token).
   **NEVER** use prod credentials — Pass-through credentials default still
   exposes the agent to real charges/messages.
4. **Each of 3 clients installed locally** (versions pinned to W7 latest stable):
   - Cursor `>= 0.49` (`cursor --version`)
   - Claude Desktop `>= 1.5` (macOS: Cmd+Shift+Space → "About Claude")
   - ChatGPT Deep Research access (ChatGPT Plus/Pro/Team/Enterprise account
     with Deep Research enabled)
5. **Screenshot tool ready** — macOS `Cmd+Shift+4` or Cleanshot. Each
   successful run requires one screenshot; failed runs require two
   (the failure state + the client's protocol logs).

## Total runs

5 APIs × 3 clients = **15 manual runs**. Failures during these 15 runs are
filed as Phase 10 launch blockers (per 09-CONTEXT.md D-11) and block the
public-launch gate.

## Cursor

### Install

1. Download Cursor from <https://cursor.com/downloads>; install per OS.
2. Verify version: `cursor --version` → must be ≥ 0.49.
3. Open Cursor → Settings → MCP Servers.

### Configure (per API, repeat 5 times)

For each of the 5 APIs (Stripe / GitHub / Notion / Linear / Slack):

1. Click **Add MCP Server** in Cursor's MCP settings panel.
2. **Name:** `mcpgen-stripe-local` (substitute API name).
3. **Type:** `http` (NOT stdio — we test the full dispatch + capability gate).
4. **URL:** `http://localhost:18787/mcp` (substitute the port for the API).
5. **Auth headers:** add `X-Upstream-Auth: Bearer ${API_TEST_KEY}` per
   pass-through credentials default (RUN-03). Cursor stores this client-side;
   it never lands in our logs.
6. Save → Cursor pings the server → green check appears next to the entry.

### Run golden task (per API)

| API | Golden task |
|-----|-------------|
| Stripe | "List my last 3 charges and tell me the total in USD." |
| GitHub | "Find the 3 most recent issues in `mcpgen/test-org/test-repo`." |
| Notion | "Search my workspace for any page titled 'Smoke Test'." |
| Linear | "Show me the 5 newest issues in the `Smoke` team." |
| Slack | "List the 3 most active channels in the workspace." |

Submit the prompt → Cursor invokes the relevant tool(s) → render the result.

### Acceptance (per API)

- ✅ Tool invocation completes within 30 s.
- ✅ Cursor renders the result without error toasts.
- ✅ **No "Approve?" confirmation prompt for read-only tools** (Pitfall #31
  guard — verifies `readOnlyHint=true` flows through correctly).
- ✅ Screenshot the success state.

If the agent loops (calls the same tool > 3×) or the result is empty when the
test data clearly exists: file a Phase 10 launch blocker citing this runbook
+ API + screenshot.

## Claude Desktop

### Install

1. Download Claude Desktop from <https://claude.ai/download>; install per OS.
2. Verify version: macOS `About Claude` panel → must be ≥ 1.5.
3. Open `~/Library/Application Support/Claude/claude_desktop_config.json`
   (macOS) or the equivalent on Windows.

### Configure (per API, repeat 5 times)

Add each of the 5 APIs as an `mcpServers` entry. Example for Stripe:

```json
{
  "mcpServers": {
    "mcpgen-stripe-local": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:18787/mcp",
        "--header",
        "X-Upstream-Auth: Bearer ${STRIPE_TEST_KEY}"
      ]
    }
  }
}
```

(Use `mcp-remote` to bridge HTTP → stdio since Claude Desktop ≤1.5 still
prefers stdio transport. Phase 10 W7+ may simplify if Claude Desktop ships
direct HTTP support.)

Save the JSON file → relaunch Claude Desktop → confirm the server appears in
the MCP indicator (bottom of the chat window).

### Run golden task (per API)

Same 5 golden tasks as the Cursor section. Submit each in a fresh
conversation.

### Acceptance (per API)

- ✅ Claude Desktop's tool-use indicator shows the call + result.
- ✅ Result renders inline (no "Server error" red banner).
- ✅ **No `outputSchema`-related crash** (Pitfall #4 guard — Claude Desktop
  on protocolVersion 2024-11-05 must NOT crash on the response).
- ✅ Screenshot the success state.

If Claude Desktop disconnects mid-tool-call OR shows "Invalid tool result":
the dispatch capability gate may have regressed — re-run the automated test
`pytest tests/integration/test_multi_protocol_client.py` first, then file a
launch blocker if the automated test passes but the real client still fails.

## ChatGPT Deep Research

### Install

1. ChatGPT Plus / Pro / Team / Enterprise account with Deep Research enabled.
2. Open <https://chatgpt.com> → Profile → Settings → **Connectors**.
3. (Deep Research uses a different MCP integration path than Cursor / Claude
   Desktop — it pulls from registered Connectors, not a local client config.)

### Configure (per API, repeat 5 times)

ChatGPT Deep Research's Connector flow expects a **publicly reachable** MCP
server. For local-mode (Phase 9 / W7), use a tunneling tool to expose each
local server:

1. Run `cloudflared tunnel --url http://localhost:18787` (or `ngrok http
   18787`) to get a public URL `https://random.trycloudflare.com`.
2. ChatGPT → Settings → Connectors → **Add custom connector**.
3. **Name:** `mcpgen-stripe-smoke`.
4. **MCP server URL:** the public tunnel URL.
5. **Auth header:** `X-Upstream-Auth: Bearer ${STRIPE_TEST_KEY}`.
6. Save → ChatGPT verifies connection → green status.

Repeat for the other 4 APIs (GitHub / Notion / Linear / Slack), each with
its own tunnel + Connector entry.

### Run golden task (per API)

Same 5 golden tasks. In ChatGPT, open a new chat → click **Tools** → enable
**Deep Research** → enable the relevant Connector → submit the task.

### Acceptance (per API)

- ✅ ChatGPT Deep Research successfully invokes `search` and / or `fetch`
  tools (these are the only two universal tools OpenAI guarantees Deep
  Research uses — Pitfall #32 / canonical schemas).
- ✅ Final answer cites the retrieved data.
- ✅ **No "Tool call rejected — invalid schema" error** (Pitfall #32 +
  Pitfall #33 guard — `search(query: string)` and `fetch(id: string)`
  signatures must be byte-for-byte canonical).
- ✅ Screenshot the success state.

If ChatGPT Deep Research falls back to web-search instead of using the
Connector: the canonical search/fetch fixtures may have drifted — check
`packages/engine-fixtures/_canonical/` and re-run the F3 mock_clients harness
(`uv run pytest tests/stages/stage_f/test_mock_clients.py`).

## Failure handling

Every failure during this runbook is a **Phase 10 launch blocker**. File one
GitHub issue per failure with:

- **Title:** `multi-client-smoke FAIL: <client> + <API>`
- **Body:** the failing screenshot + the client's protocol log (Cursor:
  Settings → MCP → "Show logs"; Claude Desktop:
  `~/Library/Logs/Claude/mcp.log`; ChatGPT: F12 dev tools network tab during
  the failing run) + the corresponding tenant Worker log
  (`wrangler tail` output).
- **Label:** `phase-10-launch-blocker`.
- **Priority:** P0 if the failure is a hard error (server crash, schema
  rejection); P1 if the agent loops or returns empty.

Re-run the failing client × API combination after the fix lands. Do NOT
proceed to public launch until all 15 runs are green.

## Sign-off

After all 15 runs are green, the operator records sign-off below.

| Field | Value |
|-------|-------|
| Operator name | `< founder name >` |
| Sprint week | W7 |
| Completion date | `< YYYY-MM-DD >` |
| Total runs attempted | `<n>` |
| Total runs passed | `<n>` |
| Screenshots archive | `< link to archive: e.g., R2 bucket `mcpgen-launch-evidence/W7/multi-client-smoke/` >` |
| Failures filed (issue links) | `< list of github issue links, or "none" >` |
| Phase 10 launch gate decision | `PASS / HOLD / RE-RUN` |

Once `PASS` is recorded here, the multi-client smoke gate of Phase 10 launch
criteria (per `docs/mcpgen-implementation-plan.md` §11.7) is satisfied.

## Operator note

This runbook is **executor-only**. Phase 9 ships the doc; Phase 10 W7
executes the 15 runs. Estimated effort: 60 min one-time work, including
screenshot capture and sign-off. If a re-run is required (e.g., after a
fix), budget 15 min per failed (client × API) combination.
