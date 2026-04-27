---
phase: 08-auth-billing
plan: 02
subsystem: billing, webhook, outbox-poller
tags: [stripe, webhook, inngest, outbox, vitest, mock, idempotency, materialized-view]

# Dependency graph
requires:
  - phase: 08-auth-billing
    plan: 01
    provides: "INNGEST_FUNCTION_IDS register; subscription_events + usage_events_outbox tables; SYNTHETIC_DEPLOYMENT_ID; 5-layer Hono mounting; auth middleware"
provides:
  - "POST /api/v1/stripe/webhook handler in PUBLIC layer with constructEventAsync + idempotent persistence + 5 dispatched event types + unhandled forward-compat"
  - "stripe-meters-emit-v1 Inngest cron with FOR UPDATE SKIP LOCKED outbox poller + REFRESH MATERIALIZED VIEW usage_hourly (Plan 01 deviation #1 follow-through)"
  - "Hoisted vi.mock('stripe') helper (apps/api/tests/_mocks/stripe.ts) re-usable across webhook + outbox + Wave 3 checkout tests"
  - "Idempotent reference-only Stripe setup script (infrastructure/stripe/setup.ts) mirroring infrastructure/logto/scaffold.ts pattern"
  - "Synthetic outbox seeder (apps/api/scripts/seed-synthetic-usage.ts) with NAMED export seedSyntheticOutbox + IIFE — Plan 05 Task 1 import dependency"
  - "Manual Stripe Customer Portal runbook (Q3 deferral fallback)"
affects: [08-03-quota-cost-cap, 08-04-drift-watcher, 08-05-launch-prep, 06-runtime]

# Tech tracking
tech-stack:
  added:
    - "stripe@^22.1.0 (apps/api Stripe SDK; Wave 1–2 fully mocked, Wave 3+ real)"
    - "@mcpgen/engine-fixtures (workspace dep on apps/api for synthetic-outbox seeding)"
    - "@mcpgen/infrastructure-stripe (new workspace package wrapping reference-only setup script so stripe SDK types resolve)"
  patterns:
    - "Hoisted vi.mock helper with per-test override hooks (setStripeMockOverrides) — Wave 3+ checkout/billing-portal tests will reuse the same shared helper"
    - "Webhook handler raw-body-first pattern: c.req.text() BEFORE constructEventAsync (T-8-04 mitigation)"
    - "subscription_events.stripe_event_id UNIQUE + onConflictDoNothing.returning() = idempotent webhook replay (T-8-05)"
    - "FOR UPDATE SKIP LOCKED claim semantics on usage_events_outbox + UNIQUE on idempotency_key (T-8-17 defense-in-depth)"
    - "Inngest 4.x triggers array form: createFunction({ id, triggers: [{cron: '* * * * *'}] }, handler) — replaces 3-arg form referenced in plan"
    - "Idempotent reference-only setup script (mirror of infrastructure/logto/scaffold.ts): try-retrieve / catch-resource_missing-create + lookup-key-deduped prices"
    - "Synthetic seeder dual-mode: NAMED export for E2E imports + process.argv[1] guarded IIFE for CLI direct-execution (replaces Bun-specific import.meta.main which TS does not type)"

key-files:
  created:
    - "apps/api/tests/_mocks/stripe.ts (shared vi.mock('stripe') helper)"
    - "apps/api/src/lib/stripe-client.ts (lazy Stripe SDK init, cached)"
    - "apps/api/src/routes/v1/stripe-webhook.ts (CTRL-06 webhook handler)"
    - "apps/api/src/inngest/functions/stripe-meters-emit.ts (CTRL-07 outbox poller)"
    - "apps/api/scripts/seed-synthetic-usage.ts (D-25 mitigation seeder)"
    - "apps/api/tests/stripe-webhook.test.ts (5 cases + Wave 3 gate)"
    - "apps/api/tests/inngest/stripe-meters-emit.test.ts (5 contract assertions + Wave 3 gate)"
    - "infrastructure/stripe/setup.ts (REFERENCE-ONLY idempotent setup script)"
    - "infrastructure/stripe/README.md (5-section docs mirroring infrastructure/logto/README.md)"
    - "infrastructure/stripe/package.json + tsconfig.json (workspace registration)"
    - "docs/runbooks/manual-customer-portal.md (Q3 deferral runbook)"
  modified:
    - "apps/api/package.json (+stripe@^22.1.0 +@mcpgen/engine-fixtures workspace dep)"
    - "apps/api/src/index.ts (mount /api/v1/stripe/webhook in PUBLIC layer; extend Bindings with STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET)"
    - "apps/api/src/inngest/functions/index.ts (push stripeMetersEmit onto functions array)"
    - "packages/contracts/package.json (add ./billing-types and ./inngest-functions to exports)"
    - "pnpm-workspace.yaml (add infrastructure/stripe)"
    - "pnpm-lock.yaml (regenerated for new deps)"

