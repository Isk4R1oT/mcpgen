# Phase 6: Runtime Plane - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `06-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 06-runtime-plane
**Workstream:** runtime
**Mode:** `--auto` (recommended option chosen for each gray area without interactive prompt; user-clarification message applied post-write to refine three decisions)
**Areas discussed:** Dispatch architecture & tenant routing · Tenant Worker local runtime model · Three upstream-credential modes · MCP `initialize` capability gating · Usage event pipeline · `mcpgen deploy` semantics + binary build matrix · Cross-cutting security · P99 latency & warm-keep

---

## Dispatch architecture & tenant routing (RUN-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Local Bun + Hono on `localhost:8789` (Phase-10 lift-shift to CF Worker; same `apps/dispatch/wrangler.toml`) | Single binary mirrors prod CF Worker shape; Hono is framework-identical between local and CF | ✓ |
| Bun + Hono on `localhost:8789`, but a separate "edge proxy" simulator (e.g. Caddy reverse proxy) for prod parity | Adds an extra hop locally; not used in prod CF | |
| Skip local dispatch entirely; have CLI talk directly to tenant ports | Loses the dispatch test surface; pitfall #4 capability gating wouldn't be covered | |

**User's choice (auto):** Bun + Hono on `localhost:8789` with `apps/dispatch/wrangler.toml` committed as Phase-10 reference.
**Notes:** User-confirmation message ("Dispatch Worker на Bun — localhost:8789") matches recommended.

| Option | Description | Selected |
|--------|-------------|----------|
| Tenant lookup = Postgres `deployments` + 5-min in-memory cache; routing table maps `script_name → localhost:879N` | Mirrors prod CF KV cache 5-min TTL with a local-equivalent contract | ✓ |
| Tenant lookup = file-system manifest (`deployments/active.json`) | Simpler in dev; doesn't match prod path | |
| Tenant lookup = pure environment variable list | Brittle; doesn't survive process restart | |

**User's choice (auto):** Postgres-as-source-of-truth + 5-min in-memory cache.
**Notes:** Confirmed by user-clarification ("Tenant routing через простой port lookup из deployments table в Postgres").

| Option | Description | Selected |
|--------|-------------|----------|
| Cross-tenant smart-ID fuzz check at dispatch (parses `id` param, validates prefix) | Runtime half of pitfall #1 mitigation; F1 fixture is the static half | ✓ |
| Push fuzz check entirely to F1 (build-time) | Misses runtime-arrived smart IDs from a malicious client | |
| Skip — rely on tenant Worker's own auth | Defence in depth lost; one mistake leaks cross-tenant data | |

**User's choice (auto):** Cross-tenant smart-ID validation at dispatch.

---

## Tenant Worker local runtime model (RUN-02)

| Option | Description | Selected |
|--------|-------------|----------|
| One Bun child process per active tenant on `localhost:8790+` (multi-port) — process supervisor in `apps/tenant-worker-runner/` | Validates per-Worker isolation, cold-start, crash blast radius locally; Phase-10 swap is `wrangler deploy` per script | ✓ |
| Single in-process Hono router with mounted sub-routes per tenant | Cheaper but doesn't validate isolation; hides cold-start behaviour pitfall #14 targets | |
| `wrangler dev` for each tenant (CF emulator) | Heaviest path; brings CF deps back even though we're in local-compute | |

**User's choice (auto):** Multi-port Bun child processes with process supervisor.
**Notes:** Confirmed by user-clarification ("Tenant Workers на Bun multi-port — localhost:8790, localhost:8791, etc (один процесс на tenant)").

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `apps/dispatch-sample` as the canonical reference; Wave 2 wires it through new dispatch + auth + usage pipeline | Saves a phase day; matches roadmap success criterion #2 | ✓ |
| Build a fresh sample tenant Worker from scratch in Phase 6 | Duplicates Phase-1 work; introduces drift between hand-coded and codegen target | |

**User's choice (auto):** Reuse `apps/dispatch-sample`.
**Notes:** Confirmed by user-clarification.

---

## `@mcpgen/runtime` real implementations (RUN-02 + Stage-E consumer)

