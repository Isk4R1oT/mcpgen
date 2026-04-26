# Architecture Research — MCPGen

**Domain:** MCP server generator (Generation Engine + Control Plane + Runtime Plane + Data Plane)
**Researched:** 2026-04-26
**Confidence:** HIGH (architecture is locked across 10+ design docs in `docs/`; this research verifies sequencing/contracts/failure boundaries against real-world MCP server generation systems and confirms the proposed 10-phase build order).

> This file is **a verification + sequencing exercise**, not a redesign. The system architecture is already fixed by `docs/mcpgen-architecture.md` and 9 detail-design docs. Where I disagree with the existing docs, I flag it explicitly under **Risks vs. Locked Architecture**. Where I confirm, I cite the doc.

---

## Standard Architecture

### System Overview (4 planes)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              USER-FACING LAYER                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                        │
│  │   Web App    │  │     CLI      │  │ Public REST/ │                        │
│  │  Next.js 15  │  │ TS+Bun bin   │  │ SSE API      │                        │
│  │  (Vercel)    │  │ npm + GH rel │  │ (Hono BFF)   │                        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                        │
│         └────────┬────────┴────────┬────────┘                                │
└──────────────────┼─────────────────┼─────────────────────────────────────────┘
                   ▼                 ▼  HTTPS + Bearer JWT (Logto-issued)
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CONTROL PLANE                                    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                  │
│  │ BFF / Gateway  │  │  Auth (Logto)  │  │ Drift Watcher  │                  │
│  │ Hono on CF     │  │  Cloud free    │  │ Inngest cron   │                  │
│  │ Workers        │  │  → self-host   │  │ daily 02:00 UTC│                  │
│  └────────┬───────┘  └────────────────┘  └────────────────┘                  │
│           │ POST /api/v1/generate (sync ack) + SSE callback channel          │
└───────────┼──────────────────────────────────────────────────────────────────┘
            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       GENERATION ENGINE (engine workstream)                   │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  FastAPI on Fly.io Machines (auto-suspend after 5 min idle)            │  │
│  │                                                                          │  │
│  │  Stage A (det)   Stage B (LLM)      Stage C (LLM, ‖×N)   Stage D (LLM) │  │
│  │  Parse  ────────►Architect (Qwen)──►Author (Qwen)───────►Shape (Qwen) │  │
│  │  RawIR           P0 Inventory       P2 Description       P5 Response  │  │
│  │                  P1 Six-Tool        P3 Parameters                     │  │
│  │                     Pattern         P4 Annotations                    │  │
│  │                                          │                            │  │
│  │                                          ▼  CompleteServerSpec        │  │
│  │  Stage E (det)                  Stage F (mixed)                       │  │
│  │  Codegen (Jinja2) ─────────────►F1 Static (det, $0)                  │  │
│  │  ~25-30 TS files                F2 Smell (Qwen ×5 shuffle)           │  │
│  │                                 F3 Agent eval (Sonnet 4.7 in loop)   │  │
│  │                                                                       │  │
│  │  PydanticAI ─→ OpenRouter (qwen/qwen3-coder) ─→ OTel ─→ Langfuse v4 │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
            │ artifact ZIP → R2; SSE per-stage events → BFF → browser
            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       RUNTIME PLANE (runtime workstream)                      │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Cloudflare Workers for Platforms — dispatch namespace                 │  │
