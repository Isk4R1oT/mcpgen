# Phase 6: Runtime Plane — Research

**Researched:** 2026-04-26
**Domain:** Local-compute runtime plane (Bun + Hono dispatch · multi-port tenant Workers · 3 upstream-credential modes · Inngest-dev usage pipeline · `mcpgen deploy` CLI · 4-target Bun-compile binary distribution)
**Confidence:** HIGH for locked stack + frozen contracts; MEDIUM for "exact algorithm" gray areas (port allocation, KV emulator wrapper choice) — these are explicitly flagged as planner discretion.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Dispatch architecture & tenant routing (RUN-01)
- **D-01:** Local dispatch is Bun + Hono on `localhost:8789`. Hono `app.fetch` is framework-identical between Bun-native `serve()` and CF Workers `export default` — Phase-10 swap is `wrangler deploy --name dispatch` against the existing `apps/dispatch/wrangler.toml`. `wrangler.toml` is committed as Phase-10 reference but not executed in Phase 6.
- **D-02:** Tenant lookup source of truth = Postgres `deployments` table; in-memory cache 5-min TTL. Dispatch resolves `script_name = {tenant_short_id}-{spec_slug}` from request → cache hit OR Postgres lookup → in-memory routing table maps `script_name → localhost:879N`.
- **D-03:** Cross-tenant smart-ID fuzz protection: dispatch validates that the smart-ID prefix in any forwarded request body matches the addressed tenant. Mismatch → 403 with `{ error: "smart_id_tenant_mismatch", … }`. Same regex compiled from Pass-1 `SmartIdSchema` is shared with the F1 fuzz fixture.

#### Tenant Worker local runtime model (RUN-02)
- **D-04:** Each active tenant deployment runs as a separate Bun child process on `localhost:8790+` (multi-port). Process supervisor lives in `apps/tenant-worker-runner/` (Bun); reads `deployments` on boot, spawns one process per active deployment, restarts on crash, exposes `/admin/spawn` + `/admin/kill` endpoints used by `mcpgen deploy`.
- **D-05:** `apps/dispatch-sample` is the canonical reference shape; Phase-6 Wave 2 wires it through new dispatch + auth + usage pipeline. Three sample tools (`customers_search`, `charges_fetch`, `subscriptions_list`) kept; Phase-1 `createStubRuntime()` replaced with the real `@mcpgen/runtime` factory.

#### `@mcpgen/runtime` real implementations
- **D-06:** Phase 6 replaces `createStubRuntime()` (which throws on every method) with real implementations of all 11 frozen `Runtime` methods: `parseSmartId / makeSmartId / routeSearch / routeFetch / routeListCollections / routeListObjects / routeUpsert / routeDelete / shapeResponse / applyFieldFilter / handleUpstreamError`. Same `index.ts` surface — only the implementation files change.
- **D-07:** Smart-ID runtime lives in `@mcpgen/runtime` and is consumed by BOTH tenant Workers AND the dispatch worker (for D-03 fuzz protection). Single source of truth.

#### Three upstream-credential modes (RUN-03/04/05)
- **D-08:** Pass-through is the default and ships first. `@mcpgen/runtime` middleware decrypts `X-Upstream-Auth` per request via HKDF-derived key, forwards to upstream, never logs, never persists. Outbound chokepoint scrubs from any log destination.
- **D-09:** Stored credentials use AES-256-GCM with per-tenant DEK in a local SQLite store (`bun:sqlite`); Phase-10 swap is real CF KV via the same `KV_NAMESPACE` binding name. UI marks "less secure" with explicit opt-in checkbox. Master key from `RUNTIME_KEK` env var.
- **D-10:** OAuth flow on behalf — STUB implementation in Phase 6. Returns a documented `{ error: "oauth_mode_phase_10_deferral", message, deferred_to_phase: 10 }` payload when `auth_mode = "oauth"`. Real `@cloudflare/workers-oauth-provider` is Phase 10.

#### MCP `initialize` capability gating (RUN-01)
- **D-11:** Dispatch is the MCP protocol negotiator; tenant Workers always emit MCP 2025-06-18 shape. Dispatch parses JSON-RPC `initialize`, captures client `protocolVersion` per `Mcp-Session-Id`, and on the way out: strips `outputSchema` from `tools/list` and drops `structuredContent` from `tools/call` for clients with `protocolVersion < "2025-06-18"`.

#### Usage event pipeline — local-compute simplified (RUN-06)
- **D-12:** Tenant Worker → `ctx.waitUntil(send_to_inngest_dev(...))` → local Inngest dev (`npx inngest-cli@latest dev`) → Inngest function writes to TimescaleDB `usage_events` hypertable. Schema/key from frozen `packages/contracts/src/usage-event.ts`. `usage_event_id` UUID + UNIQUE `(tenant_id, tool_call_id)` for dedup. On send failure → local SQLite fallback bucket; 5-min Inngest cron drains. Daily reconciliation function `usage-reconciler-v1` ships as a skeleton (logs would-be Stripe payload). Function IDs are stable strings per CTRL-09. Phase-10 swap: `send_to_inngest_dev` → `env.USAGE_QUEUE.send` (Inngest functions stay).

