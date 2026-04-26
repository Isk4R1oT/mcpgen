---
phase: 01-foundation
date: 2026-04-26
status: locked
type: scope-pivot
revision: 2
supersedes: parts of 01-04, 01-05, 01-07, 01-08
---

# Phase 1 Scope Pivot: CF + Fly.io Migration Deferred to Phase 10

## Decision (revision 2 — 2026-04-26)

**CF + Fly.io migration deferred to Phase 10. Local compute / cloud-services hybrid for Phases 1–9.**

All edge-deployment work (Cloudflare Workers, Workers-for-Platforms, Hyperdrive) AND PaaS-deployment work (Fly.io Machines for the Python engine) move out of Phases 1–9 and into Phase 10's launch-readiness scope. Cloud SaaS services with credentials in `.env.local` (Neon, Logto Cloud, OpenRouter, local Langfuse) **are in use** — the deferral is specifically about *compute-platform* hosting, not *cloud-service* dependencies.

Phases 1–9 run all compute locally on Bun / Node / uvicorn with the documented port map below. CF/Fly deploy artifacts (`wrangler.toml`, `fly.toml`, `Dockerfile`) are committed as Phase-10 reference but not executed.

**Why:** Avoid 9+ weeks of account-state drift, billing surprises, and a fake "production" environment that doesn't actually serve users. Build/maintain real CF + Fly only when launch is imminent, then verify the architectural assumptions (CF 30s sub-request limit, Fly Machine auto-suspend cold-start, Hyperdrive vs direct Neon, dispatch-namespace routing) all in one tight launch-prep window.

## Local port map (Phases 1–9)

| Service | Local URL | Runner | Notes |
|---|---|---|---|
| Next.js frontend (`apps/web`) | `http://localhost:3000` | `pnpm --filter web dev` | UI from `claude-design-ui/MCP-Gen.zip` (locked) |
| Python engine (`apps/generation-engine`) | `http://localhost:8000` | `uv run uvicorn mcpgen_engine.main:app --reload` | Replaces Fly Machines for dev |
| Hono BFF (`apps/api`) | `http://localhost:8787` | Bun via `wrangler dev --local` OR `bun run apps/api/src/index.ts` | Replaces CF Workers edge for dev |
| Dispatcher (`apps/dispatch`) | `http://localhost:8789` | Bun via `wrangler dev --local` OR direct Bun | Replaces CF Workers-for-Platforms |
| Tenant Workers (`apps/dispatch-sample` + Phase-4 generated) | `http://localhost:8790` and up | `wrangler dev --local --port 8790` per tenant | Multi-port instead of CF dispatch-namespace lookup |
| Langfuse self-hosted | `http://localhost:3001` | docker-compose (out of repo, run by user) | Already configured via `LANGFUSE_HOST` env |

Cloud services (have credentials in `.env.local`):
- **Neon Postgres** — `DATABASE_URL` (pooled, for BFF/dispatch runtime), `DATABASE_URL_UNPOOLED` (direct, for migrations/DDL — preferred for `drizzle-kit push`)
- **Logto Cloud** (free tier) — `LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `LOGTO_APP_SECRET`, `LOGTO_BASE_URL`
- **OpenRouter** (Qwen3-Coder) — `OPENROUTER_*`
- **Langfuse self-hosted local** — `LANGFUSE_HOST=http://localhost:3001`, `LANGFUSE_*`

## What changes per plan