│  │  ┌──────────────────┐                                                   │  │
│  │  │ Dispatch Worker  │ ← auth pre-check + rate limit + tenant lookup    │  │
│  │  │ (we author)      │   + dispatch into namespace                       │  │
│  │  └────────┬─────────┘                                                   │  │
│  │           │                                                              │  │
│  │  ┌────────▼─────────┐ ┌──────────────────┐ ┌──────────────────┐        │  │
│  │  │ tenant-1-mcp     │ │ tenant-2-mcp     │ │ tenant-N-mcp     │  ...   │  │
│  │  │ TS + MCP SDK +   │ │ ...              │ │ ...              │        │  │
│  │  │ @mcpgen/runtime  │ │                  │ │                  │        │  │
│  │  └──────┬───────────┘ └──────┬───────────┘ └──────┬───────────┘        │  │
│  └─────────┼─────────────────────┼────────────────────┼────────────────────┘  │
│            │ usage_event (fire-and-forget via ctx.waitUntil)                  │
│            ▼                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Usage Event Pipeline                                                  │  │
│  │  CF Queue ──► Inngest worker (batch 60s) ──► TimescaleDB hypertable   │  │
│  │                                       └────► Stripe Meters API        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              DATA PLANE                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │ Postgres 16  │ │ Cloudflare   │ │ TimescaleDB  │ │ Langfuse v4  │         │
│  │ (Neon)       │ │     R2       │ │ (in Neon)    │ │   Cloud      │         │
│  │ + pgvector   │ │  3 buckets   │ │ usage_events │ │ LLM traces   │         │
│  │ metadata     │ │ specs/       │ │ + continuous │ │ session_id = │         │
│  │ org/proj/gen │ │ artifacts/   │ │ aggregates   │ │ generation.id│         │
│  │ /deploy/tools│ │ public-cache/│ │              │ │              │         │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘         │
│  (+ CF KV: per-tenant DEK for stored credentials, auth cache 5-min TTL)       │
└──────────────────────────────────────────────────────────────────────────────┘
```

This matches `docs/mcpgen-architecture.md` §3. No new components introduced.

### Component Responsibilities

| Component | Responsibility | Workstream | Boundary protocol |
|-----------|----------------|------------|-------------------|
| **Web App** (Next.js 15 / Vercel) | Render landing, generation flow, preview, dashboard. Consume SSE per stage. **UI is locked from `claude-design-ui/MCP-Gen.zip` — wire-up only** | frontend | HTTP + SSE to BFF; Logto session cookie |
| **CLI** (TS + Bun single binary) | Local generation (`mcpgen init`), deploy (`mcpgen deploy`). Does NOT bypass cloud — same `POST /api/v1/generate` API | engine + runtime | HTTPS to BFF; OAuth device-code → long-lived API key |
| **BFF / Gateway** (Hono on CF Workers) | Job submission, SSE relay (callback ←→ browser), auth verification, quota check, R2 read for artifact download, drift API | ops + main | Public REST + SSE upstream; M2M JWT downstream to engine |
| **Auth** (Logto Cloud → self-host @ t+3mo) | User auth, OAuth 2.1 server for MCP clients, M2M tokens for inter-service | ops | OIDC + JWT introspection |
| **Drift Watcher** (Inngest cron) | Daily `HEAD/GET` upstream specs, sha256 compare, INSERT new spec row, surface diff | ops | Inngest function; Postgres + Resend |
| **Generation Engine** (FastAPI / Fly Machines auto-suspend) | 6 LLM passes + 3 deterministic stages + agent eval. Single `POST /api/v1/generate` HTTP entrypoint, async via Inngest, SSE callback per stage | engine | HTTP in; HTTP callback out; OpenRouter via PydanticAI |
| **Dispatch Worker** (CF Workers for Platforms — we author it) | Auth pre-check, rate limit, tenant lookup (cached 5 min in Worker memory + KV), dispatch into namespace | runtime | HTTPS in; CF dispatch namespace API |
| **Tenant Worker** (CF Workers for Platforms — generated per tenant) | MCP protocol implementation (Six-Tool Pattern), upstream API calls, response shaping (truncation + filtering), usage event emission | runtime (SDK) + engine (codegen) | MCP over HTTP (`tools/list`, `tools/call`); upstream HTTP; CF Queue out |
| **Usage Pipeline** (CF Queue → Inngest → Timescale + Stripe) | Fire-and-forget metering. Decouples hot path from billing reliability | runtime + ops | CF Queue → Inngest cron-batched → Postgres + Stripe Meters |
| **Postgres + pgvector + Timescale** (Neon, single DB) | OLTP metadata (org/proj/spec/gen/deploy/tools), pgvector embeddings for tool retrieval (post-MVP), TimescaleDB hypertable for usage analytics | ops | Drizzle ORM (TS); SQLAlchemy or asyncpg (Python engine) — see contract concerns |
| **R2** (Cloudflare object storage, 3 buckets) | `mcpgen-specs` (versioned, indefinite); `mcpgen-artifacts` (30d TTL); `mcpgen-public-cache` (popular API pre-gens); + `mcpgen-eval-transcripts` (30d) | ops | S3 API |

---

## Recommended Project Structure

The structure is locked in `docs/mcpgen-architecture.md` §15. Re-stated here with a **build-order annotation** — what each directory needs to exist for, and which phase produces it.

```
mcpgen/                                           ← Phase 1 Foundation
├── apps/
│   ├── web/                  Next.js 15 (Vercel)        ← Phase 1 scaffold; Phase 7 wire-up; UI from MCP-Gen.zip
│   ├── api/                  Hono Control Plane (CF)    ← Phase 1 scaffold; Phase 8 auth+billing routes
│   ├── dispatch/             Dispatch Worker (CF WfP)   ← Phase 6 primary
│   ├── generation-engine/    FastAPI (Fly Machines)     ← Phase 1 scaffold; Phase 2-5 fills it
│   ├── cli/                  TS + Bun binary            ← Phase 1 scaffold; Phase 5/6 wires generate+deploy
│   └── docs/                 Mintlify or Docusaurus     ← Phase 10
├── packages/                                    ← The contract surface (frozen end of Phase 1)
│   ├── ir/                   Pydantic + TS codegen      ← Phase 1 LOCK; consumed by everything
│   ├── runtime-sdk/          @mcpgen/runtime            ← Phase 1 stub; Phase 6 fills smart-id/pagination/truncation runtime
│   ├── codegen-templates/    Jinja2 templates           ← Phase 4 (Stage E)
│   ├── contracts/            Generation API + Usage event schemas + DB row types  ← Phase 1 LOCK
│   ├── shared-config/        ESLint/Prettier/tsconfig   ← Phase 1
│   └── ui/                   shadcn-style shared comps  ← Phase 1 (mostly empty; UI is locked in apps/web/src/)
├── infrastructure/
│   ├── neon/                 Drizzle migrations         ← Phase 1 (DB schema v1 LOCK)
│   ├── cloudflare/           wrangler + Terraform       ← Phase 1
│   ├── fly/                  fly.toml configs           ← Phase 1
│   └── inngest/              function definitions       ← Phase 1 stub; Phase 6/8 fills
├── docs/                     Source of truth (already authored, do not regenerate)
├── claude-design-ui/         MCP-Gen.zip locked         ← Phase 7 unzips into apps/web/src/
└── turbo.json + pnpm-workspace.yaml             ← Phase 1
```

---

## Architectural Patterns

### Pattern 1: Stage-as-Retry-Boundary

**What:** Pipeline grouped into 6 stages (A: Parse / B: Architect / C: Author / D: Shape / E: Codegen / F: Validate). Each stage has its own retry budget; failure inside a stage does NOT require re-running prior stages. Inputs/outputs of each stage are persisted in L2 pass-level cache.

**Trade-offs:**
- (+) Cost protection: failed F2 → retry only failed pass, not all 6.
- (+) UX: SSE per-stage progress means users see progress even on slow generations.
- (-) Adds persistence overhead between stages (L2 cache write per pass).
- (-) Cache invalidation logic is non-trivial (sha256(input) + pass_version + model_id).

### Pattern 2: Async-Job + SSE-Callback (instead of WebSocket)

**What:** Browser POSTs to BFF, receives 202 + SSE channel. BFF enqueues job in Inngest with a `callback_url`. Generation Engine, on each stage completion, POSTs an event to `callback_url`; BFF relays to the browser's SSE channel.

**Trade-offs:**
- (+) No WebSocket complexity (no sticky sessions, no reconnect logic on engine side).
- (+) SSE auto-reconnects in browsers; works through corporate proxies.
- (+) Engine remains stateless; doesn't need to know which browser is listening.
- (-) Two HTTP hops (engine → BFF → browser) add ~10–50ms per event. Acceptable for stage-grain events.
- (-) Browser disconnect doesn't cancel the job (intentional — user can refresh and see result).

### Pattern 3: Pass-Through Credentials (Default) + Stored (Opt-in, "Less Secure")

**What:** Tenant Worker accepts upstream credentials in `X-Upstream-Auth` header per request, decrypts using a key derived from the tenant API key (HKDF), forwards to upstream, never persists.

**Trade-offs:**
- (+) Zero liability surface if our infra is breached — we never had the secret.
- (+) Matches MCP spec direction (OAuth 2.1 first-class).
- (-) Slightly more complex client config (Claude Desktop must support `headers.X-Upstream-Auth`).

### Pattern 4: Six-Tool Pattern Build-Time Consolidation

**What:** Pass 1 collapses ~50 endpoints into 6 universal tools + sparingly added action/workflow/specialized tools. Smart IDs carry routing info; routing logic lives in the runtime SDK, not in tool definitions.

**Trade-offs:**
- (+) Agent token economy (~70% savings is structural, not cosmetic).
- (+) OpenAI compliance for `search(query: string)` / `fetch(id: string)` enables ChatGPT Deep Research integration.
- (-) Coverage validation (100% mandatory in Pass 1) is non-trivial.

### Pattern 5: Build-Time Decisions Over Runtime Hopes

**What:** Architectural constraints (tiered tool caps 30/50/80, Six-Tool consolidation, multi-server split, hard cap >80 = fail) are applied during generation. We do NOT rely on runtime tool selection.

**Trade-offs:**
- (+) Predictable agent behavior: at runtime, the Six-Tool surface is always present.
- (-) Rejecting a 200-endpoint API as "split into multi-server" is a UX cliff (mitigated by Pro override raising cap to 100).

---

## Data Flow

### Generate Flow (sync ack + async execution + SSE callbacks)

```
Browser/CLI                       BFF (Hono/CF)              Inngest             Generation Engine          Sandbox CF (F3 only)
   │                                  │                          │                       │                          │
   │── POST /api/v1/generate ────────►│                          │                       │                          │
   │   {spec_url, options, run_eval}  │                          │                       │                          │
   │                                  │── INSERT generation                                                          │
   │                                  │   (status=queued, options, cost_cap)                                         │
   │                                  │── enqueue Inngest job ──►│                       │                          │
   │◄── 202 + SSE URL ────────────────│                          │                       │                          │
   │                                  │                          │── trigger ────────────►│                         │
   │                                  │                          │                       │── Stage A (det parse)    │
   │◄── SSE: stage_a_done ────────────│◄─── POST /callback ──────────────────────────────│                          │
   │                                  │                          │                       │── Stage B Architect      │
   │                                  │                          │                       │   Pass 0, Pass 1         │
   │◄── SSE: stage_b_done ────────────│◄─── POST /callback ──────────────────────────────│                          │
   │                                  │                          │                       │── Stage C (P2,P3,P4)     │
   │◄── SSE: stage_c_done ────────────│◄─── POST /callback ──────────────────────────────│                          │
   │                                  │                          │                       │── Stage D (P5)           │
   │◄── SSE: stage_d_done ────────────│◄─── POST /callback ──────────────────────────────│                          │
   │                                  │                          │                       │── Stage E + F1 + F2      │
   │◄── SSE: f2_done ─────────────────│◄─── POST /callback ──────────────────────────────│                          │
   │                                  │                          │                       │  if eval_quota ok:       │
   │                                  │                          │                       │  ├── deploy to sandbox ──►│
   │                                  │                          │                       │  └── F3 agent eval        │
   │◄── SSE: f3_done ─────────────────│◄─── POST /callback ──────────────────────────────│                          │
   │                                  │                          │                       │── upload ZIP → R2        │
   │◄── SSE: completed + result ──────│◄─── POST /callback ──────────────────────────────│                          │
