---
phase: 01-foundation
date: 2026-04-26
status: locked
type: scope-pivot
supersedes: parts of 01-04, 01-05, 01-07, 01-08
---

# Phase 1 Scope Pivot: CF Migration Deferred to Phase 10

## Decision

**CF migration deferred to Phase 10 — local-only multi-runtime approach until launch readiness review.**

All Cloudflare-platform-touching work (dispatch namespace creation, real CF Workers deploys, Hyperdrive provisioning) moves out of Phase 1. The CF Worker source code scaffolds **stay** as the canonical reference shape (per `docs/mcpgen-stage-e-design.md`), but Phase 1 verification runs them locally on Bun instead of deploying to the CF edge.

**Rationale:** Phase 1's Foundation goal is satisfied by frozen contracts + buildable scaffolds + local-runnable verification. Cloud-side namespace registration, edge deployment economics, and Hyperdrive-vs-direct connection trade-offs are all launch-readiness concerns that belong in Phase 10. Building/maintaining real CF infrastructure for 9+ weeks during dev creates account-state drift, billing surprises, and a fake "production" environment that doesn't actually serve users.

## What changes per plan

| Plan | Original (Phase 1) | New (Phase 1) | Deferred to Phase 10 |
|---|---|---|---|
| **01-04 Task 4** | Push Drizzle migration to Neon dev branch via Hyperdrive in apps/api | Push directly via `@neondatabase/serverless` (HTTP) using `DATABASE_URL` from `.env.local` — no Hyperdrive | Hyperdrive provisioning for production BFF |
| **01-05 (already complete)** | Scaffold CF Worker apps `apps/api`, `apps/dispatch`, `apps/dispatch-sample` | KEEP scaffolds as-is (canonical Stage E reference shape — Phase 4 codegen target) | Real CF deploys via `wrangler deploy` |
| **01-07** | (a) 5 engine fixtures · (b) **CF dispatch namespace creation** (`mcpgen-prod` / `mcpgen-staging` / `mcpgen-sandbox`) · (c) Logto Cloud free-tier · (d) 3 ops runbooks | (a) 5 engine fixtures (unchanged) · ~~(b) CF namespace creation~~ DEFERRED · (c) Logto Cloud scaffolding (user has credentials) · (d) 3 ops runbooks (unchanged) | CF namespace creation + 3-namespace cap pre-commit hook activation against real CF API |
| **01-08** | (a) **Hono streamSSE 30s sub-request spike on `mcpgen-sandbox`** · (b) **Hyperdrive provisioning** · (c) fresh-clone E2E smoke | (a) **Local Bun SSE spike** — same 90s SSE event timing test, but the server runs as `bun run apps/api/src/routes/_spike/sse.ts` and the client runs `bash apps/api/scripts/spike-sse.sh http://localhost:8787` · ~~(b) Hyperdrive~~ replaced with direct `@neondatabase/serverless` HTTP for dev · (c) E2E smoke runs against the local Bun server | The actual 30s sub-request validation on real CF Workers (the genuine engineering risk D-15 was meant to surface) — re-run in Phase 10 against a one-time spike Worker before launch |

## Why the local-Bun fallback is acceptable for Phase 1

The CF 30s sub-request limit (D-15) is the real engineering risk, and Phase 1 cannot validate it without deploying to actual CF Workers. Documenting this gap explicitly:

**Phase 1 does NOT prove that long-running SSE works on CF Workers.** The local Bun spike only proves that the Hono `streamSSE` handler emits events at the expected timing on a Node-like runtime — which is necessary but not sufficient for production. Phase 10 launch-readiness review MUST include a real CF deploy of the spike before going live; if the 30s limit is hit, the contingency path (D-16 — Inngest + Durable Object WebSocket fanout) is already in `packages/contracts/src/generation-api.ts` API design and just needs to be wired.

Failure mode if we forget Phase 10: launch ships with SSE that works in dev but cuts off at t=30s in prod, leaving generation jobs in a "stuck at stage" UI state. Mitigation:

- Adding a **Phase 10 launch-criterion**: "Hono streamSSE 90s spike verified on real CF Workers; event at t=85s confirmed received OR D-16 contingency wired and verified" — recorded in `packages/contracts/src/launch-criteria.ts`.
- Marking `apps/api/src/routes/_spike/sse.ts` with a top-of-file comment: `// PHASE-10 RELEASE GATE: re-run on real CF Workers before launch`.

## What stays unchanged

