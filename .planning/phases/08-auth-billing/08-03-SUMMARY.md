---
phase: 08-auth-billing
plan: 03
subsystem: billing, quota, cost-cap, inngest
tags: [stripe, checkout, billing-portal, quota, cost-cap, sse-callback, m2m, inngest, vitest, paired-decision]

# Dependency graph
requires:
  - phase: 08-auth-billing
    plan: 01
    provides: "INNGEST_FUNCTION_IDS register; auth + requireM2M middleware; usage_hourly MATERIALIZED VIEW; engine-internal-api Zod schemas; QUOTA_LIMITS map; SYNTHETIC_DEPLOYMENT_ID seed; 5-layer Hono mounting; db.ts client"
  - phase: 08-auth-billing
    plan: 02
    provides: "stripe-meters-emit-v1 Inngest cron; shared vi.mock('stripe') helper (setupStripeMock + setStripeMockOverrides); webhook handler in PUBLIC layer; subscription_events idempotent persistence; usage_events_outbox seeder + named export; Inngest 4.x 2-arg createFunction signature pattern"
provides:
  - "LAUNCH_CRITERIA.COST_CAP_FREE_USD = 0.50 + COST_CAP_PRO_USD = 2.00 (Phase 8 D-13) with paired-decision file accepted by pre-commit hook"
  - "PartialResultCost discriminated-union in generation-api.ts (additive, preserves existing partial_result field)"
  - "billing-types.ts extended: SubscriptionStatus / BillingEventType / Checkout + Portal request-response Zod / DeploymentDriftPatchRequest / QuotaExceededResponse"
  - "quota.ts checkQuota helper (PAYG never blocks; anniversary-based reset_at; QUOTA_LIMITS-driven)"
  - "middleware/quota.ts quotaGate(eventType) factory returning 429 + QuotaExceededResponse on exceed"
  - "quota-period-rollover-v1 hourly Inngest cron (anniversary-based, NOT calendar month — T-8-20 mitigation)"
  - "POST /api/v1/billing/checkout (Stripe-hosted Checkout Session; M2M rejected with 403; org_id derived from auth — T-8-06 IDOR mitigation)"
  - "POST /api/v1/billing/portal (Stripe Billing Portal Session for orgs with stripe_customer_id; Q3 limited integration; M2M rejected with 403)"
  - "POST /internal/v1/sse-callback (M2M-protected; persists to pending_callbacks; emits 'generation/cost.updated' Inngest event on cost-update partial-result — T-8-07 mitigation)"
  - "POST /internal/v1/cancel-generation (M2M-protected; CancelGenerationRequest Zod-validated body; marks generations.status='cancelled' — T-8-08 mitigation)"
  - "cost-cap-enforcer-v1 Inngest function (event-triggered; concurrency limit 1 keyed on event.data.jobId — T-8-19 race mitigation; LAUNCH_CRITERIA.COST_CAP_{FREE,PRO}_USD-driven thresholds; PAYG short-circuits; M2M-Bearer cancel call to engine; emit billable usage_events_outbox row with SYNTHETIC_DEPLOYMENT_ID single-source-of-truth)"
  - "Wave 3 README expansion (3-terminal startup + Stripe sandbox prerequisites + stripe trigger verification + synthetic cost-cap smoke test)"
  - "docs/runbooks/stripe-local-dev.md thin pointer (avoids duplication)"
  - "engine cooperative-abort follow-up filed at .planning/todos/pending/engine-cooperative-abort.md (Phase 5 acceptance gate)"
affects: [08-04-drift-watcher, 08-05-launch-prep, 02-engine, 06-runtime]

