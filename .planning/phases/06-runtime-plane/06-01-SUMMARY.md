---
phase: 06-runtime-plane
plan: 01
subsystem: runtime
tags: [bun, hono, dispatch, mcp, drizzle, neon, unstorage, vitest]

requires:
  - phase: 01-foundation
    provides: "Hono scaffold + Bindings interface in apps/dispatch/src/index.ts; @mcpgen/contracts.deployments table; FND-06 frozen Runtime interface"
  - phase: 06-runtime-plane (Wave 0 — Plan 06-00)
    provides: "deployments.local_port column in Neon dev DB; tests/runtime/fixtures/{smart-id-fuzz,mock-mcp-clients}.ts shared cross-package fixtures"
provides:
  - "Live Bun + Hono dispatch on localhost:8789 with /health + /t/:name/* routing"
  - "6 mounted middleware in canonical order: hostHeaderValidation -> auth -> rateLimit -> tenantLookup -> capabilityGate -> smartIdFuzz"
  - "Multi-port forward proxy to localhost:879N for any registered local deployment"
  - "Per-session protocolVersion negotiator stripping outputSchema (tools/list) + structuredContent (tools/call) for clients < 2025-06-18"
  - "Cross-tenant smart-ID fuzz protection with inline regex matching the Wave-0 fixture (Wave-2 swap target marked TODO(plan 06-02))"
  - "5-min TTL tenant routing cache (unstorage memory driver) + Postgres `deployments` fallback"
  - "5 vitest test files / 17 passing tests covering routing + capability gating + DNS rebinding + smart-ID fuzz + session persistence"
affects:
  - "06-02 (Wave 2) — replaces inline SMART_ID_REGEX in smartIdFuzz with @mcpgen/runtime/smart-id import; wires apps/dispatch-sample through the new dispatch middleware"
  - "06-03 (auth modes) — consumes resolved authMode/upstreamCredential set by dispatch tenantLookup"
  - "06-04 (usage events) — tenant Workers reached through dispatch emit usage events"
  - "08-ops (Phase 8 / CTRL-02) — replaces auth.ts Bearer-presence stub with Logto JWKS verify"
  - "10-launch (Phase 10) — swaps Bun export for CF Workers; rateLimit -> Durable Object counter; unstorage memory driver -> cloudflare-kv-binding"

tech-stack:
  added:
    - "drizzle-orm@^0.45.2 (workspace-shared)"
    - "@neondatabase/serverless@^1.1.0 (workspace-shared)"
    - "unstorage@^1.17.5 (Phase-10 swap target via cloudflare-kv-binding driver)"
    - "ulid@^3.0.2"
    - "@types/node@^22.10.5 (Bun/Node-compatible process.env access per D-01)"
  patterns:
    - "Hono `app.use('/scope/*', middleware)` scoping so /health stays auth-free while /t/* gets the full middleware stack"
    - "Lazy Proxy-backed Drizzle client (`db = new Proxy({}, ...)`) so import-time eval does not throw when DATABASE_URL is unset (enables vi.mock pattern in tests)"
    - "vi.hoisted() container for vitest mock state when mocking workspace-internal modules (avoids 'cannot access before initialization' from vi.mock factory hoisting)"
    - "Test-only `_resetXForTest()` helpers exported from middleware modules with module-level state"
    - "Inline regex with TODO(plan-NN-NN) comment for cross-package boundary respect during phased rollout"