key-decisions:
  - "Inngest 4.x signature is createFunction({ id, triggers: [{ cron }] }, handler) — 2-arg, NOT the 3-arg form referenced in plan-text. Source: node_modules/.../InngestFunction.d.ts line 100 (Options.triggers). Plan-text deviation logged below."
  - "Synthetic seeder uses process.argv[1] guard, NOT Bun-specific `import.meta.main` (which TS lib in this project does not type). Tests import the named export without the IIFE side-effecting a DB insert."
  - "Webhook test uses minimal in-memory Drizzle mock (vi.mock('../src/db.js')) so Wave 2 tests run pure in-process without DATABASE_URL. Real Postgres ON CONFLICT semantics validated in Wave 3 integration block."
  - "Stripe outbox poller also REFRESHes usage_hourly MATERIALIZED VIEW each tick — closes the loop on Plan 01 deviation #1 (Neon TimescaleDB Apache cannot run continuous-aggregate refresh policies)."
  - "infrastructure/stripe registered as a workspace package so the reference script's `import Stripe from 'stripe'` resolves cleanly via pnpm hoisting; mirrors the workspace-package pattern but does NOT bake into Turbo build/test (typecheck-only via local script)."
  - "packages/contracts/package.json exports map extended with ./billing-types and ./inngest-functions (Rule 3 blocking — plan requires deep-import paths that were absent from the exports map after Plan 01)."

patterns-established:
  - "Hoisted setupStripeMock() / setStripeMockOverrides pair is the canonical pattern for any Stripe-touching test file (re-used by Wave 3 checkout, billing-portal, meters-list endpoints)."
  - "Webhook handlers always mount in PUBLIC layer BEFORE authMiddleware; signature verification IS the auth surface."
  - "Outbox-poller tests assert SQL contracts via static-source grep (FN_SRC.includes('FOR UPDATE SKIP LOCKED')) when concurrent-claim behavior cannot be exercised in pure in-process tests — promotes contract-shaped behavior to a check Wave 3 integration cannot bypass."
  - "Synthetic seeders must export NAMED async functions for downstream test importers AND retain a guarded IIFE for CLI direct-execution; the guard is process.argv[1] in TS-typed code, not Bun's import.meta.main."

requirements-completed: [CTRL-06, CTRL-07]

# Metrics
duration: ~12 min
completed: 2026-04-27
---

# Phase 8 Plan 02: Stripe Webhook + Outbox Poller (FULL MOCKED) Summary

**Stripe webhook handler with `constructEventAsync` + idempotent persistence + 5 dispatched event types in PUBLIC layer; `stripe-meters-emit-v1` Inngest cron with `FOR UPDATE SKIP LOCKED` outbox poller + `REFRESH MATERIALIZED VIEW usage_hourly`; reference-only idempotent Stripe setup script; synthetic outbox seeder; manual Customer Portal runbook (Q3 fallback). All Stripe SDK calls fully mocked via shared `vi.mock('stripe')` helper — CI runs without `STRIPE_SECRET_KEY`.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-04-27
- **Tasks:** 4/4
- **Files created:** 11
- **Files modified:** 6
- **Tests:** 36 pass + 2 skipped (Wave 3 integration gates) — Webhook 5+1 skip, Outbox 5+1 skip, plus 26 inherited from Plan 01

## Accomplishments