#### `mcpgen deploy` semantics + binary build matrix (CLI-02 / CLI-03)
- **D-13:** `mcpgen deploy <bundle-dir>` (default = local) registers in Postgres `deployments`, spawns local Bun process on next-free port 8790+ via `apps/tenant-worker-runner/` admin endpoint, returns `localhost:879N` URL + Claude Desktop config block with collision detection (pitfall #30 — name AND URL). `--cf` / `--remote` flag emits a Phase-10 deferral banner via the same exit-78 deferral pattern as `infrastructure/cloudflare/scripts/create-namespaces.sh`.
- **D-14:** CLI Bun-compile binary matrix ships in Phase 6 for all 4 targets (`bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`, `bun-windows-x64`). CI runs `bun build --compile --target=$T` per OS-on-OS where possible. Published as: npm package (single `mcpgen` binary chosen via `optionalDependencies` per OS) + GitHub release artifacts.

#### Cross-cutting security
- **D-15:** `hostHeaderValidation` Hono middleware mandatory on dispatch + every tenant Worker. Allowed hosts via `ALLOWED_HOSTS` env var; default dev: `localhost,127.0.0.1`; default Phase-10 prod: `*.mcpgen.dev,mcpgen.dev`. Stage-E codegen template injects this in every generated bundle.
- **D-16:** Sentry `beforeSend` redaction lives in `@mcpgen/runtime` and scrubs `Authorization`, `X-Upstream-Auth`, `Cookie`, plus all spec-declared auth headers. Plugged into existing FND-10 empty-DSN init.

#### P99 latency target & warm-keep (RUN-02)
- **D-17:** P99 < 50ms over upstream measured locally via Bun-native load-test harness (`apps/tenant-worker-runner/tests/p99-load.ts`) with fixed-latency stub upstream. Acceptance: P99 over 30-s 100-rps run is <50ms.
- **D-18:** Warm-keep cron skeleton via Inngest dev function `warm-keep-active-tenants-v1` (every 5 min; reads active deployments from Postgres; pings `/health` on each tenant Worker port).

### Claude's Discretion
The planner has flexibility on:
- Exact wave breakdown (suggested in CONTEXT: Wave 1 dispatch + dispatch-sample wired; Wave 2 = 3 auth modes; Wave 3 = usage pipeline; Wave 4 = `mcpgen deploy` + binary matrix; Wave 5 = P99 + warm-keep + smart-ID fuzz).
- Specific port-allocation algorithm for tenant Workers (sequential / hash / pool — sequential acceptable).
- Whether `apps/tenant-worker-runner/` is a new app or a folder inside `apps/dispatch/` (planner reads existing dispatch scaffold and decides).
- KV emulator concrete library: `unstorage` (recommended, matches Phase-10 `cloudflare-kv-binding` swap) vs raw `bun:sqlite` (simpler).
- Inngest dev runner location (`apps/dispatch/inngest/` vs `apps/api/inngest/` vs new `apps/inngest-dev/`).
- Whether the local SQLite KV fallback bucket is per-runner or per-deployment (failure-isolation argument either way).
- Naming of in-memory routing-table cache key (`script_name` vs `cf_worker_name`).
- Whether `mcpgen deploy --cf` is wired in Phase 6 with the deferral banner or completely absent until Phase 10 — recommended: wire it.

### Deferred Ideas (OUT OF SCOPE)
- Real CF Workers for Platforms deploys (`wrangler deploy --dispatch-namespace mcpgen-prod`) — Phase 10.
- Real CF Hyperdrive provisioning — Phase 10.
- Real CF KV / CF Queue / CF Durable Objects bindings — Phase 10.
- Real `@cloudflare/workers-oauth-provider` integration — Phase 10.
- Real CF Workers SSE 30-second sub-request validation — Phase 10.
- Real Stripe Meters submission — Phase 8 (CTRL-06).
- Drift Watcher Inngest cron — Phase 8 (CTRL-03).
- Quota enforcement + per-generation cost cap — Phase 8 (CTRL-06/07).
- Stripe Meters daily reconciliation alerts (>2 % drift) — Phase 8 (CTRL-07).
- Production-grade BetterStack + Sentry DSN fill + CF Queue depth alert — Phase 9 (CTRL-08).
- F3 mock-client harness for runtime acceptance — Phase 5 owns it.
- Privacy mode CLI (CLI-05) — v1.x backlog.
- `mcpgen logs --tail` (CTRL-11) — v1.x backlog.
- MCP SDK v2 bump — only via deliberate `chore: bump mcp-sdk to v2` PR (Phase-1 D-04).
- Multi-region runtime, A/B deploys, custom domains — out of v1 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUN-01 | Dispatch on `localhost:8789` performs auth precheck, rate-limit, tenant lookup (5-min TTL cache), `protocolVersion` parsing during `initialize`, capability-gated dispatch (omit `outputSchema` for clients <2025-06-18) | §1 Bun + Hono dispatch · §7 capability gating · §11 hostHeaderValidation · §15 cross-tenant fuzz |
| RUN-02 | Generated tenant Workers use `@modelcontextprotocol/sdk` + `@mcpgen/runtime` SDK; P99 < 50ms over upstream on warm starts; warm-keep cron every 5 min | §2 process supervisor · §3 runtime impl · §13 P99 harness · §14 warm-keep cron |
| RUN-03 | Pass-through credential mode default — HKDF-derived per-request decryption of `X-Upstream-Auth`, forward, never persist; outbound chokepoint scrub | §4 pass-through · §12 Sentry beforeSend |
| RUN-04 | Stored credential mode (AES-256-GCM with per-tenant DEK in CF KV) supported, marked "less secure", explicit opt-in | §5 stored creds with `bun:sqlite` |
| RUN-05 | OAuth 2.1 mode for user-delegated APIs uses `@cloudflare/workers-oauth-provider` with PKCE; tokens managed via Logto | §6 OAuth stub (Phase-6 deferral) |
| RUN-06 | Each tool call emits a usage event via `ctx.waitUntil(queue.send(...))` with KV fallback; CF Queue → Inngest → TimescaleDB + Stripe Meters; `usage_event_id` UUID + UNIQUE `(tenant_id, tool_call_id)` for dedup; daily reconciliation | §8 usage pipeline via Inngest dev |
| RUN-07 | One-click Claude Desktop config block (or fallback copy-paste) generated for each deployed server, with collision detection | §16 Claude Desktop config block |
| CLI-02 | `mcpgen deploy` pushes the generated server to CF Workers for Platforms tenant namespace and returns a live URL | §9 `mcpgen deploy` (local default + `--cf` deferral) |
| CLI-03 | CLI ships as Bun-compiled single binary on npm + GitHub releases (4 targets) | §10 binary distribution |
</phase_requirements>

## Summary

Phase 6 builds the local Runtime Plane: a Bun-Hono dispatch worker on `localhost:8789` that routes MCP requests to per-tenant Bun child processes on `localhost:8790+`, plus 3 upstream-credential modes (pass-through default, AES-256-GCM stored in `bun:sqlite`, OAuth stub), plus a usage-event pipeline running through local Inngest dev (`npx inngest-cli@latest dev`, default port 8288) into TimescaleDB, plus the real `mcpgen deploy` CLI shipped as a 4-target Bun-compiled binary.

The architectural shape is **lift-shift-clean** to Phase 10: every component is authored against the same Hono `app.fetch` surface that runs identically on Bun-native `serve()` and Cloudflare Workers `export default`, every cloud binding (KV, Queue, OAuth provider) has a documented local emulator that swaps to the real binding via a single config change, and every Inngest function has a stable string ID per CTRL-09. The 11 frozen `Runtime` methods get real implementations sharing a single source of truth between dispatch (for cross-tenant smart-ID fuzz protection per pitfall #1) and tenant Workers.

**Primary recommendation:** Use `unstorage` (memory driver locally, swappable to `cloudflare-kv-binding` driver in Phase 10) as the KV emulator wrapper for both stored-credentials (D-09) and the in-memory tenant-routing cache (D-02). This is the smallest-blast-radius Phase-10 swap. For the **usage-event fallback bucket** (D-12), use raw `bun:sqlite` directly — fewer moving parts for a write-once, 5-min-drain pattern; the fallback bucket needs no Phase-10 swap target equivalent at the binding level (Phase 10 uses real CF Queue + CF KV; the bucket disappears).

**Confidence:** HIGH on contracts/integration shape (every contract is frozen and tests already exist for them); MEDIUM on exact library wrappers for the KV emulator (multiple acceptable choices exist) and exact CI matrix design for cross-compile (Bun's docs claim universal cross-compile but I haven't verified all 4 targets on a single Linux runner — left as Open Question).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MCP protocol negotiation (`initialize`, `Mcp-Session-Id`) | Dispatch (Bun + Hono) | — | Single rewrite point per D-11; tenant Workers stay protocol-version-naive |
| Tenant lookup (cache + Postgres) | Dispatch | Postgres `deployments` | 5-min TTL cache; `deployments` is source of truth |
| Cross-tenant smart-ID fuzz protection | Dispatch | `@mcpgen/runtime` (regex compile) | Single regex shared with F1 fixture (D-07) |
| Auth precheck (our Bearer JWT) | Dispatch | — | Matches prod CF dispatch auth precheck |
| Rate limiting | Dispatch | — | DO-counter equivalent locally; thin in-memory bucket per Wave-1 ("rate-limit precheck" stub acceptable in Phase 6) |
| Capability gating (strip `outputSchema`/`structuredContent`) | Dispatch | — | Per D-11 — single rewrite surface |
| MCP server impl (Six-Tool Pattern) | Tenant Worker | `@modelcontextprotocol/sdk@^1.x` | Per D-04 / FND-06 |
| Universal-tool routing (search/fetch/list_*/upsert/delete) | `@mcpgen/runtime` | Tenant Worker handler | 11 frozen methods |
| Pass-through credential decryption | Tenant Worker | `@mcpgen/runtime` HKDF helper | Decryption is per-request; never persisted |
| Stored credential decryption (AES-256-GCM) | Tenant Worker | `bun:sqlite` (KV emulator) | DEK derived from `RUNTIME_KEK`; per-tenant scope |
| OAuth handshake | Tenant Worker (STUB) | — | Phase-6 stub returns `oauth_mode_phase_10_deferral`; Phase-10 swaps to `@cloudflare/workers-oauth-provider` |
| Usage-event emit | Tenant Worker | `ctx.waitUntil` (or local equivalent) | Fire-and-forget; never blocks tool response |
| Usage-event ingest + dedup | Inngest dev function | TimescaleDB `usage_events` hypertable | UNIQUE `(tenant_id, tool_call_id)` enforced at DB layer |
| Usage-event fallback drain | Inngest dev cron `usage-fallback-drain-v1` | `bun:sqlite` (per-runner bucket) | 5-min cron reads bucket, re-emits to Inngest with idempotent IDs |
| Daily reconciliation skeleton | Inngest dev function `usage-reconciler-v1` | TimescaleDB hourly aggregates | Logs would-be Stripe payload; Phase 8 (CTRL-06/07) wires real Stripe |
| `mcpgen deploy` orchestration | CLI (`apps/cli`) | `apps/tenant-worker-runner` admin HTTP | Postgres write + Bun process spawn + Claude Desktop config emission |
| Binary distribution | CLI build | npm `optionalDependencies` + GitHub releases | 4 Bun-compile targets |
| DNS-rebinding mitigation | Hono middleware (every public endpoint) | — | Mandatory on dispatch + every tenant Worker (D-15) |
| Sentry header redaction | `@mcpgen/runtime` `beforeSend` helper | Existing FND-10 empty-DSN init | Plugged into Sentry SDK at app init |

## Standard Stack

### Core (verified versions, locked from CONTEXT)

| Library | Version (verified 2026-04-26) | Purpose | Why Standard |
|---------|------------------------------|---------|--------------|
| `bun` | 1.3.5 [VERIFIED: `bun --version`] | Local runtime for dispatch + tenant Workers + CLI | Locked stack. Bun's `serve()` runs Hono `app.fetch` natively |
| `hono` | 4.12.15 [VERIFIED: `npm view hono version`] | Web framework — same `app.fetch` runs on Bun and CF Workers | Locked stack. Already in `apps/dispatch/package.json` and `apps/dispatch-sample/package.json` |
| `@modelcontextprotocol/sdk` | 1.29.0 [VERIFIED: pinned in workspace] | MCP server impl in tenant Workers + `Mcp-Session-Id` semantics | Phase-1 D-04 lock; **NEVER bump to v2 in Phase 6** |
| `inngest` (TS SDK) | 4.2.4 [VERIFIED: `npm view inngest version`] | Function definitions for `usage-events-ingest-v1`, `usage-fallback-drain-v1`, `usage-reconciler-v1`, `warm-keep-active-tenants-v1` | Locked stack. Stable function IDs per CTRL-09 |
| `inngest-cli` | 1.18.0 [VERIFIED: `npm view inngest-cli version`] | Local Inngest dev server (default port 8288) [CITED: github.com/inngest/inngest-js example READMEs] | Replaces CF Queue locally per D-12. Phase-10 swap is `env.USAGE_QUEUE.send` against real binding |
| `commander` | 14.0.3 [VERIFIED: pinned in `apps/cli/package.json`] | CLI subcommand wiring (`init`, `deploy`, future) | Locked stack |
| `bun:sqlite` | bundled with Bun 1.3.5 | KV emulator for stored credentials + usage-event fallback | Locked stack (D-09); zero-install local SQLite |
| `@sentry/bun` (or `@sentry/cloudflare`) | 10.50.0 [VERIFIED: `npm view`] | Sentry SDK in dispatch / runner / tenant Workers; `beforeSend` redaction hook | `@sentry/cloudflare` is already in `apps/dispatch-sample/package.json`. Both run on Bun (Bun-native code path) and on CF Workers (Phase-10 swap is none — same package) |
| `wrangler` | 4.85.0 [VERIFIED] | NOT executed in Phase 6 (commits `wrangler.toml` only); Phase-10 deploys via `wrangler deploy --dispatch-namespace mcpgen-prod` | Already pinned in dispatch + sample workspaces; kept for Phase-10 reference |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `unstorage` | 1.17.5 [VERIFIED: `npm view unstorage version`] | Tenant-routing cache + KV emulator wrapper (memory driver locally; `cloudflare-kv-binding` Phase-10 swap) | **Recommended** for D-02 cache and D-09 stored-credentials KV. Same import surface across dev + prod = smallest Phase-10 blast radius |
| `ulid` | 3.0.2 [VERIFIED] | Generate `usage_event_id` (FND-04 schema) and `Idempotency-Key` values (FND-14 / D-11) | Used at every emit-site that needs collision-free dedup |
| `eventsource-parser` | 3.0.8 [pinned in cli/package.json] | If `mcpgen deploy` later streams progress over SSE | Optional; Phase 6 only needs it if the planner exposes a long-running deploy progress stream — not strictly required |
| `picocolors` | 1.1.1 [pinned] | CLI colored output for "deploy success" + "Phase-10 deferral" banners | Already in CLI |
| `@clack/prompts` | 0.7.0 [pinned] | Interactive `mcpgen deploy` prompts (collision confirm, OAuth stub explainer) | Already in CLI |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `unstorage` for KV emulator | Raw `bun:sqlite` everywhere | Simpler dependency tree but loses the "single import line swaps to CF KV" Phase-10 property; planner choice (CONTEXT discretion) |
| Inngest dev for usage transport | A bare Bun HTTP endpoint that writes directly to TimescaleDB | Skips real-CF parity; D-12 explicitly chose Inngest dev for vendor portability and Phase-10 cron reuse |
| `@hono/node-server` 2.0.0 | Bun-native `Bun.serve({ fetch: app.fetch })` | Bun-native is faster, zero deps, and matches CF Workers shape — Hono docs explicitly endorse `export default { port, fetch: app.fetch }` for Bun [CITED: hono.dev/docs/api/hono] |
| Bun child-process supervision | Cluster-mode (single Bun process with multiple workers) | Cluster-mode hides cold-start blast-radius that pitfall #14 specifically targets; per-process is the locked choice (D-04) |

**Installation snippet:**
```bash
# Workspace already has hono / @modelcontextprotocol/sdk / @sentry/cloudflare / wrangler / commander
# Phase 6 adds:
pnpm --filter @mcpgen/dispatch add unstorage
pnpm --filter @mcpgen/runtime add unstorage
pnpm --filter @mcpgen/cli add ulid
# tenant-worker-runner (new app) needs:
pnpm --filter @mcpgen/tenant-worker-runner add hono inngest @sentry/bun ulid
# Inngest dev is run, not installed:
npx inngest-cli@latest dev
```

**Version verification:** All versions above were validated via `npm view <pkg> version` during research (2026-04-26); the workspace already pins the locked-stack versions.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       MCP Client (Cursor / Claude Desktop / ChatGPT DR)  │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │  POST /mcp + JSON-RPC
                                       │  Headers: Authorization, X-Upstream-Auth, Mcp-Session-Id
                                       ▼
                ┌──────────────────────────────────────────────┐
                │  Dispatch Worker  (Bun + Hono on :8789)       │
                │  ┌────────────────────────────────────────┐  │
                │  │ 1. hostHeaderValidation (D-15)         │  │
                │  │ 2. authMiddleware (Bearer JWT precheck)│  │
                │  │ 3. rate-limit (in-memory bucket)       │  │
                │  │ 4. tenant lookup (unstorage 5-min TTL) │  │
                │  │ 5. capability negotiate (initialize)   │  │
                │  │ 6. cross-tenant smart-ID fuzz check    │  │
                │  │ 7. fetch(tenant_url, req)              │  │
                │  │ 8. response rewrite (gate outputSchema)│  │
                │  └────────────────────────────────────────┘  │
                └────┬───────────────────────────────────┬─────┘
                     │                                   │
                     │  fetch(http://localhost:8790...)  │  Postgres lookup miss
                     ▼                                   ▼
   ┌────────────────────────────┐        ┌────────────────────────────┐
   │ Tenant Worker A (:8790)    │        │ Postgres `deployments`      │
   │  Bun child process         │        │ (Neon, source of truth)     │
   │  ┌──────────────────────┐  │        └────────────────────────────┘
   │  │ hostHeaderValidation │  │
   │  │ authMiddleware       │  │
   │  │ McpServer (SDK 1.x)  │  │
   │  │ tools/* handlers     │──┼──┐
   │  │ @mcpgen/runtime      │  │  │ pass-through  ┌────────────────┐
   │  └──────────────────────┘  │  ├──────────────►│ Upstream API   │
   └────────────┬───────────────┘  │  decrypt(HKDF)│ (Stripe/etc.)  │
                │                  │   forward     └────────────────┘
                │ usage event      │
                │ ctx.waitUntil    │ stored: AES-GCM via bun:sqlite
                ▼                  │
   ┌──────────────────────────┐    │
   │  Inngest dev (:8288)     │    │ oauth: STUB → 501
   │  ┌────────────────────┐  │    │
   │  │ usage-events-      │  │    │
   │  │   ingest-v1        │──┼───►│  TimescaleDB usage_events
   │  │ usage-fallback-    │  │    │  (Neon, hypertable)
   │  │   drain-v1 (cron)  │  │    │
   │  │ usage-reconciler-  │──┼────┼──► (logs would-be Stripe payload)
   │  │   v1 (daily skel)  │  │    │
   │  │ warm-keep-active-  │  │    │
   │  │   tenants-v1 (5m)  │──┼────┼──► HEAD /health on each :879N
   │  └────────────────────┘  │    │
   └──────────────────────────┘    │
                                   │ on send failure
                                   ▼
                        ┌────────────────────────────┐
                        │ usage-fallback.sqlite       │
                        │ (bun:sqlite, per-runner)    │
                        └────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                            CLI (apps/cli)                                │
│   $ mcpgen deploy <bundle-dir>          (Bun-compiled single binary)    │
│       1. POST apps/tenant-worker-runner /admin/spawn → :879N URL         │
│       2. INSERT INTO deployments (cf_worker_name, local_port, …)         │
│       3. emit Claude Desktop config block + collision check (pitfall #30)│
│   $ mcpgen deploy --cf  →  exit 78 + Phase-10 deferral banner            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
apps/
├── dispatch/                       # Existing — Phase 6 fills the body
│   ├── src/
│   │   ├── index.ts                # Phase 6: replace 404-stub with real router
│   │   ├── middleware/
│   │   │   ├── hostHeaderValidation.ts   # D-15
│   │   │   ├── auth.ts                   # JWT precheck (Logto-issued; Phase 8 wires real verify)
│   │   │   ├── rateLimit.ts              # in-memory token bucket (Phase-10 swap: DO counter)
│   │   │   ├── tenantLookup.ts           # unstorage 5-min TTL → Postgres miss
│   │   │   ├── capabilityGate.ts         # D-11 protocolVersion rewrite
│   │   │   └── smartIdFuzz.ts            # D-03 / pitfall #1
│   │   └── routing/
│   │       └── forward.ts                # fetch(`http://${host}:${port}${path}`, …)
│   └── wrangler.toml               # Phase-10 reference, NOT executed
│
├── tenant-worker-runner/           # NEW (planner discretion D-04)
│   ├── src/
│   │   ├── index.ts                # Bun supervisor entry
│   │   ├── supervisor.ts           # spawn/kill/restart per deployments row
│   │   ├── port-allocator.ts       # next-free 8790+ (sequential)
│   │   └── admin/
│   │       ├── spawn.ts            # POST /admin/spawn
│   │       ├── kill.ts             # POST /admin/kill
│   │       └── list.ts             # GET /admin/list
│   ├── tests/
│   │   ├── p99-load.ts             # D-17 Bun-native load harness
│   │   └── crash-restart.test.ts
│   └── usage-fallback.sqlite       # bun:sqlite bucket (D-12)
│
├── dispatch-sample/                # Existing — Phase-6 Wave 2 wires real runtime
│   └── src/                        # NO shape changes; createStubRuntime → real factory
│
├── cli/                            # Existing — Phase 6 fills `deploy`
│   ├── src/
│   │   ├── index.ts                # Commander wiring
│   │   ├── commands/
│   │   │   ├── deploy.ts           # CLI-02 real impl
│   │   │   └── deploy-cf.ts        # exit-78 deferral
│   │   ├── claude-desktop-config.ts  # config block emit + collision detection (RUN-07)
│   │   └── runner-client.ts        # talks to apps/tenant-worker-runner/admin
│   └── build.ts                    # Already has 4-target loop; Phase 6 adds CI matrix
│
└── inngest-dev/                    # NEW (planner discretion)
    └── src/
        └── functions/
            ├── usage-events-ingest-v1.ts
            ├── usage-fallback-drain-v1.ts
            ├── usage-reconciler-v1.ts
            └── warm-keep-active-tenants-v1.ts

packages/
├── runtime-sdk/                    # Existing — Phase 6 replaces stubs with real bodies
│   └── src/
│       ├── index.ts                # FROZEN surface (11 methods + RuntimeContext)
│       ├── types.ts                # FROZEN types
│       ├── impl/                   # NEW
│       │   ├── smartId.ts          # parseSmartId / makeSmartId (regex from @mcpgen/ir)
│       │   ├── routes/
│       │   │   ├── search.ts       # OpenAI-compliant single-string signature
│       │   │   ├── fetch.ts        # OpenAI-compliant single-string signature
│       │   │   ├── listCollections.ts
│       │   │   ├── listObjects.ts
│       │   │   ├── upsert.ts       # smart-routing create vs update
│       │   │   └── delete.ts       # smart-routing object/objects/collection
│       │   ├── shapeResponse.ts
│       │   ├── applyFieldFilter.ts
│       │   └── handleUpstreamError.ts  # teaching errors per Stage E §8
│       ├── auth/
│       │   ├── passthrough.ts      # HKDF derive → AES-GCM decrypt (RUN-03)
│       │   ├── stored.ts           # bun:sqlite + per-tenant DEK (RUN-04)
│       │   └── oauth-stub.ts       # RUN-05 deferral
│       ├── usage/
│       │   ├── emit.ts             # send_to_inngest_dev + waitUntil shim
│       │   └── fallback.ts         # bun:sqlite bucket write
│       └── observability/
│           └── beforeSend.ts       # Sentry redactor (D-16)
```

### Pattern 1: Hono `app.fetch` portability invariant

**What:** Every Worker (dispatch + tenant) exports `app.fetch` so the same code runs on Bun and CF.
**When to use:** Always. This is the lift-shift contract.
**Example:**
```typescript
// Source: hono.dev/docs/api/hono [CITED]
import { Hono } from 'hono';
const app = new Hono<{ Bindings: Bindings }>();
app.get('/health', (c) => c.json({ status: 'ok' }));
// … middleware + routes …

// Bun (Phase 6):
export default { port: 8789, fetch: app.fetch };
// CF Workers (Phase 10 — same code):
// export default app;
```

### Pattern 2: Multi-port routing via `fetch`

**What:** Dispatch resolves `script_name → localhost:879N` via in-memory routing table, forwards via standard `fetch`.
**Example:**
```typescript
const tenantUrl = new URL(c.req.url);
tenantUrl.host = `localhost:${routing[scriptName].port}`;
const upstream = await fetch(tenantUrl, {
  method: c.req.method,
  headers: c.req.raw.headers,
  body: c.req.raw.body,
  // @ts-expect-error — Bun supports duplex on streaming bodies
  duplex: 'half',
});
return upstream;
```

### Pattern 3: `waitUntil` shim on Bun

**What:** CF Workers `ctx.waitUntil(promise)` keeps the request lifetime alive for fire-and-forget work. On Bun there is no `ExecutionContext`; we shim with a top-level `Set<Promise>` that the supervisor drains on graceful shutdown.
**Example:**
```typescript
// In @mcpgen/runtime/src/usage/emit.ts
const _pending = new Set<Promise<unknown>>();
export function waitUntil(p: Promise<unknown>): void {
  _pending.add(p);
  void p.finally(() => _pending.delete(p));
}
export async function drainPending(): Promise<void> {
  // tenant-worker-runner calls this on SIGTERM
  await Promise.allSettled([..._pending]);
}
```

### Pattern 4: Per-process `globalThis` cold-start init

**What:** Stage E template invariant — high-cost setup (Zod schema build, smart-ID regex compile) goes in the module-level scope, not per-request. Re-asserted in Phase-6 PATTERNS.md even though local Bun has near-zero cold start (alignment with Phase-10 codegen contract).
**Example:**
```typescript
// Source: docs/mcpgen-stage-e-design.md §3.3 [CITED]
// Compiled ONCE at module load (warm state):
const SMART_ID_REGEX = /^([a-z0-9-]+):(object|collection|schema):([a-zA-Z_]+):(.+)$/;
// (NOT inside the request handler.)
```

### Pattern 5: Stable Inngest function IDs (CTRL-09)

**What:** Function IDs are version-suffixed strings; Phase 9 audits orphan count = 0.
**Example:**
```typescript
import { Inngest } from 'inngest';
const inngest = new Inngest({ id: 'mcpgen' });

export const usageReconciler = inngest.createFunction(
  { id: 'usage-reconciler-v1' },                     // STABLE — never renamed
  { cron: '0 2 * * *' },                              // daily 02:00 UTC
  async ({ step }) => { /* TimescaleDB hourly query → log would-be Stripe */ },
);
```

### Pattern 6: KV-binding-compatible local store (D-09)

**What:** Use `unstorage`'s memory-driver locally; the same `getItem`/`setItem` calls work against `cloudflare-kv-binding` driver in Phase 10 with one driver swap.
**Example:**
```typescript
// Source: unstorage docs [CITED]
import { createStorage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
// Phase 10:
// import cfKVDriver from 'unstorage/drivers/cloudflare-kv-binding';
const kv = createStorage({ driver: memoryDriver() /* or cfKVDriver({ binding: env.STORED_CREDS }) */ });
await kv.setItem(`creds:${tenantId}:${upstream}`, encryptedBlob);
```

### Pattern 7: Atomic mode-routed auth dispatch

**What:** A single `authMode` switch in `@mcpgen/runtime/src/auth/index.ts` routes to one of three implementations (passthrough/stored/oauth-stub). Phase-10 swap is one file body.
**Example:**
```typescript
import type { AuthMode } from '@mcpgen/runtime';
import { decryptPassthrough } from './passthrough.js';
import { decryptStored } from './stored.js';
import { oauthStub } from './oauth-stub.js';

export async function resolveUpstreamCredential(
  req: Request, tenant: TenantConfig, mode: AuthMode,
): Promise<string> {
  switch (mode.mode) {
    case 'passthrough': return await decryptPassthrough(req, tenant);
    case 'stored':      return await decryptStored(tenant);
    case 'oauth':       throw oauthStub();      // Phase-6 returns structured 501
  }
}
```

### Anti-Patterns to Avoid

- **Capturing `request.headers` in Sentry default integration** → leaks `Authorization` + `X-Upstream-Auth` (pitfall #12). Always wire `beforeSend` redaction.
- **Storing `RUNTIME_KEK` in code or git** — secrets via env vars only; never logged.
- **Synchronous `await` on usage-event emit in tool response path** — ALWAYS `ctx.waitUntil` / `waitUntil` shim. Sync emit means every tool response waits on Inngest dev availability (and prod CF Queue latency).
- **Mutating routing table from outside dispatch** — only `apps/tenant-worker-runner` writes to it; dispatch reads. Avoids race conditions during deploy.
- **Throwing generic 500 from OAuth-mode handler** — must return structured `{ error: "oauth_mode_phase_10_deferral" }` so frontend FE-04 can detect (pitfall: deferral hidden in 500).
- **Reading from CF Queue in Phase 6 code** — explicitly forbidden. Use Inngest dev URL.
- **`local_port` as a top-level `deployments` column edited in place** — there is no schema migration in Phase 6 unless we add one (see §17 below); use `metadata jsonb` if available, otherwise add a NEW timestamped Drizzle migration per FND-08.
- **Bumping `@modelcontextprotocol/sdk` to v2** — Phase-1 D-04 lock; auto-bump silently breaks every `tools/*.ts` template.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HKDF key derivation | A custom HMAC chain | Web Crypto `crypto.subtle.deriveKey` with `HKDF` algorithm | Native, audited, FIPS-140-compatible. Available on Bun and CF Workers without additional install |
| AES-256-GCM encrypt/decrypt | A custom AES + GCM tag implementation | Web Crypto `crypto.subtle.encrypt`/`decrypt` with `{ name: 'AES-GCM', iv }` | Same — built-in, constant-time |
| KV emulator | Reimplementing get/put/delete with custom serialization | `unstorage` (memory driver locally; `cloudflare-kv-binding` Phase 10) | One driver swap, same API. (Or raw `bun:sqlite` if planner picks simpler-deps; either is acceptable per CONTEXT discretion) |
| Inngest function execution | A bare cron loop in dispatch | Inngest dev (`npx inngest-cli@latest dev`) + Inngest TS SDK | Same code shape works in Phase 10; durable retries; observability built-in |
| MCP `initialize` parsing | A custom JSON-RPC parser | `@modelcontextprotocol/sdk@^1.x` `Server` class on tenant Workers; **dispatch** parses raw JSON-RPC body to extract `protocolVersion` (per D-11) — minimal hand-roll because we can't run the full SDK at dispatch where there is no `McpServer` instance | Use SDK on tenant; minimal raw parse on dispatch (~10 lines) |
| Bun child-process supervision (spawn/kill/restart) | A bash script | `Bun.spawn({ cmd, stdio, ipc })` + a small TS supervisor module | Bun's `spawn` is native and gives us `process.exited` Promise + IPC; the supervisor has structured access to crash exit codes |
| ULID generation | timestamp+random concatenation | `ulid` 3.0.2 | Locked, lexicographic, collision-free |
| Cross-compile binaries | Cross-platform CI scripts | `bun build --compile --target=$T` (Bun 1.2+ supports universal cross-compile) | Phase-1 Plan 01-08 already verified all 4 targets compile from one host |
| DNS-rebinding mitigation | A custom Origin/Host check | MCP TS SDK pattern: `hostHeaderValidation(['localhost', '127.0.0.1', '[::1]'])` middleware, ported to Hono | The MCP SDK ships canonical Express + Fastify versions [CITED: github.com/modelcontextprotocol/typescript-sdk/packages/middleware]; Hono port is ~12 lines and reuses the same allowlist semantics |
| Sentry header redaction | A custom log-line regex sweep | Sentry SDK `beforeSend({ event }) → event` hook with explicit denylist | Single audit point; runs before any transport |

**Key insight:** every "don't hand-roll" item already has a stable cross-runtime equivalent that runs identically on Bun (Phase 6) and CF Workers (Phase 10). The architecture spec was deliberately chosen to keep this list short.

## Runtime State Inventory

> Phase 6 is greenfield runtime — no rename/refactor. Below documents the state Phase 6 **creates** (matters for Phase-10 swap planning):

| Category | Items Created | Phase-10 Swap |
|----------|---------------|---------------|
| Stored data (Postgres) | New rows in `deployments` (`cf_worker_name`, `local_port` if added, `auth_mode`); new rows in `usage_events` hypertable | Postgres rows stay; only the writer changes (Inngest dev → real CF Queue consumer). No data migration |
| Live service config | Inngest dev functions registered with stable IDs (`usage-events-ingest-v1`, `usage-fallback-drain-v1`, `usage-reconciler-v1`, `warm-keep-active-tenants-v1`) | Same function IDs registered to Inngest Cloud in Phase 10. **No rename**; CTRL-09 audits at Phase 9 |
| OS-registered state | Bun child processes managed by `apps/tenant-worker-runner` (in-memory, not OS-registered) | None — Phase 10 lets CF Workers for Platforms manage tenant lifecycles |
| Secrets/env vars | `RUNTIME_KEK` (master key for stored creds); `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` (none locally — dev mode); existing `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | `RUNTIME_KEK` moves from local `.env.local` to CF Workers Secret. Same env-var name in dispatch + tenant-worker-runner code; no rename |
| Build artifacts | `apps/cli/dist/mcpgen-{target}{ext}` (4 binaries); npm tarballs per OS via `optionalDependencies` | None — Phase 10 keeps the same artifact shape |

**Nothing found in OS-registered state:** verified — no Windows Task Scheduler / launchd / systemd entries created by Phase 6. Bun child processes live and die with the supervisor.

## Common Pitfalls

> Cross-references the Phase-6 row in `.planning/research/PITFALLS.md` "Pitfall-to-Phase Mapping" plus #4, #11, #12, #13, #14, #15, #21, #30 in detail.

### Pitfall 1: Cross-tenant smart-ID prefix collision (P0, #1)
**What goes wrong:** Without tenant-prefixed smart IDs and runtime fuzz check, an agent that has valid auth on tenant A can fetch a smart-ID belonging to tenant B (e.g. both wrap Stripe and the agent received `stripe:object:Charge:ch_…` from B's prior turn). Silent cross-tenant data exposure.
**Why it happens:** Pass 1 generates smart IDs without thinking about multi-server client configs.
**How to avoid:** (a) Smart-IDs are minted as `{tenant_short_id}-{spec_slug}:…` at deploy time (Phase 2 codegen contract); (b) dispatch parses the JSON-RPC params for any `id` / `ids` / `cursor` field, runs `parseSmartId`, and verifies prefix matches tenant resolved from URL. Mismatch → 403 `{ error: "smart_id_tenant_mismatch", expected_prefix, received_prefix }`.
**Warning signs:** F3 eval — tool call to tenant_a server succeeds with an ID from tenant_b's prior turn (test fixture in F1 covers static; runtime check covers dynamic).

### Pitfall 2: outputSchema breaks <2025-06-18 clients (P0, #4)
**What goes wrong:** Older Cursor/Claude Desktop builds reject the field with strict JSON-RPC validation, returning `-32602 Invalid params` on `tools/list`.
**Why:** Backward compat scoped to message format, not handshake.
**How to avoid:** Dispatch parses `protocolVersion` during `initialize`, persists in per-session map keyed by `Mcp-Session-Id` response header, rewrites `tools/list` and `tools/call` responses for legacy clients (D-11).
**Warning signs:** F3 mock-client run with 2024-11 protocolVersion sees `tools/list` 200 with no `outputSchema` (passes); without dispatch gating, sees `-32602`.

### Pitfall 3: Per-tenant dispatch namespace anti-pattern (P0, #11)
**What goes wrong:** Cloudflare W4P explicitly forbids namespace-per-tenant.
**How to avoid:** Phase 6 never creates namespaces (deferred to Phase 10 per FND-09). The local equivalent — single in-memory routing table per environment — is structurally enforced. Pre-commit hook `no-fourth-namespace.sh` stays installed.
**Warning signs:** Any Phase-6 code path that loops over `for tenant in deployments: createNamespace(tenant)` — STOP.

### Pitfall 4: Pass-through credential leakage to Sentry/Langfuse (P0, #12)
**What goes wrong:** Default Sentry capture grabs `request.headers` — if an exception fires before redaction, upstream Bearer token is in the event.
**How to avoid:** `beforeSend` hook in `@mcpgen/runtime/src/observability/beforeSend.ts` strips `Authorization`, `X-Upstream-Auth`, `Cookie`, plus a static list of spec-declared auth headers (e.g. `Stripe-Account`). Outbound chokepoint scrubs from any logging destination.
**Warning signs:** Sentry event search for literal `Bearer ` returns >0; BetterStack grep for `sk_live_` / `ghp_` returns >0. Phase 9 PII audit deliberately leaks and verifies.

### Pitfall 5: Usage event loss under transport backpressure (P0, #13)
**What goes wrong:** Inngest dev unavailable → tenant Worker `.send()` rejects → silent revenue loss OR latency regression.
**How to avoid:** `ctx.waitUntil(send_to_inngest_dev(...))` with `.catch()` that writes to local SQLite fallback bucket; Inngest cron `usage-fallback-drain-v1` (every 5 min) drains. UNIQUE `(tenant_id, tool_call_id)` constraint at DB layer dedupes re-emits. Daily reconciliation skeleton (`usage-reconciler-v1`) computes drift from TimescaleDB hourly aggregates; logs would-be Stripe payload.
**Warning signs:** `usage-fallback.sqlite` row count > 0 for sustained periods; reconciler skeleton logs drift > 0.5 % between attempted-send count and TimescaleDB rows.

### Pitfall 6: Cold-start tax on first tool call (P1, #14)
**What goes wrong:** P99 < 50ms over upstream — cold start can blow this if first request hits an idle process.
**How to avoid:** (a) `globalThis` init for high-cost setup (Zod build, regex compile) in tenant Worker template; (b) warm-keep cron `warm-keep-active-tenants-v1` pings `/health` every 5 min on each `:879N`; (c) supervisor pre-spawns processes on boot (not lazy spawn on first request).
**Warning signs:** P99 measurement oscillates with traffic; first call after idle > 5 min hits 200ms+. Local Bun has near-zero cold start so this matters mostly as a Phase-10 parity scaffold.

### Pitfall 7: DNS-rebinding via Streamable HTTP (P0, #15)
**What goes wrong:** MCP TS SDK explicitly warns Streamable HTTP needs Host header validation.
**How to avoid:** Hono `hostHeaderValidation` middleware on dispatch + every tenant Worker, with `ALLOWED_HOSTS` env var (local default `localhost,127.0.0.1`).
**Example:**
```typescript
// Source: github.com/modelcontextprotocol/typescript-sdk/packages/middleware (port to Hono) [CITED]
import type { MiddlewareHandler } from 'hono';
export function hostHeaderValidation(allowed: ReadonlyArray<string>): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host')?.split(':')[0] ?? '';
    if (!allowed.includes(host)) return c.json({ error: 'invalid_host' }, 403);
    return next();
  };
}
```

### Pitfall 8: Inngest function ID drift / orphans (P2, #21)
**What goes wrong:** Renaming a function ID in code creates a NEW Inngest function; old continues firing if not explicitly disabled. Duplicate runs, duplicate emails.
**How to avoid:** Stable IDs (`usage-reconciler-v1`, `warm-keep-active-tenants-v1`, `usage-events-ingest-v1`, `usage-fallback-drain-v1`); bumps via deliberate version-suffix change + decision-log entry. Phase 9 (CTRL-09) audits orphan count = 0.
**Warning signs:** Inngest dashboard shows `usage-reconciler-v1` AND `usage-reconciler-v2` both registered.

### Pitfall 9: Claude Desktop config block collision (P1, #30)
**What goes wrong:** User has two `mcpgen deploy`-emitted blocks with the same `mcpServers.{name}` slot (e.g., user deploys Stripe twice) → Claude Desktop dispatch becomes nondeterministic.
**How to avoid:** CLI reads existing config (macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`, Linux `~/.config/Claude/claude_desktop_config.json`), checks BOTH `mcpServers.{name}` slot AND URL collision. Fail with structured prompt to re-run with `--name <override>`.

## Code Examples

> All examples below are verified-shape patterns. Cited source documents are referenced inline.

### Example 1: Bun + Hono dispatch entry (RUN-01)

```typescript
// apps/dispatch/src/index.ts (Phase 6)
// Source: hono.dev/docs/api/hono [CITED]
import { Hono } from 'hono';
import { hostHeaderValidation } from './middleware/hostHeaderValidation.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimit } from './middleware/rateLimit.js';
import { tenantLookup } from './middleware/tenantLookup.js';
import { capabilityGate } from './middleware/capabilityGate.js';
import { smartIdFuzz } from './middleware/smartIdFuzz.js';
import { forwardToTenant } from './routing/forward.js';

interface Bindings {
  DISPATCH_NAMESPACE: DispatchNamespace; // typed but unused locally; Phase 10 reads it
  HYPERDRIVE: Hyperdrive;
  SENTRY_DSN?: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Bindings }>();
const allowedHosts = (process.env.ALLOWED_HOSTS ?? 'localhost,127.0.0.1').split(',');

app.use('*', hostHeaderValidation(allowedHosts));     // D-15
app.use('*', authMiddleware);                          // Bearer JWT precheck
app.use('*', rateLimit);                               // in-memory bucket
app.use('*', tenantLookup);                            // unstorage 5-min TTL
app.use('*', capabilityGate);                          // D-11 protocolVersion
app.use('*', smartIdFuzz);                             // D-03 / pitfall #1
app.all('*', forwardToTenant);                         // fetch :879N

app.get('/health', (c) => c.json({ status: 'ok', service: 'dispatch' }));

// Bun (Phase 6):
export default { port: 8789, fetch: app.fetch };
// Phase 10 (CF Workers):
// export default app;
```

### Example 2: Smart-ID parse + tenant fuzz check (RUN-01 / D-03)

```typescript
// packages/runtime-sdk/src/impl/smartId.ts (Phase 6)
// Source: docs/mcpgen-pass-1-design.md §"Smart IDs" [CITED]
import type { SmartId } from '../types.js';
// Regex sourced from packages/ir/src/types.ts SmartIdSchema (single source of truth)
import { SMART_ID_REGEX } from '@mcpgen/ir';

export function parseSmartId(id: string): SmartId {
  const m = SMART_ID_REGEX.exec(id);
  if (!m) throw new Error(`invalid_smart_id: ${id}`);
  const [, server, type, collection, identifier] = m;
  if (type !== 'object' && type !== 'collection' && type !== 'schema') {
    throw new Error(`invalid_smart_id_type: ${type}`);
  }
  return { server, type, collection, identifier };
}

export function makeSmartId(parts: SmartId): string {
  return `${parts.server}:${parts.type}:${parts.collection}:${parts.identifier}`;
}
```

```typescript
// apps/dispatch/src/middleware/smartIdFuzz.ts (Phase 6)
// Source: docs/mcpgen-pass-1-design.md + pitfall #1 [CITED]
import type { MiddlewareHandler } from 'hono';
import { parseSmartId } from '@mcpgen/runtime';

export const smartIdFuzz: MiddlewareHandler = async (c, next) => {
  const tenantPrefix = c.get('tenantPrefix') as string; // set by tenantLookup middleware
  // Drain body once, store on context; downstream middleware/handlers read from there.
  const cloned = c.req.raw.clone();
  let body: unknown;
  try { body = await cloned.json(); } catch { return next(); /* not JSON-RPC */ }

  const candidates = collectSmartIdCandidates(body);  // recurse params for id/ids/cursor strings
  for (const candidate of candidates) {
    try {
      const sid = parseSmartId(candidate);
      if (sid.server !== tenantPrefix) {
        return c.json(
          { error: 'smart_id_tenant_mismatch', expected_prefix: tenantPrefix, received_prefix: sid.server },
          403,
        );
      }
    } catch { /* not a smart-id; ignore */ }
  }
  return next();
};
```

### Example 3: Pass-through credential decrypt (RUN-03)

```typescript
// packages/runtime-sdk/src/auth/passthrough.ts (Phase 6)
// HKDF + AES-GCM via Web Crypto — both available on Bun and CF Workers
const TEXT_ENCODER = new TextEncoder();