key-files:
  created:
    - "apps/dispatch/src/db.ts (lazy Drizzle client over Neon HTTP)"
    - "apps/dispatch/src/tenant-cache.ts (unstorage 5-min TTL cache)"
    - "apps/dispatch/src/middleware/hostHeaderValidation.ts (D-15 / pitfall #15)"
    - "apps/dispatch/src/middleware/auth.ts (Wave-1 Bearer presence stub)"
    - "apps/dispatch/src/middleware/rateLimit.ts (Wave-1 in-memory token bucket)"
    - "apps/dispatch/src/middleware/tenantLookup.ts (D-02 cache + Postgres fallback)"
    - "apps/dispatch/src/middleware/capabilityGate.ts (D-11 protocolVersion negotiator)"
    - "apps/dispatch/src/middleware/smartIdFuzz.ts (D-03 / pitfall #1 cross-tenant fuzz)"
    - "apps/dispatch/src/routing/forward.ts (multi-port fetch proxy)"
    - "apps/dispatch/tests/host-header-validation.test.ts (4 tests)"
    - "apps/dispatch/tests/dispatch.routing.test.ts (3 tests)"
    - "apps/dispatch/tests/capability-gating.test.ts (3 tests)"
    - "apps/dispatch/tests/smart-id-fuzz.test.ts (5 tests)"
    - "apps/dispatch/tests/session.test.ts (2 tests)"
    - "apps/dispatch/vitest.config.ts (extends shared base)"
  modified:
    - "apps/dispatch/package.json (5 new deps + @types/node devDep + test script)"
    - "apps/dispatch/tsconfig.json (added node types, widened rootDir to workspace, included tests + Wave-0 fixtures)"
    - "apps/dispatch/src/index.ts (replaced 404 stub with real router on :8789)"
    - "pnpm-lock.yaml (regenerated after pnpm install)"

key-decisions:
  - "Mount hostHeaderValidation on `*` (BEFORE /health route) so DNS-rebinding cannot hit even health probes, satisfying plan §verification expectation `Host: evil.com /health -> 403 invalid_host`"
  - "Scope auth/rateLimit/tenantLookup/capabilityGate/smartIdFuzz to /t/* only (not `*`), keeping /health unauthenticated per dispatch-as-ops-endpoint convention"
  - "Lazy Proxy db client (apps/dispatch/src/db.ts) — `db.select(...)` defers neon() init to first call so unit tests can vi.mock the module without DATABASE_URL"
  - "vi.hoisted() container (`mocks.rows`) in dispatch.routing.test.ts — vitest hoists vi.mock factories to module top, so referenced state must come from vi.hoisted() not closure-captured locals"
  - "tsconfig rootDir widened to workspace root (../../) only for the dispatch package — production source remains under src/, but tests can import shared Wave-0 fixtures (D-21 cross-workstream test ownership)"
  - "Inline SMART_ID_REGEX in smartIdFuzz.ts kept identical to tests/runtime/fixtures/smart-id-fuzz.ts SMART_ID_REGEX; TODO(plan 06-02) marker schedules the swap to `@mcpgen/runtime/smart-id` once Wave 2 ships the real parseSmartId"

patterns-established:
  - "Pattern: Hono Bun export shape `export default { port: NNNN, fetch: app.fetch }` — Phase-10 swap to `export default app` (CF Workers) is a one-line change"
  - "Pattern: Path-scoped middleware (`app.use('/t/*', mw)`) for ops-vs-tenant route separation, complementing global mounts"
  - "Pattern: vi.hoisted() container for vitest-internal mock state when mocking ESM workspace modules"
  - "Pattern: Lazy Proxy-backed singletons for env-dependent clients so import-time eval is side-effect-free (test-friendly)"

requirements-completed: [RUN-01]

duration: 12min
completed: 2026-04-27
---

# Phase 6 Plan 01: Bun + Hono dispatch router on localhost:8789 with 6 middleware Summary

**Live Bun + Hono dispatch on localhost:8789 with 6 ordered middleware (DNS-rebinding, auth precheck, rate-limit, tenant lookup with 5-min TTL cache + Postgres fallback, MCP protocolVersion negotiation with outputSchema/structuredContent stripping for legacy clients, cross-tenant smart-ID fuzz protection) + multi-port forward proxy to localhost:879N + 5 vitest test files (17 tests) covering routing, capability gating, DNS rebinding, smart-ID fuzz, and Mcp-Session-Id persistence.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-27T07:05:18Z
- **Completed:** 2026-04-27T07:16:59Z
- **Tasks:** 3
- **Files modified:** 16 (3 modified, 13 created)

