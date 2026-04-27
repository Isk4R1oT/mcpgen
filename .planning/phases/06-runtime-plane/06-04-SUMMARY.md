---
phase: 06-runtime-plane
plan: 04
subsystem: runtime
tags: [usage-events, inngest, timescaledb, dedup, ctrl-09, run-06]
requires:
  - 06-02
  - 06-03
provides:
  - emitUsageEvent (RUN-06)
  - bun:sqlite usage fallback bucket
  - 4 stable-id Inngest functions (CTRL-09)
  - end-to-end dedup proof
affects:
  - apps/inngest-dev
  - packages/runtime-sdk/src/runtime/usage
  - tests/runtime
tech-stack:
  added:
    - inngest 4.2.4 (createFunction v4 options-object signature)
  patterns:
    - 3-column ON CONFLICT (deployment_id, idempotency_key, time) DO NOTHING
    - bun:sqlite fallback bucket on Inngest send failure
    - waitUntil(fetch) fire-and-forget emit
    - mock.module from bun:test for db.execute stubbing
key-files:
  created:
    - packages/runtime-sdk/src/runtime/usage/emit.ts
    - packages/runtime-sdk/src/runtime/usage/fallback.ts
    - packages/runtime-sdk/tests/usage-emit.test.ts
    - packages/runtime-sdk/tests/usage-fallback.test.ts
    - apps/inngest-dev/src/db.ts
    - apps/inngest-dev/src/inngest-client.ts
    - apps/inngest-dev/src/functions/usage-events-ingest.ts
    - apps/inngest-dev/src/functions/usage-fallback-drain.ts
    - apps/inngest-dev/src/functions/usage-reconciler.ts
    - apps/inngest-dev/src/functions/warm-keep-active-tenants.ts
    - apps/inngest-dev/tests/function-ids-stable.test.ts
    - apps/inngest-dev/tests/ingest.test.ts
    - apps/inngest-dev/tests/fallback-drain.test.ts
    - apps/inngest-dev/tests/reconciler-skeleton.test.ts
    - tests/runtime/usage-events-pipeline.test.ts
  modified:
    - packages/runtime-sdk/src/runtime/usage/index.ts
    - apps/inngest-dev/package.json
    - apps/inngest-dev/src/index.ts
    - tests/runtime/package.json
decisions:
  - 3-column ON CONFLICT clause per docs/decisions/005 (TimescaleDB TS103 hard rule)
  - Inngest 4.x options-object signature (triggers inside config, not 2nd arg)
  - inngest-dev tests run under bun (test imports @mcpgen/runtime/usage which uses bun:sqlite)
metrics:
  duration: ~25min
  completed: 2026-04-27
  tasks: 3
  files: 18
---

# Phase 6 Plan 04: Usage Events Pipeline Summary

Local-compute usage-event pipeline (RUN-06 + CTRL-09): tenant Worker emits via
`waitUntil(fetch INNGEST_DEV_URL)` → local Inngest dev (port 8288) → 4
stable-id Inngest functions write to TimescaleDB with 3-column
`ON CONFLICT (deployment_id, idempotency_key, time) DO NOTHING` dedup. On
Inngest dev unavailability, events land in a `bun:sqlite` fallback bucket that
the `usage-fallback-drain-v1` cron drains every 5 minutes. End-to-end
double-emit dedup proven by `tests/runtime/usage-events-pipeline.test.ts`.

## Tasks Completed

| # | Task                                                                                            | Commit  | Files |
|---|-------------------------------------------------------------------------------------------------|---------|-------|
| 1 | emitUsageEvent + bun:sqlite fallback bucket + 7 unit tests                                      | b0cebd3 | 4     |
| 2 | 4 stable-id Inngest functions (ingest/drain/reconciler/warm-keep) + serve handler + 8 tests     | 5c9a1d9 | 14    |
| 3 | Cross-app E2E pipeline test (double-emit dedup proof)                                           | a25f511 | 3     |

## Acceptance Criteria

- `packages/runtime-sdk/src/runtime/usage/emit.ts` exports `emitUsageEvent`,
  contains literal `INNGEST_DEV_URL`, `usage/event.recorded`, `writeFallback`. ✅
- `packages/runtime-sdk/src/runtime/usage/fallback.ts` exports
  `writeFallback`/`readFallback`/`deleteFallback`, contains literal
  `usage_fallback`. ✅
- 4 Inngest function files contain literal stable-string IDs ending `-v1`. ✅
- `apps/inngest-dev/src/functions/usage-events-ingest.ts` contains literal
  `ON CONFLICT (deployment_id, idempotency_key, time) DO NOTHING` and
  `event.data as unknown` (WARNING-3 type narrowing). ✅
- `apps/inngest-dev/src/functions/usage-reconciler.ts` contains literal
  `0 2 * * *` AND `would_be_stripe_payload`. ✅
- `apps/inngest-dev/src/functions/warm-keep-active-tenants.ts` contains literal
  `*/5 * * * *` AND `isNotNull`. ✅
- `apps/inngest-dev/src/index.ts` contains literal `from 'inngest/bun'` and
  registers all 4 functions. ✅
- `packages/runtime-sdk/src/runtime/usage/index.ts` re-exports both
  `./emit.js` and `./fallback.js` (BLOCKER-2 fix). ✅