```

**Cross-cutting invariants:**
- Stage = retry boundary. Inngest retries with idempotent `job_id` continue from last successful stage (uses L2 pass cache).
- Browser disconnect ≠ job cancellation. User refresh re-subscribes to SSE; if completed, BFF reads final `quality_report` from DB and sends `completed` event.
- F3 quota gating: free tier beyond 1/mo skips F3, marks `eval_skipped=true`, badge becomes `standard` not `verified`.
- Cost cap exceeded → hard fail with partial result + bill (no silent cap overrun).

### Tool Call Flow (production hot path)

```
Claude Desktop                   Dispatch Worker              Tenant Worker              Upstream API
      │                                  │                           │                          │
      │── POST /mcp tools/call ──────────►│                          │                          │
      │   Authorization: Bearer <key>    │                           │                          │
      │   X-Upstream-Auth: <enc-blob>    │                           │                          │
      │                                  │── auth check (KV cache)                                │
      │                                  │── rate limit (DO counter)                              │
      │                                  │── lookup tenant, dispatch ►│                          │
      │                                  │                           │── decrypt X-Upstream-Auth │
      │                                  │                           │── route via smart ID       │
      │                                  │                           │── upstream call ──────────►│
      │                                  │                           │◄── response ──────────────│
      │                                  │                           │── apply ResponseConfig     │
      │                                  │                           │── ctx.waitUntil(emit usage)│
      │◄────────────── return result ────│◄──────────────────────────│                          │
      │                                  │                           │── (async) → CF Queue     │
      │                                  │                           │      → Inngest 60s batch  │
      │                                  │                           │      → Timescale + Stripe │