## Accomplishments

- **RUN-01 closed in full** — single source of MCP protocol negotiation (D-11) lives in `capabilityGate.ts`; tenant Workers stay version-naive
- **T-6-01 (cross-tenant smart-ID leakage) mitigated at runtime** — `smartIdFuzz.ts` middleware enforces server-prefix match against the resolved `tenantPrefix` for every smart-ID-shaped string in JSON-RPC params; mismatch returns 403 `smart_id_tenant_mismatch`
- **T-6-04 (capability gating bypass) mitigated** — protocolVersion < `2025-06-18` triggers response rewrite stripping `outputSchema` from `tools/list` AND `structuredContent` from `tools/call`; per-session map keyed by `Mcp-Session-Id`
- **T-6-15 (DNS rebinding) mitigated** — `hostHeaderValidation` middleware mounted FIRST on `*`, default allowlist `localhost,127.0.0.1` via `ALLOWED_HOSTS` env var
- **5-min TTL tenant cache (unstorage memory driver) fronting Postgres `deployments`** — single-line Phase-10 swap to `cloudflare-kv-binding` driver
- **17/17 vitest tests passing** + zero typecheck errors + manual smoke against `bun apps/dispatch/src/index.ts` confirmed all four expected response shapes

## Task Commits

Each task was committed atomically:

1. **Task 1: scaffold dispatch wave-1 deps + drizzle client + tenant-cache** — `a6c776c` (feat)
2. **Task 2: 6 middleware + multi-port forward + 5 vitest test files (TDD RED→GREEN)** — `9481f84` (feat)
3. **Task 3: wire 6 middleware + forwardToTenant into dispatch entry** — `9acbbef` (feat)

_Note: Task 2 was executed as a single commit covering both the test-side (RED) and implementation-side (GREEN) phases because vitest TDD discovery made it impractical to commit a broken-build RED state through pre-commit hooks (the workspace `pnpm -r typecheck` gate blocks commits where any package fails to typecheck). The RED phase was nonetheless validated locally (10 failing assertions against empty stubs) before authoring the GREEN bodies; the commit message documents the full RED→GREEN trajectory._

## Files Created/Modified

### Created (13)

- `apps/dispatch/src/db.ts` — Lazy Proxy-backed Drizzle client over `@neondatabase/serverless`; defers neon() init to first call so `DATABASE_URL` can be absent in unit tests
- `apps/dispatch/src/tenant-cache.ts` — `getCachedTenant`/`setCachedTenant`/`clearCache` over `unstorage` memory driver; 5-min TTL constant `5 * 60 * 1000`
- `apps/dispatch/src/middleware/hostHeaderValidation.ts` — Hono port of MCP TS SDK middleware; rejects requests with `Host` header not in `ALLOWED_HOSTS`
- `apps/dispatch/src/middleware/auth.ts` — Wave-1 Bearer presence check returning 401 `missing_bearer_token`; Phase 8 wires Logto JWKS verify
- `apps/dispatch/src/middleware/rateLimit.ts` — Wave-1 in-memory token bucket (60s window, 600 req cap); Phase-10 swap to Durable Object counter
- `apps/dispatch/src/middleware/tenantLookup.ts` — Path-prefix parser `/t/{name}/*` → cache lookup → Drizzle `SELECT cf_worker_name + local_port + auth_mode FROM deployments WHERE cf_worker_name = ?`; populates `c.set('scriptName' | 'localPort' | 'tenantPrefix' | 'authMode' | 'upstreamPath')`
- `apps/dispatch/src/middleware/capabilityGate.ts` — Per-session `Map<Mcp-Session-Id, protocolVersion>`; rewrites tools/list (strips outputSchema) and tools/call (strips structuredContent) for clients < 2025-06-18; exports `_resetSessionVersionsForTest()` for vitest isolation
- `apps/dispatch/src/middleware/smartIdFuzz.ts` — Recursive scan of JSON-RPC params for smart-ID-shaped strings; inline `SMART_ID_REGEX` matching Wave-0 fixture; `TODO(plan 06-02)` marker for Wave-2 swap
- `apps/dispatch/src/routing/forward.ts` — Multi-port `fetch` proxy; sets `duplex: 'half'` for streaming bodies; rewrites `url.host = localhost:{port}` and `url.pathname = upstreamPath`
- `apps/dispatch/tests/host-header-validation.test.ts` — 4 tests (allowlist, evil-host 403, port stripping, missing-Host defense)
- `apps/dispatch/tests/dispatch.routing.test.ts` — 3 tests (cache-hit forwarding via stubbed fetch, 404 tenant_not_found, cache-miss-then-Postgres-fallback)
- `apps/dispatch/tests/capability-gating.test.ts` — 3 tests (latest 2025-06-18 keeps outputSchema, legacy 2024-11-05 strips outputSchema from tools/list, prior 2025-03-26 strips structuredContent from tools/call)
- `apps/dispatch/tests/smart-id-fuzz.test.ts` — 5 tests (mismatch 403, match passthrough, nested ids[] mismatch, non-tenant path bypass, non-smart-ID strings ignored)
- `apps/dispatch/tests/session.test.ts` — 2 tests (Mcp-Session-Id generated when absent, protocolVersion persists across initialize → tools/list)
- `apps/dispatch/vitest.config.ts` — Extends `@mcpgen/shared-config/vitest` base