async function deriveKey(secretMaterial: ArrayBuffer, info: string): Promise<CryptoKey> {
  // RUNTIME_KEK is the master key; per-tenant secret material is loaded from env
  // at supervisor spawn time (passed via env var, NEVER persisted to disk).
  const baseKey = await crypto.subtle.importKey(
    'raw', secretMaterial, { name: 'HKDF' }, false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF', hash: 'SHA-256',
      salt: TEXT_ENCODER.encode('mcpgen.passthrough.v1'),
      info: TEXT_ENCODER.encode(info),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, ['decrypt'],
  );
}

export async function decryptPassthrough(req: Request, tenantId: string): Promise<string> {
  const blob = req.headers.get('X-Upstream-Auth');
  if (!blob) throw new Error('missing_x_upstream_auth');

  // Parse: base64( iv | ciphertext_with_tag )
  const raw = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);

  const key = await deriveKey(getTenantSecret(tenantId), `tenant:${tenantId}`);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plaintext);
  // CRITICAL: never log `blob`, `raw`, `plaintext` — beforeSend redactor catches residuals.
}
```

### Example 4: Stored credentials with `bun:sqlite` (RUN-04)

```typescript
// packages/runtime-sdk/src/auth/stored.ts (Phase 6)
// Source: docs/mcpgen-architecture.md §14 (per-tenant DEK + KEK wrap pattern) [CITED]
import { Database } from 'bun:sqlite';