```

**P99 budget over upstream:** 50ms (auth + rate limit + dispatch + response transform).

### Usage Event Flow (decoupled metering)

```
Tenant Worker
    │ ctx.waitUntil(env.USAGE_QUEUE.send(event))   ← non-blocking, fire-and-forget
    ▼
CF Queue (mcpgen-usage-events)
    │ batch consumer trigger (every 60s OR 100 events)
    ▼
Inngest worker `usage-event-ingest`
    │ batch INSERT INTO usage_events (Timescale hypertable)
    │ batch POST stripe.billing.meterEvents.create (1 per deployment_id_per_minute, idempotent)
    ▼
TimescaleDB usage_hourly continuous aggregate refreshes
    + Stripe Meters reflects in next invoice cycle
```

**Why decoupled:** Tenant Worker hot path stays under 50ms even if Stripe Meters API is slow or Inngest has a brief outage.

### Drift Detection Flow

```
Inngest cron (daily 02:00 UTC)
    │ list active projects WHERE source_url IS NOT NULL
    ▼
For each project, parallel (concurrency 10):
    ├── HEAD upstream (cheap check)
    ├── If ETag changed OR HEAD unreliable → GET full spec
    ├── sha256 → compare with specs.content_hash
    ├── If diff:
    │   ├── INSERT new spec row (version + 1)
    │   ├── Compute structural diff
    │   ├── LLM diff summary (Qwen, ~500 tokens)
    │   ├── Email via Resend
    │   └── If user opted into auto_regenerate (Pro, opt-in): enqueue new generation
    └── Log to BetterStack
```

---

## Build Order with Dependency Rationale

This section verifies and slightly amends the 10-phase plan in `docs/mcpgen-gsd-sprint-plan.md` §2.

### Verified phase dependency graph

```
Phase 1: FOUNDATION (main, blocks all)
    ├── packages/ir              ──► consumed by Phase 2-7
    ├── packages/contracts       ──► consumed by Phase 2 (engine API), 6 (runtime SDK), 7 (frontend), 8 (Stripe Meters)
    ├── DB schema v1 (Drizzle)   ──► consumed by Phase 2 (gen rows), 6 (deploy rows), 8 (org/usage rows)
    ├── packages/runtime-sdk stub ──► consumed by Phase 4 (Stage E codegen targets it), Phase 6 fills runtime
    ├── usage event schema       ──► consumed by Phase 6 (emit) and Phase 8 (Stripe consumer)
    └── auth scaffold (Logto)    ──► consumed by Phase 7, 8, 6 (dispatch token verification)

Phase 1 done ──► fan-out to (in parallel):

    ├── Phase 2 (engine: P0+P1 Architect)
    │   └── Phase 3 (engine: P2+P3+P4 Author)
    │       └── Phase 4 (engine: P5 + Stage E Codegen)
    │           └── Phase 5 (engine: F1+F2+F3 Validation)
    │
    ├── Phase 6 (runtime: Dispatch + Tenant SDK + usage pipeline)
    │   ↑ depends on: packages/runtime-sdk stub (P1) + usage event schema (P1)
    │   ↑ does NOT depend on engine completion — runtime SDK is consumed BY codegen,
    │     not produced by it; can be built against a hand-written sample tenant Worker
    │
    ├── Phase 7 (frontend: wire UI ↔ API)
    │   ↑ Wave 1 (landing/pricing/auth) depends only on Phase 1
    │   ↑ Wave 2 (generation/preview/quality) ideally after Phase 5 (need real engine)
    │   ↑ Wave 3 (dashboard) ideally after Phase 6 (needs real usage events)
    │
    └── Phase 8 (ops: Logto + Stripe Meters + quotas)
        ↑ depends on Phase 1 (DB + auth scaffold)
        ↑ End-to-end Stripe Meters depends on Phase 6 — but products/prices/webhooks built earlier

ALL OF (2-5) + 6 + 7 + 8 merged ──►
    ├── Phase 9 (main: Observability — Langfuse/Sentry/BetterStack across all)
    └── Phase 10 (main: Launch)