- Hoisted shared `setupStripeMock()` helper in `apps/api/tests/_mocks/stripe.ts` with per-test override hook (`setStripeMockOverrides`) — works across webhook, outbox, and (Wave 3+) checkout/billing-portal/meters-list tests; mocks `webhooks.constructEventAsync`, `checkout.sessions.create`, `billingPortal.sessions.create`, `billing.meterEvents.create`, `billing.meters.eventSummaries.list`, `products.{retrieve,create}`, `prices.{list,create}`.
- Lazy Stripe SDK helper (`apps/api/src/lib/stripe-client.ts`) caches the SDK at module level so the env var never appears in any log path; exposes `_resetStripeCacheForTesting` for re-mocking.
- `apps/api/src/routes/v1/stripe-webhook.ts` verbatim from plan + RESEARCH §6 D-08: `await c.req.text()` before any parse, `constructEventAsync` (async — Bun + CF Workers Web Crypto compat), `extractOrgId`, INSERT with `onConflictDoNothing({ target: subscription_events.stripe_event_id }).returning()`, replay → 200 `{duplicate:true}`, dispatch handler for `checkout.session.completed` / `customer.subscription.{created,updated,deleted}` / `invoice.payment_failed`, unhandled → ack 200 with persisted row, error path marks row `status='error'` and re-throws (Stripe retries non-2xx).
- Webhook mounted in `apps/api/src/index.ts` PUBLIC layer at `/api/v1/stripe/webhook` BEFORE `protectedApp` (line 50 vs line 65); Bindings extended with `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.
- `apps/api/src/inngest/functions/stripe-meters-emit.ts`: stable id `INNGEST_FUNCTION_IDS.STRIPE_METERS_EMIT` (`stripe-meters-emit-v1`); cron `* * * * *`; `claim-batch` step uses `FOR UPDATE SKIP LOCKED` + `LIMIT 100`; per-row `step.run('send-${row.id}', …)` calls `stripe.billing.meterEvents.create({ ..., identifier: row.idempotency_key })` then `UPDATE … SET sent_at = NOW() WHERE id = row.id`; final `refresh-usage-hourly` step closes the loop on Plan 01 deviation #1 (Neon TimescaleDB Apache cannot run continuous-aggregate policies).
- Synthetic outbox seeder (`apps/api/scripts/seed-synthetic-usage.ts`): NAMED `seedSyntheticOutbox(opts)` exported for Plan 05 Task 1 E2E import; `SYNTHETIC_DEPLOYMENT_ID` imported from `@mcpgen/contracts/billing-types` (no inline literal — single source of truth per B2/B3); reads from `@mcpgen/engine-fixtures` `ALL_FIXTURES` (5 APIs); idempotency key shape matches `STRIPE_METERS_KEY_REGEX` (deployment_id + minute_bucket + tool_name); UNIQUE conflicts skipped silently for re-run idempotency; CLI direct-execution preserved via `process.argv[1]` guard so test imports do NOT trigger DB inserts.
- `infrastructure/stripe/setup.ts` reference-only idempotent script (mirror of `infrastructure/logto/scaffold.ts`): `ensureProduct` does retrieve-then-create on stable IDs (`prod_mcpgen_pro`, `prod_mcpgen_free`), `ensurePrice` deduplicates via `lookup_keys`, `ensureMeter` lists then creates 3 meters (`mcpgen_evals`, `mcpgen_tool_calls`, `mcpgen_generations`); IDs printed to stdout, NEVER secrets.
- `infrastructure/stripe/README.md`: 5-section parity with `infrastructure/logto/README.md` (Status / Env-var contract / Reachability check / Wave-staged transition / Local-dev workflow).
- `infrastructure/stripe/package.json` + `tsconfig.json`: registered as workspace package so `import Stripe from 'stripe'` resolves cleanly for typecheck.
- `docs/runbooks/manual-customer-portal.md`: founder workflow for billing-change requests with `billingPortal.sessions.create` Bun one-liner; documents v1.0.1 upgrade trigger (churn > 5% OR > 5 manual requests/week); cites `RESEARCH §20 Q3` as deferral source.

## Task Commits

1. **Task 1: Stripe SDK + shared mock helper + setup script + README** — `184790c` (feat) — `stripe@^22.1.0` + `@mcpgen/engine-fixtures` workspace dep, `_mocks/stripe.ts`, `lib/stripe-client.ts`, `infrastructure/stripe/{setup.ts,README.md,package.json,tsconfig.json}`, `packages/contracts/package.json` exports extended.
2. **Task 2: Webhook handler + tests** — `c27bbbb` (feat) — `routes/v1/stripe-webhook.ts`, `index.ts` PUBLIC mount + Bindings, `tests/stripe-webhook.test.ts` (5 cases + integration gate).
3. **Task 3: Outbox poller + synthetic seeder + tests** — `2d78d79` (feat) — `inngest/functions/stripe-meters-emit.ts`, registered on functions barrel, `scripts/seed-synthetic-usage.ts`, `tests/inngest/stripe-meters-emit.test.ts` (5 contract assertions + integration gate).
4. **Task 4: Manual Customer Portal runbook** — `4d3ca04` (docs) — `docs/runbooks/manual-customer-portal.md`.

## Files Created/Modified

See frontmatter `key-files` for the full list.

## Decisions Made

- **Inngest 4.x `createFunction` signature is 2-arg, not 3-arg.** Plan-text RESEARCH §6 D-22 referenced `inngest.createFunction({ id }, { cron: ... }, handler)` — that signature does NOT exist in `inngest@4.2.4` (verified in `node_modules/.../InngestFunction.d.ts` line 100: `Options.triggers?: TTriggers`). Real signature is `createFunction({ id, triggers: [{ cron }] }, handler)`. Adopted the real form.
- **Webhook test uses in-memory `vi.mock('../src/db.js')` rather than gating on `DATABASE_URL_UNPOOLED`.** Plan-text Task 2 §4 listed (a) and (b) as alternatives; chose (a) because Wave 2's stated goal is "CI runs without Stripe credentials" — extending that to "CI runs without DB credentials" is the consistent posture. Real ON CONFLICT semantics validated by Wave 3 integration block under `RUN_STRIPE_INTEGRATION_TESTS=1` + `DATABASE_URL_UNPOOLED`.
- **Synthetic seeder IIFE guard uses `process.argv[1]`, not Bun's `import.meta.main`.** TS lib in this project does not type `import.meta.main` (Bun-only). `process.argv[1].endsWith('seed-synthetic-usage.{ts,js}')` is portable across Bun, tsx, and node, and ensures test imports do not trigger the IIFE → DB insert side effect. Both `bun run apps/api/scripts/seed-synthetic-usage.ts` and `import { seedSyntheticOutbox } from '...'` work as the plan acceptance requires.
- **`infrastructure/stripe/` registered as workspace package.** `infrastructure/logto/scaffold.ts` uses only `fetch` (no third-party deps), so its standalone tsconfig works. `infrastructure/stripe/setup.ts` imports the `stripe` SDK; the cleanest workspace-friendly resolution is to add `infrastructure/stripe` as a workspace package with its own `package.json` declaring `stripe@^22.1.0`. Adds NO Turbo build steps (typecheck-only via local script).
- **`packages/contracts/package.json` exports map extended with `./billing-types` and `./inngest-functions`.** Plan-text required `import { SYNTHETIC_DEPLOYMENT_ID } from '@mcpgen/contracts/billing-types'` (B2 acceptance). The exports map after Plan 01 only had `./db-schema`. Without the addition, the deep import would fail under strict subpath-export resolution. Treated as Rule 3 blocking — fixed inline.
- **Outbox poller also refreshes `usage_hourly` MATERIALIZED VIEW.** Plan 01's Wave-1 deviation #1 specified that the matview lives instead of a TimescaleDB continuous aggregate, and noted "Wave 2 stripe-meters-emit-v1 will REFRESH on cron tick." Honored that explicitly via a `refresh-usage-hourly` step.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Inngest `createFunction` 3-arg form does not exist in installed SDK**
- **Found during:** Task 3 (initial implementation per plan-text)
- **Issue:** Plan-text RESEARCH §6 D-22 used `inngest.createFunction({ id, ... }, { cron: '* * * * *' }, handler)` — the 3-arg form. `inngest@4.2.4` only exports the 2-arg form `createFunction(options, handler)` where `options.triggers` is an array of trigger objects.
- **Fix:** Switched to `createFunction({ id: INNGEST_FUNCTION_IDS.STRIPE_METERS_EMIT, triggers: [{ cron: '* * * * *' }] }, handler)`. Stable-ID + cron-string + handler-shape contract preserved.
- **Files modified:** `apps/api/src/inngest/functions/stripe-meters-emit.ts`.
- **Verification:** `pnpm --filter @mcpgen/api typecheck` passes; the test asserts `.opts.id === 'stripe-meters-emit-v1'`.
- **Committed in:** `2d78d79` (Task 3).

**2. [Rule 3 — Blocking] `@mcpgen/contracts/billing-types` deep import path was not in package exports map**
- **Found during:** Task 1 (planning the Task 3 import path)
- **Issue:** Plan acceptance for Task 3 mandates `import { SYNTHETIC_DEPLOYMENT_ID } from '@mcpgen/contracts/billing-types'` (B2 single-source-of-truth). The exports map only had `.`, `./generation-api`, `./usage-event`, `./launch-criteria`, `./idempotency`, `./db-schema`.
- **Fix:** Added `./billing-types` and `./inngest-functions` to `packages/contracts/package.json` exports.
- **Files modified:** `packages/contracts/package.json`.
- **Verification:** `pnpm --filter @mcpgen/api typecheck` passes; the import resolves correctly.
- **Committed in:** `184790c` (Task 1).

**3. [Rule 3 — Blocking] `infrastructure/stripe/setup.ts` could not resolve `stripe` SDK types**
- **Found during:** Task 1 (running `npx tsc --noEmit` on the new `infrastructure/stripe/tsconfig.json`)
- **Issue:** `infrastructure/logto/scaffold.ts` uses only `fetch` so its standalone tsconfig has no third-party deps. `infrastructure/stripe/setup.ts` imports the `stripe` SDK; without a `package.json` declaring the dep, TS could not resolve the module.
- **Fix:** Registered `infrastructure/stripe` as a workspace package with its own `package.json` declaring `stripe@^22.1.0` + `@types/node`; added it to `pnpm-workspace.yaml`.
- **Files modified:** `infrastructure/stripe/package.json` (new), `pnpm-workspace.yaml`.
- **Verification:** `cd infrastructure/stripe && npx tsc --noEmit -p tsconfig.json` exits 0.
- **Committed in:** `184790c` (Task 1).

**4. [Rule 1 — Bug] `Stripe.errors.StripeError` used as type, not value, in setup script**
- **Found during:** Task 1 (typecheck after stripe SDK install)
- **Issue:** `(err as Stripe.errors.StripeError).code` raised TS2749 — `Stripe.errors.StripeError` is a class (value), not a type alias.
- **Fix:** Replaced with structural cast `(err as { code?: string }).code === 'resource_missing'`.
- **Files modified:** `infrastructure/stripe/setup.ts`.
- **Verification:** Typecheck passes.
- **Committed in:** `184790c` (Task 1).

**5. [Rule 3 — Blocking] `import.meta.main` is Bun-only and TS-untyped in this project**
- **Found during:** Task 3 (synthetic seeder authoring)
- **Issue:** Plan-text used `if (import.meta.main)` to guard the IIFE. TS lib in this project (target `ES2023` + `module: ESNext`) does not type `import.meta.main` — it's a Bun-runtime extension. `tsc --noEmit` would have errored.
- **Fix:** Switched to `process.argv[1].endsWith('seed-synthetic-usage.{ts,js}')` guard — portable across Bun, tsx, and node; doesn't trigger on test-import.
- **Files modified:** `apps/api/scripts/seed-synthetic-usage.ts`.
- **Verification:** Typecheck passes; CLI direct-execution behavior preserved; test-import behavior preserved (no IIFE side-effect).
- **Committed in:** `2d78d79` (Task 3).

---

**Total deviations:** 5 auto-fixed (4 Rule 3 — blocking; 1 Rule 1 — bug). All discovered during typecheck/tests; none require user intervention.
**Impact on plan:** None substantive — all fixes preserve the plan's must-have truths and acceptance criteria. The Inngest signature change is the only deviation that downstream waves need to mirror (Plan 03 cost-cap-enforcer, Plan 04 drift-watcher will use the same 2-arg form). Logged in this SUMMARY for Plan 05 Task 2 to record in `08-PHASE-DEVIATIONS.md`.

## Issues Encountered

- pnpm peer-dependency warnings for React 19 vs Mintlify's React 18 expectation — pre-existing from Phase 1, not in scope.
- `Ignored build scripts` warnings from pnpm (esbuild, sharp, workerd, etc.) — pre-existing, no action needed.
- Inngest dev-server warning (`In cloud mode but no signing key found`) emitted from `tests/auth-mounting.test.ts > GET /api/inngest is mounted` — expected per Plan 01 Wave-1 setup (Phases 1–9 are local-only; Cloud signing key arrives in Phase 10).

## User Setup Required (for Wave 3)

Wave 3 will exercise the real Stripe sandbox. Before Wave 3 starts, the user must:

1. Create a Stripe sandbox account (or use an existing one).
2. Append to `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...   # captured from `stripe listen` in step 4
   ```
3. Run `bun run infrastructure/stripe/setup.ts` once to create products / Pro price / 3 meters; paste the printed IDs into `.env.local`.
4. In a second terminal during dev: `stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook` — capture the `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.
5. Trigger test events via `stripe trigger checkout.session.completed` (etc.) to verify the webhook handler end-to-end.