const db = new Database(process.env.STORED_CREDS_DB ?? 'stored-creds.sqlite');
db.exec(`
  CREATE TABLE IF NOT EXISTS tenant_creds (
    tenant_id TEXT NOT NULL,
    upstream  TEXT NOT NULL,
    iv        BLOB NOT NULL,
    ct        BLOB NOT NULL,           -- AES-GCM ciphertext+tag
    wrapped_dek BLOB NOT NULL,         -- DEK wrapped under RUNTIME_KEK
    created_at INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, upstream)
  );
`);

async function unwrapDek(wrapped: ArrayBuffer): Promise<CryptoKey> {
  const kek = await crypto.subtle.importKey(
    'raw',
    Buffer.from(process.env.RUNTIME_KEK!, 'base64'),
    { name: 'AES-KW' }, false, ['unwrapKey'],
  );
  return crypto.subtle.unwrapKey(
    'raw', wrapped, kek, { name: 'AES-KW' },
    { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
}

export async function decryptStored(tenantId: string, upstream: string): Promise<string> {
  const row = db.query(
    'SELECT iv, ct, wrapped_dek FROM tenant_creds WHERE tenant_id = ? AND upstream = ?',
  ).get(tenantId, upstream) as { iv: Uint8Array; ct: Uint8Array; wrapped_dek: Uint8Array } | null;
  if (!row) throw new Error('stored_creds_not_found');

  const dek = await unwrapDek(row.wrapped_dek.buffer);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv }, dek, row.ct);
  return new TextDecoder().decode(plaintext);
}
```

### Example 5: OAuth-mode stub (RUN-05 deferral)

```typescript
// packages/runtime-sdk/src/auth/oauth-stub.ts (Phase 6 only)
// Source: CONTEXT.md D-10 — exact stub shape required for FE-04 [CITED]
export function oauthStub(): never {
  const err = new Error('oauth_mode_phase_10_deferral');
  // Marker fields the frontend reads via JSON Response wrapping:
  Object.assign(err, {
    code: 'oauth_mode_phase_10_deferral',
    message:
      'OAuth on-behalf flow ships in Phase 10 with @cloudflare/workers-oauth-provider. ' +
      'Use auth_mode = "passthrough" or "stored" until then.',
    deferred_to_phase: 10,
  });
  throw err;
}
// In the Hono error boundary:
// app.onError((err, c) => {
//   if ((err as any).code === 'oauth_mode_phase_10_deferral') {
//     return c.json({ error: (err as any).code, message: err.message, deferred_to_phase: 10 }, 501);
//   }
//   throw err;
// });
```

### Example 6: Capability gate (D-11)

```typescript
// apps/dispatch/src/middleware/capabilityGate.ts (Phase 6)
// Source: MCP spec 2025-03-26 (Mcp-Session-Id) + 2025-06-18 (outputSchema) [CITED]
import type { MiddlewareHandler } from 'hono';
const sessionVersions = new Map<string, string>(); // sessionId → protocolVersion