```

### Build order is correct. Diff against sprint plan: minor amendments

**1. Phase 6 (runtime) start time** — sprint plan says "can start parallel with Phase 2". Confirmed. The Tenant Worker template can be built against a hand-written sample (Stripe with 3 tools) before the engine generates real code. **Important** — without this, Phase 6 idles waiting for Phase 5.

**Recommendation:** add explicit milestone "Phase 6 has a hand-deployed sample tenant Worker by end of Wave 2".

**2. Phase 7 Wave 1 (landing) start time** — sprint plan correctly notes can start after Phase 1. Confirmed.

**3. Phase 8 Stripe Meters validation** — sprint plan says depends on Phase 6 (usage events). Refined: **Stripe products/prices/webhooks can be built in Phase 8 Wave 1-2 against synthetic test events; end-to-end real-event validation depends on Phase 6**. Unblocks Phase 8 to start parallel with Phase 2-5.

**4. Phase 9 placement** — correctly an integration phase after merges. **Risk:** Sentry source maps need build-time integration. **Recommendation:** add Sentry SDK initialization to each app skeleton in Phase 1 (no DSN yet, just initialize); Phase 9 fills DSN + source map upload in CI.

**5. Langfuse v4 OTel** — **Add to Phase 1 engine scaffold:** initialize OTel exporter early so traces appear in Phase 2 from day 1, not in Phase 9.

### Contracts to Freeze in Phase 1

These five contracts must be in `packages/ir` or `packages/contracts` by end of Phase 1.

| # | Contract | Location | Owner workstream | Affects | What it must specify |
|---|----------|----------|------------------|---------|----------------------|
| 1 | **IR schema** | `packages/ir/src/types.ts` (TS) + `packages/ir/python/types.py` (Pydantic) — generated from one source | engine + main | engine, runtime, frontend, ops | All Pass output types: `Tool`, `ToolDescription`, `ToolAnnotations`, `ResponseConfig`, `RoutingRule`, `WorkflowDef`, `SmartIdSchema`, `FinalTool`. Source: `mcpgen-generation-engine-v2.md` §5.2 |
| 2 | **Generation API** | `packages/contracts/src/generation-api.ts` | engine + ops | engine, frontend, ops | `POST /api/v1/generate` request shape (spec source, options, callback_url, idempotency key); SSE event envelope (`{job_id, stage, status, partial_result?, error?}`); error code enum; callback POST shape. Source: `mcpgen-architecture.md` §5.8 |
| 3 | **DB schema v1** | `infrastructure/neon/migrations/0001_init.sql` + `packages/contracts/src/db-types.ts` | ops | engine, runtime, ops, frontend | All tables from `mcpgen-architecture.md` §7.1 |
| 4 | **Tenant Worker SDK API** | `packages/runtime-sdk/src/index.ts` (interface stub) | runtime | engine (Stage E codegen targets it), runtime | `runtime.routeSearch/routeFetch/routeUpsert/routeDelete` signatures, `runtime.callUpstream/callWorkflow` signatures, `ctx.auth` shape, usage event emission API |
| 5 | **Usage event schema** | `packages/contracts/src/usage-event.ts` | runtime + ops | runtime, ops, dashboard | Event envelope: `{time, deployment_id, tool_name, tokens_in, tokens_out, upstream_latency_ms, worker_cpu_ms, status, client_type, error_class}`. Must match Timescale columns AND Stripe Meters dimension keys |

**Cross-language contract mechanics (critical detail):**
- IR schema **must have a single source of truth.** **Recommendation:** TS Zod as source — frontend + runtime + Stage E templates all read TS, and the engine is the only Python consumer.
- DB types: Drizzle generates TS types from migrations; engine accesses Postgres via SQLAlchemy/asyncpg. **Recommendation:** Drizzle is source; emit JSON schema of each table after migrations and reflect into Pydantic in the engine.

---

## Failure Boundaries (per layer)

### Generation Engine fails mid-pipeline

| Failure | Detection | Handling | Cross-component effect |
|---------|-----------|----------|------------------------|
| Engine pod crashes mid-Stage C | Inngest job timeout (5 min) | Inngest retries with same `job_id`; engine resumes from L2 cache (last successful stage) | Browser sees SSE silence then `stage_X resumed` event; if 3 retries fail → `generation.status='failed'`, badge=`needs_review` |
| Qwen3-Coder OpenRouter rate-limit | 429 from OpenRouter | PydanticAI retry with exponential backoff (3 attempts); fallback model `qwen/qwen3-30b-a3b-instruct` | Cost cap may be exceeded if many retries; surface in `llm_cost_breakdown` |
| Cost cap exceeded mid-pipeline | Per-pass cost tally vs `cost_cap_usd` | Hard fail with partial result; bill exact spend; do NOT silently exceed | UI shows partial result + "[Resume with raised cap] [Cancel]" |
| Fly Machine cold start adds latency | Health check returns 503 first 1.5s | Inngest retry; or wait for `/health` 200 (keep-warm cron mitigates) | Browser sees `stage_a_started` delayed by 1.5s; acceptable |
| L2 cache write failure (Postgres down) | DB INSERT exception | Engine falls back to in-memory only; logs warning to Sentry | Generation completes but caching disabled (cost ↑) |

### Control Plane (BFF) fails

| Failure | Detection | Handling | Cross-component effect |
|---------|-----------|----------|------------------------|
| BFF Worker exception during `POST /generate` | Sentry alert | Browser sees 5xx, retries (idempotency key in `packages/contracts` deduplicates) | Inngest job not enqueued; user retries; safe |
| SSE callback POST from engine fails (BFF down) | Engine logs + Sentry | Engine retries callback (3 attempts); after that, generation completes silently; user refresh polls and sees result | UX degraded but no data loss |
| Logto introspection endpoint slow | BFF auth middleware timeout | Cached introspection in CF Worker memory (5-min TTL) absorbs short outages | Users with cached tokens unaffected; new logins blocked |

### Runtime Plane fails

| Failure | Detection | Handling | Cross-component effect |
|---------|-----------|----------|------------------------|
| Tenant Worker 5xx on tools/call | Client receives 5xx | Sentry alert; usage event still emitted with `status='error'` | Billing not affected (errors not metered); Stripe Meters get correct count |
| CF Queue backed up (>10K msg) | CF Queue depth metric | Inngest consumer scales (concurrency keys); if Stripe Meters down → events queue indefinitely | Tenant tool calls succeed; metering delayed minutes-to-hours; Stripe invoice late but correct |
| Stripe Meters API down | POST `meterEvents.create` 5xx | Inngest retries with idempotency key; after exhausted → log to dead-letter, alert; events stay in Timescale (source of truth) | Billing eventually consistent; can replay from Timescale |
| Dispatch Worker auth cache stale | KV TTL expires | Falls back to Logto introspection on next request | Brief 50-200ms latency spike; resolves automatically |
| Stored credentials KV decrypt fails | Tenant Worker exception | Return 401 with "credentials invalid; re-deploy" | User must re-deploy; OK |

### Data Plane fails

| Failure | Detection | Handling | Cross-component effect |
|---------|-----------|----------|------------------------|
| Neon Postgres outage | Drizzle/asyncpg timeout | Inngest retries; engine retries; BFF returns 503; tenant Workers (which don't read DB on hot path) unaffected | Generation jobs queued; tool calls keep working; dashboard shows stale data |
| R2 outage | S3 client error | Engine cannot upload artifact → generation fails at upload step (last step); tenant Workers don't read R2 on hot path | Generation fails late; user can re-run from cache |
| pgvector index corruption | Query plan regressions | Tool retrieval feature (post-MVP) degraded; not on critical path | No MVP impact |
| TimescaleDB continuous aggregate lagging | Dashboard shows stale `usage_hourly` | Continuous aggregates refresh on schedule; manual refresh available | Dashboard latency 1-15min; tolerable |
| Langfuse Cloud outage | OTel export errors logged to Sentry | Engine retries OTel; if persistent → drop traces (logfire backpressure); generation continues | Trace data lost for outage window; not user-visible |

### Cross-cutting invariants

| Invariant | Why it matters | How to enforce |
|-----------|----------------|----------------|
| **Usage event schema identical at emit-site (tenant Worker), wire (CF Queue), persist-site (Timescale row), and Stripe Meters dimensions** | Mismatch = silent billing drift | One source of truth in `packages/contracts/src/usage-event.ts`. Tenant Worker imports it. Inngest consumer imports it. Drizzle migration generates from it. |
| **Smart ID format identical at codegen, runtime, and Pass 1 schema** | Stage E embeds `SMART_ID_SCHEMA`; runtime SDK parses IDs; if regex differs → all `fetch` calls 404 | Smart ID regex generated from `packages/ir`'s `SmartIdSchema` and used in both Stage E template and `@mcpgen/runtime` |
| **Generation `cost_cap_usd` enforced at engine, BFF, AND Stripe quota** | If only enforced at engine, BFF can re-submit infinite jobs | Enforce at all 3 levels: BFF rejects if org's monthly gen quota exceeded; engine tracks per-pass spend and stops; Stripe Meters tracks cumulative |
| **Auth tokens never logged** | GDPR + ICP-A trust baseline | Sentry beforeSend filter strips `Authorization` and `X-Upstream-Auth` headers; structured logs use field names that are filtered |
| **Spec content never logged** | Often contains internal API; PII risk | OTel/Sentry filter; engine never includes raw spec in trace events; only `content_hash` |
| **Generation `job_id` consistent across BFF, Inngest, Engine, R2 keys, DB row** | Idempotency + traceability | Generated as ULID at BFF; passed through every layer; used as session_id in Langfuse |
| **F3 sandbox CF namespace isolated from production tenant namespace** | A bug deploying a malformed Worker into production could break dispatch routing for real users | Use separate CF account or separate dispatch namespace `mcpgen-sandbox`. **Lock this in Phase 1 ops setup.** |
| **Quality badge and `is_publishable` flag consistent** | UI shows "verified" badge but `is_publishable=false` would be a contradiction | Single derivation function in `packages/contracts/src/quality.ts`, called from engine and rendered in frontend |

---

## Cross-Cutting Concerns

### Observability Hooks (wire from Phase 1, fill in Phase 9)

| Concern | Tool | Phase 1 wiring | Phase 9 completion |
|---------|------|----------------|--------------------|
| LLM tracing | Langfuse v4 via OTel | Initialize `logfire.configure(send_to_logfire=False, otlp_endpoint=...)` in engine FastAPI bootstrap; capture session_id=generation.id, user_id, tags, cost (auto by PydanticAI) | Verify trace → cost → quality_score correlation; alerting on cost spikes |
| Application errors | Sentry | Initialize SDK in each app entrypoint with empty DSN | Fill DSN per env; CI uploads source maps; alerting on P1 |
| Logs | BetterStack | structured JSON logger (`pino` for TS, `structlog` for Python); ship to BetterStack ingest | Tag-based filtering, retention 30d |
| Uptime | BetterStack Uptime | One health check per public endpoint | Add tenant Worker samples; on-call rotation (solo) |
| Customer-facing analytics | TimescaleDB → BFF read API → Next.js charts | Continuous aggregate `usage_hourly` defined in Phase 1 | BFF read endpoint + dashboard wired |

### Source Map Strategy

- **Next.js / Vercel:** automatic via `@sentry/nextjs` + Vercel build integration.
- **Hono on CF Workers:** `wrangler deploy --upload-source-maps` + `@sentry/cloudflare`. Must be set up in Phase 1 CI.
- **FastAPI on Fly Machines:** `sentry-sdk[fastapi]` auto-handles Python tracebacks.

### Secret Management

- **Our keys** (Stripe, OpenRouter, Resend): CF Workers Secrets + Fly.io Secrets.
- **User upstream API keys (stored mode)**: AES-256-GCM with per-tenant DEK in CF KV; KEK in CF Workers Secret. DEK derived via HKDF(KEK, tenant_id).
- **User upstream API keys (pass-through, default)**: never persisted; encrypted blob in `X-Upstream-Auth`, decrypted via key derived from tenant API key (HKDF), forwarded, discarded.
- **Pre-commit gitleaks hook** catches accidental commits.

### Idempotency Keys (must be in Phase 1 contracts)

| Operation | Idempotency key source | Why |
|-----------|------------------------|-----|
| `POST /api/v1/generate` | Client-supplied UUID in `Idempotency-Key` header, fallback to ULID | Browser retry on 5xx must not enqueue duplicate generation |
| Inngest job trigger | `generation.id` (ULID) | Inngest retries naturally idempotent |
| Stripe Meters event | `${deployment_id}_${minute_bucket}_${tool_name}` | Stripe dedupes; safe to retry CF Queue consumer |
| CF dispatch namespace deploy | `${deployment.id}` becomes `cf_worker_name` | Re-deploy is upsert; safe |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 users (MVP) | Everything as designed. Single Fly region (e.g. `iad`). Single Neon region. CF Workers global edge handles request routing implicitly. |
| 100-1k users | Watch CF Queue depth; if metering lag > 10 min consistently, increase Inngest concurrency. Watch Fly Machine cold starts; if visible to users, add second region or stop using auto-suspend for the engine. |
| 1k-10k users | Self-host Logto (per `mcpgen-architecture.md` §19 trigger: 5K MAU). Self-host Langfuse if LLM events > 5M/mo. |
| 10k-100k users | Migrate Vercel → CF Pages (consolidate vendors). Add Neon EU region for data residency. Re-evaluate WfP per-Worker cost vs. shared multi-tenant Worker. |

### Scaling Priorities

1. **First bottleneck: Fly Machine engine throughput.** Generation is single-machine per job. Inngest concurrency per-org (1/free, 5/Pro) prevents thundering herd; if global throughput becomes the issue: scale Fly Machines.
2. **Second bottleneck: Stripe Meters API rate limits.** ~100 req/sec per merchant.
3. **Third bottleneck: Postgres connection limit.** Neon Launch tier ~100 connections. **Use Hyperdrive in Phase 1 ops scaffold; pools connections at the edge.**
4. **Fourth bottleneck: R2 bandwidth.** No egress fees; fine indefinitely.

---

## Anti-Patterns (specific to this domain)

### Anti-Pattern 1: Skipping `packages/contracts` for "speed"
Phase 1 sets up `packages/contracts` with TSC project references. Even if it's just one file, the import boundary is the discipline that prevents drift.

### Anti-Pattern 2: Treating SSE as transactional
SSE is a *progress hint*; the source of truth is `generation.status` in Postgres. UI: on reconnect, fetch current state from BFF, then subscribe to SSE for delta.

### Anti-Pattern 3: Storing the upstream API key "for convenience"
Pass-through default; UI requires explicit "I understand this is less secure" checkbox to enable stored.

### Anti-Pattern 4: Logging spec content for "debugging"
Log `content_hash + endpoint_count + structural_diff_summary`. For deep debug, opt-in "debug bundle" feature where user explicitly uploads spec to a debug R2 bucket with 7-day TTL.

### Anti-Pattern 5: Running F3 agent eval against production tenant namespace
Separate `mcpgen-sandbox` CF account or namespace. **Lock this in Phase 1 ops setup.**

### Anti-Pattern 6: Letting Drizzle and SQLAlchemy diverge
Drizzle is source. CI step generates JSON schema from migrations. Engine reflects into Pydantic on startup.

### Anti-Pattern 7: Building "pass 6" that runs after F3 to "fix" failures
Failure pattern → upstream pass mapping (`docs/mcpgen-stage-f-design.md`). Targeted retry of the specific upstream pass. Max 2 rounds. Then ship with `needs_review` badge.

### Anti-Pattern 8: Using LiteLLM "for flexibility"
Already deleted per `docs/mcpgen-model-and-provider-override.md`. PydanticAI's `OpenAIProvider` directly with OpenRouter `base_url`.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes / gotchas |
|---------|---------------------|-----------------|
| OpenRouter (LLM) | PydanticAI `OpenAIProvider(base_url=https://openrouter.ai/api/v1)` | Set `OPENROUTER_HTTP_REFERER` and `OPENROUTER_X_TITLE` headers; rate limits per-account; fallback model `qwen/qwen3-30b-a3b-instruct` |
| Anthropic (F3 agent eval only) | Direct `@anthropic-ai/sdk` | F3 test agent is the documented exception; uses real Sonnet 4.7 because it simulates production users |
| Cloudflare (Workers, WfP, R2, Queue, KV) | wrangler CLI + CF API | WfP requires "Workers Paid" + "Workers for Platforms" SKU; verify pricing/limits in Phase 6 |
| Neon (Postgres + Timescale + pgvector) | Drizzle (TS) + asyncpg (Python) | Hyperdrive for CF Workers connection pooling; TimescaleDB extension must be enabled |
| Logto Cloud | OIDC via standard libraries | Free tier 5K MAU; introspection endpoint cached 5 min |
| Inngest Cloud | `inngest` SDK in BFF and Engine | Concurrency keys per-org; idempotent jobs; SSE relay for callbacks |
| Stripe Billing + Meters | `stripe` SDK; webhook handler in BFF | Meters API rate limit ~100 req/sec; idempotency keys mandatory; webhook signature verification |
| Langfuse v4 | OTel via PydanticAI's logfire integration | `send_to_logfire=False`; OTLP HTTP exporter to Langfuse Cloud |
| Sentry | `@sentry/nextjs` + `@sentry/cloudflare` + `sentry-sdk[fastapi]` | Source map upload differs per runtime — wire in Phase 1, not Phase 9 |
| BetterStack | structured JSON ingest | Logs via `pino`/`structlog`; uptime via HTTP checks |
| Resend | `resend` SDK | Email templates for drift, signup, deploy success, quotas |
| Vercel | Git push → auto-deploy `apps/web` | Production protection rule on `main`; preview deploys per PR |

### Multi-repo vs Monorepo decision

**Locked to monorepo Turborepo + pnpm in `mcpgen-architecture.md` §15.** Verifying: confirmed appropriate. TS-Python polyglot monorepo with shared schema (IR + contracts) requires synchronized commits across `apps/web`, `apps/api`, `apps/generation-engine`, `packages/ir`. Multi-repo coordination cost would dominate.

**Tooling gotcha to verify in Phase 1:** Cloudflare wrangler deploy from a monorepo workspace requires `--config` pointing to the right `wrangler.toml`; ensure CI uses `pnpm --filter=apps/api wrangler deploy`.

**No change recommended.** Keep monorepo + Turborepo + pnpm.

---

## Risks vs. Locked Architecture

These are places where the documented architecture may need adjustment under real load or real failure modes.

### R-A1. Fly Machines auto-suspend cold start vs. SSE expectations
SSE connection from BFF to engine is initiated *after* the Inngest job triggers; if engine is cold, Stage A "Parsing spec..." status delayed by 1.5s. **Cosmetic.** Phase 2 keep-warm cron is critical; verify it's in Phase 1 Inngest setup.

### R-A2. CF Queue → Inngest backpressure
If Inngest consumer fails for >5 minutes, CF Queue holds messages, but Stripe Meters won't reflect usage in real-time. **Billing accuracy preserved** (Timescale is source of truth, can be replayed). BetterStack alert on CF Queue depth > 10K. Phase 9 concern; verify wired.

### R-A3. Stripe Meters API rate limits at scale
~100 req/sec per merchant. Inngest batching keeps this ~1 req/sec/deployment. Safe to ~6000 active deployments × 1 tool/minute = 100/sec. Beyond that, must batch larger. Not MVP concern; t+12 concern.

### R-A4. SSE callback delivery semantics (engine → BFF)
**Lost progress events → user sees SSE silence; refresh recovers from DB.** Add explicit retry policy: 3 attempts with exponential backoff; on final failure, write event to a `pending_callbacks` table and surface via cron retry. **Recommend:** add `pending_callbacks` table to DB schema v1 in Phase 1.

### R-A5. Source maps not wired in Phase 1
Sentry source map upload is build-time integration. If left to Phase 9, Phase 5 errors are unreadable. Phase 1 includes empty-DSN Sentry SDK init in each app + CI source map upload step.

### R-A6. IR cross-language source-of-truth ambiguity
Phase 1 must pick one. **Recommend TS Zod as source** because 4 of 5 consuming surfaces are TS; only engine is Python; Zod → Pydantic codegen tools exist. **Lock decision in Phase 1.**

### R-A7. Generation API request shape not yet specified
Phase 1 produces `packages/contracts/src/generation-api.ts` with **all fields explicitly typed**, including `Idempotency-Key` header convention, SSE event union types, error code enum.

### R-A8. F3 sandbox isolation must be in Phase 1 ops, not Phase 5 engine
**Phase 1 Wave 1 includes "create `mcpgen-sandbox` CF namespace + token". Phase 5 just consumes it.**

---

## Summary for Roadmapper

**Confirmation:** the 10-phase plan in `docs/mcpgen-gsd-sprint-plan.md` is correct in shape and ordering. No phases need to be added, removed, or re-ordered.

**Eight refinements to fold into roadmap phase definitions:**

1. **Phase 1 must include sample tenant Worker scaffold** so Phase 6 can validate dispatch + auth + usage pipeline without engine completion.
2. **Phase 1 must include empty-DSN Sentry SDK init in all 4 apps + CI source map upload** (R-A5).
3. **Phase 1 must include Langfuse OTel exporter init in engine scaffold** (no DSN needed; traces will appear from Phase 2 day 1).
4. **Phase 1 must include `mcpgen-sandbox` CF namespace + token** (R-A8).
5. **Phase 1 must lock IR source-of-truth direction** (recommend TS Zod → Pydantic) (R-A6).
6. **Phase 1 DB schema v1 must include `pending_callbacks` table** for SSE callback retry (R-A4).
7. **Phase 1 contracts must spec idempotency keys at all 4 surfaces** (POST /generate, Inngest job, Stripe Meters event, CF dispatch deploy).
8. **Phase 8 Stripe Meters integration can start in Wave 1-2 against synthetic test events**; only end-to-end real-event validation needs Phase 6 — unblocks parallel work.

**Files referenced (all absolute paths):**
- `/Users/igor/Projects/mcpgen/docs/mcpgen-architecture.md`
- `/Users/igor/Projects/mcpgen/docs/mcpgen-gsd-sprint-plan.md`
- `/Users/igor/Projects/mcpgen/docs/mcpgen-implementation-plan.md`
- `/Users/igor/Projects/mcpgen/docs/mcpgen-generation-engine-v2.md`
- `/Users/igor/Projects/mcpgen/docs/mcpgen-pass-{0,1,2,3,4,5}-design.md`
- `/Users/igor/Projects/mcpgen/docs/mcpgen-stage-{e,f}-design.md`
- `/Users/igor/Projects/mcpgen/docs/mcpgen-model-and-provider-override.md`
- `/Users/igor/Projects/mcpgen/.planning/PROJECT.md`