# Tech tracking
tech-stack:
  added:
    - "(none — all deps pre-existing from Plan 01/02: stripe@^22.1.0, inngest@^4.2.4, jose@^6.2.2, drizzle-orm, zod)"
  patterns:
    - "Conditional spread for exactOptionalPropertyTypes — stripe.checkout.sessions.create rejects `undefined` keys; build {customer} OR {customer_email} object then merge into base params"
    - "Static-source contract assertions (readFileSync + .toContain) for Inngest function shape — same pattern as Plan 02 stripe-meters-emit"
    - "Synthetic JWT mode toggle via globalThis.__authMode in jose mock (per-test user vs M2M switch without re-mounting the mock)"
    - "Drizzle raw-SQL JOIN for plan_tier lookup in cost-cap-enforcer (no Drizzle relations declared yet — query.with-shape would require packages/contracts/src/db-relations.ts)"
    - "Wave 3 commit-1 commits both packages/contracts/src/launch-criteria.ts AND docs/decisions/2026-04-26-cost-cap-thresholds.md in the SAME commit so the launch-criteria-paired-decision pre-commit hook accepts (no --no-verify; hook regex requires date-prefix `^docs/decisions/[0-9]{4}-[0-9]{2}-[0-9]{2}-.+\\.md$`)"

key-files:
  created:
    - "docs/decisions/2026-04-26-cost-cap-thresholds.md (paired with launch-criteria.ts edit; pre-commit-hook-enforced)"
    - "apps/api/src/lib/quota-queries.ts (TimescaleDB usage_hourly 4-table JOIN)"
    - "apps/api/src/lib/quota.ts (checkQuota helper; PAYG branch; anniversary +1mo)"
    - "apps/api/src/middleware/quota.ts (quotaGate factory)"
    - "apps/api/src/inngest/functions/quota-period-rollover.ts (hourly cron)"
    - "apps/api/src/inngest/functions/cost-cap-enforcer.ts (event-triggered; concurrency-key serialization)"
    - "apps/api/src/routes/v1/billing/checkout.ts (Stripe-hosted Checkout)"
    - "apps/api/src/routes/v1/billing/portal.ts (Q3 limited Customer Portal)"
    - "apps/api/src/routes/internal/v1/sse-callback.ts (M2M cost-update ingest)"
    - "apps/api/src/routes/internal/v1/cancel-generation.ts (M2M generation cancel)"
    - "apps/api/tests/quota.test.ts (8 static + DB-gated integration)"
    - "apps/api/tests/inngest/quota-period-rollover.test.ts (4 contract assertions)"
    - "apps/api/tests/inngest/cost-cap-enforcer.test.ts (9 contract assertions)"
    - "apps/api/tests/billing/checkout.test.ts (3 cases: 401, 403 M2M, 200)"
    - "docs/runbooks/stripe-local-dev.md (thin pointer)"
    - ".planning/todos/pending/engine-cooperative-abort.md (Phase 5 follow-up)"
  modified:
    - "packages/contracts/src/launch-criteria.ts (+ COST_CAP_FREE_USD + COST_CAP_PRO_USD)"
    - "packages/contracts/src/generation-api.ts (+ PartialResultCost + PartialResult discriminated union)"
    - "packages/contracts/src/billing-types.ts (+ 6 Zod schemas extending the Wave-1 SYNTHETIC_DEPLOYMENT_ID seed)"
    - "packages/contracts/tests/launch-criteria.test.ts (+ 4 cases for cost-cap constants + cross-doc consistency vs CLAUDE.md / mcpgen-architecture.md)"
    - "apps/api/src/inngest/functions/index.ts (+ quotaPeriodRollover + costCapEnforcer)"
    - "apps/api/src/index.ts (+ 4 route mounts: 2 protectedApp billing/* + 2 internalApp; + 4 new Bindings: STRIPE_PRICE_PRO, ENGINE_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET)"
    - "apps/api/README.md (+ Wave 3 prerequisites + verification + cost-cap smoke sections)"