- All 4 frozen TS contracts (Plans 01-01..01-03) — committed and locked.
- Drizzle schema + migration SQL (Plan 01-04 Tasks 1–3) — committed; Task 4 pushes against Neon dev via direct connection.
- 6 app scaffolds (Plan 01-05) — committed; CF Worker file shape preserved.
- All 4 pre-commit hooks (Plan 01-02) — `no-fourth-namespace.sh` stays installed but is dormant in Phase 1 (no namespaces created yet, so its trigger condition can't fire). It activates the moment Phase 10 creates the first namespace.
- All CI workflows — stay intact; the CF-deploy steps in `runtime-ci.yml` will be no-ops in Phase 1 (no `CLOUDFLARE_API_TOKEN` secret set).
- Logto Cloud free tier scaffolding — proceeds as planned in Plan 01-07 (user has credentials).
- Langfuse local — already local in Plan 01-06 design (`logfire.configure(send_to_logfire=False, otlp_endpoint=...)` points at local Langfuse).
- Engine fixtures (Plan 01-07) — proceeds as planned; consumed by frontend/runtime/ops workstreams in subsequent phases regardless of CF status.

## Phase 1 success-criteria reconciliation

ROADMAP Phase 1 lists 8 success criteria. After this pivot:

| # | Original criterion | New status |
|---|---|---|
| 1 | `pnpm install && pnpm build && pnpm typecheck` from fresh clone | ✓ unchanged |
| 2 | 5 contracts committed AND import-resolved across both languages | ✓ unchanged (Drizzle push uses direct Neon, not Hyperdrive) |
| 3 | **Three CF dispatch namespaces exist** (`mcpgen-prod` / `mcpgen-staging` / `mcpgen-sandbox`) | **MOVED to Phase 10.** Phase 1 verifies the *config* (wrangler.toml env blocks reference all 3) but does not create them on CF. |
| 4 | Sentry SDK empty-DSN init in all apps + Langfuse OTel exporter | ✓ unchanged |
| 5 | `packages/engine-fixtures/` ships static fixtures for all 5 APIs | ✓ unchanged (Plan 01-07 part) |
| 6 | Pre-commit hooks installed + CI-enforced + launch-criteria paired-decision | ✓ unchanged |
| 7 | **Hono streamSSE 30s sub-request limit verified on real CF** | **DOWNGRADED.** Phase 1 verifies SSE timing on local Bun. Real-CF verification is a Phase-10 gate. |
| 8 | Idempotency keys + Drizzle prefix + Logto Cloud scaffolded + Pro-upgrade runbook tested on staging | ✓ partially — Logto Cloud scaffolded (Phase 1); Pro-upgrade runbook tested **not on real CF staging**, only documented + dry-run'd locally |

## Roadmap update needed

`ROADMAP.md` Phase 1 success criteria #3 and #7 should be footnoted with `(deferred to Phase 10 per .planning/phases/01-foundation/01-PHASE-DEVIATIONS.md)`. The ROADMAP itself stays the same — Phase 10 launch-criteria gets criteria #3 and #7 added explicitly.

## What downstream phases need to know

- **Phase 2 (engine passes)** — unaffected. Engine runs locally on Fly.io Machines or local docker-compose; doesn't touch CF.
- **Phase 3 (BFF + control plane)** — apps/api scaffolds are final; Phase 3 fills in real Hono routes. Direct Neon connection (no Hyperdrive) means slightly higher latency in dev but no architectural change.
- **Phase 4 (Stage E codegen)** — `apps/dispatch-sample/` is still the canonical reference shape; Phase 4 just generates more Workers in the same shape. Generated Workers are not deployed in Phase 4 either — they're committed as build artifacts and served from local Bun until Phase 10.
- **Phase 5 (Stage F validation)** — F1 (static checks) runs locally; F2 (smell scan) runs locally; F3 (agent eval) runs locally against locally-served tenant Workers. No CF dependency.
- **Phase 6 (runtime / dispatcher)** — was originally "deploy CF dispatch + tenant Workers + usage events"; needs revision. **Decision deferred** — Phase 6 plan must be re-discussed with the CF deferral in mind. Likely Phase 6 becomes "local Bun multi-Worker runner with usage event emission to local Inngest"; real CF dispatch becomes Phase 10's primary task.
- **Phases 7, 8, 9** — frontend/billing/observability — minimal CF dependency in original plan; should be largely unaffected.
- **Phase 10 (launch)** — gains: CF namespace creation + dispatch deploy + Hyperdrive provisioning + SSE spike on real CF + Pro-tier Logto upgrade test on staging + the 3-namespace cap hook activation. Phase 10's plan should be ~2–3× larger than originally scoped.

This is a structural change to the roadmap. Recommend running `/gsd-discuss-phase 6` before Phase 6 starts to re-scope it given the local-only constraint.