export const capabilityGate: MiddlewareHandler = async (c, next) => {
  const sid = c.req.header('Mcp-Session-Id');
  const cloned = c.req.raw.clone();
  let body: { method?: string; params?: { protocolVersion?: string } } = {};
  try { body = await cloned.json(); } catch {}

  if (body?.method === 'initialize' && body.params?.protocolVersion) {
    if (!sid) {
      const newSid = crypto.randomUUID();
      sessionVersions.set(newSid, body.params.protocolVersion);
      c.header('Mcp-Session-Id', newSid);
    } else {
      sessionVersions.set(sid, body.params.protocolVersion);
    }
  }
  await next();

  const pv = sid ? sessionVersions.get(sid) : undefined;
  if (pv && pv < '2025-06-18') {
    // Rewrite tools/list and tools/call responses on the way out
    const text = await c.res.clone().text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { return; }
    const downgraded = downgradeForLegacy(json, body?.method);
    c.res = new Response(JSON.stringify(downgraded), {
      status: c.res.status, headers: c.res.headers,
    });
  }
};
```

### Example 7: Usage-event emit + fallback (RUN-06)

```typescript
// packages/runtime-sdk/src/usage/emit.ts (Phase 6)
// Source: contracts/src/usage-event.ts (FROZEN) + D-12 [CITED]
import { ulid } from 'ulid';
import { type UsageEvent, UsageEvent as UsageEventSchema } from '@mcpgen/contracts';
import { writeFallback } from './fallback.js';