key-decisions:
  - "Inngest 4.x 2-arg createFunction signature carried over from Plan 02 deviation #1 (createFunction({ id, triggers: [...] }, handler)); applied to BOTH new functions (quota-period-rollover with cron trigger and cost-cap-enforcer with event trigger). RESEARCH §12 plan-text used the 3-arg form for cost-cap-enforcer; the 3-arg form does NOT exist in inngest@4.2.4."
  - "exactOptionalPropertyTypes: true forces conditional spread in checkout.ts: `stripe.checkout.sessions.create(...)` rejects `undefined` for `customer` / `customer_email`. Built customerParams object conditionally then merged with baseParams via spread. Plan-text used `org.stripe_customer_id ?? undefined` which would have failed typecheck."
  - "cost-cap-enforcer uses raw SQL JOIN (drizzle sql template) to look up plan_tier through generations → projects → organizations rather than `db.query.generations.findFirst({ with: { project: { with: { organization: true }}}})`. Drizzle relations are NOT declared in packages/contracts/src/db-schema.ts; using `with` would have required adding a db-relations.ts file. Static SQL query achieves the same outcome with no schema-package edits."
  - "quotaPeriodRollover and costCapEnforcer both registered on apps/api/src/inngest/functions/index.ts barrel — ordered alphabetically by ID NOT enforced (waves push in landing order); Phase 9 orphan audit walks the array regardless."
  - "checkout.test.ts uses a globalThis.__authMode toggle to switch the jose mock between user JWT (audience=LOGTO_BASE_URL, organization_id claim set) and M2M JWT (audience=LOGTO_M2M_RESOURCE_INDICATOR) per-test — avoids re-mounting the vi.mock('jose') between cases."
  - "Cross-doc consistency assertion in tests/launch-criteria.test.ts now reads BOTH CLAUDE.md AND docs/mcpgen-architecture.md for the literal phrase `cost cap $0.50 free / $2.00 pro` — doc drift fails before CI."

patterns-established:
  - "Conditional-spread pattern for Stripe SDK params under exactOptionalPropertyTypes (re-usable by Wave 4 drift email Resend client and any future Stripe call with optional fields)."
  - "Static-source contract assertions for event-triggered Inngest functions (same shape as cron-triggered functions from Plan 02; no live Inngest dev server required for unit tests)."
  - "globalThis.__authMode toggle for jose mock (re-usable across any test that needs to exercise both user and M2M paths through the same Hono app instance)."
  - "Raw SQL JOIN in Inngest step.run for cross-table lookups when Drizzle relations are not declared (alternative to introducing db-relations.ts mid-phase)."
  - "Paired-decision commit pattern: launch-criteria.ts edit + same-commit `docs/decisions/<YYYY-MM-DD>-<slug>.md` triggers the hook to PASS (verified live in commit 4c4739c — no --no-verify needed)."

requirements-completed: [CTRL-06, CTRL-07]

# Metrics
duration: ~30 min
completed: 2026-04-27
---

# Phase 8 Plan 03: Quota + Cost Cap + Stripe Checkout/Portal + SSE Callback Summary