| Plan | Original (Phase 1) | New (Phase 1) | Deferred to Phase 10 |
|---|---|---|---|
| **01-04 Task 4** | Push Drizzle migration to Neon dev branch via Hyperdrive in apps/api | **DONE** — pushed via direct connection (`db:test-migrate` using node-postgres on `DATABASE_URL`); see `01-04-SCHEMA-PUSH-EVIDENCE.md`. **Future migrations:** use `DATABASE_URL_UNPOOLED` per user preference (pooled URL works for migrations because node-postgres bypasses PgBouncer's prepared-statement issues, but `_UNPOOLED` is the safer canonical choice). | Hyperdrive provisioning for production BFF |
| **01-05 (already complete)** | Scaffold CF Worker apps `apps/api`, `apps/dispatch`, `apps/dispatch-sample` + Fly.io scaffold for engine | KEEP scaffolds — they ARE the canonical Stage E reference shape. Run them via `wrangler dev --local` and `uv run uvicorn` for Phase-1 verification. | Real CF deploys via `wrangler deploy`; Fly Machines deploy via `fly deploy` |
| **01-06 (already complete)** | FastAPI engine with Fly.io deployment target | KEEP scaffold + `fly.toml` artifact. Local dev uses `uv run uvicorn`. | `fly deploy` for production |
| **01-07** | (a) 5 fixtures · (b) **CF dispatch namespace creation** · (c) Logto Cloud free-tier · (d) 3 ops runbooks · (e) [BLOCKING] CF + Logto checkpoint | (a) 5 fixtures (unchanged) · ~~(b) CF namespace creation~~ DEFERRED · (c) Logto Cloud scaffolding via management API (we have credentials) · (d) 3 ops runbooks (unchanged) · (e) Logto-only verification (CF gate dropped) | CF namespace creation + 3-namespace cap pre-commit hook activation against real CF API |
| **01-08** | (a) **Hono streamSSE 30s sub-request spike on `mcpgen-sandbox`** · (b) **Hyperdrive provisioning** · (c) fresh-clone E2E smoke | (a) **Local Bun SSE spike** — same 90s SSE event-timing test, but server runs as `bun run apps/api/src/index.ts` on `localhost:8787` and client runs `bash apps/api/scripts/spike-sse.sh http://localhost:8787` · ~~(b) Hyperdrive~~ replaced with direct `@neondatabase/serverless` HTTP using `DATABASE_URL` (already proven by Plan 04 Task 4) · (c) E2E smoke runs against the local stack on the documented port map | Real CF deploy of the SSE spike — Phase-10 launch gate; Hyperdrive provisioning |

## Why the local-Bun fallback is acceptable for Phase 1 (with explicit gap)

The CF 30s sub-request limit (D-15) is a real engineering risk that the local Bun spike CANNOT validate. Documenting this explicitly:

**Phase 1 does NOT prove that long-running SSE works on CF Workers.** The local Bun spike only proves that the Hono `streamSSE` handler emits events at the expected timing on a Node-like runtime — necessary but not sufficient for production CF Workers (which have a hard 30-second `fetch()` budget per sub-request).

**Mitigation against forgetting Phase 10:**
- New Phase-10 launch-criterion: *"Hono streamSSE 90s spike verified on real CF Workers; event at t=85s confirmed received OR D-16 contingency (Inngest + Durable Object WebSocket fanout) wired and verified"* — to be added to `packages/contracts/src/launch-criteria.ts` BEFORE Phase 10 closes. (Adding it now would prevent any commit before Phase 10 since the gate constant says `false`; deferring the add to Phase 10 itself avoids that.)
- `apps/api/src/routes/_spike/sse.ts` carries a top-of-file comment: `// PHASE-10 RELEASE GATE: re-run on real CF Workers before launch. Local Bun spike (Phase 1) does NOT validate the CF 30s sub-request limit.`

**Mitigation against Fly cold-start surprises:**
- New Phase-10 launch-criterion: *"Fly Machines auto-suspend cold-start latency measured under typical generation traffic; first-request P95 < 8 s OR pre-warm strategy documented and configured."*

## What stays unchanged

- All 5 frozen TS contracts (Plans 01-01..01-04) — committed and locked.
- 6 app scaffolds (Plan 01-05) — committed; CF Worker file shape preserved as Stage E reference.
- Python engine scaffold (Plan 01-06) — committed; Day-1 Qwen smoke test passing; `fly.toml` committed but not deployed.
- All 4 pre-commit hooks (Plan 01-02) — `no-fourth-namespace.sh` stays installed but is **dormant** in Phase 1 (no namespaces created yet, so the trigger condition can't fire). It activates the moment Phase 10 creates the first namespace.
- All CI workflows — stay intact; the CF-deploy steps in `runtime-ci.yml` will be no-ops in Phase 1 (no `CLOUDFLARE_API_TOKEN` secret set in GitHub Actions).
- Logto Cloud free-tier scaffolding — proceeds in Plan 01-07 using the user's existing `LOGTO_*` credentials.
- Engine fixtures (Plan 01-07) — proceeds; consumed by frontend/runtime/ops in subsequent phases regardless of CF status.
- All bash + Python tooling for migrations (Drizzle Kit, `db:test-migrate`).

## Phase 1 success-criteria reconciliation

ROADMAP Phase 1 lists 8 success criteria. After this pivot:

| # | Original criterion | New status |
|---|---|---|
| 1 | `pnpm install && pnpm build && pnpm typecheck` from fresh clone | ✓ unchanged |
| 2 | 5 contracts committed AND import-resolved across both languages | ✓ unchanged (Drizzle push uses direct Neon, not Hyperdrive) |
| 3 | **Three CF dispatch namespaces exist** | **MOVED to Phase 10.** Phase 1 verifies the *config* (wrangler.toml env blocks reference all 3) but does not create them on CF. |
| 4 | Sentry SDK empty-DSN init in all apps + Langfuse OTel exporter | ✓ unchanged |
| 5 | `packages/engine-fixtures/` ships static fixtures for all 5 APIs | ✓ unchanged (Plan 01-07 part) |
| 6 | Pre-commit hooks installed + CI-enforced + launch-criteria paired-decision | ✓ unchanged |
| 7 | **Hono streamSSE 30s sub-request limit verified on real CF** | **DOWNGRADED.** Phase 1 verifies SSE timing on local Bun; real-CF verification is a Phase-10 gate. Documented above. |
| 8 | Idempotency keys + Drizzle prefix + Logto Cloud scaffolded + Pro-upgrade runbook tested on staging | Partial — Logto Cloud scaffolded (Phase 1); Pro-upgrade runbook documented + dry-run'd locally; staging dry-run deferred to Phase 10 (staging requires the deferred CF deploy). |

## Roadmap update needed

`ROADMAP.md` Phase 1 success criteria #3 and #7 should be footnoted with `(deferred to Phase 10 per .planning/phases/01-foundation/01-PHASE-DEVIATIONS.md)`. The ROADMAP itself stays the same in shape — Phase 10 launch-criteria gets the explicit gates added.

## What downstream phases need to know

- **Phase 2 (engine passes)** — engine runs locally via uvicorn at `localhost:8000`; passes call OpenRouter directly. No Fly dependency. Langfuse traces go to local instance at `localhost:3001`.
- **Phase 3 (BFF + control plane)** — apps/api scaffolds are final; Phase 3 fills in real Hono routes and runs them on `localhost:8787` via `wrangler dev --local`. Direct Neon connection (no Hyperdrive) means slightly higher latency in dev but no architectural change to BFF code.
- **Phase 4 (Stage E codegen)** — `apps/dispatch-sample/` is still the canonical reference shape; Phase 4 generates more Workers in the same shape. Generated Workers are not deployed in Phase 4 either — they're committed as build artifacts and served from local `wrangler dev --local --port 8790+` instances during Phases 4–6.
- **Phase 5 (Stage F validation)** — F1 (static checks) runs locally; F2 (smell scan) runs locally; F3 (agent eval) runs locally against locally-served tenant Workers (the test agent uses `localhost:8790+` URLs).
- **Phase 6 (runtime / dispatcher)** — was originally "deploy CF dispatch + tenant Workers + usage events"; needs revision. **Decision deferred** — Phase 6 plan must be re-discussed with the local-only constraint in mind. Likely Phase 6 becomes "local Bun multi-Worker runner with usage event emission to local Inngest dev server"; real CF dispatch becomes Phase 10's primary task.
- **Phases 7, 8, 9** — frontend/billing/observability — minimal CF/Fly dependency in original plans; should be largely unaffected.
- **Phase 10 (launch)** — gains: CF namespace creation + dispatch deploy + Hyperdrive provisioning + SSE spike on real CF + Pro-tier Logto upgrade test on staging + Fly Machines deploy + cold-start latency measurement + the 3-namespace cap hook activation. Phase 10's plan should be ~3× larger than originally scoped.

This is a structural change to the roadmap. Recommend running `/gsd-discuss-phase 6` before Phase 6 starts to re-scope it given the local-only constraint.

## Revision history

- **revision 1** (2026-04-26 earlier): CF migration deferred to Phase 10 (CF only).
- **revision 2** (2026-04-26 later): Fly.io migration ALSO deferred to Phase 10. Specific local port map documented. Plan 04 Task 4 already complete via direct connection (this revision); future migrations use `DATABASE_URL_UNPOOLED`.