const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288/e/mcpgen-dev';
const _pending = new Set<Promise<unknown>>();

export function waitUntil(p: Promise<unknown>): void {
  _pending.add(p);
  void p.finally(() => _pending.delete(p));
}

export async function emitUsageEvent(event: UsageEvent): Promise<void> {
  // Validate at emit-site (single source of truth check)
  UsageEventSchema.parse(event);

  const send = fetch(INNGEST_DEV_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'usage/event.recorded', data: event }),
  })
    .then(async (r) => { if (!r.ok) throw new Error(`inngest_dev_${r.status}`); })
    .catch(async (e) => {
      // Backpressure / dev unavailable → fallback bucket
      await writeFallback(event);
      console.warn('[usage] fallback write:', (e as Error).message);
    });

  waitUntil(send);
}
```

### Example 8: Inngest dev usage-events ingest function

```typescript
// apps/inngest-dev/src/functions/usage-events-ingest-v1.ts (Phase 6)
// Source: github.com/inngest/inngest-js docs [CITED]
import { Inngest } from 'inngest';
import { UsageEvent } from '@mcpgen/contracts';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

const inngest = new Inngest({ id: 'mcpgen' });

export const usageEventsIngest = inngest.createFunction(
  { id: 'usage-events-ingest-v1', concurrency: { limit: 25 } },
  { event: 'usage/event.recorded' },
  async ({ event, step }) => {
    const parsed = UsageEvent.parse(event.data);
    await step.run('insert-timescale', async () => {
      // ON CONFLICT DO NOTHING via the FROZEN contract:
      // UNIQUE (deployment_id, time, tool_name, idempotency_key) — see usage_events schema
      await db.execute(sql`
        INSERT INTO usage_events (
          time, deployment_id, tool_name, tokens_in, tokens_out,
          upstream_latency_ms, worker_cpu_ms, status, client_type, error_class
        ) VALUES (
          ${parsed.time}, ${parsed.deployment_id}, ${parsed.tool_name},
          ${parsed.tokens_in}, ${parsed.tokens_out},
          ${parsed.upstream_latency_ms}, ${parsed.worker_cpu_ms},
          ${parsed.status}, ${parsed.client_type}, ${parsed.error_class}
        ) ON CONFLICT DO NOTHING
      `);
    });
  },
);
```

### Example 9: `mcpgen deploy` real impl (CLI-02)

```typescript
// apps/cli/src/commands/deploy.ts (Phase 6)
// Source: CONTEXT D-13 + pitfall #30 [CITED]
import { Command } from 'commander';
import { spawnTenantWorker } from '../runner-client.js';
import { writeClaudeDesktopConfigBlock } from '../claude-desktop-config.js';
import pc from 'picocolors';

export function registerDeploy(program: Command): void {
  program
    .command('deploy <bundle-dir>')
    .option('--cf, --remote', 'deploy to Cloudflare (Phase 10 — currently deferred)')
    .option('--name <name>', 'override mcpServers slot name on collision')
    .action(async (bundleDir: string, opts: { cf?: boolean; name?: string }) => {
      if (opts.cf) {
        console.error(pc.yellow('--cf is deferred to Phase 10. See Phase-10 launch-readiness.'));
        process.exit(78);  // EX_CONFIG, matches infrastructure/cloudflare/scripts/create-namespaces.sh
      }
      const result = await spawnTenantWorker(bundleDir);
      // result: { deploymentId, scriptName, port, url }
      writeClaudeDesktopConfigBlock({
        name: opts.name ?? result.scriptName,
        url: result.url,
      });
      console.log(pc.green(`✓ Deployed ${result.scriptName} → ${result.url}`));
    });
}
```

### Example 10: Bun cross-compile loop (CLI-03 — already exists; Phase 6 wraps it in CI)

```typescript
// apps/cli/build.ts — already in repo. Phase 6 adds CI matrix that runs
// `bun-darwin-arm64` on macOS-arm runner, `bun-darwin-x64` on macOS-intel,
// `bun-linux-x64` on linux-x64, `bun-windows-x64` on linux-x64 (cross-compile)
// and verifies `--help` runs on each target OS.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pinning per-tenant CF dispatch namespaces | Single namespace per env (prod/staging/sandbox) — never per-tenant | 2025 (Cloudflare W4P guidance) | Pitfall #11 mitigation; tenant identity = script name |
| MCP SDK v1 (`server.tool(name, desc, schema, handler)`) | MCP SDK v2 (`registerTool({ title, description, inputSchema, outputSchema }, handler)`) | 2025 ecosystem shift | Phase-6 STAYS on v1 (D-04); v2 bump is a deliberate post-launch chore PR |
| Sync queue.send() for usage events | `ctx.waitUntil(queue.send(...))` + KV fallback bucket + reconciler cron | 2024+ Cloudflare best-practice | Pitfall #13; Phase 6 swaps the transport (Inngest dev) but keeps the pattern |
| `outputSchema` always emitted | `outputSchema` gated by client `protocolVersion` (rewritten at dispatch) | MCP spec 2025-06-18 + 2024-11 backward-compat | Pitfall #4 mitigation; D-11 |
| AES-CBC + custom HMAC | Web Crypto AES-GCM with built-in tag | Modern browsers + Bun + CF Workers all support `crypto.subtle` | Native, audited, constant-time |
| Tenant lookups against KV directly | Postgres = source of truth; KV/unstorage cache layer with 5-min TTL | Architecture refinement | Tolerates KV outages; cache rebuild is fast |

**Deprecated / outdated:**
- LiteLLM in any path → REMOVED per `docs/mcpgen-model-and-provider-override.md`. Phase 6 has no LLM calls anyway.
- Per-tenant dispatch namespaces — explicitly forbidden by Cloudflare.
- Logging spec content / upstream responses / upstream credentials — privacy-LOCKED constraint.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `unstorage` 1.17.5 has both a `memory` driver (Phase 6) and a `cloudflare-kv-binding` driver (Phase 10) usable with identical `getItem`/`setItem` API. | §3 / Pattern 6 | Low — `unstorage` docs document both drivers. If the `cloudflare-kv-binding` driver is not 100 % API-equivalent, planner can fall back to raw `bun:sqlite` (CONTEXT discretion) at the cost of a larger Phase-10 swap surface |
| A2 | Bun 1.2+ supports cross-compile of all 4 targets (`bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`, `bun-windows-x64`) from a single Linux runner. | §10 / CI matrix | Low — Plan 01-08 already verified all 4 targets compile locally; CI matrix design is the only open question |
| A3 | `apps/inngest-dev/` is the right home for the 4 Inngest functions (vs folding into `apps/api/inngest/`). | §8 / project structure | Low — CONTEXT lists this as planner discretion. Any of the three locations works |
| A4 | The existing `deployments` table has no `metadata jsonb` column, so a NEW Drizzle migration `20260428000000_add_local_port_to_deployments.sql` is needed for `local_port`. | §17 schema migration | Medium — verified in Read of `db-schema.ts` line 133–143: NO `metadata` column exists. A new migration is REQUIRED |
| A5 | Inngest dev server default port is 8288 [VERIFIED via Inngest docs example]. | §8 | None — verified |
| A6 | `Mcp-Session-Id` HTTP header is the canonical session identifier per MCP 2025-03-26 transport spec. | §7 / Example 6 | Low — confirmed in MCP TS SDK Streamable HTTP docs |
| A7 | `RUNTIME_KEK` will be loaded from `.env.local` in Phase 6 and migrated to CF Workers Secret in Phase 10 with the same env-var name. | §5 | None — env var name is the locked contract; secret destination changes only |
| A8 | Hono `app.fetch` body-cloning idiom (`c.req.raw.clone()`) works identically on Bun's native `fetch` and CF Workers. | §15 / Example 2, 6 | Low — both runtimes implement Web Standard `Request.clone()` |
| A9 | The `usage_events` hypertable already enforces dedup at Postgres layer via existing schema constraints. **Need to verify:** the FROZEN contract (CONTEXT) implies `UNIQUE (tenant_id, tool_call_id)` exists — but the migrated DDL in `20260427000000_init_schema.sql` only has indexes, NOT a unique constraint. | §8 | **MEDIUM RISK** — likely needs the same Phase-6 migration as A4, OR an `ON CONFLICT DO NOTHING` guard at insert-site. See Open Questions #6 |

**Where this matters:** A4 and A9 imply at least one Phase-6 Drizzle migration. The planner should treat that as a `[BLOCKING]` task (per FND-08 / docs/decisions/001 timestamp-prefix convention) before any code-level work depending on the new column or the unique constraint.

## Open Questions

1. **Does `deployments` need a NEW Drizzle migration for `local_port`?**
   - What we know: existing schema (`packages/contracts/src/db-schema.ts` lines 133–143) has no `metadata jsonb` column; columns are: `id`, `generation_id`, `cf_worker_name` (UNIQUE), `dispatch_namespace`, `url`, `auth_mode`, `created_at`.
   - What's unclear: whether the planner prefers (a) add `local_port integer NULL` column via new migration (cleaner schema), or (b) put `local_port` inside `url` (e.g., `http://localhost:8790`) and parse on read (no migration but coupling).
   - Recommendation: **Add new migration** `20260428000000_add_local_port_to_deployments.sql` (and possibly a `metadata jsonb` general-purpose column for future) — cleaner separation, matches FND-08 pattern. Tag the task `[BLOCKING]`.

2. **Where does `apps/tenant-worker-runner/` live — new app or folder inside `apps/dispatch/`?**
   - What we know: CONTEXT says planner picks; both are acceptable.
   - Recommendation: **New app**. Dispatch's responsibility is routing + auth + capability gating; supervisor's responsibility is process lifecycle + admin endpoints. Mixing them blurs the Phase-10 swap boundary (in Phase 10 the supervisor disappears entirely; dispatch keeps doing the same job).

