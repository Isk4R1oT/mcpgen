---
phase: 09-observability-polish
plan: 03
subsystem: bff-routes
tags: [hono, bff, deployments, badge-public, dashboard, contracts, zod, integration-tests, idor]

# Dependency graph
requires:
  - phase: 07-frontend-wire-up
    provides: dashboard data layer (apps/web/src/lib/api/dashboard-client.ts) defining the BFF wire shape against fixtures
  - phase: 08-auth-billing
    provides: drift.ts canonical 4-table JOIN org-scope pattern; authMiddleware (D-01) on protectedApp
  - plan: 09-01
    provides: redactBeforeSend now in @mcpgen/contracts (Phase 9 D-03) — sets the precedent for cross-app shared contracts
  - plan: 09-02
    provides: deployments.public_badge boolean column live in dev DB (Phase 9 D-19)
provides:
  - GET /api/v1/deployments BFF endpoint (Hono + protectedApp + 4-table JOIN org scope; D-18 #1 of 4)
  - PATCH /api/v1/deployments/:id/badge-public BFF endpoint (zValidator + org scope; D-18 #4 of 4)
  - apps/api/src/lib/auth-helpers.ts deploymentBelongsToOrg helper (extracted from drift.ts:48-62 for cross-route reuse)
  - packages/contracts/src/dashboard-api.ts wire-shape source of truth (Deployment / UsageHourlyRow / DeployResponse / BadgePublicRequest schemas)
  - 11 vitest unit tests for the promoted contracts module
  - 10 Hono integration tests covering happy path + 401 + 403 (M2M) + 404 (foreign-org) + 400 (invalid body) + 400 (no_org_context)
affects: [09-04, 09-05, 09-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Selective barrel re-export to avoid cross-module type collision (Deployment is db row in db-types.ts vs wire shape in dashboard-api.ts; consumers deep-import @mcpgen/contracts/dashboard-api for the wire type)"
    - "BFF endpoint contract derived from frontend Route Handler proxy, not plan body (PATCH + public_badge wins over POST + public per actual Phase 7 wiring)"
    - "Per-route auth + org-scope check via deploymentBelongsToOrg (4-table JOIN deployments → generations → projects → org_id) shared between drift.ts and deployments.ts"
    - "Foreign-org access returns 404 (not 403) — defense in depth, never confirms existence (PATTERNS.md key finding #2)"
    - "Hono multi-route mounting via protectedApp.route('/', X) for self-prefixing route groups; drift + deployments coexist with no collision because methods + paths differ"
    - "Vitest mock pattern for Hono integration tests: jose mock with __authMode toggle + vi.mock('../../src/db.js') in-memory store with SQL-fragment-matching execute()"
    - "Frontend dashboard-client.ts re-exports promoted schemas verbatim so the existing 14 Phase-7 unit tests pass without touching call sites"

key-files:
  created:
    - packages/contracts/src/dashboard-api.ts
    - packages/contracts/src/dashboard-api.test.ts
    - apps/api/src/lib/auth-helpers.ts
    - apps/api/src/routes/v1/deployments.ts
    - apps/api/tests/routes/deployments-list.test.ts
    - apps/api/tests/routes/badge-public.test.ts
  modified:
    - packages/contracts/package.json
    - packages/contracts/src/index.ts
    - apps/web/src/lib/api/dashboard-client.ts
    - apps/api/src/routes/v1/drift.ts
    - apps/api/src/index.ts

key-decisions:
  - "BFF endpoint method is PATCH /badge-public (not POST) and request body field is public_badge (not public) — matches the frontend Route Handler proxy at apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/route.ts; changing either side would 502 dashboard live mode"
  - "Selective barrel re-export from packages/contracts/src/index.ts excludes the wire-shape Deployment type to avoid collision with the Drizzle InferSelectModel Deployment in db-types.ts; wire-shape consumers deep-import @mcpgen/contracts/dashboard-api"
  - "Integration tests follow drift.test.ts in-memory mock pattern (no skipIf(!DATABASE_URL) seeded-DB approach the plan body sketched) — the established analog works deterministically without DATABASE_URL"
  - "Helper extracted to apps/api/src/lib/auth-helpers.ts so Plan 09-04 (/usage/hourly) and Plan 09-06 (/deploy/[id]) reuse the same 4-table JOIN predicate without copy-paste drift"

patterns-established:
  - "Cross-package contract promotion: take a TODO(phase-N) local Zod schema in apps/web/src/lib/api/* → move verbatim to packages/contracts/src/<name>.ts → re-export under @mcpgen/contracts/<name> deep-import path → update web client to re-export from contracts → preserve all existing import paths via local re-export shim"
  - "BFF route file pattern (from drift.ts analog): Hono<{ Bindings, Variables: { auth: AuthContext } }> + per-handler M2M-rejection check + no_org_context check + deploymentBelongsToOrg + 404 not 403 + zValidator on body schemas from @mcpgen/contracts/dashboard-api"

requirements-completed: [CTRL-08]

# Metrics
duration: 9min
completed: 2026-04-30
---

# Phase 9 Plan 03: BFF Carry-Forward Endpoints — Deployments List + Badge-Public Toggle Summary

Closes 2 of 4 Phase 7 dashboard carry-forward stubs (D-18) by implementing `GET /api/v1/deployments` and `PATCH /api/v1/deployments/:id/badge-public` in the Hono BFF, promoting the frontend's local Zod schemas to `@mcpgen/contracts/dashboard-api` as the single source of truth, and extracting the canonical 4-table JOIN org-scope predicate to `apps/api/src/lib/auth-helpers.ts` for cross-route reuse by Plan 04 and Plan 06.

## Files Created / Modified

### Task 1 — Promote dashboard wire schemas to contracts
- **Created** `packages/contracts/src/dashboard-api.ts` — 7 Zod schemas (`DeploymentSchema`, `DeploymentsListResponseSchema`, `UsageHourlyRowSchema`, `UsageHourlyResponseSchema`, `DeployResponseSchema`, `BadgePublicRequestSchema`, `BadgePublicResponseSchema`) plus `z.infer` type aliases
- **Created** `packages/contracts/src/dashboard-api.test.ts` — 11 vitest unit tests (3 per major schema + smoke for usage)
- **Modified** `packages/contracts/package.json` — added `"./dashboard-api": "./src/dashboard-api.ts"` deep-import export
- **Modified** `packages/contracts/src/index.ts` — selective barrel re-export (omits wire-shape `Deployment` type to avoid collision with the Drizzle `Deployment` row type in `db-types.ts`)
- **Modified** `apps/web/src/lib/api/dashboard-client.ts` — replaced local Zod schema definitions with re-export from `@mcpgen/contracts/dashboard-api`; preserves the 14 Phase-7 vitest unit tests verbatim

Commits: `69aec27` (RED), `5d17050` (GREEN)

### Task 2 — Extract helper + implement deployments BFF route
- **Created** `apps/api/src/lib/auth-helpers.ts` — `deploymentBelongsToOrg(deploymentId, orgId)` helper (4-table JOIN deployments → generations → projects → org_id)
- **Modified** `apps/api/src/routes/v1/drift.ts` — removed local helper definition, imports from `../../lib/auth-helpers.js`; existing 11 drift tests still pass unchanged
- **Created** `apps/api/src/routes/v1/deployments.ts` — Hono route group with `GET /deployments` and `PATCH /deployments/:id/badge-public`; per-handler M2M rejection (`m2m_cannot_list_deployments` / `m2m_cannot_toggle_badge`), `no_org_context` check, foreign-org → 404, `zValidator` on body via `BadgePublicRequestSchema`
- **Modified** `apps/api/src/index.ts` — imports `deploymentsRoute`, mounts via `protectedApp.route('/', deploymentsRoute)` after the existing `driftRoute` mount

Commits: `7940a9d` (refactor), `5f27afe` (feat)

### Task 3 — Integration tests
- **Created** `apps/api/tests/routes/deployments-list.test.ts` — 4 tests: 401 unauthenticated; 403 M2M; 400 no_org_context; 200 returns only authenticated org's deployments (cross-org isolation regression)
- **Created** `apps/api/tests/routes/badge-public.test.ts` — 6 tests: 403 M2M; 404 foreign-org (not 403, defense in depth); 400 zValidator non-boolean; 400 zValidator missing field; 200 toggle on; 200 toggle off

Commit: `9bee72f`

## Acceptance Criteria — All Met

| Criterion | Status |
|-----------|--------|
| `apps/api/src/lib/auth-helpers.ts` exports `deploymentBelongsToOrg` | Met |
| `packages/contracts/src/dashboard-api.ts` exports `DeploymentSchema`, `BadgePublicRequestSchema`, `UsageHourlyRowSchema` | Met |
| `apps/api/src/routes/v1/deployments.ts` exports `deploymentsRoute` with `GET /deployments` + `PATCH /deployments/:id/badge-public` | Met |
| Routes mounted in `apps/api/src/index.ts` via `protectedApp.route('/', deploymentsRoute)` | Met |
| `apps/api/tests/routes/deployments-list.test.ts` passes (foreign-org → 404; M2M → 403; happy-path → 200) | Met (4/4 tests pass) |
| `apps/api/tests/routes/badge-public.test.ts` passes (toggle works; foreign-org → 404; uses `public_badge` from Plan 09-02) | Met (6/6 tests pass) |
| Auth middleware on both endpoints (no new auth bypass) | Met (mounted under `protectedApp` which applies `authMiddleware`) |
| Phase 7 dashboard `MCPGEN_FRONTEND_MODE=live` no longer 502s on these endpoints | Confirmed by static contract match |

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| `@mcpgen/contracts` (incl. dashboard-api) | 113 / 113 | All pass |
| `@mcpgen/api` typecheck | n/a | Clean |
| `@mcpgen/api` (incl. drift + deployments-list + badge-public) | 138 / 153 (15 skipped — expected: e2e + DB-gated) | All pass |
| `@mcpgen/web` (incl. preserved dashboard-client tests) | 98 / 98 | All pass |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] BFF method/body MUST match frontend proxy: PATCH `/badge-public` with `{ public_badge: boolean }`, not POST `/badge-public` with `{ public }`**
- **Found during:** Task 1 / Task 2 reading
- **Issue:** Plan body says `POST /api/v1/deployments/[id]/badge-public` with body `{ public: boolean }`. The frontend Route Handler proxy at `apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/route.ts` already wires `PATCH` with body `{ public_badge: boolean }` (validated client-side, with `IDEMPOTENCY_KEY_HEADER` check). The frontend dashboard-client tests assert PATCH + `public_badge` verbatim. Implementing the plan's POST + `public` shape would 502 the dashboard's live mode and break 1 of the 14 Phase-7 client tests.
- **Fix:** BFF endpoint implements PATCH `/deployments/:id/badge-public` with `BadgePublicRequestSchema = z.object({ public_badge: z.boolean() })` to match the frontend proxy.
- **Files modified:** `apps/api/src/routes/v1/deployments.ts`, `packages/contracts/src/dashboard-api.ts`
- **Commit:** `5f27afe`

**2. [Rule 1 — Type Collision] Wire-shape `Deployment` type collides with Drizzle row `Deployment` in `db-types.ts`**
- **Found during:** Task 1 typecheck after barrel re-export
- **Issue:** `packages/contracts/src/db-types.ts:42` already exports `export type Deployment = typeof deployments.$inferSelect`. A wildcard `export * from './dashboard-api.js'` introduced TS2308 "ambiguous member" error.
- **Fix:** Selective named re-export from `index.ts` — schemas + non-colliding type aliases only. Wire-shape consumers deep-import via `@mcpgen/contracts/dashboard-api` (typed exception documented in `index.ts` comment).
- **Files modified:** `packages/contracts/src/index.ts`
- **Commit:** `5d17050`

**3. [Rule 1 — Established pattern over plan sketch] Integration tests use in-memory db mock, not `skipIf(!DATABASE_URL)` seeded-DB**
- **Found during:** Task 3 reading the analog
- **Issue:** Plan body suggested `describe.skipIf(!process.env.DATABASE_URL)` with seeded orgs/projects/generations/deployments. The canonical analog `apps/api/tests/routes/drift.test.ts` uses `vi.mock('../../src/db.js')` with an in-memory store and SQL-fragment matching — works without DATABASE_URL, runs deterministically in CI, is the established pattern across all `apps/api/tests/`.
- **Fix:** Mirror `drift.test.ts` shape exactly. No skipIf guard; always-on tests with mock db.
- **Files created:** `apps/api/tests/routes/deployments-list.test.ts`, `apps/api/tests/routes/badge-public.test.ts`
- **Commit:** `9bee72f`

## Authentication Gates
None encountered.

## Threat Model Coverage

| Threat ID | Mitigation evidence |
|-----------|---------------------|
| T-9-bff-auth-01 (JWT replay) | Both routes mounted under `protectedApp` which applies `authMiddleware` (Phase 8 D-01); 401-unauthenticated test in `deployments-list.test.ts` confirms |
| T-9-bff-auth-02 (Foreign-org IDOR) | `deploymentBelongsToOrg` 4-table JOIN; 404-not-403 test in `badge-public.test.ts` confirms (`expect(res.status).not.toBe(403)`) plus `deploymentsStore.get(FOREIGN_DEPLOYMENT_ID)?.public_badge` stays `false` post-attempt |
| T-9-bff-auth-03 (M2M elevation) | Explicit `auth.isM2M` check returns 403 with `m2m_cannot_*` reason; M2M-rejection tests in both files |
| T-9-bff-auth-04 (SQL injection) | Drizzle parameterized SQL (`${deploymentId}` is sql identifier param); `zValidator` on PATCH body |
| T-9-bff-auth-05 (Cross-org listing) | `WHERE p.org_id = ${auth.organizationId}` mandatory in GET /deployments; cross-org isolation test asserts foreign deployment NEVER appears |

## Self-Check: PASSED

- File `packages/contracts/src/dashboard-api.ts` exists — FOUND
- File `packages/contracts/src/dashboard-api.test.ts` exists — FOUND
- File `apps/api/src/lib/auth-helpers.ts` exists — FOUND
- File `apps/api/src/routes/v1/deployments.ts` exists — FOUND
- File `apps/api/tests/routes/deployments-list.test.ts` exists — FOUND
- File `apps/api/tests/routes/badge-public.test.ts` exists — FOUND
- Commit `69aec27` (test RED) — FOUND
- Commit `5d17050` (feat GREEN) — FOUND
- Commit `7940a9d` (refactor) — FOUND
- Commit `5f27afe` (feat) — FOUND
- Commit `9bee72f` (test) — FOUND

## Carry-Forward to Plan 09-04 / 09-06

- `deploymentBelongsToOrg` helper in `auth-helpers.ts` is the shared org-scope predicate for `/usage/hourly` (Plan 04) and `/deploy/[id]` (Plan 06)
- `UsageHourlyRowSchema` / `UsageHourlyResponseSchema` already in `dashboard-api.ts` — Plan 04 imports verbatim
- `DeployResponseSchema` already in `dashboard-api.ts` — Plan 06 imports verbatim
- `protectedApp.route('/', deploymentsRoute)` mounting pattern is the template for additional routes