### Modified (3)

- `apps/dispatch/package.json` — Added 5 new runtime deps (`@mcpgen/contracts`, `@mcpgen/runtime`, `@neondatabase/serverless`, `drizzle-orm`, `ulid`, `unstorage`) + `@types/node` devDep; changed test script from `vitest --run --passWithNoTests` to `vitest --passWithNoTests` so plan-specified `pnpm test --run` doesn't double-pass `--run`
- `apps/dispatch/tsconfig.json` — Added `node` to types array (Bun runtime needs `process.env` per D-01); widened `rootDir` to workspace root and `include` to cover `tests/**/*` + `../../tests/runtime/fixtures/**/*` + `vitest.config.ts`
- `apps/dispatch/src/index.ts` — Replaced Phase-1 404 stub with real router; mounts `hostHeaderValidation` on `*` and the rest on `/t/*`; exports Bun shape `{ port: 8789, fetch: app.fetch }` with Phase-10 CF Workers swap commented inline

## Decisions Made

- **Mount hostHeaderValidation on `*` (BEFORE /health)** — plan §verification mandates `Host: evil.com /health -> 403 invalid_host`; rejected the alternative "health is BEFORE host-check for CI smoke" because the threat model T-6-15 disposition is `mitigate` and bypass on /health would defeat that.
- **Scope auth/rateLimit/tenantLookup/capabilityGate/smartIdFuzz to `/t/*`** — `/health` is an ops endpoint and must not require a Bearer token; tenant routes are the only path family that carries authenticated traffic.
- **Lazy Proxy db client over `new Proxy({}, get -> getClient)`** — chosen over a `getDb()` helper to preserve the `db.select(...)` call shape that drizzle-orm expects in middleware code; tests can `vi.mock('../src/db.js')` and never trigger neon() init.
- **`vi.hoisted({ rows: [] })` container in dispatch.routing.test.ts** — vitest hoists `vi.mock(...)` factories to file top, so any captured outer reference must come from `vi.hoisted()` (the canonical vitest mechanism for shared mock state).
- **Inline SMART_ID_REGEX with `TODO(plan 06-02)` marker** — production dispatch code MUST NOT import from `tests/runtime/fixtures/*` (workspace-boundary violation); plan-mandated single-line swap to `@mcpgen/runtime/smart-id` lands in Wave 2 once the real parseSmartId ships.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `process.env` not available under CF-Workers-only tsconfig types**
- **Found during:** Task 1 (db.ts initial typecheck)
- **Issue:** `apps/dispatch/tsconfig.json` had `types: ["@cloudflare/workers-types"]` only; D-01 changes dispatch to a Bun runtime locally and `db.ts` reads `process.env.DATABASE_URL`, but `process` was undefined at the type level.
- **Fix:** Added `@types/node` to devDependencies and `node` to the tsconfig `types` array. Documented the dual-target rationale in the tsconfig comment (Bun locally + CF Workers in Phase 10).
- **Files modified:** `apps/dispatch/package.json`, `apps/dispatch/tsconfig.json`
- **Verification:** `pnpm --filter @mcpgen/dispatch typecheck` exits 0
- **Committed in:** a6c776c (Task 1 commit)