3. **KV emulator wrapper API choice — `unstorage` vs raw `bun:sqlite`?**
   - What we know: CONTEXT marks both acceptable.
   - Recommendation: **`unstorage` for the 5-min TTL routing cache (D-02) and stored-credentials KV (D-09)**. Raw `bun:sqlite` for the **usage-event fallback bucket (D-12)** because the bucket has no Phase-10 swap target equivalent (Phase 10 uses CF Queue + KV, not a fallback file). Two purposes, two tools.

4. **Inngest dev runner home — `apps/dispatch/inngest/` vs `apps/api/inngest/` vs new `apps/inngest-dev/`?**
   - What we know: CONTEXT planner discretion.
   - Recommendation: **`apps/inngest-dev/`** as a new app. Functions are not coupled to a specific HTTP boundary; both `apps/api` (Phase 8 Drift Watcher) and `apps/tenant-worker-runner` (Phase 6 usage events) consume the same Inngest URL. Single registration point; future-proof for Phase 8 functions.

5. **Whether `mcpgen deploy --cf` is wired in Phase 6 with a deferral banner or completely absent?**
   - What we know: CONTEXT Claude's discretion list says "recommended: wire the flag with the banner so the surface is committed."
   - Recommendation: **Wire the flag.** Same exit-78 pattern as `infrastructure/cloudflare/scripts/create-namespaces.sh`. Forces planner-of-Phase-10 to think about the flag instead of reinventing it.