| Option | Description | Selected |
|--------|-------------|----------|
| Replace all 11 `createStubRuntime()` throws with real bodies; keep `Runtime` interface FROZEN | Frozen interface from Phase 1 — Phase 6 is implementation-only | ✓ |
| Renegotiate the `Runtime` interface based on Phase-6 learnings | Breaks Stage E codegen template assumptions; would need contract-change PR per OPS-02 | |
| Inline runtime methods directly in tenant Workers (skip `@mcpgen/runtime`) | Loses single source of truth; codegen templates would have to embed | |

**User's choice (auto):** Real implementations behind FROZEN interface.

| Option | Description | Selected |
|--------|-------------|----------|
| Smart-ID utilities live in `@mcpgen/runtime` consumed by both tenant Workers AND dispatch | Single source of truth for the highest-stakes invariant in the runtime plane | ✓ |
| Smart-ID utilities split: dispatch has its own copy, tenant has another | Two implementations of the same regex = guaranteed drift | |

**User's choice (auto):** Smart-ID in `@mcpgen/runtime`, single source.

---

## Three upstream-credential modes (RUN-03 / RUN-04 / RUN-05)

> **Scope clarification (post-write user message):** these modes are for credentials to wrapped APIs (Stripe / GitHub upstream calls), NOT MCPGen user auth (Logto = Phase 8 ops).

| Option | Description | Selected |
|--------|-------------|----------|
| Pass-through default — HKDF-derived per-request decryption of `X-Upstream-Auth`, never persisted | Matches RUN-03 + privacy-LOCKED; tenant Worker never holds upstream secrets | ✓ |
| Stored as default, pass-through opt-in | Inverts liability stance; not what RULES.md mandates | |
| No default — require per-tenant opt-in | Adds friction to ICP-A solo-dev hero flow | |

**User's choice (auto):** Pass-through default.

| Option | Description | Selected |
|--------|-------------|----------|
| Stored AES-256-GCM with per-tenant DEK in **local SQLite** (Phase-10 swap to CF KV) | Matches RUN-04; SQLite is already on stack via `bun:sqlite`; KV interface wraps it | ✓ |
| Stored AES-256-GCM in `unstorage` driver `fs` (filesystem JSON files) | Adds a dependency that the user-clarification didn't approve; SQLite is more directly controllable | |
| Stored credentials deferred to Phase 10 entirely | Misses RUN-04 in MVP | |

**User's choice (auto + user refinement):** Local SQLite (revised from initial draft of `unstorage fs`).
**Notes:** Initial draft used `unstorage` driver; user-clarification message specified "AES-256-GCM с per-tenant DEK в local SQLite" — applied.

| Option | Description | Selected |
|--------|-------------|----------|
| OAuth flow on behalf — **STUB only in Phase 6**, real `@cloudflare/workers-oauth-provider` integration in Phase 10 | OAuth provider is CF-Workers-coupled; user-delegated APIs not on launch critical path; saves 1–2 phase days | ✓ |
| Full OAuth 2.1 PKCE in Phase 6 via Logto Cloud + `@cloudflare/workers-oauth-provider` running on local Bun | Risky locally; user-clarification explicitly removed Logto from Phase 6 | |
| Hand-rolled OAuth 2.1 PKCE against arbitrary OIDC issuer | Adds CSRF / state validation surface we don't need to own | |

**User's choice (auto + user refinement):** Stub only in Phase 6, real impl in Phase 10.
**Notes:** Initial draft proposed full OAuth + Logto; user-clarification message corrected to "Stub implementation в Phase 6, real `@cloudflare/workers-oauth-provider` integration в Phase 10. NO Logto в этом workstream — Logto user auth = Phase 8 ops" — applied.

---

## MCP `initialize` capability gating (RUN-01 + pitfall #4)

| Option | Description | Selected |
|--------|-------------|----------|
| Dispatch is the protocol negotiator; tenant Workers always emit MCP 2025-06-18; dispatch downgrades responses for legacy clients | Single rewrite point; tenant Workers stay simple | ✓ |
| Tenant Worker reads `protocolVersion` from a header injected by dispatch and emits version-appropriate output | Distributes the gating logic across N tenant Workers; more places for the bug to hide | |
| Always emit MCP 2025-06-18 regardless of client | Breaks Cursor and ChatGPT Deep Research clients on older protocol versions | |

**User's choice (auto):** Dispatch as protocol negotiator.
**Notes:** Confirmed by user-clarification ("dispatch parses клиентский protocolVersion во время initialize MCP handshake; для clients < 2025-06-18 омитим outputSchema (Pitfall #4)").