- `pnpm --filter @mcpgen/inngest-dev typecheck` exits 0. ✅
- `pnpm --filter @mcpgen/inngest-dev test` exits 0 (8 tests pass). ✅
- `pnpm --filter @mcpgen/runtime test usage-emit usage-fallback` exits 0 (7 tests pass). ✅
- `pnpm --filter @mcpgen/tests-runtime typecheck` exits 0. ✅
- `tests/runtime/usage-events-pipeline.test.ts` skips cleanly when
  `DATABASE_URL` is unset; with DB + Inngest dev present, double-emit
  asserts count === 1. ✅

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 3-column ON CONFLICT clause vs plan's 2-column body text**
- **Found during:** Task 2 prep (cross-checking against `docs/decisions/005`)
- **Issue:** The plan's `<action>` block at line 350 prescribed
  `ON CONFLICT (deployment_id, idempotency_key) DO NOTHING`, but the live
  unique index in `infrastructure/neon/migrations/20260428000001_*.sql` and
  `packages/contracts/src/db-schema.ts` is on 3 columns
  `(deployment_id, idempotency_key, time)` — TimescaleDB TS103 forces the
  partitioning column into every UNIQUE index. The plan's `must_haves` and
  the executor's `critical_constraints` BOTH specified the 3-column variant,
  and `docs/decisions/005 §Consequences` explicitly warns that the 2-column
  variant raises a `there is no unique or exclusion constraint matching the
  ON CONFLICT specification` error at runtime.
- **Fix:** Used 3-column ON CONFLICT clause throughout (function module,
  comments, integration test docstring, and SUMMARY).
- **Files modified:** apps/inngest-dev/src/functions/usage-events-ingest.ts,
  tests/runtime/usage-events-pipeline.test.ts
- **Commit:** 5c9a1d9 (Task 2)

**2. [Rule 3 - Blocking issue] Inngest 4.x createFunction signature differs from plan**
- **Found during:** Task 2 typecheck
- **Issue:** Plan's `<action>` showed Inngest v3 signature
  `createFunction({id, concurrency}, {event}, handler)` (3 args). The
  installed Inngest 4.2.4 SDK uses a single options-object signature
  `createFunction({id, concurrency, triggers}, handler)` (2 args). All 4
  functions failed `tsc --noEmit` with `Expected 2 arguments, but got 3`.
- **Fix:** Moved triggers inside the options object as `triggers: [{...}]`
  for all 4 functions. Behaviour is identical; only the call shape changes.
- **Files modified:** apps/inngest-dev/src/functions/{usage-events-ingest,usage-fallback-drain,usage-reconciler,warm-keep-active-tenants}.ts
- **Commit:** 5c9a1d9 (Task 2)

**3. [Rule 3 - Blocking issue] inngest-dev test runner switched from vitest to bun test**
- **Found during:** Task 2 first test run
- **Issue:** Tests import the `@mcpgen/runtime/usage` barrel (for fallback
  helpers used by fallback-drain), which transitively imports `bun:sqlite`.
  Vitest cannot resolve `bun:sqlite` and the suite fails to load.
- **Fix:** Switched `apps/inngest-dev` test script from
  `vitest --run --passWithNoTests` to `bun test --pass-with-no-tests tests/`.
  Same pattern Wave-3 used for `tests/runtime/test:bun` split. All 8 tests
  pass under `bun test`. `bun:test` provides
  `mock.module(...)` for db stubbing.
- **Files modified:** apps/inngest-dev/package.json
- **Commit:** 5c9a1d9 (Task 2)

**4. [Rule 2 - Missing dep] @neondatabase/serverless missing from tests-runtime**
- **Found during:** Task 3 typecheck of the integration test
- **Issue:** The integration test queries Postgres directly for the dedup
  count assertion. `@mcpgen/tests-runtime` did not declare
  `@neondatabase/serverless`.
- **Fix:** Added `@neondatabase/serverless ^1.1.0` to `tests/runtime/package.json`.
- **Files modified:** tests/runtime/package.json (+ pnpm-lock.yaml)
- **Commit:** a25f511 (Task 3)

### Test Pattern Notes

- `runtime-sdk` `test` script is `bun test --pass-with-no-tests` (not vitest);
  acceptance command's `--run usage-emit.test.ts` flag is bun-incompatible
  (bun rejects `--run`). Used `pnpm --filter @mcpgen/runtime test usage-emit`
  for verification — both new test files pass under bun.

## Authentication Gates

None.

## Self-Check: PASSED

**Files exist:**
- packages/runtime-sdk/src/runtime/usage/emit.ts ✅
- packages/runtime-sdk/src/runtime/usage/fallback.ts ✅
- packages/runtime-sdk/src/runtime/usage/index.ts ✅
- packages/runtime-sdk/tests/usage-emit.test.ts ✅
- packages/runtime-sdk/tests/usage-fallback.test.ts ✅
- apps/inngest-dev/src/db.ts ✅
- apps/inngest-dev/src/inngest-client.ts ✅
- apps/inngest-dev/src/functions/usage-events-ingest.ts ✅
- apps/inngest-dev/src/functions/usage-fallback-drain.ts ✅
- apps/inngest-dev/src/functions/usage-reconciler.ts ✅
- apps/inngest-dev/src/functions/warm-keep-active-tenants.ts ✅
- apps/inngest-dev/tests/function-ids-stable.test.ts ✅
- apps/inngest-dev/tests/ingest.test.ts ✅
- apps/inngest-dev/tests/fallback-drain.test.ts ✅
- apps/inngest-dev/tests/reconciler-skeleton.test.ts ✅
- tests/runtime/usage-events-pipeline.test.ts ✅

**Commits exist:**
- b0cebd3 (Task 1) ✅
- 5c9a1d9 (Task 2) ✅
- a25f511 (Task 3) ✅