## Next Phase Readiness

- **Wave 3 (Plan 08-03 — Quota + cost cap):** Can `import { stripeMetersEmit } from './inngest/functions/stripe-meters-emit.js'` (already on functions barrel) and add `costCapEnforcer` + `quotaPeriodRollover` next to it. Will use the same hoisted `setupStripeMock()` for tests.
- **Wave 4 (Plan 08-04 — Drift Watcher):** Can use `getStripe(env)` for any Stripe-touching helper (drift email digest billing); `_mocks/stripe.ts` covers `billingPortal.sessions.create` and `meters.eventSummaries.list` for reconciliation cron.
- **Plan 05 Task 1 (E2E test):** Can `import { seedSyntheticOutbox } from '../scripts/seed-synthetic-usage.js'`; pass `SYNTHETIC_DEPLOYMENT_ID` from `@mcpgen/contracts/billing-types` and the test's `tenantOrgId`. The IIFE will not fire under vitest because `process.argv[1]` will not end with `seed-synthetic-usage.{ts,js}`.
- **Plan 05 Task 2 (08-PHASE-DEVIATIONS.md):** Must record the 5 Wave 2 deviations (Inngest 2-arg signature; contracts exports map extension; infrastructure/stripe workspace registration; Stripe.errors.StripeError type→value cast; process.argv[1] guard for synthetic seeder).
- **Engine workstream:** No cross-cutting impact — engine never imports `apps/api/src/routes/v1/stripe-webhook.ts` or the outbox poller.