**2. [Rule 3 - Blocking] vitest test script double-pass `--run` flag**
- **Found during:** Task 2 (first attempt to run RED tests via plan-specified `pnpm --filter @mcpgen/dispatch test --run`)
- **Issue:** The package.json `test` script was inherited as `vitest --run --passWithNoTests`; the plan's verify command appends another `--run`, and vitest's CAC parser raises `Expected a single value for option "--run", received [true, true]`.
- **Fix:** Changed the script to `vitest --passWithNoTests` (drop the embedded `--run`). The plan's verify command `pnpm test --run` now passes a single `--run` to vitest. Backwards-compatible with `pnpm test --watch` for local dev.
- **Files modified:** `apps/dispatch/package.json`
- **Verification:** `pnpm --filter @mcpgen/dispatch test --run` runs vitest in non-watch mode and reports 17/17 tests passing.
- **Committed in:** 9481f84 (Task 2 commit)

**3. [Rule 1 - Bug] db.ts threw at import time when DATABASE_URL was unset**
- **Found during:** Task 2 (dispatch.routing.test.ts module-load failure)
- **Issue:** `neon(process.env.DATABASE_URL ?? '')` evaluated at import time; passing `''` to neon() raises `No database connection string was provided`. Test files that mock the db module via `vi.mock(...)` still triggered the import-time evaluation before the mock could apply.
- **Fix:** Refactored db.ts to a lazy Proxy-backed singleton (`db = new Proxy({}, get -> getClient)`); `getClient()` runs the neon() init on first call. Tests that mock the module never reach the underlying neon().
- **Files modified:** `apps/dispatch/src/db.ts`
- **Verification:** `pnpm --filter @mcpgen/dispatch test --run` succeeds (5/5 files, 17/17 tests); `pnpm --filter @mcpgen/dispatch typecheck` exits 0; manual smoke `bun apps/dispatch/src/index.ts` with DATABASE_URL set boots without errors.
- **Committed in:** 9481f84 (Task 2 commit)

**4. [Rule 3 - Blocking] tsconfig rootDir prevented test files from importing Wave-0 fixtures**
- **Found during:** Task 2 (typecheck after writing capability-gating + session tests)
- **Issue:** `tsconfig.json` rootDir was `./` so `tests/capability-gating.test.ts` could not import from `../../../tests/runtime/fixtures/mock-mcp-clients.ts` (TS6059: not under rootDir).
- **Fix:** Widened `rootDir` to `../../` (workspace root) and added `../../tests/runtime/fixtures/**/*` to include. Production source remains under `src/`; the boundary respect in the smartIdFuzz middleware is preserved by the inline SMART_ID_REGEX (no production import from `tests/`).
- **Files modified:** `apps/dispatch/tsconfig.json`
- **Verification:** `pnpm --filter @mcpgen/dispatch typecheck` exits 0; the production grep guard `! grep -F "tests/runtime/fixtures" apps/dispatch/src/middleware/smartIdFuzz.ts` passes.
- **Committed in:** 9481f84 (Task 2 commit)