**Wave 3 lands the cost-cap + quota enforcement loop end-to-end on the BFF half: launch-criteria.ts gains COST_CAP_FREE_USD=$0.50 / COST_CAP_PRO_USD=$2.00 (paired-decision file accepted by the pre-commit hook); generation-api.ts adds the PartialResultCost discriminated-union; billing-types.ts gets the Wave-3 Zod schemas; quota.ts/middleware/quota.ts read the usage_hourly MATERIALIZED VIEW (per Pitfall #16 real-time quota truth); quota-period-rollover-v1 hourly cron rolls anniversary-based periods (T-8-20 mitigation); /api/v1/billing/{checkout,portal} create Stripe-hosted sessions; /internal/v1/{sse-callback,cancel-generation} are M2M-protected (T-8-07 / T-8-08); cost-cap-enforcer-v1 serializes per-job (concurrency key 'event.data.jobId' — T-8-19), reads thresholds from LAUNCH_CRITERIA, fires M2M cancel to engine, marks generations.status='cost_capped', and emits a billable usage_events_outbox row keyed on SYNTHETIC_DEPLOYMENT_ID (B2 single-source-of-truth import). Engine cooperative-abort filed for Phase 5 follow-up.**

## Performance

- **Duration:** ~30 min (interactive execution)
- **Completed:** 2026-04-27
- **Tasks:** 4/4
- **Files created:** 16
- **Files modified:** 6
- **Tests:** 59 pass + 3 skipped (was 47 pass + 3 skipped after Plan 02). Contracts: 75 pass (was 71).

## Accomplishments

- **Paired-decision commit (Task 1, commit `4c4739c`):** `packages/contracts/src/launch-criteria.ts` extended with `COST_CAP_FREE_USD=0.50` + `COST_CAP_PRO_USD=2.00`. The pre-commit hook `.pre-commit-hooks/launch-criteria-paired-decision.sh` accepted the commit because `docs/decisions/2026-04-26-cost-cap-thresholds.md` was in the SAME commit and matches the date-prefix regex `^docs/decisions/[0-9]{4}-[0-9]{2}-[0-9]{2}-.+\.md$`. NO `--no-verify` used for this commit. Hook explicitly logged `Passed`.
- **Generation-api SSE envelope extended:** added `PartialResultCost` Zod object + `PartialResult` discriminated union; the pre-existing `partial_result: z.record(...).optional()` field is preserved (additive, not breaking).
- **billing-types.ts upgraded** from a 1-constant Wave-1 seed to the full Phase 8 billing-surface schema set: SubscriptionStatus / BillingEventType / Checkout request+response / Billing Portal request+response / DeploymentDriftPatchRequest / QuotaExceededResponse.
- **Quota helper + middleware + cron (Task 2, commit `f0908db`):** `apps/api/src/lib/quota-queries.ts` runs the verbatim RESEARCH §11 SQL (4-table FK JOIN against the usage_hourly matview); `apps/api/src/lib/quota.ts` returns `{ok, used, limit, reset_at}` (PAYG short-circuits with `limit: Infinity`); `apps/api/src/middleware/quota.ts` returns 429 with `QuotaExceededResponse` on exceed; `apps/api/src/inngest/functions/quota-period-rollover.ts` runs the single SQL UPDATE hourly (`INTERVAL '1 month'` + `NOW()` against `quota_period_start`).
- **Stripe Checkout + Billing Portal routes (Task 3, commit `c1a9a5a`):** `apps/api/src/routes/v1/billing/checkout.ts` creates Stripe-hosted Checkout Session (M2M tokens 403'd; org_id derived from auth — T-8-06 mitigation); `apps/api/src/routes/v1/billing/portal.ts` creates Billing Portal Session for orgs with `stripe_customer_id`. Routes mounted on `protectedApp`.
- **M2M internal routes:** `apps/api/src/routes/internal/v1/sse-callback.ts` ingests engine→BFF SSE callbacks, persists to `pending_callbacks`, emits `generation/cost.updated` Inngest events on cost-update partial-results (T-8-07 mitigation). `apps/api/src/routes/internal/v1/cancel-generation.ts` accepts engine self-abort acks, validates body via `CancelGenerationRequest.safeParse`, marks `generations.status='cancelled'` (T-8-08 mitigation). Both mounted on `internalApp` (the Wave 1 sub-app already applies `authMiddleware + requireM2M`).
- **Cost-cap-enforcer Inngest function (Task 3):** stable ID `INNGEST_FUNCTION_IDS.COST_CAP_ENFORCER`; concurrency `{ limit: 1, key: 'event.data.jobId' }` (T-8-19 race mitigation); 6 step.run blocks (persist-cost / lookup-org via raw SQL JOIN / threshold-check / cancel-engine via M2M Bearer to `${ENGINE_ENDPOINT}/internal/v1/cancel-generation` / mark-cost-capped / emit-billable-event); reads thresholds from `LAUNCH_CRITERIA.COST_CAP_{FREE,PRO}_USD`; PAYG short-circuits; emits a billable `usage_events_outbox` row keyed on `${jobId}_cost_capped` with `deployment_id: SYNTHETIC_DEPLOYMENT_ID` imported from `@mcpgen/contracts/billing-types` (B2 — same constant Plan 02 seeder uses; eliminates inline-literal UUID drift).
- **Bindings extended in `apps/api/src/index.ts`:** `STRIPE_PRICE_PRO`, `ENGINE_ENDPOINT`, `LOGTO_M2M_APP_ID`, `LOGTO_M2M_APP_SECRET` (LOGTO_M2M_RESOURCE_INDICATOR already from Wave 1).
- **Inngest functions barrel (Phase 9 orphan-audit input):** now registers all 3 Wave-2+3 functions: `stripeMetersEmit`, `quotaPeriodRollover`, `costCapEnforcer`.
- **Tests:** 12 new tests across 4 files. `tests/quota.test.ts` (7 static + 1 DB-gated integration shell). `tests/inngest/quota-period-rollover.test.ts` (4: stable ID, register import, INTERVAL/NOW, hourly cron). `tests/inngest/cost-cap-enforcer.test.ts` (9: stable ID, register import, concurrency key, event trigger, LAUNCH_CRITERIA wiring, PAYG branch, cancel-engine call shape, SYNTHETIC_DEPLOYMENT_ID single-source-of-truth + regression-protect inline literal, usage_events_outbox emit). `tests/billing/checkout.test.ts` (3: 401 no-auth, 403 M2M, 200 with mocked Stripe). 4 new contract tests in `tests/launch-criteria.test.ts` (2 constant-value + 2 cross-doc consistency).
- **Wave 3 docs (Task 4, commit `db2ed21`):** `apps/api/README.md` extended with Stripe sandbox prerequisites, `stripe trigger` + replay verification commands, and a synthetic curl-against-Inngest-dev-server cost-cap smoke test that fires the enforcer end-to-end without engine running. `docs/runbooks/stripe-local-dev.md` is a thin discoverable pointer (avoids duplicating apps/api/README.md + infrastructure/stripe/README.md content).
- **Engine cooperative-abort follow-up filed:** `.planning/todos/pending/engine-cooperative-abort.md` (B5 standardized filename; Plan 05 references this exact path) documents the Phase 5 acceptance gate ("engine cancel signal aborts current pass within 5s of receipt") + soft-cap behavior until cooperative abort lands (typical overage <$0.10/gen; bounded by Pass-2 per-tool parallelism).

## Task Commits

1. **Task 1: cost-cap thresholds + PartialResultCost + billing-types Zod** — `4c4739c` (feat) — extends 3 contract files + creates the paired-decision file in the same commit; pre-commit hook explicitly accepted (logged `launch-criteria changes need decision log: Passed`).
2. **Task 2: quota check + middleware + period-rollover Inngest cron** — `f0908db` (feat) — 4 new BFF source files (quota.ts, quota-queries.ts, middleware/quota.ts, inngest/quota-period-rollover.ts) + 2 new test files + barrel registration. Tests: 47 pass + 3 skipped (was 36 + 2).
3. **Task 3: Stripe Checkout/Portal routes + sse-callback (M2M) + cancel-generation (M2M) + cost-cap-enforcer** — `c1a9a5a` (feat) — 5 new route/function files + 2 new test files + index.ts mount + Bindings extension + barrel registration. Tests: 59 pass + 3 skipped (was 47 + 3).
4. **Task 4: Wave 3 docs + engine cooperative-abort follow-up** — `db2ed21` (docs) — apps/api/README.md expansion + thin runbook pointer + Phase 5 acceptance-gate todo file.

## Files Created/Modified

See frontmatter `key-files` for the full list.

## Decisions Made

- **Inngest 4.x 2-arg createFunction (carry-forward).** Plan-text RESEARCH §12 used the 3-arg form `inngest.createFunction({ id, ... }, { event: '...' }, handler)` for cost-cap-enforcer. inngest@4.2.4 `Options.triggers` is the canonical declaration site (verified in node_modules type defs); applied 2-arg form to BOTH quota-period-rollover (cron trigger) and cost-cap-enforcer (event trigger). Mirrors Plan 02 deviation #1.
- **Conditional-spread for Stripe SDK params.** TypeScript's `exactOptionalPropertyTypes: true` rejects `customer: undefined`. Built `customerParams` object conditionally (`{customer}` if `stripe_customer_id`, else `{customer_email}` if user.email, else `{}`) and spread into `baseParams`. Cleaner than `as any` cast and preserves type safety.
- **Raw SQL JOIN in cost-cap-enforcer for plan_tier lookup.** RESEARCH §12 plan-text used Drizzle's `query.generations.findFirst({ with: { project: { with: { organization: true }}}})`. Drizzle relations are NOT declared in `packages/contracts/src/db-schema.ts`; using `with` would have required introducing `db-relations.ts`. Used `db.execute(sql\`SELECT o.plan_tier FROM generations g JOIN projects p ... JOIN organizations o ...\`)` instead — same outcome, no schema-package edits.
- **`globalThis.__authMode` toggle for jose mock (in checkout.test.ts).** Switches the jose mock's `jwtVerify` return value between user JWT (audience=LOGTO_BASE_URL, with `organization_id` claim) and M2M JWT (audience=LOGTO_M2M_RESOURCE_INDICATOR) per-test. Avoids re-mounting the vi.mock between cases.
- **Cross-doc consistency assertion now reads architecture.md too.** `tests/launch-criteria.test.ts` extended to assert the literal phrase `cost cap $0.50 free / $2.00 pro` exists in BOTH `CLAUDE.md` and `docs/mcpgen-architecture.md`. Doc drift fails before CI (single-edit-multi-file invariant).
- **Worktree base reset to `81f5ccf`.** The worktree branch was created at `f2f4621` (Phase 1 complete) per the parent agent spawn; `81f5ccf` was the actual Plan 03 base (Plans 01+02 merged on `feature/auth-billing`). Performed `git reset --hard 81f5ccf` per the worktree-branch-check directive (safe — fresh worktree).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan-text Inngest createFunction 3-arg form does not exist in inngest@4.2.4**
- **Found during:** Task 3 (cost-cap-enforcer authoring against RESEARCH §12 verbatim text)
- **Issue:** RESEARCH §12 used `inngest.createFunction({ id, concurrency }, { event: '...' }, handler)`. inngest@4.2.4 only has the 2-arg form (Plan 02 deviation #1).
- **Fix:** Used `inngest.createFunction({ id, concurrency, triggers: [{ event: 'generation/cost.updated' }] }, handler)`. Same outcome.
- **Files modified:** `apps/api/src/inngest/functions/cost-cap-enforcer.ts`.
- **Verification:** `pnpm --filter @mcpgen/api typecheck` clean; cost-cap-enforcer.test.ts asserts `triggers` array contains the event.
- **Committed in:** `c1a9a5a` (Task 3).

**2. [Rule 1 — Bug] checkout.ts plan-text used `customer: org.stripe_customer_id ?? undefined` which fails under exactOptionalPropertyTypes: true**
- **Found during:** Task 3 first typecheck after creating checkout.ts
- **Issue:** Stripe SDK params reject `undefined` values explicitly: `Type 'string | undefined' is not assignable to type 'string'`.
- **Fix:** Conditional-spread pattern — built `customerParams` object containing exactly `{customer}` OR `{customer_email}` OR `{}` then merged with `baseParams` via spread. Stripe SDK accepts the resulting object.
- **Files modified:** `apps/api/src/routes/v1/billing/checkout.ts`.
- **Verification:** `pnpm --filter @mcpgen/api typecheck` clean.
- **Committed in:** `c1a9a5a` (Task 3).

**3. [Rule 3 — Blocking] Plan-text used Drizzle `with: { project: { with: { organization: true }}}` for plan_tier lookup but Drizzle relations are not declared**
- **Found during:** Task 3 cost-cap-enforcer authoring
- **Issue:** `packages/contracts/src/db-schema.ts` declares the tables but NO `relations(...)` exports. `query.generations.findFirst({ with: ... })` would error at runtime.
- **Fix:** Replaced with raw SQL JOIN using drizzle's `sql` template tag inside `step.run('lookup-org', ...)`. Same outcome (returns `plan_tier` string), no schema-package edits.
- **Files modified:** `apps/api/src/inngest/functions/cost-cap-enforcer.ts`.
- **Verification:** Static-source assertion in cost-cap-enforcer.test.ts asserts `'JOIN projects'` etc. is present; typecheck clean.
- **Committed in:** `c1a9a5a` (Task 3).

**4. [Rule 3 — Blocking] `.planning/todos/pending/` directory did not exist**
- **Found during:** Task 4 (filing the engine cooperative-abort follow-up)
- **Issue:** The plan must-haves require the file at `.planning/todos/pending/engine-cooperative-abort.md` (B5 standardized path). Parent dirs absent.
- **Fix:** `mkdir -p .planning/todos/pending` before writing the file.
- **Files created:** `.planning/todos/pending/engine-cooperative-abort.md` + parent dirs.
- **Verification:** `test -f .planning/todos/pending/engine-cooperative-abort.md` exits 0.
- **Committed in:** `db2ed21` (Task 4).

---

**Total deviations:** 4 auto-fixed (3 Rule 3 — blocking; 1 Rule 1 — bug). All discovered during typecheck/tests; none require user intervention. None substantive — all fixes preserve plan must-have truths and acceptance criteria.

**Impact on plan:** None. The Inngest 2-arg signature now uniform across all 3 Wave-2+3 functions. The conditional-spread pattern in checkout.ts is reusable for any Wave 4+ Stripe call. The raw-SQL JOIN in cost-cap-enforcer is a candidate for promotion to a `db-relations.ts` file if Plan 04 / Plan 05 adds more cross-table lookups (track in Plan 05 Task 2 PHASE-DEVIATIONS).

## Issues Encountered

- pnpm peer-dependency warnings for React 19 vs Mintlify's React 18 expectation in `apps/docs` — pre-existing from Phase 1, not in scope.
- `Ignored build scripts` warnings from pnpm (esbuild, sharp, workerd, etc.) — pre-existing, no action needed.
- Inngest dev-server warning (`In cloud mode but no signing key found`) emitted from `tests/auth-mounting.test.ts > GET /api/inngest is mounted` — expected per Plan 01 Wave-1 setup (Phases 1–9 are local-only; Cloud signing key arrives in Phase 10).

## User Setup Required (Wave 3)

The user has already provided the Stripe sandbox credentials in `/Users/igor/Projects/mcpgen/.env.local`:
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `STRIPE_PRODUCT_FREE` / `STRIPE_PRODUCT_PRO` / `STRIPE_PRICE_PRO`
- `STRIPE_METER_EVALS_ID` / `STRIPE_METER_TOOL_CALLS_ID` / `STRIPE_METER_GENERATIONS_ID`

For end-to-end Wave 3 manual smoke (NOT required for plan acceptance — covered by static-source contract assertions and mocked-Stripe unit tests):
1. **Terminal 1:** `bun run apps/api/src/index.ts` (BFF on :8787)
2. **Terminal 2:** `pnpm --filter @mcpgen/api dev:inngest` (Inngest dev on :8288)
3. **Terminal 3:** `stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook` (already running per user setup)
4. **Terminal 4:** `stripe trigger customer.subscription.created` → check `subscription_events` for `status='processed'`.
5. **Synthetic cost-cap smoke** (against the Inngest dev server — apps/api/README.md "Wave 3 cost-cap smoke test"):
   ```bash
   curl -X POST http://localhost:8288/e/synthetic-cost-update \
     -H 'Content-Type: application/json' \
     -d '{"name":"generation/cost.updated","data":{"jobId":"gen_synth_1","passName":"pass_1","cumulativeCostUsd":0.75}}'
   ```
   Expected: cost-cap-enforcer fires (0.75 > Free cap 0.50); attempts to call `${ENGINE_ENDPOINT}/internal/v1/cancel-generation` (will fail with engine-not-running error — expected); generation row marked `status='cost_capped'`; `usage_events_outbox` gets a `generation_cost_capped` row.

## Threats Mitigated

| Threat ID | Component | Mitigation Status |
|-----------|-----------|------------------|
| T-8-06 | `routes/v1/billing/checkout.ts` IDOR via crafted org_id | ✅ M2M tokens 403'd; org_id derived from `c.var.auth.organizationId` (not body). Test: checkout.test.ts "rejects M2M token with 403". |
| T-8-07 | `inngest/functions/cost-cap-enforcer.ts` SSE event spoofing | ✅ `/internal/v1/sse-callback` mounted under `internalApp` (Wave 1 `authMiddleware + requireM2M`). Only valid M2M JWT can emit Inngest events. |
| T-8-08 | `routes/internal/v1/cancel-generation.ts` cancel-endpoint auth bypass | ✅ Mounted under `internalApp` with `requireM2M`. CancelGenerationRequest Zod-validated body. Wave 1 auth-mounting.test.ts already covers the M2M gate; Wave 3 mount preserves the chain. |
| T-8-19 | `inngest/functions/cost-cap-enforcer.ts` race condition (two simultaneous cost events) | ✅ `concurrency: { limit: 1, key: 'event.data.jobId' }` serializes per-generation processing. Threshold check runs after persist-cost step; second event sees consistent state. Test: cost-cap-enforcer.test.ts "configures concurrency limit 1 keyed on event.data.jobId". |
| T-8-20 | `middleware/quota.ts` period-rollover boundary attack | ✅ Anniversary-based `quota_period_start` (NOT calendar month) reduces boundary surface to 12 events/year/org. `quota-period-rollover-v1` cron runs hourly with single SQL UPDATE (atomic). PAYG never blocks (defense-in-depth). 30-min matview refresh lag documented per RESEARCH §11. Test: quota-period-rollover.test.ts "INTERVAL '1 month' + NOW()". |

## Next Phase Readiness

- **Wave 4 (Plan 08-04 — Drift Watcher):** Can `import { DeploymentDriftPatchRequest } from '@mcpgen/contracts'` for the PATCH `/api/v1/deployments/:id` body. Can use the `quotaGate('generation')` middleware on the auto-regenerate endpoint per D-19/D-20. Will use the same hoisted `setupStripeMock()` for any Stripe-touching helper (e.g. drift-email digest billing).
- **Wave 5 (Plan 08-05 — Launch Prep):** Will record this Plan's deviations (Inngest 2-arg uniform, conditional-spread pattern, raw SQL JOIN over Drizzle relations, `.planning/todos/pending/` directory creation) in `08-PHASE-DEVIATIONS.md` Task 2. Can re-use the static-source contract-assertion pattern for any new Inngest function added in Wave 4 (`drift-watcher-v1`, `drift-watcher-check-v1`, `usage-reconciler-v1`, `logto-mau-watch-v1`).
- **Engine workstream (Phase 5 acceptance gate):** Must implement cooperative abort per `.planning/todos/pending/engine-cooperative-abort.md`. Until then, the cost cap is a soft cap (typical overage <$0.10/gen).

## Self-Check: PASSED

All 16 created files exist on disk; all 4 task commits exist in `git log`:
- `4c4739c` Task 1 (cost-cap thresholds + PartialResultCost + billing-types Zod)
- `f0908db` Task 2 (quota helper + middleware + quota-period-rollover Inngest)
- `c1a9a5a` Task 3 (Checkout/Portal routes + sse-callback + cancel-generation + cost-cap-enforcer)
- `db2ed21` Task 4 (Wave 3 docs + engine cooperative-abort follow-up)

Final verification commands all green:
- `pnpm --filter @mcpgen/contracts typecheck` — OK
- `pnpm --filter @mcpgen/contracts test` — 75 pass (was 71)
- `pnpm --filter @mcpgen/api typecheck` — OK
- `pnpm --filter @mcpgen/api test` — 59 pass + 3 skipped (was 47 + 3)
- Pre-commit hook accepted Task 1 commit (paired-decision file matched the date-prefix regex)
- `git diff packages/contracts/src/launch-criteria.ts | grep COST_CAP` shows exactly 2 added constants
- `grep -E "checkoutRoute|sseCallbackRoute|cancelGenerationRoute|portalRoute" apps/api/src/index.ts` returns 8 lines (4 imports + 4 mounts)
- All 5 threats T-8-06..T-8-08 + T-8-19..T-8-20 grep-verifiable in source

**STATE.md / ROADMAP.md NOT modified** — orchestrator owns those per parent-agent directive.

---
*Phase: 08-auth-billing*
*Plan: 03*
*Completed: 2026-04-27*
