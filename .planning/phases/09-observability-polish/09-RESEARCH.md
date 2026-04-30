# Phase 9: Observability & Polish — Research

**Researched:** 2026-04-30
**Domain:** Cross-cutting observability (Sentry / BetterStack / Langfuse) + 5 cross-phase audits + 4 BFF carry-forwards
**Confidence:** HIGH (Sentry / Langfuse / Inngest / outbox all directly verifiable in tree; BetterStack heartbeat URL verified via official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Sentry / Langfuse / BetterStack DSNs MUST no-op gracefully when DSN is empty/unset. Phase 10 promotes from optional to required-in-prod via build-time check.
- **D-02:** Confirmed `.env.local` set: `SENTRY_DSN_API`, `SENTRY_DSN_DISPATCH`, `SENTRY_DSN_ENGINE`, `SENTRY_DSN_WEB`, `LANGFUSE_PUBLIC_KEY/SECRET_KEY/HOST/OTLP_ENDPOINT`, `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`. Missing: `BETTERSTACK_LOGS_TOKEN`, `BETTERSTACK_UPTIME_API_KEY`, `SENTRY_AUTH_TOKEN`. Phase 9 ships placeholder + runbook only.
- **D-03:** Single `redactBeforeSend()` helper in `packages/contracts/src/sentry-redaction.ts` consumed by every TS Sentry init. Strips header keys (case-insensitive): `Authorization`, `X-Upstream-Auth`, `Cookie`, `Stripe-Account`, `Stripe-Signature`, `X-Webhook-Signature`, plus `/^x-.*-(auth|token|key|secret)/i`. Strips request body when content-type matches yaml/json AND path contains `/v1/generate`. Strips `event.extra.spec`, `event.extra.openapi_yaml`, and any string field containing `Bearer `, `sk_live_`, `sk_test_`, `ghp_`.
- **D-04:** Python equivalent `mcpgen_engine.observability.sentry_redaction.redact_before_send` mirrors D-03 exactly. Cross-language regression test feeds canonical attack inputs and asserts redaction.
- **D-05:** Source maps upload is per-runtime, orchestrated by single `pnpm sourcemaps:upload`. apps/web uses `@sentry/nextjs` auto upload (already wired); apps/api + apps/dispatch use `@sentry/cli sourcemaps upload --release ${VERSION}` invoked from `wrangler deploy` post-build hook (skipped when `SENTRY_AUTH_TOKEN` absent); apps/generation-engine uses `sentry-cli` Python wheel + `--upload-source` flag (Phase 10 only).
- **D-06:** Every PydanticAI `agent.run(...)` passes `metadata={"session_id": str(generation.id), "stage": "<pass-N>"}`. Logfire OTel exporter forwards trace attributes to Langfuse with `langfuse.session.id` mapping.
- **D-07:** Spec content NEVER in Langfuse traces. Logfire `scrubbing` rule replaces span attributes named `spec_yaml`, `spec_url_response_body`, `raw_ir.openapi`, or `prompt.system` containing >10K chars with `<spec redacted, sha256:...>`. IR structure (tools, params, descriptions) logged in full.
- **D-08:** F1 cross-tenant fuzz test at `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py` — generates 5 server bundles for 5 tenants × 5 specs; extracts smart-ID regex from each `runtime/smart_id.ts`; asserts no two regexes match the same identifier across tenants.
- **D-09:** Runtime guard already exists in `apps/dispatch/src/middleware/smartIdFuzz.ts`. Phase 9 adds integration test `apps/dispatch/tests/cross-tenant-id-block.test.ts`.
- **D-10:** Extend Phase 5 F3 mock_clients with 2024-11 protocol mock client that DROPS `outputSchema` from `tools/list`. Test fixture: `apps/generation-engine/tests/integration/test_multi_protocol_client.py`.
- **D-11:** Manual runbook `docs/runbooks/multi-client-smoke.md` (Cursor / Claude Desktop / ChatGPT Deep Research × 5 popular APIs = 15 manual runs).
- **D-12:** pytest CI gate `apps/generation-engine/tests/security/test_pii_redaction.py` + vitest `apps/api/tests/security/sentry-redaction.test.ts`. 6 canonical leak vectors.
- **D-13:** One-off W7 audit script `scripts/observability/leak-audit.ts` with mocked Sentry events API in Phase 9 (real org swap in Phase 10).
- **D-14:** Assertion test `apps/api/tests/inngest/test_orphan_audit.test.ts` statically scans every `inngest.createFunction({ id: ... })` and asserts the id is in `INNGEST_FUNCTION_IDS`.
- **D-15:** One-off live audit script `scripts/observability/inngest-orphan-audit.ts` queries Inngest dev server.
- **D-16:** Local synthetic load test `apps/api/tests/load/test_neon_oom_replication.test.ts` — concurrent tsvector + pgvector + TimescaleDB hypertable insert against local Postgres docker container.
- **D-17:** Neon Scale-tier upgrade is a Phase 10 calendar action. Phase 9 ships `docs/runbooks/neon-scale-upgrade.md`.
- **D-18:** Implement 4 BFF endpoints (`GET /deployments`, `GET /usage/hourly`, `GET /deploy/[generationId]`, `POST /deployments/[id]/badge-public`).
- **D-19:** Drizzle migration `20260430000000_phase9_badge_public.sql` adds `deployments.public_badge boolean not null default false`.
- **D-20:** Revise `docs/mcpgen-architecture.md` §6 P99 budget statement + Stage E template addition (`globalThis.__mcpgen_zod_schemas` cache).
- **D-21:** BetterStack alert (or local fallback `scripts/observability/outbox-depth-monitor.ts`) monitors `usage_events_outbox` row count where `sent_at IS NULL`. Threshold: alert when count > 10K.

### Claude's Discretion

- Exact Drizzle migration column types, idx names, defaults — planner picks per existing patterns in `infrastructure/neon/migrations/*`.
- BFF endpoint pagination defaults (limit/offset) for `/usage/hourly` — planner picks per Pass 3 standard parameter set in CLAUDE.md §13.
- Sentry release / environment naming convention — planner picks per `@sentry/cli` defaults.
- Logfire span names for redaction processor — planner picks per Logfire convention.
- Specific test file structure (table-driven vs per-vector test) for D-12 — planner picks per existing vitest patterns in `apps/api/tests/`.

### Deferred Ideas (OUT OF SCOPE)

- BetterStack DSN provisioning + production targets (apps/web Vercel, apps/api CF Workers, apps/dispatch CF Workers, apps/generation-engine Fly, sample tenant Worker) — Phase 10.
- CF Queue depth alert (replaced by outbox depth alert in Phase 9 D-21) — flip to CF Queue alert when CF deploy lands in Phase 10.
- Real Neon Scale-tier compute upgrade — Phase 9 ships runbook only; user executes at W7.
- Real-Sentry leak audit (D-13) — Phase 9 mocks the events API; Phase 10 swaps in real Sentry org.
- Production source-maps upload to Sentry (D-05) — wired but skipped without `SENTRY_AUTH_TOKEN`; Phase 10 CI provisions the token.
- Logto Cloud Pro pre-buy (Pitfall #17) — calendar action W7, not Phase 9 implementation.
- GTM-01..03 (Quickstart docs, Privacy/ToS/Pricing, soft launch) — Phase 10.
- Custom Sentry HTML email templates / embedded Stripe Elements / GraphQL parser / multi-region runtime / A/B deploys / Team plan / SSO / auto-regenerate on drift — out-of-scope per `RULES.md` §6 / `PROJECT.md`.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **CTRL-08** | Sentry (TS + Python with source maps), BetterStack (logs + uptime + CF Queue depth alert), Langfuse v4 (LLM tracing via OTel) wired across all components; Sentry `beforeSend` strips auth headers and spec content | §3 (Sentry redaction shared helper TS+Py) · §4 (Langfuse OTel `langfuse.session.id` attribute via PydanticAI metadata) · §5 (BetterStack heartbeat URL + outbox depth fallback) · §7 (PII deliberate-leak audit) · §11 (validation tests for all 6 leak vectors × 4 SDKs) |
| **CTRL-09** | Inngest function IDs are stable strings; orphan audit in Phase 9 [P2: pitfall #21] | §6 (orphan audit static scan + live `inngest-cli` query) · existing `INNGEST_FUNCTION_IDS` register at `packages/contracts/src/inngest-functions.ts` already shipped Phase 8 — Phase 9 only verifies set-equality |

ROADMAP "Phase 9 Success Criteria" maps 4 numbered criteria to these 2 REQ IDs:
1. Sentry DSNs filled in all 4 apps + source maps + `beforeSend` redaction + leak audit returns zero hits → CTRL-08
2. Langfuse v4 `session_id = generation.id` correlation + spec redaction → CTRL-08
3. BetterStack uptime + CF Queue depth alert (substituted by outbox depth) + Neon connection-refusal alert → CTRL-08
4. Inngest stable IDs + orphan audit + cross-tenant smart-ID fuzz + multi-client smoke → CTRL-09 + CTRL-08
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **§9 Observability invariant:** Logfire `send_to_logfire=False` (already wired Phase 1 `apps/generation-engine/src/mcpgen_engine/observability.py:38`); OTLP → Langfuse Cloud. **NEVER LOG**: spec content, upstream API responses, upstream auth credentials. **OK TO LOG**: generation metadata, tool names, IR structure, performance metrics, error traces.
- **No silent fallbacks** (CLAUDE.md global): Phase 9 redaction failures must be visible in CI; redactor that misses a vector is a CI failure, not a warn.
- **No mocking the database in integration tests** (RULES.md). D-16 hits a real local Postgres docker container.
- **Atomic commits** (Conventional Commits 1.0.0); D-18 four BFF routes need to be split or share one atomic feat commit per route.
- **Pre-commit `gitleaks`** is already installed Phase 5; D-12 leak vectors must use sentinel patterns that don't trip gitleaks (suggested: `MCPGEN_LEAK_CANARY_2026Q2` per CONTEXT specifics).
- **No `--no-verify`**: D-21 outbox monitor runs locally via `pnpm` script that respects pre-commit gates.
- **Single LLM model** `qwen/qwen3-coder` via OpenRouter (model-and-provider-override.md). Phase 9 doesn't add LLM calls beyond what Phase 5 F2/F3 already wires; F3 test agent stays on Sonnet 4.7.

---

## Summary

Phase 9 is the **integration phase** for cross-cutting concerns that span all 8 prior phases. Most observability primitives already exist in tree (Sentry SDK init shells, Logfire OTel exporter, redaction helpers, dispatch smart-ID middleware, inngest function ID register). Phase 9's job is to (a) **consolidate redaction** behind a single shared helper that all 4 apps + the Stage E template import, (b) **wire `langfuse.session.id`** from the engine `agent.run()` call site through to Langfuse, (c) **close 4 BFF carry-forward endpoints** that Phase 7 already wired the frontend to expect, and (d) **gate** all CTRL-08 and CTRL-09 criteria with regression tests so the launch criteria can be enforced in CI.

The phase is **light on new code, heavy on integration tests + audits**. The biggest concrete deliverables are: ~3 shared modules (TS + Py redaction helpers, BFF route group), 1 Drizzle migration, 1 Stage E template addition (Zod cache in `globalThis`), 1 doc edit (architecture §6 P99 SLO), and ~12 audit tests. The local-compute mode (per `project_local_compute.md` and Phase 8 D-22) means cloud SaaS endpoints (BetterStack uptime, real Sentry events API, real CF Queue alerts) are runbook-deferred to Phase 10.

**Primary recommendation:** Wave the work as `Wave 1: shared helpers + migration + redaction tests` (foundation; D-03/D-04/D-12/D-19) → `Wave 2: BFF endpoints + Langfuse session_id + Inngest audit` (D-06/D-07/D-14/D-18) → `Wave 3: cross-phase audits + runbooks + SLO doc` (D-08/D-09/D-10/D-13/D-15/D-16/D-17/D-20/D-21). Wave 1 unblocks Wave 2/3 because the shared `redactBeforeSend()` helper is consumed by both the BFF Sentry refit AND the leak-audit CI gate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shared Sentry redaction (D-03/D-04) | Cross-cutting library (`packages/contracts/`, `mcpgen_engine.observability`) | TS Sentry SDK init in 4 apps + Stage E template | A single source of truth for the denylist closes the "if we miss one variant, all apps inherit the fix from one PR" property in CONTEXT D-03. |
| Langfuse `session_id` correlation (D-06/D-07) | Engine (Python) | OTel/Logfire SDK → Langfuse OTLP endpoint | `agent.run(metadata=...)` is per-call site (10 sites across passes 0-5 + F2/F3 judges); the OTLP exporter is already wired in `observability.py`. |
| Source maps upload (D-05) | Build time (CI/CD) | Per-runtime: Webpack (next), wrangler (CF), sentry-cli (Python wheel) | Source maps are debugging artifact; runtime never sees them. Skip-when-no-token path keeps local dev unaffected. |
| Cross-tenant smart-ID fuzz (D-08) | Test infrastructure (engine integration test) | Generated `runtime/smart_id.ts` regex artifacts + dispatch `smartIdFuzz` middleware | Defense in depth — fuzz check at codegen time + runtime guard at dispatch. The runtime guard already exists at `apps/dispatch/src/middleware/smartIdFuzz.ts:23`. |
| 2024-protocol mock client (D-10) | Test infrastructure (engine F3 mocks) | F3 `mock_clients.py` extension | Phase 5 F3 already harnesses 3 mock clients — adding the 4th is a fixture-only change. |
| PII deliberate-leak audit (D-12/D-13) | Test infrastructure (vitest + pytest CI) | Mocked Sentry events API (StorageAdapter pattern) | Phase 8 already shipped the StorageAdapter abstraction (`packages/contracts/src/storage.ts`) — D-13's mocked Sentry events API follows the same Phase 9 mock impl + Phase 10 real impl pattern. |
| Inngest orphan audit (D-14/D-15) | Test infrastructure (vitest static-source assertion) + Inngest CLI (live) | `INNGEST_FUNCTION_IDS` register + `apps/api/src/inngest/functions/index.ts` array | Static test runs in <1s on every PR; live audit runs weekly post-launch. Both consume the same register. |
| Neon Scale-tier OOM verification (D-16/D-17) | Test infrastructure (vitest load test) + runbook | Local docker Postgres (Phases 1-9) → real Neon Scale tier (Phase 10 W7) | Phase 9 ships SQL workload reproducer; tier upgrade is a paid action user executes at W7. |
| 4 BFF carry-forward endpoints (D-18) | Hono BFF (`apps/api`) | Drizzle queries + Logto JWT middleware (already shipped) + TimescaleDB `usage_hourly` materialized view (already shipped Phase 8) | Same pattern as Phase 8 drift routes (`apps/api/src/routes/v1/drift.ts`). Org-scoping via `c.var.auth.organizationId`. |
| `public_badge` migration (D-19) | Drizzle (`infrastructure/neon/migrations/`) | `db-schema.ts` table extension | Single column ALTER. Timestamp prefix mandatory per Phase 1 D-12 + Pitfall #18. |
| Zod schema cache (D-20) | Stage E template (`packages/codegen-templates/templates/`) | CF Workers `globalThis` lifetime | Per-isolate init-once is documented CF idiom; Zod schema build is ~ms but accumulates per-tool per-request. |
| Outbox depth alert (D-21) | Local pnpm script + BetterStack heartbeat URL placeholder | `usage_events_outbox` partial index (already shipped Phase 8 migration line 112) + Resend client (already shipped Phase 8) | Heartbeat URL is HTTP GET to `https://uptime.betterstack.com/api/v1/heartbeat/{token}` — wireable in Phase 9, hot-keyed by user in Phase 10. |

---

## Standard Stack

### Core (already pinned in repo — no version bumps needed)

| Library | Version | Purpose | Why Standard | Provenance |
|---------|---------|---------|--------------|------------|
| `@sentry/cloudflare` | `^10.50.0` (10.51.0 latest) | Sentry SDK for CF Workers — `apps/api`, `apps/dispatch`, generated tenant Workers | Official Sentry CF integration; `withSentry(envCallback, handler)` is the canonical CF pattern (NOT `Sentry.init()`) | [VERIFIED: apps/api/package.json:23 + npm view] |
| `@sentry/nextjs` | `^10.50.0` (10.51.0 latest) | Sentry SDK for Next.js — `apps/web` | Auto-uploads source maps via `withSentryConfig`; integrates with App Router middleware/edge/server | [VERIFIED: apps/web/next.config.js:18 + npm view] |
| `@sentry/cli` | `^3.4.1` (3.4.1 latest) | Source-map upload CLI for CF Workers + Python | Runs in build-time only; reads `SENTRY_AUTH_TOKEN` from env | [CITED: docs.sentry.io/platforms/javascript/guides/cloudflare/sourcemaps/uploading/wrangler/] |
| `sentry-sdk[fastapi]` | `>=2.16,<3.0` (2.58.0 installed) | Python Sentry SDK for `apps/generation-engine` | `dsn=None` disables client; `before_send=...` hook signature unchanged across 2.x | [VERIFIED: apps/generation-engine/uv.lock + apps/generation-engine/pyproject.toml] |
| `logfire` | `>=1.0,<2.0` (1.3.2 installed) | OTel SDK shim used by PydanticAI; we configure with `send_to_logfire=False` and attach our own OTLP exporter to Langfuse | Already wired Phase 1 (FND-11) at `apps/generation-engine/src/mcpgen_engine/observability.py:28-50` | [VERIFIED: tree inspection] |
| `pydantic-ai` | `==0.2.20` | LLM agent framework; `agent.run(metadata=...)` accepts dict that attaches to OTel span | `metadata` param documented at API reference; primitives only or callable returning primitives | [CITED: search via WebSearch — "PydanticAI 0.2 agent.run metadata" → ai.pydantic.dev/api/agent] |
| `opentelemetry-sdk` | `>=1.27,<2.0` | OTel core (TracerProvider, BatchSpanProcessor, SpanContext) | Already wired in `observability.py:25-26` | [VERIFIED] |
| `opentelemetry-exporter-otlp-proto-http` | `>=1.27,<2.0` | OTLP HTTP exporter to `LANGFUSE_OTLP_ENDPOINT` | Already wired in `observability.py:23` | [VERIFIED] |
| `inngest` | `^4.2.4` | Inngest TypeScript SDK — function definitions; we expose `/api/inngest` route | Phase 8 wired 7 functions at `apps/api/src/inngest/functions/*.ts`; ID register at `packages/contracts/src/inngest-functions.ts` | [VERIFIED] |
| `drizzle-orm` | `^0.45.2` | Postgres queries for D-18 BFF endpoints + D-19 migration | Already canonical for this project (Phase 1 D-12) | [VERIFIED] |
| `zod` | `^4.3.6` | Request/response validation in BFF routes | Pinned across monorepo; existing route pattern in `drift.ts:27` uses `zValidator('json', ...)` | [VERIFIED] |
| `vitest` | `^1.6.0` | Test runner for `apps/api` + `apps/web` + `apps/dispatch` | Workspace-wide convention (Phase 1 D-13) | [VERIFIED] |
| `pytest` | (engine) | Test runner for `apps/generation-engine` | Already wired (`tests/test_observability.py` exists) | [VERIFIED] |

### Supporting (Phase 9 may add — verify before pinning)

| Library | Version | Purpose | When to Use | Provenance |
|---------|---------|---------|-------------|------------|
| `pg-promise` or `postgres` (already used) | n/a | D-16 concurrent SQL load | If existing `@neondatabase/serverless` works concurrently, prefer it. Else `node-postgres` (`pg`). | [ASSUMED — verify in Wave 3] |
| **None additional** | — | — | Phase 9 should add ZERO new runtime deps. All work is integration of already-pinned libraries. | Recommendation per CONTEXT "no new runtime dependencies" pattern from Phase 7. |

### Alternatives Considered

| Instead of | Could Use | Why we don't |
|------------|-----------|--------------|
| Shared TS+Py redaction helpers (D-03/D-04) | Sentry's `denylist` config option | Sentry's built-in denylist is per-PII-pattern not per-header-key; doesn't cover spec body redaction or the `event.extra.spec` shape. Plus we want a single source of truth for both languages. |
| `langfuse-python` SDK explicit calls | OTel via Logfire exporter (selected) | OTel path is already wired (D-06 just adds `metadata=`). Explicit SDK calls would duplicate the trace surface and risk drift between PydanticAI auto-spans and explicit calls. |
| pgbench for D-16 | bare vitest concurrent SQL | pgbench is a separate binary that needs setup outside Node; existing engine tests already use plain SQL (Phase 8 reconciler uses `db.execute(sql\`...\`)`). Stick with vitest + concurrent Promise.all. |
| `inngest-cli list` (live audit) | Static AST scan of files | Both. Static AST scan = D-14 (CI-friendly, <1s); live `inngest-cli` query = D-15 (post-launch ops cadence). |

**Installation (no new packages):**
```bash
# All deps already declared; Phase 9 only re-imports them.
# If D-16 needs pgbench-equivalent, add a single dev dep to apps/api or apps/generation-engine.
```

**Version verification (run before commit):**
```bash
npm view @sentry/cloudflare version  # → 10.51.0 (matches ^10.50.0)
npm view @sentry/nextjs version      # → 10.51.0
npm view @sentry/cli version          # → 3.4.1
pip index versions sentry-sdk         # → 2.58.0 (within >=2.16,<3.0)
```
[VERIFIED via `npm view` + `pip index` runs 2026-04-30.]

---

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 9 OBSERVABILITY DATA FLOWS                         │
└────────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
  │  apps/web       │     │  apps/api       │     │  apps/dispatch  │
  │  (Next.js)      │     │  (Hono BFF)     │     │  (Hono CF)      │
  │                 │     │                 │     │                 │
  │  @sentry/nextjs │     │ @sentry/clf     │     │ @sentry/clf     │
  │   beforeSend ───┼──┐  │  beforeSend ────┼──┐  │  beforeSend ────┼──┐
  │   (3 configs)   │  │  │                 │  │  │                 │  │
  └─────────────────┘  │  └─────────────────┘  │  └─────────────────┘  │
                       │                       │                       │
                       │  ┌─ packages/contracts/src/sentry-redaction.ts ┐
                       └──┤  redactBeforeSend()                          │
                          │  • Header denylist                           │
                       ┌──┤  • Body content-type/path filter             │
                       │  │  • String-pattern redaction                  │
                       │  └─────────────────────────────────────────────┘
                       │
  ┌─────────────────┐  │     ┌──────────────────────────────────────────┐
  │ Generated tenant│  │     │  apps/generation-engine (FastAPI/Py)     │
  │ Workers (Stage E│  │     │                                           │
  │  template)      │  │     │  sentry_sdk[fastapi]                      │
  │                 │  │     │   before_send=                             │
  │  sentry_redact  │──┘     │   mcpgen_engine.observability             │
  │  .ts.j2 imports │        │     .sentry_redaction.redact_before_send  │
  │  shared helper  │        │   (mirrors D-03 Python equivalent)        │
  └─────────────────┘        │                                           │
                             │  agent.run(metadata={"session_id": ...})  │
                             │           │                                │
                             │           ▼                                │
                             │  Logfire OTel SDK                          │
                             │   span.set_attribute("langfuse.session.id"│
                             │     , metadata.session_id)                 │
                             │   logfire.scrubbing(callback=preserve_     │
                             │     langfuse_session_id)                   │
                             │           │                                │
                             │           ▼                                │
                             │  OTLPSpanExporter(Basic auth)              │
                             └──────────┬───────────────────────────────┘
                                        │
                                        ▼
                            ┌────────────────────────────┐
                            │  Sentry Cloud              │
                            │  (4 projects: web/api/     │
                            │   dispatch/engine)         │
                            │  + sourcemaps (D-05)       │
                            │                            │
                            │  Langfuse Cloud            │
                            │  (OTLP endpoint;           │
                            │   trace.session_id =       │
                            │   langfuse.session.id      │
                            │   span attribute)          │
                            └────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────┐
  │  CROSS-PHASE AUDIT GATES (CI-enforced, run on every PR)          │
  ├──────────────────────────────────────────────────────────────────┤
  │  D-08 cross-tenant smart-ID fuzz: pytest integration              │
  │  D-09 dispatch tenant-mismatch test: vitest                       │
  │  D-10 2024-protocol mock client: pytest extension to F3           │
  │  D-12 PII redaction (6 vectors × 4 SDKs): vitest + pytest         │
  │  D-14 Inngest orphan audit (static): vitest                       │
  │  D-19 deployments.public_badge migration                          │
  └──────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────┐
  │  RUNBOOK / ONE-OFF SCRIPTS (manual; Phase 10 calendar actions)   │
  ├──────────────────────────────────────────────────────────────────┤
  │  D-11 multi-client smoke (Cursor/CD/CGPT × 5 APIs = 15 runs)      │
  │  D-13 leak-audit.ts (mocked Phase 9 → real Sentry org Phase 10)   │
  │  D-15 inngest-orphan-audit.ts (live dev-server query)             │
  │  D-16 Neon OOM repro (local pgbench-equivalent under docker)      │
  │  D-17 neon-scale-upgrade.md runbook                                │
  │  D-21 outbox-depth-monitor.ts (cron-able locally; BetterStack    │
  │       heartbeat URL placeholder until W7)                          │
  └──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| File / Module | Responsibility | Phase 9 Action |
|---------------|----------------|----------------|
| `packages/contracts/src/sentry-redaction.ts` (NEW) | TS shared `redactBeforeSend(event)` consumed by 4 apps + Stage E template | CREATE — D-03 |
| `apps/generation-engine/src/mcpgen_engine/observability/sentry_redaction.py` (NEW; current `observability.py` becomes a sibling module or `__init__.py` package) | Python equivalent of D-03 | CREATE — D-04. Recommend converting current `observability.py` (single file) to `observability/` package with `__init__.py` re-exporting `configure_langfuse_otel` and adding `sentry_redaction.py` sibling. |
| `apps/web/src/lib/sentry/redact.ts` | Already exists — **must be replaced** by re-export of new `@mcpgen/contracts/sentry-redaction` | MODIFY — D-03 (turn into shim re-exporting from `@mcpgen/contracts`) |
| `apps/api/src/instrumentation.ts:38-66` | Already has `sentryOptionsFor(env)` with inline `beforeSend` | MODIFY — replace inline body with `redactBeforeSend` import — D-03 |
| `apps/dispatch/` (no Sentry init yet — only DSN env binding declared) | Add `instrumentation.ts` mirroring `apps/api` pattern + import shared helper | CREATE init shim — D-03 |
| `packages/codegen-templates/templates/sentry_redact.ts.j2` | Already generates per-Worker redactor; **expand denylist to match D-03** (current template only covers headers + top-level body keys per NOTE 6 marked "Phase 9 follow-up") | MODIFY — D-03; converge denylist with shared helper. |
| `apps/generation-engine/src/mcpgen_engine/main.py:33-50` | Inline `_sentry_before_send` redactor | MODIFY — replace with `redact_before_send` import — D-04 |
| `apps/generation-engine/src/mcpgen_engine/observability.py:38` | `logfire.configure(send_to_logfire=False)` | MODIFY — add `scrubbing=ScrubbingOptions(callback=...)` to preserve `langfuse.session.id` (Logfire auto-scrubs anything matching "session"); add per-attribute scrub for spec content >10K chars — D-07 |
| `apps/generation-engine/src/mcpgen_engine/passes/pass_*/`-`stages/stage_f/`*.py (~10 `agent.run()` call sites — see "Existing Patterns" below) | LLM agent invocations | MODIFY — add `metadata={"session_id": str(generation_id), "stage": "<pass-N>"}` to every `agent.run(...)` — D-06 |
| `packages/contracts/src/db-schema.ts:144-157` | `deployments` table | MODIFY — add `public_badge: boolean('public_badge').notNull().default(false)` — D-19 |
| `infrastructure/neon/migrations/20260430000000_phase9_badge_public.sql` (NEW) | ALTER TABLE deployments ADD COLUMN | CREATE — D-19 |
| `apps/api/src/routes/v1/deployments.ts` (NEW) | `GET /api/v1/deployments` (list) + `POST /api/v1/deployments/:id/badge-public` | CREATE — D-18 |
| `apps/api/src/routes/v1/usage.ts` (NEW) | `GET /api/v1/usage/hourly` reading `usage_hourly` MATERIALIZED VIEW | CREATE — D-18 |
| `apps/api/src/routes/v1/deploy.ts` (NEW) | `GET /api/v1/deploy/:generationId` + `POST /api/v1/deploy/:generationId` (deploy submission already implied by Phase 7's frontend) | CREATE — D-18 |
| `apps/api/src/index.ts:76-86` (`protectedApp`) | Mount new routes | MODIFY — D-18 |
| `apps/api/tests/inngest/test_orphan_audit.test.ts` (NEW) | Static AST scan vs INNGEST_FUNCTION_IDS | CREATE — D-14 |
| `apps/api/tests/security/sentry-redaction.test.ts` (NEW) | 6 leak vectors × TS Sentry SDKs | CREATE — D-12 |
| `apps/generation-engine/tests/security/test_pii_redaction.py` (NEW) | 6 leak vectors × Python Sentry SDK + cross-language equivalence with TS fixtures | CREATE — D-12 |
| `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py` (NEW) | Generate 5×5 server bundles, extract regex, intersection-test | CREATE — D-08 |
| `apps/dispatch/tests/cross-tenant-id-block.test.ts` (NEW) | POST `tools/call` with foreign-tenant ID; assert 403 | CREATE — D-09 |
| `apps/generation-engine/tests/integration/test_multi_protocol_client.py` (NEW) | 4th mock client dropping `outputSchema` | CREATE — D-10 |
| `apps/api/tests/load/test_neon_oom_replication.test.ts` (NEW) | Concurrent SQL workload against local Postgres | CREATE — D-16 |
| `scripts/observability/leak-audit.ts` (NEW) | One-off mocked Sentry events query | CREATE — D-13 |
| `scripts/observability/inngest-orphan-audit.ts` (NEW) | One-off live `inngest-cli` query | CREATE — D-15 |
| `scripts/observability/outbox-depth-monitor.ts` (NEW) | Cron-able local outbox row counter + Resend alert + BetterStack heartbeat URL hook | CREATE — D-21 |
| `docs/runbooks/multi-client-smoke.md` (NEW) | 15-run manual operator checklist | CREATE — D-11 |
| `docs/runbooks/neon-scale-upgrade.md` (NEW) | Step-by-step upgrade procedure | CREATE — D-17 |
| `docs/mcpgen-architecture.md` §6 | P99 SLO statement | MODIFY — D-20 |
| `packages/codegen-templates/templates/server.ts.j2` or `index.ts.j2` (Stage E entry) | Per-isolate Zod schema cache hook | MODIFY — D-20 |

### Pattern 1: Shared cross-language redaction helper

**What:** A redaction helper exists once per language (TS in `@mcpgen/contracts`, Py in `mcpgen_engine.observability.sentry_redaction`) and is imported by every Sentry init site. Cross-language equivalence is enforced by a regression test that feeds canonical attack inputs (a JSON fixture, e.g. `tests/fixtures/leak-vectors.json`) to BOTH redactors and asserts the outputs match.

**When to use:** Any cross-cutting redaction concern that must apply across both TS apps + Python engine.

**Example (cross-language equivalence test fixture):**
```json
// tests/fixtures/leak-vectors.json — shared TS + Py
{
  "vectors": [
    { "name": "auth_header_bearer", "input_event": {"request": {"headers": {"Authorization": "Bearer sk_live_FAKE_LEAK_XYZ"}}}, "expected_no_match": ["sk_live_FAKE_LEAK_XYZ", "Bearer "] },
    { "name": "x_upstream_auth", "input_event": {"request": {"headers": {"X-Upstream-Auth": "ghp_FAKE_LEAK_XYZ"}}}, "expected_no_match": ["ghp_FAKE_LEAK_XYZ"] },
    { "name": "cookie", "input_event": {"request": {"headers": {"Cookie": "session=FAKE_LEAK_COOKIE"}}}, "expected_no_match": ["FAKE_LEAK_COOKIE"] },
    { "name": "spec_body", "input_event": {"request": {"url": "/v1/generate", "data": {"spec": "openapi: 3.0.0\n..."}}}, "expected_no_match": ["openapi: 3.0.0"] },
    { "name": "error_message", "input_event": {"message": "Bearer FAKE_LEAK_TOKEN expired"}, "expected_no_match": ["FAKE_LEAK_TOKEN"] },
    { "name": "extra_spec", "input_event": {"extra": {"spec": "..."}}, "expected_no_match": ["spec content"] }
  ]
}
```

[CITED: based on apps/web/src/lib/sentry/redact.ts pattern + Phase 8 instrumentation.ts:24-34 redactString approach]

### Pattern 2: PydanticAI `agent.run(metadata=...)` → Logfire span attribute → Langfuse `trace.session_id`

**What:** `agent.run(prompt, model_settings=..., metadata={"session_id": str(generation.id), "stage": "pass-2"})` — PydanticAI's `metadata` parameter "is attached to the agent run span when instrumentation is enabled" (PydanticAI docs). Logfire's auto-instrumentation surfaces these as span attributes. **CRITICAL CAVEAT:** Logfire scrubs anything matching `session` by default — needs explicit scrubbing callback to preserve `langfuse.session.id`.

**When to use:** Every `agent.run()` call site in the engine. Surfaces include:
1. `apps/generation-engine/src/mcpgen_engine/passes/pass_0/llm.py:170`
2. `apps/generation-engine/src/mcpgen_engine/passes/pass_1/schema_synth.py:255`
3. `apps/generation-engine/src/mcpgen_engine/passes/pass_1/schema_synth.py:285`
4. `apps/generation-engine/src/mcpgen_engine/passes/pass_2/authoring.py:149`
5. `apps/generation-engine/src/mcpgen_engine/passes/pass_2/quality_gate.py:138`
6. `apps/generation-engine/src/mcpgen_engine/passes/pass_3/enrich.py:168`
7. `apps/generation-engine/src/mcpgen_engine/passes/pass_3/quality_gate.py:166`
8. `apps/generation-engine/src/mcpgen_engine/passes/pass_4/llm_judge.py:117`
9. `apps/generation-engine/src/mcpgen_engine/passes/pass_5/field_ranking.py:199`
10. `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py:155, 167`
11. `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f3_agent_eval.py:287`

**Example (consolidating the call surface to avoid 11 duplicate edits):**

```python
# apps/generation-engine/src/mcpgen_engine/observability/run_tracing.py (NEW)
from typing import Any
from pydantic_ai import Agent

async def run_with_tracing(
    agent: Agent[Any, Any],
    prompt: str,
    *,
    session_id: str,
    stage: str,
    model_settings: dict[str, Any],
) -> Any:
    """Wrap agent.run with mandatory metadata for Langfuse correlation.

    Replaces every `agent.run(prompt, model_settings=...)` call with a single
    helper that mints `metadata={"session_id": session_id, "stage": stage}`
    and forwards to PydanticAI. Centralizes D-06 wiring at one site.
    """
    return await agent.run(
        prompt,
        model_settings=model_settings,
        metadata={"session_id": session_id, "stage": stage},
    )
```

```python
# apps/generation-engine/src/mcpgen_engine/observability/scrubbing.py (NEW or merged into observability.py)
import logfire

def _preserve_langfuse_session_id(match: logfire.ScrubMatch):
    """Logfire auto-scrubs 'session' — preserve langfuse.session.id."""
    if match.path == ("attributes", "langfuse.session.id"):
        return match.value
    if match.path == ("attributes", "langfuse.user.id"):
        return match.value
    return None  # let Logfire scrub the rest

def configure_logfire_scrubbing() -> None:
    logfire.configure(
        send_to_logfire=False,
        service_name="mcpgen-generation-engine",
        scrubbing=logfire.ScrubbingOptions(callback=_preserve_langfuse_session_id),
    )
```

[CITED: github.com/orgs/langfuse/discussions/6001 — "[Scrubbed due to 'session'] when using OpenTelemetry to set session id"; CITED: langfuse.com/integrations/native/opentelemetry — `span.set_attribute("langfuse.session.id", "...")`; CITED: ai.pydantic.dev/api/agent — `metadata` parameter]

### Pattern 3: BFF route group consuming Logto JWT auth + org-scoping

**What:** Every new BFF route in D-18 follows the same `auth.organizationId` → `deploymentBelongsToOrg(deploymentId, orgId)` → query-and-respond shape.

**When to use:** All 4 D-18 endpoints.

**Example:**

```ts
// apps/api/src/routes/v1/deployments.ts (NEW)
import { Hono } from 'hono';
import { eq, and, sql, desc } from 'drizzle-orm';
import { deployments, generations } from '@mcpgen/contracts/db-schema';
import { db } from '../../db.js';
import type { AuthContext } from '../../middleware/auth.js';

export const deploymentsRoute = new Hono<{
  Variables: { auth: AuthContext };
}>();

deploymentsRoute.get('/', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_cannot_list_deployments' }, 403);
  }
  if (!auth.organizationId) {
    return c.json({ error: 'no_org_context' }, 400);
  }
  // Org-scope via 3-table JOIN (deployments → generations → projects → org)
  const rows = await db.execute(sql`
    SELECT d.id AS deployment_id, d.generation_id, d.cf_worker_name AS server_name,
           d.url AS server_url, d.auth_mode, d.created_at AS deployed_at,
           g.quality_report, d.public_badge
    FROM deployments d
    JOIN generations g ON g.id = d.generation_id
    JOIN projects p ON p.id = g.project_id
    WHERE p.org_id = ${auth.organizationId}
    ORDER BY d.created_at DESC
  `);
  return c.json({ deployments: rows.rows });
});

deploymentsRoute.post('/:id/badge-public', async (c) => {
  // ... org-scope check via deploymentBelongsToOrg helper from drift.ts
  // ... UPDATE deployments SET public_badge = body.public_badge WHERE id = :id
});
```

[CITED: apps/api/src/routes/v1/drift.ts:96-148 (existing 4-table org-scoping pattern); CITED: apps/api/src/index.ts:76-86 (protectedApp mounting pattern)]

### Pattern 4: Inngest orphan audit via static-source assertion (per existing test convention)

**What:** Read every `apps/api/src/inngest/functions/*.ts` file as text, regex-extract `id: INNGEST_FUNCTION_IDS.X` references, assert each maps to a registered key.

**When to use:** D-14 — runs in <1s, no Inngest dev server needed.

**Example:**

```ts
// apps/api/tests/inngest/test_orphan_audit.test.ts (NEW)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { functions } from '../../src/inngest/functions/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_DIR = resolve(HERE, '../../src/inngest/functions');
const REGISTERED_IDS = new Set(Object.values(INNGEST_FUNCTION_IDS));

describe('Inngest orphan audit (CTRL-09 / D-14)', () => {
  it('every function file uses an id from INNGEST_FUNCTION_IDS', () => {
    const files = readdirSync(FN_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    const idRegex = /id:\s*INNGEST_FUNCTION_IDS\.([A-Z_]+)/g;
    const found = new Set<string>();
    for (const file of files) {
      const src = readFileSync(resolve(FN_DIR, file), 'utf-8');
      let m: RegExpExecArray | null;
      while ((m = idRegex.exec(src)) !== null) {
        const key = m[1] as string;
        const value = (INNGEST_FUNCTION_IDS as Record<string, string>)[key];
        expect(REGISTERED_IDS, `${file} references unregistered key ${key}`).toContain(value);
        found.add(value);
      }
    }
    // Bidirectional: register has no orphan IDs without a function
    expect(found, 'register vs implementation set-equality').toEqual(REGISTERED_IDS);
  });

  it('runtime functions[] array length matches register', () => {
    expect(functions.length).toBe(Object.keys(INNGEST_FUNCTION_IDS).length);
  });
});
```

[CITED: existing pattern in apps/api/tests/inngest/drift-watcher.test.ts:15-27]

### Anti-Patterns to Avoid

- **Per-app duplicated redaction:** if any app's `beforeSend` body is inline rather than imported from the shared helper, a new auth-header variant landing in another spec's denylist will silently miss that app. **Mitigation:** D-03 enforces single source of truth.
- **Forgetting Logfire `session` scrubbing:** Logfire auto-scrubs anything matching the regex `session` and emits `[Scrubbed due to 'session']`. Without the explicit `scrubbing_callback`, Langfuse `trace.session_id` shows up scrubbed in the UI. [CITED: github.com/orgs/langfuse/discussions/6001]
- **Hardcoding 2025-06-18 protocol-version-only:** D-10's whole purpose is regression coverage for older Cursor builds (per Pitfall #4). Implementing the mock by copy-pasting an existing 2025-06-18 mock is a no-op test.
- **Drizzle migration prefix collision:** Phase 8 used `20260428000002_phase8_billing_drift.sql`; Phase 9 must use a strictly-greater timestamp. `20260430000000_phase9_badge_public.sql` is fine; verify no other phase has consumed that exact value.
- **Committing real Sentry/BetterStack/Langfuse DSNs:** local-mode requires DSNs in `.env.local` (gitignored). The redactor should NOT depend on a DSN being present (because the SDK would no-op anyway and the redactor never fires).
- **Adding pgbench-as-binary dependency:** D-16 must run on every CI environment. A pure-vitest concurrent SQL workload using existing `@neondatabase/serverless` or Drizzle is portable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT verification on new BFF routes (D-18) | Custom JWT decoder | `authMiddleware` from `apps/api/src/middleware/auth.ts:47` (already mounted on `protectedApp` at `index.ts:77`) | Phase 8 already wired Logto JWKS + audience checks — new routes inherit by mounting under `protectedApp`. |
| Org-scoping for D-18 endpoints | Per-route SQL JOIN copy-paste | Pattern from `drift.ts:48-62` (`deploymentBelongsToOrg`) — extract to `apps/api/src/lib/auth-helpers.ts` | Phase 8 established the 4-table JOIN pattern (deployments → generations → projects → organizations); new code should reuse, not redefine. |
| `usage_events_outbox` row counter (D-21) | New SQL query | Existing partial index from Phase 8 migration line 112: `usage_events_outbox_pending_idx ON usage_events_outbox(sent_at) WHERE sent_at IS NULL` makes `SELECT COUNT(*) WHERE sent_at IS NULL` O(log n) | Phase 8 migration already shipped the index for exactly this hot path. |
| Smart-ID parsing in dispatch tests | Re-implementing the regex | Import `parseSmartId` from `@mcpgen/runtime/smart-id` (already used in `apps/dispatch/src/middleware/smartIdFuzz.ts:13`) | One source of truth — closes T-6-01 per Phase 6 PATTERN. |
| Mocking Sentry events API for D-13 | Inline httpx mock | `StorageAdapter`-style interface from `packages/contracts/src/storage.ts` (Phase 8 D-23) | Same mock-now-real-later substitution as R2 — Phase 9 mock impl, Phase 10 real impl. |
| Resend email rate-limit for outbox alert (D-21) | New rate-limit table | Existing `drift_email_log` PK pattern (`UNIQUE (tenant_id, week_start)`) — extend with `('outbox_depth', sample_date)` | Phase 8 D-18 established the dedup-via-PK-conflict pattern. |
| MCP protocol version negotiation (D-10) | Re-implementing handshake | Existing `apps/dispatch/src/middleware/capabilityGate.ts` parses `protocolVersion` from `initialize` (Phase 6 D-11) — D-10 mock client just needs to send `protocolVersion: "2024-11-05"` | Phase 6 capability gate is the single integration point. |
| Langfuse SDK explicit calls | langfuse-python SDK | OTel via Logfire (already wired) + `metadata=` on `agent.run` | Two paths to Langfuse risks divergence; OTel is the documented Phase 1 choice (FND-11). |

**Key insight:** Phase 9's biggest "don't hand-roll" item is **redaction**. Sentry's default capture is permissive (Pitfall #12). The shared `redactBeforeSend()` helper enforces a single denylist that all 4 apps + Stage E template + tests use. If Phase 9 ships ANYTHING with inline redaction logic, a future denylist expansion will leave one app behind.

---

## Runtime State Inventory

> Phase 9 has migrate-adjacent work (D-19 column add) but no rename/refactor. Brief inventory:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — `deployments.public_badge` is a NEW column with default `false`, no backfill needed. | Migration only (D-19); no data migration. |
| Live service config | BetterStack heartbeat URL (D-21) — placeholder env var until W7. Sentry org/project slugs — placeholder until W7. | Documented in `apps/api/README.md` runbook (already established in Phase 8 for stripe-cli). |
| OS-registered state | None — no Task Scheduler / launchd / pm2 entries created in Phase 9. | None. |
| Secrets/env vars | New env keys: `BETTERSTACK_LOGS_TOKEN`, `BETTERSTACK_UPTIME_API_KEY` (heartbeat URLs), `SENTRY_AUTH_TOKEN` (build-time only — CI only, NOT `.env.local`), `SENTRY_ORG`, `SENTRY_PROJECT_*` (4 projects). All must work as empty/unset in Phases 1-9. | Update `.env.example` only; runbook for W7 provisioning. Note: `SENTRY_AUTH_TOKEN` MUST NOT live in `.env.local` per Sentry security guidance. [CITED] |
| Build artifacts / installed packages | If D-19 adds `public_badge` to `db-schema.ts`, the Drizzle journal `infrastructure/neon/migrations/meta/_journal.json` requires a paired update (Pitfall #18 lesson). | Migration-generation tool (`drizzle-kit generate` then manual SQL augmentation per Phase 1 plan 01-04 pattern) updates journal automatically. Verify via `pnpm db:test-migrate`. |

---

## Common Pitfalls

### Pitfall 1: Logfire's auto-scrubber strips `langfuse.session.id` (D-07 silent failure)

**What goes wrong:** Logfire's default scrubbing matches the regex `session` and replaces values with `[Scrubbed due to 'session']`. The Langfuse trace shows `session_id = "[Scrubbed due to 'session']"`, breaking trace-session correlation. CTRL-08 success criterion #2 silently fails — the test would pass, the data would be wrong.
**Why it happens:** Logfire is conservative about PII; the substring `session` is in its default denylist.
**How to avoid:** Configure `logfire.ScrubbingOptions(callback=preserve_langfuse_session_id)` that returns `match.value` for `match.path == ("attributes", "langfuse.session.id")`.
**Warning signs:** Langfuse Cloud UI shows session column populated with `[Scrubbed...]` for all spans.
[CITED: https://github.com/orgs/langfuse/discussions/6001]

### Pitfall 2: PydanticAI's `metadata` doesn't auto-set Langfuse-specific OTel attributes (D-06 mapping required)

**What goes wrong:** `agent.run(metadata={"session_id": "..."})` attaches `session_id` to the run's OTel span, but Langfuse looks for the attribute path `attributes.langfuse.session.id` (NOT `attributes.session_id`). The metadata reaches Logfire but Langfuse maps nothing to `trace.session_id`.
**Why it happens:** Langfuse's OTel ingest uses Langfuse-specific attribute names (`langfuse.session.id`, `langfuse.user.id`, `langfuse.tags`) that follow the `langfuse.` namespace convention. PydanticAI doesn't know about Langfuse.
**How to avoid:** D-06 implementation must wrap `agent.run` with a span context (or use a Logfire span processor) that explicitly sets `langfuse.session.id` from the metadata. Pattern:
```python
import logfire
async def run_with_tracing(agent, prompt, *, session_id, stage, model_settings):
    with logfire.span("agent.run", attributes={
        "langfuse.session.id": session_id,
        "langfuse.tags": [stage],
    }):
        return await agent.run(prompt, model_settings=model_settings)
```
Or, alternatively, configure a Logfire/OTel SpanProcessor that copies `attributes.session_id` → `attributes.langfuse.session.id` on `on_start`.
**Warning signs:** Langfuse trace UI shows traces but Session column is empty.
[CITED: https://langfuse.com/integrations/native/opentelemetry]

### Pitfall 3: `@sentry/cloudflare` `withSentry()` already exists in apps/api but `apps/dispatch` has no Sentry init (D-03 incomplete coverage)

**What goes wrong:** `apps/dispatch/src/index.ts:25` declares `SENTRY_DSN?: string` binding but no `withSentry` wrapper. Errors thrown in dispatch middleware never reach Sentry; the redaction helper has no consumer.
**Why it happens:** Phase 6 wired `apps/api` and `apps/web` Sentry but not dispatch (which only landed in Phase 6 Wave 1 after Phase 1 wired the others).
**How to avoid:** D-03 plan must include `apps/dispatch/src/instrumentation.ts` mirroring `apps/api/src/instrumentation.ts:38-66` shape.
**Warning signs:** Sentry "Issues" tab for `dispatch` project is empty after a deliberate exception.
[VERIFIED: tree inspection of apps/dispatch/src/index.ts]

### Pitfall 4: Drizzle migration journal not updated after manual SQL edit (Phase 1 D-12 lesson)

**What goes wrong:** D-19 manually authors `20260430000000_phase9_badge_public.sql`. Drizzle's `_journal.json` is the source of truth for `drizzle-kit migrate`; if it's not updated, the migration runs out of order on the next `migrate` invocation.
**Why it happens:** Phase 1 plan 01-04 lesson: "Manual SQL augmentation requires explicit journal entry" (per existing `infrastructure/neon/README.md` documented pattern).
**How to avoid:** Either (a) generate via `drizzle-kit generate`, then rename file to use Phase 9 timestamp prefix, OR (b) hand-author SQL AND hand-update `_journal.json`. Run `pnpm --filter @mcpgen/contracts db:test-migrate` (per Phase 1 plan) before commit to verify ordering.
**Warning signs:** CI step `db:test-migrate` reports "migration X not in journal" or "expected migration N at index N".

### Pitfall 5: BFF endpoint `org_scope_check` skipped on `/usage/hourly` performance path

**What goes wrong:** `usage_hourly` is a MATERIALIZED VIEW with `(bucket, deployment_id)` PK; the query naturally filters by `deployment_id`. If D-18 plan reuses `usage_events`-style scoping (`WHERE deployment_id IN (SELECT id FROM deployments WHERE org_id = ?)`), it's slow. If it skips org-scoping under "performance", a malicious user can pass any `deployment_id` and read another tenant's usage.
**Why it happens:** Materialized view doesn't carry org_id; it must be JOINed back through `deployments → generations → projects`.
**How to avoid:** Always JOIN. Add an index on `deployments(org_id)` (verify exists in Phase 1 schema) so the JOIN stays fast.
**Warning signs:** Cross-tenant data leak in dashboard.
[VERIFIED: db-schema.ts:144-157 shows `deployments` has no direct `org_id` — must traverse via projects]

### Pitfall 6: Stage E `globalThis.__mcpgen_zod_schemas` cache leaks across tenant Workers in single isolate (D-20)

**What goes wrong:** D-20 caches Zod schemas in `globalThis` to avoid per-request rebuild cost. CF Workers run multiple Workers per isolate (each tenant Worker is a script, but all share the JS engine isolate). If the cache key doesn't include the tenant identifier, two tenants with different schemas could collide.
**Why it happens:** `globalThis` is per-isolate, not per-Worker. Stage E generates code per-Worker but a single isolate hosts many Workers.
**How to avoid:** Cache key must be `${tenant_id}:${tool_name}` or skip caching for any schema that depends on tenant-specific state. Alternatively, the cache lives at module-init scope inside the generated tools handler (each `tool_*.ts` file's top-level `const SCHEMA = z.object({...})`) — Zod already does this if templates declare schemas at module level rather than inside handler functions.
**Warning signs:** Cross-tenant schema validation false-passes; F1 cross-tenant fuzz test (D-08) fails or shows surprising regex collisions.
[CITED: docs.cloudflare.com/workers/runtime-apis/web-standards/#globalthis]

### Pitfall 7: D-12 leak vector sentinels trigger gitleaks pre-commit hook

**What goes wrong:** Test fixtures contain literal `sk_live_FAKE_LEAK_XYZ` strings to verify redaction. Gitleaks (already installed Phase 1 D-12, Phase 5 plan 02 reactivated) treats any `sk_live_` pattern as a leaked Stripe key.
**Why it happens:** Gitleaks regex matches the prefix, not the entropy of the suffix.
**How to avoid:** Use `MCPGEN_LEAK_CANARY_2026Q2` sentinel string per CONTEXT specifics. For Stripe-shaped tests, use `sk_live_REDACTION_TEST_DO_NOT_USE_AS_REAL_KEY_2026Q2` and add an explicit gitleaks allowlist entry in `.gitleaks.toml` for the test fixture path. Phase 5 plan 02 already established this pattern (per memory `git-workflow-rules.md` "gitleaks allowlist").
**Warning signs:** Pre-commit fails with "potential Stripe API key" on `tests/fixtures/leak-vectors.json`.

### Pitfall 8: `inngest-cli list` is not a stable CLI surface (D-15 ambiguity)

**What goes wrong:** D-15 plan body assumes `inngest-cli list` exists. The Inngest dev server exposes a UI at `http://localhost:8288` and JSON-RPC discovery via `GET /api/inngest`, but `list` is not documented as a stable CLI subcommand.
**Why it happens:** Inngest CLI is in active development; subcommands change.
**How to avoid:** D-15 script queries the dev server's discovery endpoint directly: `GET http://localhost:8288/v0/apps/{appId}/functions` (verified pattern from Inngest docs) OR scrapes the UI's API. Verify the exact endpoint path during plan execution. Fallback: dev server's `GET /api/inngest` returns the function manifest as JSON (the same payload the SDK serves).
[CITED: search via WebSearch — "Inngest dev server endpoint" → docs aren't fully canonical]
**Risk:** LOW (script is one-off post-launch ops; CLI form can be revised cheaply if Inngest changes the API).

### Pitfall 9: Multi-protocol mock client (D-10) doesn't actually exercise the dispatch capability gate

**What goes wrong:** D-10 adds a 2024-protocol mock client at `apps/generation-engine/tests/integration/test_multi_protocol_client.py`. If the mock targets the engine directly (per Phase 5 F3 patterns) rather than going through dispatch's `capabilityGate` middleware, the test verifies engine output, not the protocol negotiation that Pitfall #4 actually concerns.
**Why it happens:** F3's Phase 5 mock harness was scoped to engine-direct testing.
**How to avoid:** D-10 mock client must point at the dispatch URL, not the engine. Or — preferred — the test verifies that the generated tenant Worker's `tools/list` response correctly drops `outputSchema` when `protocolVersion: "2024-11-05"` was negotiated in `initialize`. This requires running through dispatch + capability gate. Plan should explicitly test the integration, not just the engine.

### Pitfall 10: Outbox depth alert false-positive on cold start

**What goes wrong:** D-21 alerts when `usage_events_outbox` count > 10K. On Phase 8 fixture-mode startup, the outbox is seeded with synthetic rows; the alert fires immediately.
**Why it happens:** No distinction between "synthetic seed" and "real backlog."
**How to avoid:** Alert on count of rows where `sent_at IS NULL AND created_at < now() - interval '5 minutes'`. Synthetic rows from CI fixtures are typically just-created.
**Warning signs:** Resend email blast on `pnpm dev:inngest` startup.

---

## Code Examples

### Code Example 1: Shared TS redaction helper (D-03)

```ts
// packages/contracts/src/sentry-redaction.ts
//
// CTRL-08 / D-03: Single source of truth for Sentry beforeSend redaction.
// Imported by every TS Sentry init: apps/web (3 configs), apps/api,
// apps/dispatch, and Stage E template (sentry_redact.ts.j2).

const REDACTED_HEADERS = new Set<string>([
  'authorization',
  'x-upstream-auth',
  'cookie',
  'set-cookie',
  'stripe-account',
  'stripe-signature',
  'x-webhook-signature',
]);

const VARIABLE_AUTH_HEADER_RE = /^x-.*-(auth|token|key|secret)$/i;

const SENSITIVE_STRING_PATTERNS = [
  /Bearer\s+\S+/g,
  /sk_live_[A-Za-z0-9]{16,}/g,
  /sk_test_[A-Za-z0-9]{16,}/g,
  /ghp_[A-Za-z0-9]{16,}/g,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT
];

const REDACTED_QUERY_PARAMS = ['key', 'token', 'secret', 'auth'];
const REDACTION_VALUE = '[REDACTED]';

export interface SentryEventRequest {
  url?: string;
  headers?: Record<string, string>;
  data?: unknown;
}

export interface SentryEventLike {
  request?: SentryEventRequest;
  message?: string;
  extra?: Record<string, unknown>;
}

export function redactBeforeSend<T extends SentryEventLike>(event: T): T {
  // 1. Headers
  if (event.request?.headers) {
    const h = event.request.headers;
    for (const k of Object.keys(h)) {
      const lk = k.toLowerCase();
      if (REDACTED_HEADERS.has(lk) || VARIABLE_AUTH_HEADER_RE.test(lk)) {
        h[k] = REDACTION_VALUE;
      }
    }
  }
  // 2. URL query params
  if (typeof event.request?.url === 'string') {
    try {
      const u = new URL(event.request.url);
      for (const p of REDACTED_QUERY_PARAMS) {
        if (u.searchParams.has(p)) u.searchParams.set(p, REDACTION_VALUE);
      }
      event.request.url = u.toString();
    } catch {
      /* malformed URL — leave unchanged */
    }
  }
  // 3. Body — when content-type yaml/json AND path contains /v1/generate
  if (event.request?.url?.includes('/v1/generate') && event.request.data && typeof event.request.data === 'object') {
    event.request.data = '[REDACTED:spec]';
  }
  // 4. event.extra spec / openapi
  if (event.extra) {
    for (const k of ['spec', 'openapi_yaml', 'raw_ir']) {
      if (k in event.extra) event.extra[k] = '[REDACTED:spec]';
    }
  }
  // 5. Free-form message string-pattern redaction
  if (typeof event.message === 'string') {
    let m = event.message;
    for (const re of SENSITIVE_STRING_PATTERNS) m = m.replace(re, REDACTION_VALUE);
    event.message = m;
  }
  return event;
}
```

### Code Example 2: Python equivalent (D-04)

```python
# apps/generation-engine/src/mcpgen_engine/observability/sentry_redaction.py
import re
from typing import Any

REDACTED_HEADERS = {
    "authorization", "x-upstream-auth", "cookie", "set-cookie",
    "stripe-account", "stripe-signature", "x-webhook-signature",
}
VARIABLE_AUTH_HEADER_RE = re.compile(r"^x-.*-(auth|token|key|secret)$", re.IGNORECASE)
SENSITIVE_STRING_PATTERNS = [
    re.compile(r"Bearer\s+\S+"),
    re.compile(r"sk_live_[A-Za-z0-9]{16,}"),
    re.compile(r"sk_test_[A-Za-z0-9]{16,}"),
    re.compile(r"ghp_[A-Za-z0-9]{16,}"),
    re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),
]
REDACTED = "[REDACTED]"

def redact_before_send(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any] | None:
    request = event.get("request")
    if isinstance(request, dict):
        # 1. Headers
        headers = request.get("headers")
        if isinstance(headers, dict):
            for k in list(headers.keys()):
                lk = k.lower()
                if lk in REDACTED_HEADERS or VARIABLE_AUTH_HEADER_RE.match(lk):
                    headers[k] = REDACTED
        # 2. URL: leave to message-string redaction below for free-form path
        # 3. Body redaction when path is generate
        url = request.get("url", "")
        if "/v1/generate" in url and isinstance(request.get("data"), (dict, str)):
            request["data"] = "[REDACTED:spec]"
    # 4. extra
    extra = event.get("extra")
    if isinstance(extra, dict):
        for k in ("spec", "openapi_yaml", "raw_ir"):
            if k in extra:
                extra[k] = "[REDACTED:spec]"
    # 5. Message strings
    msg = event.get("message")
    if isinstance(msg, str):
        for re_p in SENSITIVE_STRING_PATTERNS:
            msg = re_p.sub(REDACTED, msg)
        event["message"] = msg
    return event
```

### Code Example 3: D-21 outbox depth monitor

```ts
// scripts/observability/outbox-depth-monitor.ts
import { db } from '../../apps/api/src/db.js';
import { sql } from 'drizzle-orm';

const THRESHOLD = 10_000;
const HEARTBEAT_URL = process.env.BETTERSTACK_OUTBOX_HEARTBEAT_URL ?? '';
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const OPS_EMAIL = process.env.OPS_EMAIL ?? '';

async function main(): Promise<void> {
  // Per Pitfall #10: only count rows older than 5 min to avoid CI seed false-positives
  const r = await db.execute(sql`
    SELECT COUNT(*) AS pending
    FROM usage_events_outbox
    WHERE sent_at IS NULL
      AND created_at < now() - interval '5 minutes'
  `);
  const pending = Number((r.rows[0] as { pending: string }).pending);

  console.log(`[outbox-depth] pending=${pending} threshold=${THRESHOLD}`);

  // BetterStack heartbeat: GET to heartbeat URL on healthy state
  if (HEARTBEAT_URL && pending <= THRESHOLD) {
    await fetch(HEARTBEAT_URL, { method: 'GET' });
  }

  if (pending > THRESHOLD) {
    // Alert via Resend (already wired in Phase 8 lib/email/resend-client.ts)
    if (RESEND_API_KEY && OPS_EMAIL) {
      // ... send email — see drift_email_log dedup pattern
    }
    process.exit(1); // CI surface
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
```

[CITED: BetterStack heartbeat URL format `https://uptime.betterstack.com/api/v1/heartbeat/{token}` — betterstack.com/docs/uptime/cron-and-heartbeat-monitor/]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@sentry/cloudflare` | apps/api, apps/dispatch, Stage E | ✓ | 10.51.0 latest, 10.50.0 pinned | — |
| `@sentry/nextjs` | apps/web | ✓ | 10.51.0 | — |
| `@sentry/cli` | D-05 sourcemaps upload | ✓ (npx) | 3.4.1 | Skip-when-no-token (no fallback needed locally) |
| `sentry-sdk[fastapi]` | apps/generation-engine | ✓ | 2.58.0 | — |
| `logfire` | engine OTel | ✓ | 1.3.2 | — |
| `pydantic-ai` | engine LLM agents | ✓ | 0.2.20 | — |
| Local Postgres docker container with TimescaleDB + pgvector | D-16 OOM repro | Probable; verify via `docker-compose.yml` inspection | — | If not in docker-compose, recommend adding Phase 9 plan task to spin up via `docker run timescale/timescaledb-ha:pg16` + `CREATE EXTENSION pgvector` |
| `inngest-cli` | D-15 live audit | ✓ via `npx inngest-cli@latest` | (npx fetches latest) | Skip if dev server not running; D-14 static test always works |
| `gitleaks` | D-12 sentinel allowlist | ✓ (Phase 1 + Phase 5) | — | — |
| BetterStack uptime API | D-21 production heartbeat | ✗ (Phase 10 W7 provisioning) | — | Local cron + Resend email (alone) |
| Real Sentry DSNs | D-13 real leak audit | ✗ (Phase 10) | — | Mocked Sentry events API in Phase 9 (`StorageAdapter` pattern) |

**Missing dependencies with no fallback:** None blocking Phase 9 itself; all Phase 10 cloud provisioning is gated by the `optional-cloud + no-op when DSN absent` invariant (D-01).

**Missing dependencies with fallback:**
- BetterStack heartbeat URL → local `pnpm` script + Resend email
- Real Sentry events API → mocked `StorageAdapter` impl
- Real Neon Scale tier → local docker Postgres + runbook

---

## Validation Architecture

> Phase 9 is heavy on audit tests. Per `.planning/config.json` `workflow.nyquist_validation: true`, this section is mandatory.

### Test Framework

| Property | Value |
|----------|-------|
| Framework (TS) | vitest@1.6.0 (apps/api, apps/web, apps/dispatch — workspace-pinned) |
| Framework (Py) | pytest (apps/generation-engine) |
| Config file | `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`, `apps/dispatch/vitest.config.ts`, `apps/generation-engine/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command (TS) | `pnpm --filter @mcpgen/api test` (and same for web/dispatch) |
| Quick run command (Py) | `cd apps/generation-engine && uv run pytest` |
| Full suite command | `pnpm test` (workspace) |
| CI step | `main-ci.yml` matrix already runs all four; new tests inherit |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTRL-08 §1 (Sentry redaction) | TS+Py beforeSend strips 6 leak vectors | unit + integration | `pnpm --filter @mcpgen/api test sentry-redaction` + `uv run pytest tests/security/test_pii_redaction.py` | ❌ Wave 1 |
| CTRL-08 §1 (cross-language equivalence) | TS + Py redactor agree on canonical fixture | integration | `pnpm test cross-lang-redaction` (reads shared JSON fixture) | ❌ Wave 1 |
| CTRL-08 §1 (source maps upload) | `pnpm sourcemaps:upload` no-ops without token; runs CLI when token set | integration (skip when no token) | `pnpm sourcemaps:upload` | ❌ Wave 3 (smoke only) |
| CTRL-08 §2 (Langfuse session_id) | Logfire span has `langfuse.session.id` attribute = `generation.id` | integration | `uv run pytest tests/integration/test_langfuse_session_correlation.py` (mocks OTLP exporter, asserts span attribute) | ❌ Wave 2 |
| CTRL-08 §2 (spec scrub) | Spec content >10K chars in span attr is replaced with `<spec redacted, sha256:...>` | unit | `uv run pytest tests/test_observability.py::test_logfire_spec_scrub` | ❌ Wave 2 |
| CTRL-08 §3 (BetterStack uptime) | Heartbeat URL no-ops when `BETTERSTACK_OUTBOX_HEARTBEAT_URL` empty; sends GET when set | integration (skip when no URL) | `pnpm --filter @mcpgen/api outbox:monitor:test` | ❌ Wave 3 |
| CTRL-08 §3 (outbox depth alert) | Threshold > 10K rows triggers Resend; ≤ 10K is silent | integration | vitest mock fixture: insert 10001 rows where `sent_at IS NULL AND created_at < now() - 5m`; assert script exits 1 + Resend client called | ❌ Wave 3 |
| CTRL-08 §3 (Neon connection-refusal alert) | Sentry captures `connection terminated unexpectedly` | manual + runbook | `docs/runbooks/neon-scale-upgrade.md` operator step | ❌ Wave 3 (runbook only) |
| CTRL-09 (orphan audit) | Static scan: every `createFunction({ id: ... })` uses `INNGEST_FUNCTION_IDS` key + bidirectional set-equality | unit | `pnpm --filter @mcpgen/api test test_orphan_audit` | ❌ Wave 2 |
| CTRL-09 (live audit) | `pnpm inngest:orphan-audit` against running dev server reports 0 orphans | manual / weekly cron | `pnpm inngest:orphan-audit` | ❌ Wave 3 |
| Pitfall #1 (cross-tenant smart-ID) | F1 fuzz across 5 tenants × 5 specs: zero regex collisions | integration | `uv run pytest tests/integration/test_cross_tenant_smart_id_fuzz.py` | ❌ Wave 3 |
| Pitfall #1 (dispatch runtime guard) | POST `tools/call` with foreign-tenant ID → 403 | integration | `pnpm --filter @mcpgen/dispatch test cross-tenant-id-block` | ❌ Wave 3 |
| Pitfall #4 (multi-protocol) | 2024-11 mock omitting `outputSchema` from `tools/list` succeeds | integration | `uv run pytest tests/integration/test_multi_protocol_client.py` | ❌ Wave 3 |
| Pitfall #19 (Neon OOM) | Concurrent tsvector + pgvector + TimescaleDB insert workload completes 10-min run with 0 connection errors against local docker Postgres | load (slow; CI-tagged) | `pnpm --filter @mcpgen/api test:load test_neon_oom_replication` | ❌ Wave 3 |
| FE-04 carry-forward (D-18) | 4 BFF endpoints accept Logto JWT, return correct shapes against frontend Zod parsers | integration (re-uses Phase 7 e2e suite with `MCPGEN_FRONTEND_MODE=live`) | `pnpm --filter @mcpgen/web test:e2e --project=live` | ❌ Wave 2 (existing skipped tests un-skip) |
| D-19 migration | `deployments.public_badge boolean default false` migrates cleanly from Phase 8 schema | integration | `pnpm --filter @mcpgen/contracts db:test-migrate` | ❌ Wave 1 |
| D-20 SLO doc | Architecture §6 P99 statement matches new wording | text | `grep -q "P99 warm < 50ms" docs/mcpgen-architecture.md` | ❌ Wave 3 |

### Sampling Rate

- **Per task commit:** Affected file's package quick test (`pnpm --filter @mcpgen/<pkg> test` or `uv run pytest tests/<test_file>.py`)
- **Per wave merge:** Full workspace test (`pnpm test` + `uv run pytest`)
- **Phase gate:** Full suite green + `pnpm sourcemaps:upload` no-op smoke + multi-client smoke runbook executed (D-11 manual checklist)
- **Manual ops cadence (post-Phase 9):** Weekly D-15 + D-21 + multi-client smoke; quarterly Neon OOM repro

### Wave 0 Gaps

- [ ] `apps/api/tests/security/sentry-redaction.test.ts` — covers CTRL-08 §1 (TS)
- [ ] `apps/generation-engine/tests/security/test_pii_redaction.py` — covers CTRL-08 §1 (Py)
- [ ] `apps/api/tests/security/test_cross_lang_redaction.test.ts` — equivalence test reading shared JSON fixture
- [ ] `apps/generation-engine/tests/integration/test_langfuse_session_correlation.py` — covers CTRL-08 §2
- [ ] `apps/api/tests/inngest/test_orphan_audit.test.ts` — covers CTRL-09
- [ ] `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py` — Pitfall #1 (extract regex from generated bundles)
- [ ] `apps/dispatch/tests/cross-tenant-id-block.test.ts` — Pitfall #1 runtime guard
- [ ] `apps/generation-engine/tests/integration/test_multi_protocol_client.py` — Pitfall #4
- [ ] `apps/api/tests/load/test_neon_oom_replication.test.ts` — Pitfall #19
- [ ] `apps/api/tests/integration/test_outbox_depth_alert.test.ts` — D-21 alert when count > 10K
- [ ] `apps/api/tests/integration/test_bff_endpoints.test.ts` — D-18 four endpoints, request/response shapes against Phase 7 Zod schemas
- [ ] `tests/fixtures/leak-vectors.json` — shared 6-vector fixture (TS + Py both consume)
- [ ] No new framework install needed (vitest, pytest already configured)

---

## Security Domain

> `security_enforcement` is enabled (default — config does not have `false`). ASVS coverage required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Logto JWT verification (Phase 8 D-01); D-18 routes inherit `authMiddleware` |
| V3 Session Management | partial | Logto handles session; D-21 outbox depth alert is system-internal |
| V4 Access Control | yes | Org-scoping JOIN pattern from Phase 8 `drift.ts`; D-18 four endpoints replicate |
| V5 Input Validation | yes | `zod` validation via `@hono/zod-validator` (existing `drift.ts` pattern); D-18 routes use Zod for body+query |
| V6 Cryptography | partial | Sentry/Langfuse Basic auth (`base64(public_key:secret_key)`) follows OTLP std; no hand-rolled crypto |
| V7 Error Handling | yes | D-12 PII redaction prevents credential leakage in error events |
| V8 Data Protection | yes | D-03/D-04 redaction; never log spec content per CLAUDE.md §9 |
| V9 Communications | partial | OTLP over HTTPS to Langfuse Cloud; HTTPS only |
| V11 Business Logic | yes | D-08/D-09 cross-tenant smart-ID enforcement |
| V12 Files & Resources | n/a | No file upload in Phase 9 |
| V13 API & Web Service | yes | D-18 BFF routes; idempotency keys for write ops (already enforced in dashboard-client.ts) |
| V14 Configuration | yes | D-01 no-op-when-empty pattern; secrets in `.env.local` only |

### Known Threat Patterns for {observability + BFF stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential leakage via Sentry default headers capture | Information Disclosure | `beforeSend` redaction with full denylist (D-03/D-04) |
| Cross-tenant data leakage via foreign smart-ID | Information Disclosure | Dispatch `smartIdFuzz` middleware (Phase 6 already) + integration test (D-09) |
| Cross-tenant data leakage via BFF endpoint without org-scope | Information Disclosure | 4-table JOIN authz pattern in every D-18 route (Pitfall #5 above) |
| PII leakage via Langfuse trace metadata | Information Disclosure | Logfire scrubbing callback + spec content >10K char check (D-07) |
| Logto JWT replay on D-18 routes | Spoofing | `authMiddleware` already verifies issuer + audience + expiry (Phase 8) |
| Inngest function ID drift causing duplicate side effects | Tampering | Static orphan audit (D-14) + stable IDs in `INNGEST_FUNCTION_IDS` register |
| Source map exposure on public deploy | Information Disclosure | `withSentryConfig` uploads to private Sentry org; `next.config.js:withSentryConfig` already configured (T-1-07) |
| Outbox depth false-positive triggering ops alert fatigue | Denial of Service | 5-min created_at filter (Pitfall #10) |
| Neon connection terminated during autovacuum | Availability | D-16 reproducer + D-17 Scale-tier upgrade runbook |
| 2024-protocol client receiving `outputSchema` and rejecting | Availability | D-10 mock client integration test |
| Gitleaks pre-commit blocking legitimate test fixture | Operational | Allowlist entry in `.gitleaks.toml` (Pitfall #7) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `agent.run(metadata=...)` kwarg exists in pydantic-ai 0.2.20 | Pattern 2 / Pitfall #2 | LOW — verified via official docs search; backup plan = wrap with explicit `logfire.span()` (no metadata kwarg needed). |
| A2 | Inngest dev server discovery endpoint is `GET http://localhost:8288/v0/apps/.../functions` | Pitfall #8 / D-15 | MEDIUM — D-15 is one-off post-launch script; even if endpoint changes, script can be revised. Plan should verify by spike. |
| A3 | Local docker-compose includes a Postgres+TimescaleDB+pgvector image | D-16 | MEDIUM — if not, plan adds task to provision via `docker run timescale/timescaledb-ha:pg16-latest` + `CREATE EXTENSION pgvector`. Verify in Wave 0. |
| A4 | `inngest-cli list` is NOT a stable CLI surface (per Pitfall #8) | Pitfall #8 | LOW — searched docs and didn't find the subcommand documented; D-15 plan should use HTTP endpoint instead. |
| A5 | Logfire's auto-scrubber strips `langfuse.session.id` due to "session" match | Pitfall #1 / D-07 | HIGH if not addressed; verified via [github.com/orgs/langfuse/discussions/6001]. Mitigation is explicit `scrubbing_callback`. |
| A6 | `usage_hourly` MATERIALIZED VIEW carries `deployment_id` PK and is JOIN-able to `deployments` | Pattern 3 / Pitfall #5 | LOW — verified in `infrastructure/neon/migrations/20260428000002_phase8_billing_drift.sql:125-137`. |
| A7 | Phase 7 frontend Zod schemas (`DeploymentSchema`, `UsageHourlyRowSchema`, `DeployResponseSchema`) are the contract D-18 must match | D-18 | LOW — verified at `apps/web/src/lib/api/dashboard-client.ts:31-90`. Promote to `packages/contracts/src/dashboard-api.ts` per existing TODO. |
| A8 | `usage_events_outbox` partial index `WHERE sent_at IS NULL` makes outbox count cheap | D-21 | LOW — verified at `infrastructure/neon/migrations/20260428000002_phase8_billing_drift.sql:112`. |
| A9 | BetterStack heartbeat URL `https://uptime.betterstack.com/api/v1/heartbeat/{token}` accepts simple HTTP GET | D-21 | LOW — confirmed via `betterstack.com/docs/uptime/cron-and-heartbeat-monitor/` (search result). |
| A10 | `@sentry/cloudflare` `withSentry(envCallback, handler)` shape unchanged from Phase 1 (10.50.x) to current 10.51.x | D-03 | LOW — semver minor; api shape is documented stable since 10.x release. |
| A11 | `redactSentryEvent` shape in `apps/web/src/lib/sentry/redact.ts` (Phase 7 plan 07-06) can be replaced with re-export from `@mcpgen/contracts/sentry-redaction` without breaking the 17 existing vitest unit tests | D-03 | LOW — the existing tests pass `SentryEventLike` shape; adding fields to redactor is additive. Tests may need to be expanded for new vectors, but should not regress. |
| A12 | Drizzle migration `_journal.json` update can be done via `drizzle-kit generate` then file rename (matches Phase 1 plan 01-04 pattern) | D-19 / Pitfall #4 | LOW — established pattern; documented at `infrastructure/neon/README.md`. |
| A13 | Frontend Route Handler in `apps/web/src/app/api/v1/deployments/route.ts:30` uses fixture deployment_id format `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01` (UUID); BFF must return same shape | D-18 | LOW — verified via tree inspection. |
| A14 | The 7 Inngest functions all use `id: INNGEST_FUNCTION_IDS.X` syntax (not literal strings) — D-14 regex `/id:\s*INNGEST_FUNCTION_IDS\.([A-Z_]+)/g` will match all of them | D-14 | LOW — verified by grep at all 7 sites. |
| A15 | `vitest@1.6.0`'s `--config` and concurrent runner can handle a 10-min load test (D-16) without timeout | D-16 | MEDIUM — vitest default test timeout is 5s; D-16 needs `test.timeout(600_000)` per-test override or a separate vitest config. Plan should explicitly set timeout. |

---

## Open Questions

1. **D-06 implementation choice: PydanticAI metadata vs explicit logfire.span() wrapper**
   - What we know: `agent.run(metadata={...})` does attach metadata to the auto-instrumented span (PydanticAI docs); BUT Langfuse needs the attribute name to be `langfuse.session.id`, not `session_id`.
   - What's unclear: whether PydanticAI's auto-instrumentation prefixes `langfuse.` or whether we need to manually set the langfuse-namespaced attribute.
   - Recommendation: in plan, write a Wave 0 spike that runs one `agent.run(metadata={"session_id": "test"})` against the existing engine, captures the OTel span attributes, and verifies whether `langfuse.session.id` appears OR if we need the wrapper helper from "Pattern 2". Cheap to verify; expensive to assume wrong.

2. **D-15 inngest-cli endpoint shape**
   - What we know: dev server runs on `http://localhost:8288`; functions are discoverable via the JSON-RPC discovery flow (the same flow Inngest dev server uses to invoke functions on the registered app).
   - What's unclear: exact URL/payload for "list all registered functions in dev server."
   - Recommendation: D-15 plan opens with a `curl http://localhost:8288/v0/...` spike to identify the canonical endpoint. Falls back to `GET http://localhost:8787/api/inngest` (the BFF's own Inngest serve endpoint) which returns the function manifest the SDK self-publishes.

3. **D-16 docker-compose status for local Postgres+TimescaleDB+pgvector**
   - What we know: Phase 1 D-04 pushed schema to a Neon dev branch; Phases 2-8 may have run against either local docker or Neon.
   - What's unclear: whether `docker-compose.yml` exists in this repo and includes the right image.
   - Recommendation: Wave 0 inspect — `ls docker-compose*.yml` + `cat`. If absent, D-16 plan adds a single docker run command in the test setup hook.

4. **D-18 endpoint placement under existing `protectedApp` vs new sub-app**
   - What we know: Phase 8 mounted drift routes under `protectedApp` directly via `protectedApp.route('/', driftRoute)` (path-prefix-via-route-internal). New deployments routes could follow the same pattern, OR mount under a `/deployments` prefix.
   - What's unclear: whether D-18 plan should create one `deploymentsRoute` with all 4 endpoints (deployments list, badge-public, deploy submission, single deployment fetch) OR split into 3 route groups by URL prefix.
   - Recommendation: Single `deploymentsRoute` consumer matching `drift.ts` pattern (one file, multiple paths) — keeps D-18 atomic and the planner can split tasks per route if needed.

5. **Redaction helper dependency direction: should `apps/web/src/lib/sentry/redact.ts` remain (with extended denylist) or be deleted in favor of `@mcpgen/contracts` import?**
   - What we know: `redactSentryEvent` exists with 17 vitest unit tests + 3 integration tests (Phase 7 plan 07-06).
   - What's unclear: whether D-03 plan should DELETE `apps/web/src/lib/sentry/redact.ts` and re-point the 3 sentry config files to `@mcpgen/contracts/sentry-redaction`, OR keep `redact.ts` as a thin re-export shim.
   - Recommendation: Thin shim approach — preserves the 17 unit tests as a regression suite for the shared helper, minimal blast radius, allows web-only extensions (e.g., URL ?key= scrubbing per CONTEXT D-30 in Phase 7) to layer on top via composition.

---

## Sources

### Primary (HIGH confidence)

- `/Users/igor/Projects/mcpgen/.planning/phases/09-observability-polish/09-CONTEXT.md` — locked decisions D-01..D-21
- `/Users/igor/Projects/mcpgen/CLAUDE.md` §9 (Observability & Privacy) — Logfire `send_to_logfire=False` invariant
- `/Users/igor/Projects/mcpgen/RULES.md` — non-negotiables; redaction list
- `/Users/igor/Projects/mcpgen/.planning/research/PITFALLS.md` §#1, #4, #12, #14, #19, #21, #33
- `/Users/igor/Projects/mcpgen/apps/api/src/instrumentation.ts` — Phase 1+8 Sentry init pattern
- `/Users/igor/Projects/mcpgen/apps/web/src/lib/sentry/redact.ts` — Phase 7 plan 07-06 helper
- `/Users/igor/Projects/mcpgen/apps/generation-engine/src/mcpgen_engine/observability.py` — Phase 1 Logfire OTel exporter
- `/Users/igor/Projects/mcpgen/apps/generation-engine/src/mcpgen_engine/main.py:33-66` — Python Sentry beforeSend
- `/Users/igor/Projects/mcpgen/apps/dispatch/src/middleware/smartIdFuzz.ts` — runtime guard already shipped Phase 6
- `/Users/igor/Projects/mcpgen/apps/api/src/routes/v1/drift.ts` — auth/org-scoping pattern for D-18
- `/Users/igor/Projects/mcpgen/apps/api/src/inngest/functions/index.ts` — 7 function array
- `/Users/igor/Projects/mcpgen/packages/contracts/src/inngest-functions.ts` — register
- `/Users/igor/Projects/mcpgen/packages/contracts/src/db-schema.ts:144-157` — deployments table for D-19
- `/Users/igor/Projects/mcpgen/infrastructure/neon/migrations/20260428000002_phase8_billing_drift.sql:112` — outbox partial index
- `/Users/igor/Projects/mcpgen/apps/web/src/app/api/v1/deployments/route.ts` — frontend Route Handler shape
- `/Users/igor/Projects/mcpgen/apps/web/src/lib/api/dashboard-client.ts:31-90` — frontend Zod schemas (BFF contract)
- `/Users/igor/Projects/mcpgen/.env.local` (gitignored) — confirmed DSN env var keys

### Secondary (MEDIUM confidence — verified via WebSearch + cross-reference)

- [Langfuse OpenTelemetry integration](https://langfuse.com/integrations/native/opentelemetry) — `langfuse.session.id` / `langfuse.user.id` / `langfuse.tags` attribute names
- [Logfire scrubbing & langfuse.session.id discussion](https://github.com/orgs/langfuse/discussions/6001) — Logfire scrubs "session"; explicit callback pattern
- [Sentry Cloudflare Wrangler sourcemaps](https://docs.sentry.io/platforms/javascript/guides/cloudflare/sourcemaps/uploading/wrangler/) — `wrangler deploy --upload-source-maps` + `sentry-cli sourcemaps upload --release`
- [Sentry Next.js Build Options](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/build/) — `withSentryConfig` + `SENTRY_AUTH_TOKEN` env var
- [BetterStack Cron and heartbeat monitor](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/) — heartbeat URL `https://uptime.betterstack.com/api/v1/heartbeat/{token}`
- [Inngest Dev Server](https://www.inngest.com/docs/dev-server) — `npx inngest-cli@latest dev` + `http://localhost:8288` UI
- [PydanticAI Agent docs](https://ai.pydantic.dev/api/agent/) — `metadata` parameter on `agent.run()`

### Tertiary (LOW confidence — needs spike verification in Wave 0)

- Exact OTel attribute set produced by PydanticAI auto-instrumentation when `metadata=` is passed (Open Question #1)
- Exact Inngest dev-server discovery endpoint URL (Open Question #2)
- Local docker-compose Postgres+Timescale+pgvector status (Open Question #3)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every dep already pinned and verified via npm/pip; no new packages
- Architecture: HIGH — leverages existing Phase 1/6/7/8 patterns (auth middleware, drift route, smart-ID fuzz, Sentry init); cross-language redaction pattern is documented in Pattern 1
- Pitfalls: HIGH for Logfire-scrubs-session and Pydantic AI metadata mapping (verified via discussions); MEDIUM for Inngest CLI surface and docker-compose presence (Open Questions 2 + 3)
- Pass/route mapping: HIGH — verified all 11 `agent.run()` call sites via grep; verified frontend Zod contract via tree inspection

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (cloud SDKs move fast; especially `@sentry/cloudflare`, `pydantic-ai`)

---

## RESEARCH COMPLETE

**Phase:** 9 — Observability & Polish
**Confidence:** HIGH

### Key Findings

1. **Most observability primitives already exist in tree.** Sentry SDK init shells (apps/web 3 configs, apps/api `instrumentation.ts`, generated tenant Workers via `sentry_redact.ts.j2`), Logfire OTel exporter (`observability.py`), `INNGEST_FUNCTION_IDS` register, `usage_events_outbox` table + partial index, dispatch `smartIdFuzz` middleware, and Phase 7 frontend Zod schemas as the BFF contract. **Phase 9 is integration, not net-new infrastructure.**

2. **`apps/dispatch` has no Sentry init wired yet** — only the env binding declared. D-03 plan must include `apps/dispatch/src/instrumentation.ts` mirroring `apps/api`. Easy to miss.

3. **Logfire auto-scrubs `langfuse.session.id` due to "session" pattern match (P0 issue).** Without explicit `scrubbing_callback`, D-07 silently fails — the data path completes but Langfuse Cloud shows `[Scrubbed due to 'session']` in the session column. Verified pattern at `github.com/orgs/langfuse/discussions/6001`.

4. **D-18 BFF endpoints' contract is already locked** by Phase 7's frontend Zod schemas at `apps/web/src/lib/api/dashboard-client.ts:31-90`. Plan should promote those to `packages/contracts/src/dashboard-api.ts` (per existing TODO) and have the BFF import the same schemas — single source of truth.

5. **D-06 implementation has TWO viable paths** (PydanticAI `metadata=` kwarg vs explicit `logfire.span()` wrapper). Both work but only one auto-sets `langfuse.session.id`. Wave 0 spike resolves which.

### File Created

`/Users/igor/Projects/mcpgen/.planning/phases/09-observability-polish/09-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Every library already pinned in `package.json` / `pyproject.toml`; no version bumps |
| Architecture | HIGH | Reuses existing patterns (drift.ts auth, smartIdFuzz dispatch, instrumentation.ts Sentry init, observability.py Logfire) |
| Pitfalls | HIGH | Logfire-session-scrub + PydanticAI mapping issue verified via official discussions; D-19 migration timestamp collision risk verified by file listing |
| Validation Architecture | HIGH | All 14 test files mapped to CTRL-08/09 sub-criteria + 6 leak vectors × 4 SDKs |
| BFF endpoints | HIGH | Contract is the frontend Zod schemas; we have the exact shape |
| D-15 Inngest CLI surface | MEDIUM | API not fully canonical; LOW risk because it's a one-off post-launch script |
| D-16 docker-compose presence | MEDIUM | Not yet verified; trivial to fix in Wave 0 if absent |
| PydanticAI metadata→Langfuse mapping | MEDIUM | Needs Wave 0 spike to confirm whether wrapper helper is required |

### Open Questions

5 questions catalogued — only Open Question #1 (PydanticAI metadata vs explicit span) is potentially blocking, and a 5-min Wave 0 spike resolves it cheaply.

### Ready for Planning

Research complete. Planner can now create PLAN.md files for Waves 1, 2, 3 per the recommended sequencing in §"Summary".

Sources:
- [Langfuse OpenTelemetry integration](https://langfuse.com/integrations/native/opentelemetry)
- [Logfire scrubs "session" — Langfuse discussion #6001](https://github.com/orgs/langfuse/discussions/6001)
- [Sentry Cloudflare Wrangler sourcemaps](https://docs.sentry.io/platforms/javascript/guides/cloudflare/sourcemaps/uploading/wrangler/)
- [Sentry Next.js Build Options](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/build/)
- [BetterStack Cron and heartbeat monitor](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/)
- [Inngest Dev Server](https://www.inngest.com/docs/dev-server)
- [PydanticAI Agent docs](https://ai.pydantic.dev/api/agent/)
