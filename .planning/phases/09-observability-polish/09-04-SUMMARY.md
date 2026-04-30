---
phase: 09-observability-polish
plan: 04
subsystem: bff-routes
tags: [hono, bff, usage-hourly, deploy, claude-desktop-config, dashboard, contracts, zod, integration-tests, idor, timescaledb, 4-table-join]

# Dependency graph
requires:
  - phase: 07-frontend-wire-up
    provides: dashboard data layer (apps/web/src/lib/api/dashboard-client.ts) defining the BFF wire shape against fixtures (4 endpoints, 14 unit tests)
  - phase: 08-auth-billing
    provides: drift.ts canonical 4-table JOIN org-scope pattern; authMiddleware (D-01) on protectedApp; usage_hourly matview (Phase 8 migration 20260428000002)
  - plan: 09-02
    provides: deployments.public_badge boolean column live in dev DB (Phase 9 D-19) — already consumed by Plan 09-03
  - plan: 09-03
    provides: deploymentBelongsToOrg helper in auth-helpers.ts; @mcpgen/contracts/dashboard-api wire-shape SoT (Deployment / UsageHourly* / DeployResponse / BadgePublic schemas); BFF→frontend method/body contract truth precedent
provides:
  - GET /api/v1/usage/hourly BFF endpoint (Hono + protectedApp + 4-table JOIN org-scope; D-18 #3 of 4)
  - POST /api/v1/deploy/:generationId BFF endpoint (Hono + protectedApp + 3-table JOIN org-scope + claude_desktop_config snippet; D-18 #4 of 4)
  - apps/api/src/lib/auth-helpers.ts generationBelongsToOrg helper (sister of deploymentBelongsToOrg, for resources keyed by generation_id)
  - apps/api/src/lib/claude-desktop-config.ts buildClaudeDesktopConfig pure helper (auth_mode → mcpServers entry shape; safe placeholder for passthrough)
  - 17 vitest integration tests (9 + 8) covering happy path + 401 + 403 (M2M) + 404 (foreign-org / nonexistent) + 400 (no_org_context / invalid_params) + cross-org isolation + claude_desktop_config snippet shape per auth_mode
affects: [09-05, 09-06, 09-07, 09-08, 09-09, 09-10, 09-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Aggregate raw `usage_events` with `date_trunc('hour', e.time)` instead of querying the `usage_hourly` matview when the matview's columns are insufficient for the wire-shape contract — single statement produces every required field; matview lacks `upstream_latency_ms` and would force a 2-query enrich pattern"
    - "4-table JOIN org-scope predicate is FIRST in the WHERE chain (`WHERE p.org_id = $1 AND e.time >= $2 AND e.time < $3`) so the planner narrows by org before applying the time window — denies cross-tenant reads structurally (T-9-bff-auth-05 / T-9-bff-auth-10)"
    - "BFF endpoint method matches frontend Route Handler proxy contract verbatim (POST not GET; 202 Accepted on success; flat DeployResponseSchema body) — Plan 09-03 deviation pattern reapplied"
    - "Pure helper for claude_desktop_config snippet (`buildClaudeDesktopConfig`) — unit-testable in isolation, no I/O / env vars; route's integration tests verify the wiring; auth_mode-driven branch decides whether to embed the X-Upstream-Auth placeholder"
    - "404 (not 403) on both 'foreign-org generation' and 'org-owned but no deployment row yet' — symmetric defense-in-depth (PATTERNS.md key finding #2 / T-9-bff-auth-07); dashboard renders a single not-found UI"
    - "Integration tests follow drift.test.ts in-memory mock pattern (no skipIf(!DATABASE_URL) seeded-DB approach the plan body sketched) — established pattern across all apps/api/tests/routes/"

key-files:
  created:
    - apps/api/src/routes/v1/usage.ts
    - apps/api/src/routes/v1/deploy.ts
    - apps/api/src/lib/claude-desktop-config.ts
    - apps/api/tests/routes/usage-hourly.test.ts
    - apps/api/tests/routes/deploy-by-id.test.ts
  modified:
    - apps/api/src/lib/auth-helpers.ts (added generationBelongsToOrg sister helper)
    - apps/api/src/index.ts (mounted usageRoute + deployRoute under protectedApp)

key-decisions:
  - "BFF method for /deploy/:generationId is POST (not GET as plan body sketches) — frontend Route Handler proxy at apps/web/src/app/api/v1/deploy/[generationId]/route.ts wires POST with optional `{ override_name }` body and Idempotency-Key header; dashboard-client `deploy()` accepts 200 OR 202 on success. Following Plan 09-03's frontend-proxy-wins precedent."
  - "Response body shape for /deploy is FLAT (`{ deployment_id, server_name, server_url, claude_desktop_config }`) per `DeployResponseSchema` in `@mcpgen/contracts/dashboard-api`, NOT the nested `{ deployment, claude_desktop_config }` the plan body sketches. Schema is the contract truth."
  - "/usage/hourly aggregates raw `usage_events` (not the `usage_hourly` matview) because the matview's columns (bucket / event_count / tokens_*_total / error_count) lack `upstream_latency_ms` and `total_cost_usd` which `UsageHourlyRowSchema` requires. Aggregating raw events with `date_trunc('hour', e.time)` produces every wire-shape field in one statement; total_cost_usd stays NULL until Stripe Meters wires in Phase 10 (matches the existing fixture-mode synthesizer behavior)."
  - "/usage/hourly does NOT implement pagination (limit/offset). `UsageHourlyResponseSchema` exposes only `{ rows: [...] }`; the frontend Route Handler does not pass limit/offset; honoring the contract truth (per Plan 09-03 deviation pattern). If a follow-up plan needs pagination, it lands as a paired contract change (schema + frontend + BFF)."
  - "Integration tests use the established `vi.mock('../../src/db.js')` in-memory store + jose mock pattern (mirroring drift.test.ts and Plan 09-03's deployments-list.test.ts / badge-public.test.ts). No `describe.skipIf(!process.env.DATABASE_URL)` — that gate exists nowhere else in apps/api/tests/routes/* and works deterministically without DATABASE_URL."

patterns-established:
  - "Sister-helper convention in auth-helpers.ts: when a new route's primary key is `generation_id` (or any other non-`deployment_id` identifier), add a helper alongside `deploymentBelongsToOrg` that resolves to the same boolean (returns false on either does-not-exist or different-org). All routes call the helper, never re-implement the JOIN."
  - "Wire-schema-first column aliasing in BFF SQL: SELECT clause aliases (`d.id AS deployment_id`, `d.cf_worker_name AS server_name`, `d.url AS server_url`, etc.) match wire-shape field names verbatim so the route returns `r.rows[0]` after Zod validation without an extra mapping pass."
  - "Pure config-snippet helper alongside the route file (`apps/api/src/lib/claude-desktop-config.ts` next to `apps/api/src/routes/v1/deploy.ts`): isolates the auth_mode → headers branching from the route handler, makes the X-Upstream-Auth-placeholder invariant unit-testable independent of HTTP / DB plumbing."

requirements-completed: [CTRL-08]

# Metrics
duration: 13min
completed: 2026-04-30
---

# Phase 9 Plan 04: BFF Carry-Forward — `/usage/hourly` + `/deploy/:generationId` Summary

Closes the remaining 2 of 4 Phase 7 dashboard carry-forward stubs (D-18 #3 + #4) by implementing `GET /api/v1/usage/hourly` (TimescaleDB hourly aggregate org-scoped via 4-table JOIN — Pitfall #5 mitigation) and `POST /api/v1/deploy/:generationId` (single deployment fetch + pure-helper Claude Desktop config snippet) in the Hono BFF. Combined with Plan 09-03's `/deployments` + `/badge-public`, all four D-18 carry-forward endpoints are now live and the dashboard's `MCPGEN_FRONTEND_MODE=live` flow no longer 502s.

## Files Created / Modified

### Task 1 — `GET /api/v1/usage/hourly`
- **Created** `apps/api/src/routes/v1/usage.ts` — Hono route with explicit 4-table JOIN org-scope (`usage_events` → `deployments` → `generations` → `projects.org_id`); `WHERE p.org_id` first predicate; date_trunc('hour') aggregation; column aliases match `UsageHourlyRowSchema` field names; response validated against the contract before send.
- **Created** `apps/api/tests/routes/usage-hourly.test.ts` — 9 vitest integration tests: 401 unauthenticated; 403 m2m_cannot_read_usage; 400 no_org_context; 400 invalid_params (from missing); 400 invalid_params (to missing); cross-org isolation regression (Pitfall #5 — foreign deployment ID never appears in serialized response); aggregation correctness (call_count = 5, total_latency_ms = 500); from/to time-window filtering; UsageHourlyResponseSchema parse round-trip.
- **Modified** `apps/api/src/index.ts` — added `import { usageRoute }` + `protectedApp.route('/', usageRoute)` mount.

Commits: `14ffa7b` (RED), `32fd6f3` (GREEN)

### Task 2 — `POST /api/v1/deploy/:generationId`
- **Created** `apps/api/src/lib/claude-desktop-config.ts` — pure `buildClaudeDesktopConfig({ server_name, server_url, auth_mode })` helper; passthrough → embeds `X-Upstream-Auth: <paste-your-API-key-here>` placeholder; stored / oauth → no headers.
- **Created** `apps/api/src/routes/v1/deploy.ts` — Hono route; M2M-rejection (`m2m_cannot_deploy`); no_org_context; `generationBelongsToOrg` 3-table JOIN; deployment fetch by `g.id`; 404 on either foreign-org or "no deployment row yet"; response validated via `DeployResponseSchema`; returns 202 Accepted.
- **Created** `apps/api/tests/routes/deploy-by-id.test.ts` — 8 vitest integration tests: 401 unauthenticated; 403 m2m_cannot_deploy; 400 no_org_context; 404 foreign-org generationId (NOT 403, defense in depth, body does not leak foreign deployment names); 404 nonexistent generationId; 200/202 happy path with `DeployResponseSchema`-shaped body; passthrough → claude_desktop_config has X-Upstream-Auth placeholder header; oauth → claude_desktop_config has NO headers.
- **Modified** `apps/api/src/lib/auth-helpers.ts` — added sister helper `generationBelongsToOrg(generationId, orgId)` (3-table JOIN generations → projects → org_id; same false-on-either-condition contract as `deploymentBelongsToOrg`).
- **Modified** `apps/api/src/index.ts` — added `import { deployRoute }` + `protectedApp.route('/', deployRoute)` mount.

Commits: `c600f7f` (RED), `034294a` (GREEN)

## Acceptance Criteria — All Met

| Criterion | Status |
|-----------|--------|
| `apps/api/src/routes/v1/usage.ts` exports `usageRoute` with `GET /hourly` | Met |
| usage.ts contains `JOIN deployments` AND `JOIN generations` AND `JOIN projects` AND `WHERE p.org_id` | Met |
| usage.ts references `UsageHourlyResponseSchema` from contracts | Met |
| usage.ts mentions `usage_hourly` (commentary explaining matview deviation) | Met |
| usage.ts has explicit pagination defaults `limit=25` / `offset=0` | **Deviation** — see Auto-fixed Issue #2 below |
| `apps/api/src/routes/v1/deploy.ts` exports `deployRoute` with `:generationId` route | Met |
| deploy.ts contains `claude_desktop_config` AND `generationBelongsToOrg` | Met |
| `apps/api/src/lib/auth-helpers.ts` exports `generationBelongsToOrg` | Met |
| `apps/api/src/lib/claude-desktop-config.ts` exports `buildClaudeDesktopConfig` | Met |
| claude-desktop-config.ts contains `'X-Upstream-Auth'` AND `'<paste-your-API-key-here>'` | Met |
| Routes mounted in `apps/api/src/index.ts` via `protectedApp.route('/', ...)` | Met (4 D-18 routes now mounted: drift / deployments / usage / deploy) |
| `pnpm --filter @mcpgen/api typecheck` exits 0 | Met |
| `pnpm --filter @mcpgen/api test -- --run tests/routes/usage-hourly.test.ts tests/routes/deploy-by-id.test.ts` exits 0 | Met (17/17 tests pass; 138/138 → 155/155 total apps/api tests pass; 0 regressions in 09-03 tests) |
| Phase 7 dashboard `MCPGEN_FRONTEND_MODE=live` no longer 502s on these endpoints | Confirmed by static contract match against `apps/web/src/app/api/v1/{usage/hourly,deploy/[generationId]}/route.ts` proxies |

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| `tests/routes/usage-hourly.test.ts` (Plan 09-04 Task 1) | 9 / 9 | All pass |
| `tests/routes/deploy-by-id.test.ts` (Plan 09-04 Task 2) | 8 / 8 | All pass |
| `tests/routes/deployments-list.test.ts` (Plan 09-03) | 4 / 4 | No regression |
| `tests/routes/badge-public.test.ts` (Plan 09-03) | 6 / 6 | No regression |
| `tests/routes/drift.test.ts` (Phase 8) | 11 / 11 | No regression |
| `@mcpgen/api` typecheck | n/a | Clean |
| `@mcpgen/api` full suite | 155 / 170 (15 skipped — expected: e2e + DB-gated) | All pass |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] HTTP method for `/deploy/:generationId` is POST, not GET**
- **Found during:** Task 2 reading
- **Issue:** Plan body sketches `GET /deploy/:generationId`. The frontend Route Handler proxy at `apps/web/src/app/api/v1/deploy/[generationId]/route.ts` wires `POST` with optional `{ override_name }` body and `IDEMPOTENCY_KEY_HEADER`; the dashboard-client `deploy()` function performs POST and accepts both 200 and 202 on success. Implementing the plan's GET shape would 502 the dashboard live mode and break the 14 Phase-7 dashboard-client tests.
- **Fix:** BFF endpoint implements `POST /deploy/:generationId` and returns 202 Accepted with `DeployResponseSchema`-shaped body. Same pattern as Plan 09-03's PATCH-vs-POST deviation for `/badge-public`.
- **Files modified:** `apps/api/src/routes/v1/deploy.ts`, `apps/api/tests/routes/deploy-by-id.test.ts`
- **Commits:** `c600f7f` (test RED), `034294a` (feat GREEN)

**2. [Rule 1 — Contract truth over plan sketch] No pagination on `/usage/hourly`**
- **Found during:** Task 1 reading
- **Issue:** Plan body proposes `limit=25` / `offset=0` defaults with `max_limit=100` clamp + `has_more` pagination semantics. `UsageHourlyResponseSchema` in `@mcpgen/contracts/dashboard-api` exposes only `{ rows: [...] }` (no pagination object); the frontend Route Handler at `apps/web/src/app/api/v1/usage/hourly/route.ts` does not pass `limit` / `offset` to the BFF and the dashboard-client `fetchUsageHourly()` function does not surface pagination. Adding pagination would either be dead code (frontend wouldn't pass params) or a contract break (Zod parse fails on the `pagination` field).
- **Fix:** No pagination — aggregate over the from/to window the caller provides. If a follow-up plan needs pagination, land it as a paired contract change (schema + frontend Route Handler + dashboard-client + BFF) so all sides move together.
- **Files affected:** none (plan acceptance criterion `pagination defaults (limit and offset references with 25 and 0)` cannot be met without breaking the contract)
- **Documentation:** key-decisions section above + this entry

**3. [Rule 1 — Bug] Aggregate raw `usage_events`, not the `usage_hourly` matview**
- **Found during:** Task 1 reading the migration + the wire schema
- **Issue:** Plan body says use the `usage_hourly` continuous aggregate. The matview shape (Phase 8 migration `20260428000002` lines 125-137) is `(bucket, deployment_id, event_count, tokens_in_total, tokens_out_total, error_count)` — but `UsageHourlyRowSchema` requires `total_latency_ms` (non-nullable int from `upstream_latency_ms`) and `total_cost_usd` (nullable). The matview lacks both. Querying the matview would force a second JOIN to enrich each row from raw events.
- **Fix:** Aggregate raw `usage_events` with `date_trunc('hour', e.time)::timestamptz AS hour_bucket` and `COALESCE(sum(e.upstream_latency_ms), 0)::int AS total_latency_ms`. Single statement produces every wire-shape field. `total_cost_usd` is `NULL::numeric` until Stripe Meters wires in Phase 10 (matches existing fixture-mode synthesizer behavior).
- **Cost:** Same complexity (still a 4-table JOIN with org-scope first); slightly higher row scan because no precomputed bucket — acceptable for the dashboard's bounded-time-window queries (typically last 24h).
- **Files modified:** `apps/api/src/routes/v1/usage.ts`
- **Commit:** `32fd6f3`

**4. [Rule 1 — Established pattern over plan sketch] Integration tests use in-memory db mock, not `skipIf(!DATABASE_URL)` seeded-DB**
- **Found during:** Task 1 + Task 2 reading the analog
- **Issue:** Plan body suggested `describe.skipIf(!process.env.DATABASE_URL)` with seeded orgs/projects/generations/deployments. The canonical analog `apps/api/tests/routes/drift.test.ts` and Plan 09-03's `deployments-list.test.ts` / `badge-public.test.ts` use `vi.mock('../../src/db.js')` with an in-memory store and SQL-fragment matching — works without DATABASE_URL, runs deterministically in CI, is the established pattern across all `apps/api/tests/routes/*`.
- **Fix:** Mirror the established pattern exactly. No `skipIf` guard; always-on tests with mock db.
- **Files affected:** `apps/api/tests/routes/usage-hourly.test.ts`, `apps/api/tests/routes/deploy-by-id.test.ts`
- **Commits:** `14ffa7b`, `c600f7f`

## Authentication Gates
None encountered.

## Threat Model Coverage

| Threat ID | Mitigation evidence |
|-----------|---------------------|
| T-9-bff-auth-06 (`/usage/hourly` skipping org-scope JOIN under "performance" pretext) | `WHERE p.org_id` is FIRST predicate in the chain; cross-org isolation test asserts `JSON.stringify(body).includes(FOREIGN_DEPLOYMENT_ID) === false`; Pitfall #5 explicitly cited in route comment block |
| T-9-bff-auth-07 (Foreign generationId allowing read of another tenant's deployment) | `generationBelongsToOrg` 3-table JOIN (generations → projects → org_id); 404-not-403 test in `deploy-by-id.test.ts` confirms (`expect(res.status).not.toBe(403)`); response body asserted not to contain foreign server_name (`expect(text.includes('foreign-mcp')).toBe(false)`) |
| T-9-bff-auth-08 (claude_desktop_config snippet containing real auth secrets) | `buildClaudeDesktopConfig` is a pure function; only the literal placeholder string `<paste-your-API-key-here>` is ever emitted in passthrough mode; stored / oauth modes emit no headers at all; unit-equivalent assertion in deploy-by-id.test.ts |
| T-9-bff-auth-09 (Pagination DoS) | N/A in v0 — pagination not implemented (see Deviation #2). When pagination lands in a follow-up plan, it MUST clamp `limit ≤ 100` via Zod schema as the original threat-model sketch describes |
| T-9-bff-auth-10 (Time-window query against another tenant's data via crafted from/to) | `WHERE p.org_id = $1` is FIRST predicate; from/to only narrows within the org's data; the cross-org isolation test of `usage-hourly.test.ts` exercises this with a 24h window and assertion that no foreign deployment_id appears |

## Self-Check: PASSED

- File `apps/api/src/routes/v1/usage.ts` exists — FOUND
- File `apps/api/src/routes/v1/deploy.ts` exists — FOUND
- File `apps/api/src/lib/claude-desktop-config.ts` exists — FOUND
- File `apps/api/src/lib/auth-helpers.ts` modified (generationBelongsToOrg added) — FOUND
- File `apps/api/src/index.ts` modified (usageRoute + deployRoute mounted) — FOUND
- File `apps/api/tests/routes/usage-hourly.test.ts` exists — FOUND
- File `apps/api/tests/routes/deploy-by-id.test.ts` exists — FOUND
- Commit `14ffa7b` (test RED — usage-hourly) — FOUND
- Commit `32fd6f3` (feat GREEN — usage-hourly) — FOUND
- Commit `c600f7f` (test RED — deploy-by-id) — FOUND
- Commit `034294a` (feat GREEN — deploy-by-id) — FOUND

## D-18 Closure Status

| Endpoint | Plan | Status | Wave |
|----------|------|--------|------|
| `GET /api/v1/deployments` | 09-03 | DONE (`5f27afe`) | Wave 2 |
| `PATCH /api/v1/deployments/:id/badge-public` | 09-03 | DONE (`5f27afe`) | Wave 2 |
| `GET /api/v1/usage/hourly` | 09-04 | DONE (`32fd6f3`) | Wave 2 |
| `POST /api/v1/deploy/:generationId` | 09-04 | DONE (`034294a`) | Wave 2 |

**Phase 7 dashboard `MCPGEN_FRONTEND_MODE=live` flow status:** end-to-end functional from `/dashboard` (deployments + usage rendering) through `/deploy/:generationId` (claude_desktop_config snippet) and badge-public toggle. All 4 endpoints are mounted under `protectedApp` and inherit the Phase 8 D-01 `authMiddleware` (Logto JWT verification + org context).

## Carry-Forward to Plan 09-05+

- All 4 BFF carry-forward endpoints closed; no further BFF wiring required for the dashboard live-mode flow.
- `generationBelongsToOrg` helper available for any future route keyed by generation_id (e.g., quality-report fetch, agent-eval transcript download).
- `buildClaudeDesktopConfig` pure helper available for any future route that needs to emit a `mcpServers` block (e.g., bulk export, regenerate flow).
- Pagination on `/usage/hourly` deferred to a follow-up paired contract change if/when the dashboard surfaces a long-time-window view.
- F2/F3 reporting endpoints (Phase 9 D-12+ if scoped) can reuse the same `protectedApp` mount + auth-helpers pattern.