## Self-Check: PASSED

All 11 created files exist on disk; all 4 task commits exist in `git log`:

- `184790c` Task 1 (Stripe SDK + mock helper + setup script + README)
- `c27bbbb` Task 2 (webhook handler + tests)
- `2d78d79` Task 3 (outbox poller + seeder + tests)
- `4d3ca04` Task 4 (Customer Portal runbook)

Final verification commands all green:
- `pnpm --filter @mcpgen/api typecheck` — OK
- `pnpm --filter @mcpgen/api test` — 36/36 pass + 2 skipped
- `cd infrastructure/stripe && npx tsc --noEmit -p tsconfig.json` — OK
- `git diff packages/contracts/src/launch-criteria.ts` — empty (untouched, owned by Plan 03)
- `git diff packages/contracts/src/generation-api.ts` — empty (untouched, owned by Plan 03)
- `git diff packages/contracts/src/db-schema.ts` — empty (untouched, owned by Plan 01)
- `grep -n "stripe/webhook\|protectedApp" apps/api/src/index.ts` — webhook mount line 50 < protectedApp line 65 (PUBLIC layer order verified)
- All 4 threats grep-verifiable: T-8-04 (`constructEventAsync` + `c.req.text()`), T-8-05 (`onConflictDoNothing` + `duplicate: true`), T-8-17 (`FOR UPDATE SKIP LOCKED`), T-8-18 (`STRIPE_SECRET_KEY` only `process.env`-read in setup.ts, never logged)

---
*Phase: 08-auth-billing*
*Plan: 02*
*Completed: 2026-04-27*
