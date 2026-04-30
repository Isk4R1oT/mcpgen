---
phase: 07-frontend-wire-up
fixed_at: 2026-04-30T13:21:30Z
review_path: .planning/phases/07-frontend-wire-up/07-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-04-30T13:21:30Z
**Source review:** `.planning/phases/07-frontend-wire-up/07-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01 + WR-01..WR-06; INF-01..INF-06 deferred per scope_note)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: Deploy proxy does not forward `Idempotency-Key`, allowing duplicate deployments on retry

**Files modified:**
- `apps/web/src/lib/api/dashboard-client.ts`
- `apps/web/src/app/api/v1/deploy/[generationId]/route.ts`
- `apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/route.ts`
- `apps/web/tests/unit/lib/api/dashboard-client.test.ts`

**Commit:** 9cf0e52

**Applied fix:**
- `dashboard-client.ts deploy()` now mints + forwards an `Idempotency-Key` via `getOrCreateIdempotencyKey('deploy:${generationId}', opts?.override_name ?? '')` so retries dedupe but rename-after-collision uses a fresh key (separate logical action). Header forwarded via `IDEMPOTENCY_KEY_HEADER` constant from `@mcpgen/contracts`.
- `dashboard-client.ts setBadgePublic()` does the same, namespaced per `(deploymentId, on/off)` so toggling the badge on→off→on uses three distinct keys but a flaky network retry of any one toggle dedupes.
- `/api/v1/deploy/[generationId]/route.ts` live-mode branch now reads the header, validates via `validateIdempotencyKey`, returns 400 `invalid_idempotency_key` on missing/malformed, and forwards otherwise.
- `/api/v1/deployments/[deploymentId]/badge-public/route.ts` live-mode branch does the same.
- `dashboard-client.test.ts`: install localStorage shim for both `deploy` and `setBadgePublic` suites; add three new CR-01 assertions (header presence + retry-key reuse + override_name discrimination); switch two new tests to `mockImplementation` so each call gets a fresh single-use Response.

**Logic note:** This is a contract enforcement / wire-format fix (not a logic bug); standard verification (typecheck + 14 unit tests passing) is sufficient.

---

### WR-01 + WR-02: Server-side prefetch broken (relative URL + missing cookie forwarding)

**Files modified:**
- `apps/web/src/app/dashboard/page.tsx`

**Commit:** 864dc36

**Applied fix:** Chose **Option A** per scope_note guidance — drop the SSR prefetch entirely. The Server Component prefetch was always failing silently:
- WR-01: `fetchDeployments` / `fetchUsageHourly` issue `fetch('/api/v1/...')` which Node's `fetch` rejects from a Server Component (relative URL throws `TypeError: Invalid URL`).
- WR-02: even with an absolute origin, the Logto session cookie does NOT auto-attach from RSC, so the BFF would respond with 401.

The previous try/catch swallowed both failures (CLAUDE.md "no silent fallbacks" violation). Removed both `qc.prefetchQuery({...})` calls and the misleading comment block; updated the leading comment to explain why we don't prefetch. Removed the now-unused imports of `fetchDeployments` / `fetchUsageHourly` from `dashboard-client`. Kept `HydrationBoundary` in place (seeded empty) so a future correct SSR prefetch (absolute origin + `cookies()` from `next/headers`) can be added without restructuring the client.

---

### WR-03: Toggle-public-badge silently swallows refetch failure with no surfacing

**Files modified:**
- `apps/web/src/lib/jsx-bridge/screens.tsx`

**Commit:** 02102ef

**Applied fix:**
- Added `toggleError` state on `DashboardWrapper` (mirrors `errorMessage` state in `DeployWrapper`).
- Surface the failure message in a sibling alert region (`role="alert"`, `data-testid="dashboard-toggle-error"`) using only locked CSS-vars (`mc-mono`, `var(--accent-red, var(--text))`, `var(--border)`) — FE-05 anti-drift preserved.
- On both success and failure, invalidate the `['deployments']` query via `useQueryClient().invalidateQueries({...})` so React Query refetches the canonical server state; this rolls back the optimistic checkbox to whatever the server actually persisted.
- Added `useQueryClient` to the existing `@tanstack/react-query` import.

---

### WR-04: SSE proxy returns 502 status with `Content-Type: text/event-stream` — error event unreachable

**Files modified:**
- `apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts`

**Commit:** 3e6fc91

**Applied fix:** Changed `status: 502` → `status: 200` in the `bff_unreachable` error response so the client's SSE parser delivers the `event: error` body to `useGenerationSSE`. Added explanatory comment noting both the `EventSource`-spec rationale and the actual code path used by `useGenerationSSE` (fetch + `EventSourceParserStream`, which throws on `!res.ok`). Body and `Content-Type` headers unchanged.

---

### WR-05: `Last-Event-ID` header casing may not match BFF parser

**Files modified:**
- `apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts`

**Commit:** 5f076b2

**Applied fix:** Verified the contracts constant `LAST_EVENT_ID_HEADER = 'Last-Event-ID'` (Title-Case, the canonical SSE form). Did NOT change the contract. At the proxy-write boundary (the only place where Hono on CF Workers might read raw bindings without case normalization), normalized to wire-canonical lowercase `'last-event-id'` per RFC 6855. Request-side reads via `req.headers.get(LAST_EVENT_ID_HEADER)` keep working because HTTP header reads are case-insensitive on the WHATWG Headers API.

---

### WR-06: Fixture mode not hard-blocked in production via env var

**Files modified:**
- `apps/web/src/lib/fixture-mode/index.ts`
- `apps/web/tests/unit/lib/fixture-mode/guard.test.ts`

**Commit:** 07dece3

**Applied fix:** Added a `process.env.NODE_ENV === 'production'` short-circuit at the top of `getFrontendMode` that returns `'live'` regardless of env-var or query-string state — closes the cross-tenant data isolation gap (T-7-15) where a stray `MCPGEN_FRONTEND_MODE=fixtures` env-var leak into a Vercel production deploy would route every authenticated user to the shared fixture deployments + usage_hourly rows. Extended `tests/unit/lib/fixture-mode/guard.test.ts` with a new test case that sets `MCPGEN_FRONTEND_MODE=fixtures` + `NODE_ENV=production` and asserts the override is ignored both when `req` is undefined and when a request is supplied. All 10 tests in the file pass.

---

## Verification

All fixes verified via:
- **Tier 1:** Re-read each modified file; confirmed fix text present and surrounding code intact.
- **Tier 2:** `pnpm --filter @mcpgen/web run typecheck` (no errors after every fix).
- **Tier 2 (tests):** Targeted unit tests after each fix:
  - CR-01: `tests/unit/lib/api/dashboard-client.test.ts` — 14 tests passing (3 new assertions covering header presence, retry-key reuse, override_name discrimination).
  - WR-06: `tests/unit/lib/fixture-mode/guard.test.ts` — 10 tests passing (1 new assertion covering env-var override in production).
  - Full suite re-run after final commit: 13 test files / **98 tests passing**.

No findings were skipped. No source files left in broken state.

## Skipped Issues

None.

---

_Fixed: 2026-04-30T13:21:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