6. **Does the `usage_events` hypertable need a UNIQUE constraint added in Phase 6?**
   - What we know: D-12 says "UNIQUE `(tenant_id, tool_call_id)` for dedup"; the existing migration only has B-tree indexes, no UNIQUE.
   - What's unclear: (a) the CONTEXT phrasing "tool_call_id" doesn't match any column name (closest is `idempotency_key` from `usage-event.ts` schema, but that's not in the DB columns either — see `db-schema.ts` lines 201–219 — `idempotency_key` is in the Zod payload, NOT the DB row); (b) whether dedup should happen via a migration-added UNIQUE or an `ON CONFLICT DO NOTHING` guard at insert.
   - Recommendation: **Both, in this order:** (i) Phase 6 adds an `idempotency_key` column to `usage_events` via the same new Drizzle migration as #1 above, with `UNIQUE (deployment_id, idempotency_key)` constraint; (ii) all inserts use `ON CONFLICT DO NOTHING` for defence-in-depth. Tag the task `[BLOCKING]`. **Also propose a `chore(contracts): align usage-event idempotency_key with usage_events DB column` PR** since the FROZEN contract has `idempotency_key` in the Zod schema but the migrated DB doesn't store it — drift between contract and DB needs reconciliation per D-21 cross-workstream test ownership.

7. **Bun cross-compile CI matrix — which OS runners verify which targets?**
   - What we know: Bun 1.2+ claims all 4 targets cross-compile from a single host; Plan 01-08 verified locally.
   - What's unclear: whether the CI **verifies** the binary on the target OS (i.e., runs `mcpgen --version` after download) or just trusts the cross-compile output.
   - Recommendation: **Cross-compile on a single linux-x64 runner; verify each binary on its native OS runner.** GitHub Actions matrix: build job × 1 (linux-x64) → upload artifacts → 4 verify jobs (ubuntu-latest for linux, macos-13 for darwin-x64, macos-14 for darwin-arm64, windows-latest for windows-x64). Each verify job downloads the artifact and runs `--version`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | dispatch / runner / CLI / sample / inngest-dev | ✓ | 1.3.5 | — (locked stack) |
| Node.js | tooling (pnpm scripts; not runtime) | ✓ | ≥22.0.0 (per `package.json` engines) | — |
| pnpm | workspace install | ✓ | 10.30.2 | — |
| Postgres (Neon) | `deployments` + `usage_events` | ✓ via `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Neon dev branch (PG 16 + TimescaleDB 2.17.1 + pgvector 0.8.0) | — |
| Inngest dev (`npx inngest-cli@latest dev`) | usage event pipeline | ✓ via `npx` (no install needed) | 1.18.0 | — — D-12 mandates it |
| OpenRouter | (not used in Phase 6 — runtime is deterministic) | ✓ | n/a | — |
| Logto Cloud | (not used in Phase 6 — Phase 8 ops) | ✓ in `.env.local` | n/a | — |
| Langfuse local | (not used in Phase 6 — runtime emits no LLM traces) | ✓ on `localhost:3001` | n/a | — |
| Cloudflare API token | not needed | n/a | — | — — Phase 10 only |
| Fly.io CLI | not needed | n/a | — | — — Phase 10 only |
| `wrangler` (executed) | not executed in Phase 6 | n/a | n/a | Local Bun via `serve` instead |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** none — all required compute-runtime dependencies are local; cloud SaaS dependencies (Neon, Inngest dev) are available via `.env.local` credentials and `npx`.

## Validation Architecture

> Per Nyquist validation: every requirement has a verification mechanism. Test files are paths the executor will create; commands are runnable from the repo root.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` 1.6.0 (existing per workspace) |
| Config file | each app has its own `vitest.config.ts` (existing pattern) |
| Quick run command | `pnpm --filter @mcpgen/runtime test` (per-package) |
| Full suite command | `pnpm test` (turbo across all workspaces) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RUN-01 | Dispatch routes `/t/{script_name}` to `localhost:879N`; capability gates for 3 protocolVersion mock clients | integration | `pnpm --filter @mcpgen/dispatch test -- dispatch.test.ts` | ❌ Wave 0 (`tests/runtime/dispatch.test.ts`) |
| RUN-01 | `hostHeaderValidation` rejects unknown Host headers | unit | `pnpm --filter @mcpgen/dispatch test -- hostHeaderValidation.test.ts` | ❌ Wave 0 |
| RUN-01 | Smart-ID fuzz returns 403 on cross-tenant prefix | unit | `pnpm --filter @mcpgen/dispatch test -- smartIdFuzz.test.ts` | ❌ Wave 0 |
| RUN-01 | `Mcp-Session-Id` is set on `initialize` and persists protocolVersion across requests | integration | `pnpm --filter @mcpgen/dispatch test -- session.test.ts` | ❌ Wave 0 |
| RUN-02 | All 11 `Runtime` methods have non-throwing implementations | unit (introspection) | `pnpm --filter @mcpgen/runtime test -- not-stubbed.test.ts` | ❌ Wave 0 — extends Phase-1 stub-throws test |
| RUN-02 | `parseSmartId` / `makeSmartId` round-trip | unit | `pnpm --filter @mcpgen/runtime test -- smartId.test.ts` | ❌ Wave 0 |
| RUN-02 | P99 < 50ms over upstream on 30s 100-rps load with fixed-latency stub | load test | `pnpm --filter @mcpgen/tenant-worker-runner test -- p99-load.ts` | ❌ Wave 0 (`apps/tenant-worker-runner/tests/p99-load.ts`) |
| RUN-02 | Crash-restart: kill a tenant Bun process; supervisor restarts within 5s | integration | `pnpm --filter @mcpgen/tenant-worker-runner test -- crash-restart.test.ts` | ❌ Wave 0 |
| RUN-02 | warm-keep cron pings every active deployment's `/health` every 5 min | integration | `pnpm --filter @mcpgen/inngest-dev test -- warm-keep.test.ts` | ❌ Wave 0 |
| RUN-03 | `decryptPassthrough` correctly decrypts a known-good HKDF+AES-GCM blob | unit | `pnpm --filter @mcpgen/runtime test -- passthrough.test.ts` | ❌ Wave 0 |
| RUN-03 | Sentry `beforeSend` redacts `Authorization`, `X-Upstream-Auth`, `Cookie` from event headers | unit | `pnpm --filter @mcpgen/runtime test -- beforeSend.test.ts` | ❌ Wave 0 |
| RUN-03 | Outbound chokepoint: deliberate-leak test — wrap `fetch` with a credential string and assert no log line contains it | integration | `pnpm --filter @mcpgen/runtime test -- credential-scrub.test.ts` | ❌ Wave 0 |
| RUN-04 | `decryptStored` round-trips through `bun:sqlite` (encrypt → store → decrypt) | unit | `pnpm --filter @mcpgen/runtime test -- stored.test.ts` | ❌ Wave 0 |
| RUN-04 | Per-tenant DEKs are isolated (tenant A's key cannot decrypt tenant B's blob) | unit | `pnpm --filter @mcpgen/runtime test -- stored-isolation.test.ts` | ❌ Wave 0 |
| RUN-05 | OAuth-mode handler returns 501 with `{ error: "oauth_mode_phase_10_deferral", deferred_to_phase: 10 }` | unit | `pnpm --filter @mcpgen/runtime test -- oauth-stub.test.ts` | ❌ Wave 0 |
| RUN-06 | `emitUsageEvent` validates against frozen `UsageEvent` schema and POSTs to Inngest dev | integration | `pnpm --filter @mcpgen/runtime test -- usage-emit.test.ts` (against ephemeral `inngest-cli dev`) | ❌ Wave 0 |
| RUN-06 | Inngest function `usage-events-ingest-v1` writes to TimescaleDB with `ON CONFLICT DO NOTHING` | integration | `pnpm --filter @mcpgen/inngest-dev test -- ingest.test.ts` (against real Neon dev branch) | ❌ Wave 0 |
| RUN-06 | Fallback bucket: when Inngest dev is unreachable, event lands in `usage-fallback.sqlite` | integration | `pnpm --filter @mcpgen/runtime test -- usage-fallback.test.ts` | ❌ Wave 0 |
| RUN-06 | `usage-fallback-drain-v1` cron drains bucket and emits to ingest | integration | `pnpm --filter @mcpgen/inngest-dev test -- fallback-drain.test.ts` | ❌ Wave 0 |
| RUN-06 | `usage-reconciler-v1` skeleton runs and logs structured payload | integration | `pnpm --filter @mcpgen/inngest-dev test -- reconciler.test.ts` | ❌ Wave 0 |
| RUN-07 | `mcpgen deploy` emits a Claude Desktop config block with correct shape | unit | `pnpm --filter @mcpgen/cli test -- claude-desktop-config.test.ts` | ❌ Wave 0 |
| RUN-07 | Collision detection: deploying twice with same name fails unless `--name` provided | unit | `pnpm --filter @mcpgen/cli test -- collision-detection.test.ts` | ❌ Wave 0 |
| RUN-07 | URL collision: same URL (e.g., `localhost:8790` reused after crash) is detected | unit | `pnpm --filter @mcpgen/cli test -- url-collision.test.ts` | ❌ Wave 0 |
| CLI-02 | `mcpgen deploy <bundle-dir>` end-to-end → `localhost:879N/health` returns 200 | E2E smoke | `pnpm --filter @mcpgen/cli test -- deploy-e2e.test.ts` (spawns runner + dispatch) | ❌ Wave 0 |
| CLI-02 | `mcpgen deploy --cf` exits with code 78 and prints deferral banner | unit | `pnpm --filter @mcpgen/cli test -- deploy-cf-deferral.test.ts` | ❌ Wave 0 |
| CLI-03 | `bun build --compile` produces 4 binaries; each `--version` succeeds on its native OS | CI matrix | GitHub Actions `cli-binary-matrix.yml` | ❌ Wave 0 (CI workflow file) |
| **All** | apps/dispatch-sample E2E pipeline: `mcpgen deploy apps/dispatch-sample` → MCP `initialize` → `tools/list` → `tools/call` → usage event in TimescaleDB | E2E smoke (gold standard) | `pnpm --filter @mcpgen/dispatch-sample test -- e2e.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter <affected> test` (per-package)
- **Per wave merge:** `pnpm test` (workspace turbo) — must be green before merging into `runtime` worktree main
- **Phase gate:** Full suite green + apps/dispatch-sample E2E smoke + 4-target binary matrix CI green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/dispatch/tests/dispatch.test.ts` — covers RUN-01 (multi-port routing + capability gating)
- [ ] `apps/dispatch/tests/hostHeaderValidation.test.ts` — RUN-01 / D-15
- [ ] `apps/dispatch/tests/smartIdFuzz.test.ts` — RUN-01 / D-03 / pitfall #1
- [ ] `apps/dispatch/tests/session.test.ts` — RUN-01 / D-11 `Mcp-Session-Id`
- [ ] `packages/runtime-sdk/tests/not-stubbed.test.ts` — RUN-02 (extends existing Phase-1 stub-throws test by inverting it after Phase 6)
- [ ] `packages/runtime-sdk/tests/smartId.test.ts` — RUN-02 / D-07 (regex round-trip)
- [ ] `packages/runtime-sdk/tests/passthrough.test.ts` — RUN-03
- [ ] `packages/runtime-sdk/tests/stored.test.ts` + `stored-isolation.test.ts` — RUN-04
- [ ] `packages/runtime-sdk/tests/oauth-stub.test.ts` — RUN-05
- [ ] `packages/runtime-sdk/tests/beforeSend.test.ts` + `credential-scrub.test.ts` — RUN-03 / pitfall #12
- [ ] `packages/runtime-sdk/tests/usage-emit.test.ts` + `usage-fallback.test.ts` — RUN-06
- [ ] `apps/tenant-worker-runner/tests/p99-load.ts` — RUN-02 / pitfall #14
- [ ] `apps/tenant-worker-runner/tests/crash-restart.test.ts` — RUN-02
- [ ] `apps/inngest-dev/tests/ingest.test.ts` + `fallback-drain.test.ts` + `reconciler.test.ts` + `warm-keep.test.ts` — RUN-06 / D-12 / D-18
- [ ] `apps/cli/tests/claude-desktop-config.test.ts` + `collision-detection.test.ts` + `url-collision.test.ts` + `deploy-e2e.test.ts` + `deploy-cf-deferral.test.ts` — CLI-02 / RUN-07
- [ ] `.github/workflows/cli-binary-matrix.yml` — CLI-03 cross-compile CI
- [ ] `apps/dispatch-sample/tests/e2e.test.ts` — D-05 canonical E2E smoke
- [ ] `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql` (NEW migration; planner to confirm naming and exact ALTER TABLE statements per Open Question #1 + #6)

## Security Domain

> Required per `security_enforcement` (defaulted to enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (RUN-01 our Bearer JWT precheck; Phase 6 stubs to Phase-8 real verify) | JWT introspection cached 5 min; bearer scheme; Logto-issued tokens (Phase 8) |
| V3 Session Management | yes (RUN-01 `Mcp-Session-Id`) | In-memory session map keyed by header value; sessions are per-dispatch-instance — no need for distributed session store in Phase 6 |
| V4 Access Control | yes (D-03 cross-tenant smart-ID fuzz) | Tenant prefix in smart-ID matched against URL-resolved tenant; 403 on mismatch |
| V5 Input Validation | yes | All inputs validated via Zod schemas from `@mcpgen/contracts` (frozen FND-04) and `@mcpgen/ir` (frozen FND-02) |
| V6 Cryptography | yes (RUN-03 / RUN-04) | Web Crypto `crypto.subtle` only — never hand-roll. AES-256-GCM for encryption; HKDF-SHA-256 for key derivation; AES-KW for DEK wrap |
| V7 Error Handling & Logging | yes | Sentry `beforeSend` denylist; outbound chokepoint scrubbing; structured errors NEVER include credential material |
| V8 Data Protection | yes | Pass-through never persists upstream creds; stored mode AES-256-GCM at rest with per-tenant DEK; KEK from env; never log spec content / upstream responses / upstream creds |
| V9 Communication | yes | TLS handled by Bun-native (local) / Cloudflare (Phase 10). DNS rebinding mitigation via `hostHeaderValidation` (D-15) |
| V11 Business Logic | yes (RUN-06 idempotency) | UNIQUE constraint at DB layer + ON CONFLICT DO NOTHING; idempotency-key conventions per FND-14 |
| V13 API & Web Service | yes | MCP protocol versioning + capability gating (D-11); JSON-RPC error code conventions |
| V14 Configuration | yes | `RUNTIME_KEK` and `OPENROUTER_API_KEY` (latter not used in Phase 6) loaded from env; never logged; gitleaks pre-commit hook prevents accidental commits |

### Known Threat Patterns for `Bun + Hono + Postgres + bun:sqlite + Web Crypto` stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant smart-ID fetch | Information Disclosure | Tenant-prefixed smart IDs + dispatch-side fuzz check (D-03 / pitfall #1) |
| Pass-through credential leak via Sentry | Information Disclosure | `beforeSend` redaction with explicit denylist (D-16 / pitfall #12) |
| DNS rebinding attack on Streamable HTTP | Spoofing | `hostHeaderValidation` Hono middleware on every public endpoint (D-15 / pitfall #15) |
| Usage-event replay (double billing) | Tampering | UNIQUE `(deployment_id, idempotency_key)` constraint at DB layer + `usage_event_id` UUID generation client-side |
| `RUNTIME_KEK` exposure via misconfigured logger | Elevation of Privilege | Sentry beforeSend denylist; pre-commit `gitleaks` (already installed FND-12); env-var-only loading |
| Storage-layer SQL injection on `bun:sqlite` | Tampering | Always use parameterised queries (`db.query('… WHERE … = ?').get(arg)` — bun:sqlite native syntax); never string-interpolate |
| Tenant DoS via slow upstream | DoS | Rate limit at dispatch (Wave 1 stub); request timeout per upstream call (5 s default per `@mcpgen/runtime/handleUpstreamError`) |
| Cross-process info leak via shared `RUNTIME_KEK` | Information Disclosure | Per-tenant DEK derivation under HKDF info `tenant:${tenantId}` ensures tenant A's leaked DEK doesn't grant access to tenant B (D-09 architecture §14) |
| Cold-start race on supervisor restart | DoS | Process supervisor pre-spawns on boot; reconciles state from `deployments` table; restarts crashed processes within 5 s (verified by `crash-restart.test.ts`) |
| OAuth-mode mistakenly returning 200 | Elevation of Privilege | Phase-6 stub MUST return structured 501 with `oauth_mode_phase_10_deferral` payload (D-10) |
| MCP `initialize` capability response leak | Information Disclosure | `outputSchema` is intentional protocol metadata, not sensitive — but the protocolVersion gate (D-11) prevents leaking protocol-version-specific capabilities to legacy clients |

## Sources

### Primary (HIGH confidence)

- `packages/runtime-sdk/src/index.ts` — FROZEN `Runtime` interface
- `packages/runtime-sdk/src/types.ts` — FROZEN option types (SmartId, RouteSearchOpts, …)
- `packages/contracts/src/usage-event.ts` — FROZEN UsageEvent schema
- `packages/contracts/src/idempotency.ts` — FROZEN idempotency-key conventions
- `packages/contracts/src/db-schema.ts` + `infrastructure/neon/migrations/20260427000000_init_schema.sql` — committed schema
- `apps/dispatch/src/index.ts` + `apps/dispatch/wrangler.toml` — existing scaffold + Phase-10 reference
- `apps/dispatch-sample/src/index.ts` + tools + auth middleware — canonical reference shape
- `apps/cli/src/index.ts` + `apps/cli/build.ts` — existing 4-target compile loop
- `infrastructure/cloudflare/scripts/create-namespaces.sh` — exit-78 deferral pattern
- `docs/mcpgen-architecture.md` §6 / §7 / §11 / §14 — runtime plane + data model + privacy + security
- `docs/mcpgen-stage-e-design.md` §3.3 / §4 / §5 / §6 / §7 / §8 — runtime SDK contract from codegen side
- `.planning/research/PITFALLS.md` — #1, #4, #11, #12, #13, #14, #15, #21, #30
- `.planning/research/STACK.md` — locked versions + drift to verify
- `.planning/research/ARCHITECTURE.md` — Refinement #1 (apps/dispatch-sample canonical)
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-04, D-08, D-09, D-11, D-13, D-19, D-21
- `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` — local port map + Phase-10 deferral list
- `~/.claude/projects/-Users-igor-Projects-mcpgen/memory/project_local_compute.md` — port map + deferrals
- `hono.dev/docs/api/hono` (Context7 `/websites/hono_dev`) — `app.fetch` portability example
- `github.com/modelcontextprotocol/typescript-sdk/packages/middleware/{express,fastify}/README.md` (Context7) — canonical `hostHeaderValidation` API
- `github.com/inngest/inngest-js/examples/{bun,framework-elysiajs}/README.md` (Context7) — Inngest dev default port 8288
- npm registry (verified 2026-04-26): hono 4.12.15, @modelcontextprotocol/sdk 1.29.0, inngest 4.2.4, inngest-cli 1.18.0, commander 14.0.3, @cloudflare/workers-oauth-provider 0.4.0, unstorage 1.17.5, @sentry/cloudflare 10.50.0, @sentry/bun 10.50.0, ulid 3.0.2, wrangler 4.85.0

### Secondary (MEDIUM confidence)

- Bun 1.2+ cross-compile claim — verified locally in Plan 01-08; CI matrix design is Open Question #7
- `unstorage` `cloudflare-kv-binding` driver Phase-10 swap parity — believed correct based on `unstorage` docs; minor risk noted in Assumption A1

### Tertiary (LOW confidence)

- (none — all factual claims are either verified or explicitly tagged as assumed in the Assumptions Log)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via `npm view` 2026-04-26; locked from CONTEXT
- Architecture: HIGH — every component derives from a frozen contract or a CONTEXT D-decision
- Pitfalls: HIGH — all 9 referenced pitfalls have explicit mitigation patterns + verification tests
- Validation Architecture: HIGH — every requirement has a named test file; Wave-0 gap list is exhaustive
- Schema migration scope: MEDIUM — Open Question #1 and #6 require planner confirmation before code work begins

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (30 days; locked stack rarely changes; primary risk is upstream library bumps that don't affect Phase-6-locked versions)

---

## RESEARCH COMPLETE