---

## Usage event pipeline — local-compute simplified (RUN-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Tenant Worker → `ctx.waitUntil(send_to_inngest_dev(...))` → local Inngest dev (`npx inngest-cli@latest dev`) → Inngest function writes to TimescaleDB; KV fallback via local SQLite | Phase-10 swap is `Inngest dev URL → CF Queue binding`, no schema change | ✓ |
| Tenant Worker → direct HTTP POST to BFF `/api/v1/usage-events` → BFF writes to TimescaleDB | Skips the Inngest layer entirely; loses async retry semantics; Phase-10 swap is harder | |
| Tenant Worker writes directly to Postgres | Loses the queue-backpressure resilience pattern from RUN-06 + pitfall #13 | |

**User's choice (auto + user refinement):** Inngest dev as the local CF-Queue replacement.
**Notes:** Initial draft proposed direct BFF POST; user-clarification message corrected to "tool call emits через `ctx.waitUntil(queue.send(...))` → local Inngest dev server → TimescaleDB" — applied.

| Option | Description | Selected |
|--------|-------------|----------|
| Daily reconciliation `usage-reconciler-v1` ships in Phase 6 as **skeleton** (logs would-be Stripe payload); Phase 8 wires the real Stripe call + drift alerts | Splits ownership cleanly: Phase 6 = pipeline, Phase 8 = Stripe + alerts | ✓ |
| Push the reconciliation function entirely into Phase 8 | Phase 6 success criterion #4 explicitly requires the reconciliation job; deferring breaks the SC | |
| Ship the reconciler with real Stripe Meters call in Phase 6 | Stripe is Phase-8 territory; cost cap + quota enforcement aren't ready until then | |

**User's choice (auto):** Skeleton in Phase 6, Stripe wiring in Phase 8.

---

## `mcpgen deploy` semantics + binary build matrix (CLI-02 / CLI-03)

| Option | Description | Selected |
|--------|-------------|----------|
| `mcpgen deploy <bundle>` (default = local) → spawns Bun process via `apps/tenant-worker-runner/` admin endpoint, returns `localhost:879N` URL + Claude Desktop config block (with collision detection) | Matches CLI-02 ("returns a live URL") + RUN-07 (Claude Desktop config); structural parity to Phase-10 CF deploys | ✓ |
| `mcpgen deploy` is a no-op until Phase 10 | Misses CLI-02 in MVP and breaks the Phase-7 frontend wire-up that depends on a working URL | |
| `mcpgen deploy` only writes the Postgres `deployments` row; tenant-worker-runner must be started manually | Hidden two-step process for users; bad UX | |

**User's choice (auto):** Local Bun process spawn with one-click config block.

| Option | Description | Selected |
|--------|-------------|----------|
| Bun-compile binary matrix for all 4 targets (`bun-darwin-arm64/x64`, `bun-linux-x64`, `bun-windows-x64`) ships in Phase 6 — npm package via `optionalDependencies` selector + GitHub release artifacts | Phase-1 Plan 01-08 already validated all 4 targets compile | ✓ |
| Ship one target in Phase 6, expand in Phase 9 | CLI-03 requirement explicitly lists all 4 targets in Phase 6 | |
| Ship via npm only, no GitHub release | Misses non-npm distribution channels | |

**User's choice (auto):** All 4 targets, npm + GitHub release.
**Notes:** Confirmed by user-clarification ("Bun-compiled single binary на npm + GitHub releases — bun-darwin-arm64, bun-darwin-x64, bun-linux-x64, bun-windows-x64. Это работает локально без CF").

---

## Cross-cutting security (DNS rebinding + Sentry redaction)

| Option | Description | Selected |
|--------|-------------|----------|
| `hostHeaderValidation` Hono middleware on dispatch + every tenant Worker; `ALLOWED_HOSTS` env var (default dev: `localhost,127.0.0.1`; default Phase-10: `*.mcpgen.dev`) | Pitfall #15 mitigation; mandatory across all entry points | ✓ |
| Defer DNS rebinding mitigation to Phase 10 | Pitfall #15 is exploitable from day-one of any deployed Worker | |

**User's choice (auto):** Mandatory `hostHeaderValidation` everywhere.