**5. [Rule 1 - Bug] Hono `c.set` typed `never` in tests without typed Variables**
- **Found during:** Task 2 (smart-id-fuzz.test.ts initial typecheck)
- **Issue:** `c.set('tenantPrefix', tenantPrefix)` raised TS2769 because the Hono context's Variables map was inferred as `Record<string, never>` when the app was constructed without a Variables generic.
- **Fix:** Declared a `TestVariables` interface in the test file and constructed the test app as `new Hono<{ Variables: TestVariables }>()`.
- **Files modified:** `apps/dispatch/tests/smart-id-fuzz.test.ts`
- **Verification:** typecheck clean; smartIdFuzz tests pass.
- **Committed in:** 9481f84 (Task 2 commit)

---

**Total deviations:** 5 auto-fixed (1 Rule 1 bug, 1 Rule 1 bug, 3 Rule 3 blockers).
**Impact on plan:** All 5 deviations were necessary for correctness (test isolation + typecheck enforcement) and reflect the plan's local-Bun runtime pivot from D-01 not being fully reflected in the inherited Phase-1 dispatch tsconfig. No scope expansion — every fix lands in a file that the plan already lists in `files_modified`. Plan §threat_model dispositions for T-6-01 / T-6-04 / T-6-15 are met; Wave-1 acceptance criteria for capabilityGate (D-11) and smartIdFuzz (D-03) all pass.

## Issues Encountered

None — all deviations were handled inline via the deviation rules.

## User Setup Required

None — no external service configuration required. `DATABASE_URL` is already populated in `.env.local` for local-compute dev (per memory `reference_credentials.md`).

## Next Phase Readiness

- **Wave 2 (Plan 06-02) ready** — replace inline `SMART_ID_REGEX` in `apps/dispatch/src/middleware/smartIdFuzz.ts` with `import { parseSmartId } from '@mcpgen/runtime/smart-id'`; the `TODO(plan 06-02)` markers identify exact swap sites.
- **apps/dispatch-sample wiring (Wave 2) ready** — dispatch correctly forwards `/t/sample-stripe/*` to `localhost:8790` once a deployment row with `local_port = 8790` is registered. The `tenantLookup` middleware already extracts the upstream path on the way down.
- **Phase 8 (CTRL-02) ready** — `apps/dispatch/src/middleware/auth.ts` exposes the single-file swap site for Logto JWKS verify. Bearer presence check is the inverse-mock anchor.
- **Phase 10 ready** — Bun export `{ port: 8789, fetch: app.fetch }` swaps to `export default app` against CF Workers; `unstorage` memory driver swaps to `cloudflare-kv-binding`; `rateLimit` swaps to a Durable Object counter. All swap sites are commented inline.

## Self-Check: PASSED

All 15 plan-required files exist on disk:
- `apps/dispatch/src/index.ts`, `db.ts`, `tenant-cache.ts`, 6 middleware files, `routing/forward.ts`, 5 test files

All 3 task commits exist in git history (`git log --oneline --all`):
- `a6c776c` feat(06-01): scaffold dispatch wave-1 deps + drizzle client + tenant-cache
- `9481f84` feat(06-01): add 6 dispatch middleware + multi-port forward + 5 tests
- `9acbbef` feat(06-01): wire 6 middleware + forwardToTenant into dispatch entry

All `<acceptance_criteria>` from each task pass:
- Task 1 verify (5 grep + typecheck) — green
- Task 2 verify (10 file-existence + grep + typecheck + 17 vitest tests) — green
- Task 3 verify (5 grep + typecheck + 17 vitest tests) — green

Plan-level `<verification>` commands:
- `pnpm --filter @mcpgen/dispatch typecheck` — exits 0
- `pnpm --filter @mcpgen/dispatch test --run` — 5 files / 17 tests, all pass
- `pnpm --filter @mcpgen/dispatch build` — exits 0
- Manual smoke against `bun apps/dispatch/src/index.ts`: 4/4 expected status codes (200 / 403 / 404 / 401)

---
*Phase: 06-runtime-plane*
*Completed: 2026-04-27*