| Option | Description | Selected |
|--------|-------------|----------|
| Sentry `beforeSend` redaction helper centralised in `@mcpgen/runtime`; auto-wired into existing FND-10 Sentry init | Single audit point; matches Phase-9 deliberate-leak PII audit | ✓ |
| Per-app duplicate redactors | N audit points; drift inevitable | |

**User's choice (auto):** Centralised redactor in `@mcpgen/runtime`.
**Notes:** Confirmed by user-clarification ("Outbound chokepoint scrubs credentials из любых logging destinations ... Sentry beforeSend redaction (Phase 1 уже scaffolded в apps/dispatch-sample/)").

---

## P99 latency target & warm-keep strategy (RUN-02 + pitfall #14)

| Option | Description | Selected |
|--------|-------------|----------|
| P99 < 50ms over upstream measured locally via Bun-native load-test harness; real CF P99 validation is Phase-10 launch gate | Matches RUN-02 acceptance; stays in locked stack | ✓ |
| Use k6 instead of Bun-native | Adds a tool outside locked stack | |
| Skip local P99 measurement; rely on Phase-10 CF measurement | Loses the regression detection during Phase 6 implementation | |

**User's choice (auto):** Bun-native local load-test harness.
**Notes:** Confirmed by user-clarification ("На local Bun будет даже лучше (нет network round-trip к CF edge)").

| Option | Description | Selected |
|--------|-------------|----------|
| Warm-keep cron skeleton ships in Phase 6 as Inngest dev function `warm-keep-active-tenants-v1` (every 5 min ping) | Structurally identical to Phase-10 prod cron; parity scaffold | ✓ |
| Defer warm-keep entirely to Phase 10 | Misses pitfall #14 mitigation pattern in the codegen template | |

**User's choice (auto):** Skeleton in Phase 6.
**Notes:** Confirmed by user-clarification ("warm-keep cron каждые 5 min для active tenants — implementation в Phase 6, реальный effect только в Phase 10").

---

## Claude's Discretion

Areas where the user explicitly delegated to Claude / planner during analysis:

- Exact wave breakdown for the 9 requirements (suggested 5-wave breakdown logged in CONTEXT.md decisions section)
- Specific port numbers for individual tenant Workers (sequential 8790+ recommended; alternatives acceptable)
- Whether `apps/tenant-worker-runner/` is a new app or a folder inside `apps/dispatch/` (planner reads scaffold and decides)
- KV emulator concrete approach: `unstorage` vs raw SQLite (note: user-clarification specified SQLite for stored credentials; planner picks the wrapper API)
- Inngest dev runner location (planner picks)
- Bun cross-compile per-target CI runner assignment (planner double-checks Bun 1.1+ docs)
- Whether the local SQLite KV fallback bucket lives per-runner or per-tenant (planner picks based on failure-isolation argument)
- Naming of the in-memory routing-table cache key (`script_name` vs `cf_worker_name`)
- Whether `mcpgen deploy --cf` is fully wired in Phase 6 with a deferral banner or completely absent (planner: recommended to wire with banner)

## Deferred Ideas

Logged in CONTEXT.md `<deferred>` section. Highlights:

- Real CF Workers for Platforms deploys → Phase 10
- Real CF Hyperdrive provisioning → Phase 10
- Real CF KV / CF Queue / CF Durable Objects bindings → Phase 10 (Phase 6 emulates with SQLite + Inngest dev)
- Real `@cloudflare/workers-oauth-provider` integration (RUN-05 OAuth on-behalf) → Phase 10
- Real CF Workers SSE 30-second sub-request validation → Phase 10
- Real Stripe Meters submission + drift alerts → Phase 8 (CTRL-06/07)
- Drift Watcher Inngest cron → Phase 8 (CTRL-03)
- Quota enforcement + per-generation cost cap → Phase 8 (CTRL-06/07)
- Production-grade BetterStack uptime + Sentry DSN fill → Phase 9 (CTRL-08)
- F3 mock client harness → Phase 5 owns the harness; Phase 6 only consumes
- Privacy mode CLI / `mcpgen logs --tail` → v1.x backlog
- MCP SDK auto-bump to v2 → forbidden until deliberate `chore: bump mcp-sdk to v2` PR
- Multi-region runtime / A/B deploys / canary releases / custom domains → out of MVP

---

*Discussion log: 06-runtime-plane*
*Workstream: runtime*
*Audit trail authored: 2026-04-26*
