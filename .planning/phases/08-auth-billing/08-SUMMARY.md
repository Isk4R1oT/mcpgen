---
phase: 08-auth-billing
status: complete (modified scope; pre-Phase-6 acceptance + post-Phase-6 re-verification deferred)
date_completed: 2026-04-28
plans_total: 5
plans_complete: 5
plans_complete_modified_scope: 1  # Plan 05 ships pre-Phase-6 with synthetic-outbox path
verifier_run: pending  # verifier agent runs after this Plan 05 completes
auto_advance: true
mirrors: .planning/phases/01-foundation/01-SUMMARY.md
---

# Phase 8 Auth + Billing — Phase-Level Summary

Phase 8 closes with all 5 plans complete (4 standard scope, 1 modified scope
per [`08-PHASE-DEVIATIONS.md`](./08-PHASE-DEVIATIONS.md) Deviation 2). The
operational layer between Phase 1 foundation and Phase 10 launch is in place:
Logto JWT verification (user + M2M), Stripe Billing (Checkout + webhook +
Meters outbox poller), quota enforcement (TimescaleDB-backed real-time
truth), cost-cap enforcement (engine→BFF SSE protocol), Drift Watcher
(parsed-IR diff + per-week email rate-limit), usage reconciliation
(TimescaleDB ↔ Stripe Meters daily compare), MAU watcher (Logto Cloud
free-tier 5 K cap mitigation), and the Resend-backed email surface that all
three crons depend on. All 7 Inngest functions ship behind a stable-ID
register (`packages/contracts/src/inngest-functions.ts`) so the Phase 9
orphan audit has a single ground truth.

## Scope rationale (user-direction, locked)

**Phase 8 ships LOCAL-COMPUTE auth+billing while CF Workers / Workers for
Platforms / Fly.io migration stays deferred to Phase 10. Cloud SaaS services
(Neon Postgres, Logto Cloud, Stripe sandbox, Resend, OpenRouter, Langfuse
local) are in active use; the deferral covers only compute-platform
hosting.**

This is the locked rationale string; mirror of Phase 1 Foundation rationale
(see [`01-SUMMARY.md` §"Scope rationale"](../01-foundation/01-SUMMARY.md)).
The local-compute pivot per `project_local_compute.md` memory removes 9+
weeks of CF + Fly account-state drift, billing surprises, and a fake
"production" environment that doesn't actually serve users.

Two consequences flow from this rationale into Phase 8 architecture:

1. The `usage_events_outbox` Postgres table substitutes for CF Queue (D-25
   pre-Phase-6 path); a `USAGE_EVENT_TRANSPORT=outbox|cf-queue` env-var flag
   flips to `cf-queue` at Phase 10.
2. The `LocalFsStorageAdapter` (`.local-storage/`) substitutes for R2; the
   `R2StorageAdapter` is a `NotImplementedError` stub until Phase 10.

Full pivot history: [`08-PHASE-DEVIATIONS.md`](./08-PHASE-DEVIATIONS.md)
Deviations 1, 2, and 7.

## Per-Plan Completion Table (5 of 5)

| # | Plan | Wave | Status | Date | Key deliverables | Commits |
|---|------|------|--------|------|------------------|---------|
| 08-01 | Auth middleware + DB migration + Storage adapter + Outbox + Inngest scaffold | 1 | **complete** | 2026-04-27 | jose JWT middleware (user + M2M); Drizzle migration `20260428000000_phase8_billing_drift.sql`; `LocalFsStorageAdapter`; `INNGEST_FUNCTION_IDS` 7-entry register; `engine-internal-api` Zod contract; `SYNTHETIC_DEPLOYMENT_ID` constant | `47dac53` `41b10af` `bdb17d8` `b080567` `3adbace` |
| 08-02 | Stripe webhook + outbox poller + setup script (FULL MOCKED) | 2 | **complete** | 2026-04-27 | Webhook handler in PUBLIC layer (`constructEventAsync` + idempotent persistence + 5 dispatched events); `stripe-meters-emit-v1` cron (`FOR UPDATE SKIP LOCKED` + `REFRESH MATERIALIZED VIEW usage_hourly`); shared `setupStripeMock()` helper; `seedSyntheticOutbox` named export; manual Customer Portal runbook (Q3) | `184790c` `c27bbbb` `2d78d79` `4d3ca04` |
| 08-03 | Real Stripe + Checkout + cost cap + quota | 3 | **complete** | 2026-04-27 | `LAUNCH_CRITERIA.COST_CAP_FREE_USD=0.50`/`COST_CAP_PRO_USD=2.00` (paired-decision); `PartialResultCost` discriminated union; `checkQuota` + `quotaGate` middleware; `quota-period-rollover-v1` hourly cron; `/api/v1/billing/{checkout,portal}` (M2M rejected 403); `/internal/v1/{sse-callback,cancel-generation}` (M2M-protected); `cost-cap-enforcer-v1` (concurrency-key serialized; PAYG short-circuit; M2M cancel call); engine cooperative-abort follow-up filed | `4c4739c` `f0908db` `c1a9a5a` `db2ed21` |
| 08-04 | Drift Watcher + reconciler + MAU + Resend wiring | 4 | **complete** | 2026-04-28 | `drift-watcher-v1` daily fan-out + `drift-watcher-check-v1` per-deployment check (engine `/internal/v1/parse` Q1 fallback to `engine_unavailable` no-op); cosmetic-stripping IR diff; D-18 1-email/wk/tenant rate-limit (composite-PK 23505 silent swallow); `usage-reconciler-v1` daily TimescaleDB ↔ Stripe Meters compare; `logto-mau-watch-v1` 4 K MAU alert; Resend client (3 send paths); 3 drift-management routes (4-table-JOIN IDOR mitigation); engine `/internal/v1/parse` cross-ws ask filed | `3345485` `58a3325` `1141bf6` `914a2c9` |
| 08-05 | E2E billing flow + phase-level summary + deviation log | 5 | **complete (modified scope)** | 2026-04-28 | `apps/api/tests/e2e/billing-flow.test.ts` (6 it-blocks; `RUN_E2E_BILLING_TESTS` + `PHASE_6_AVAILABLE` gates); `seed-org.ts` (full FK chain incl. `SYNTHETIC_DEPLOYMENT_ID` deployment row); `stripe-cli.ts` (`Bun.spawn` + `generateTestHeaderString` fallback); this `08-SUMMARY.md`; `08-PHASE-DEVIATIONS.md` (7 entries); `apps/api/README.md` Wave 5 amendment | `fe644d7` `a640d5f` |

## Requirements closure (CTRL-02..CTRL-07)

| Req ID | Closed by | Verification |
|--------|-----------|--------------|
| CTRL-02 (Logto JWT verification — user + M2M) | Plan 01 (auth middleware) + Plan 04 (MAU watcher subset, Pitfall #17) | `apps/api/tests/auth.test.ts` + `apps/api/tests/auth-mounting.test.ts` + `apps/api/tests/inngest/logto-mau-watch.test.ts` |
| CTRL-03 (Drift Watcher) | Plan 04 (drift-watcher + drift-watcher-check + ir-diff + email rate-limit) | `apps/api/tests/drift/ir-diff.test.ts` + `apps/api/tests/drift/email-rate-limit.test.ts` + `apps/api/tests/inngest/drift-watcher.test.ts` + `apps/api/tests/routes/drift.test.ts` |
| CTRL-04 (Drizzle migration `20260428000000_phase8_billing_drift.sql`) | Plan 01 (migration + schema push) | `pnpm --filter @mcpgen/contracts db:test-migrate` + [`08-01-SCHEMA-PUSH-EVIDENCE.md`](./08-01-SCHEMA-PUSH-EVIDENCE.md) |
| CTRL-05 (Storage adapter — local-fs primary, R2 stub) | Plan 01 (storage adapter + interface) | `apps/api/tests/storage/local-fs.test.ts` |
| CTRL-06 (Stripe Billing) | Plan 02 (webhook + setup) + Plan 03 (Checkout + cost cap) + Plan 05 (E2E) | `apps/api/tests/stripe-webhook.test.ts` + `apps/api/tests/billing/checkout.test.ts` + `apps/api/tests/inngest/cost-cap-enforcer.test.ts` + `apps/api/tests/e2e/billing-flow.test.ts` |
| CTRL-07 (Quota + outbox + reconciler) | Plan 02 (outbox poller) + Plan 03 (quota + period rollover) + Plan 04 (reconciler) + Plan 05 (E2E) | `apps/api/tests/inngest/stripe-meters-emit.test.ts` + `apps/api/tests/quota.test.ts` + `apps/api/tests/inngest/quota-period-rollover.test.ts` + `apps/api/tests/inngest/usage-reconciler.test.ts` + `apps/api/tests/e2e/billing-flow.test.ts` |

## Threats mitigated (T-8-01..T-8-23)

Per-threat mitigations are documented in each plan's SUMMARY.md threat table.
Aggregate landing summary:

| ID | Plan | Test reference |
|----|------|----------------|
| T-8-01..T-8-03 (auth bypass / mount-leak / storage path traversal) | 08-01 | `apps/api/tests/auth.test.ts`, `auth-mounting.test.ts`, `storage/local-fs.test.ts` |
| T-8-04..T-8-05 (webhook signature replay / race) | 08-02 | `apps/api/tests/stripe-webhook.test.ts` |
| T-8-06..T-8-08 (M2M IDOR via Checkout / cost-cap bypass / engine cancel auth) | 08-03 | `apps/api/tests/billing/checkout.test.ts` + `inngest/cost-cap-enforcer.test.ts` |
| T-8-09..T-8-11 (drift cosmetic-noise spam / fan-out fail / email-flood) | 08-04 | `apps/api/tests/drift/ir-diff.test.ts`, `email-rate-limit.test.ts`, `inngest/drift-watcher.test.ts` |
| T-8-12..T-8-14 (reconcile double-alert / MAU bypass / drift route IDOR) | 08-04 | `apps/api/tests/inngest/usage-reconciler.test.ts`, `inngest/logto-mau-watch.test.ts`, `routes/drift.test.ts` |
| T-8-15..T-8-16 (Sentry secret leakage / migration drift) | 08-01 | `apps/api/src/instrumentation.ts` regex redaction; `db:test-migrate` sentinel-table gate |
| T-8-17..T-8-20 (outbox dup-claim / meter-event drift / quota drift / period rollover off-by-one) | 08-02 + 08-03 | `apps/api/tests/inngest/stripe-meters-emit.test.ts`, `quota.test.ts`, `inngest/quota-period-rollover.test.ts` |
| T-8-21..T-8-23 (E2E test data leak / PII in logs / accidental production seed) | 08-05 | `apps/api/tests/e2e/billing-flow.test.ts` (`SYNTHETIC_DEPLOYMENT_ID` import + UUID-prefixed test org IDs + CASCADE cleanup) |

## Local-Dev Port Map (Phases 1-9)

Mirror of Phase 1 [`01-SUMMARY.md` Local-Dev Port Map](../01-foundation/01-SUMMARY.md);
unchanged through Phase 8.

| Port | Service | Started by | Wave |
|------|---------|------------|------|
| 8787 | Hono BFF (`apps/api`) | `bun run apps/api/src/index.ts` (Terminal 1) | Phase 1 |
| 8288 | Inngest dev server | `npx inngest-cli@latest dev -u http://localhost:8787/api/inngest` (Terminal 2) | Phase 8 W1 |
| 12111 | stripe-cli forwarder | `stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook` (Terminal 3) | Phase 8 W3 |
| 8000 | engine FastAPI (optional, drift-watcher-check best-effort) | `uv run uvicorn mcpgen_engine.main:app --reload` (Terminal 4) | Phase 2 |
| 3000 | Next.js frontend (`apps/web`) | `pnpm --filter web dev` | Phase 7 |
| 3001 | Langfuse self-hosted | `docker-compose up langfuse` (out of repo) | Phase 1 |
| 8789 | Dispatcher (`apps/dispatch`) | `wrangler dev --local --port 8789` | Phase 6 |
| 8790+ | Tenant Workers | `wrangler dev --local --port 8790+` per tenant | Phase 6 |

**Cloud services** (credentials in `.env.local`): Neon Postgres
(`DATABASE_URL` + `DATABASE_URL_UNPOOLED`), Logto Cloud
(`LOGTO_*` triple + `LOGTO_M2M_*` triple), Stripe sandbox
(`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PRICE_PRO`),
Resend (`RESEND_API_KEY` + `OPS_EMAIL`), OpenRouter (`OPENROUTER_*`),
Langfuse (`LANGFUSE_HOST=http://localhost:3001`).

## Phase-10 carry-forward

Aggregating per-deviation Phase-10 follow-up items from
[`08-PHASE-DEVIATIONS.md`](./08-PHASE-DEVIATIONS.md):

1. **R2 storage adapter implementation** (Deviation 1) — replace
   `apps/api/src/lib/storage/r2.ts` `NotImplementedError` stub with the real
   adapter against the Cloudflare R2 binding. Owner: `runtime` workstream.
2. **CF Queue migration from `usage_events_outbox`** (Deviation 2) — flip
   `USAGE_EVENT_TRANSPORT=outbox|cf-queue` env-var flag from Plan 02 to
   `cf-queue`. Outbox table stays as defense-in-depth retry buffer. Owner:
   `runtime` workstream.
3. **Inngest Cloud production wire-up** — add `INNGEST_EVENT_KEY` +
   `INNGEST_SIGNING_KEY` to production env; remove `apps/api/package.json`
   `dev:inngest` script reference if cloud-only. Owner: `ops` workstream.
4. **Logto Cloud Pro pre-buy** — calendar action W7 per Phase 1 D-14 +
   Pitfall #17. Owner: user.
5. **Resend domain verification (`mcpgen.dev`)** — calendar action W7 per
   Plan 04 Q4 (Deviation 6). Owner: user.
6. **Stripe Customer Portal full integration** — fast-follow if churn > 5 %
   in W7–W10 per Plan 02 + Plan 03 Q3 (Deviation 5). Owner: Phase 9 launch
   follow-up.
7. **Real CF + multi-region deploy verification** — Phase-10 launch-criterion
   addition (per T-1-03 paired-decision pattern). Owner: `runtime`
   workstream.
8. **Re-run E2E with `PHASE_6_AVAILABLE=1`** (Deviation 2) — once Phase 6
   ships, ops workstream re-verifies the real-dispatch path of
   `apps/api/tests/e2e/billing-flow.test.ts`. Owner: `ops` workstream.

## Phase-9 audit hooks

Phase 9 (Observability) intake gates that Phase 8 prepares:

1. **Inngest orphan audit** — Phase 9 walks every
   `inngest.createFunction({ id: ... })` in the repo and asserts the id is in
   `INNGEST_FUNCTION_IDS` register. Phase 8 lands the 7-entry register
   (Deviation 7); the audit ground truth is fixed.
2. **Sentry beforeSend redaction** — Plan 01 (T-8-15) extends regex
   redaction to `cus_*` / `sk_(live|test)_*` / JWT-shape strings. Phase 9
   should add a synthetic-PII test that exercises the redaction path.
3. **gitleaks pre-commit scan** — pre-commit hook from Phase 1 catches any
   accidentally-committed `sk_live_*` / `sk_test_*` / JWT secret. Phase 9
   should add a CI gate that fails if the rule is removed.

## Cross-workstream follow-ups

| Item | Filed in | Target workstream | Target phase |
|------|----------|-------------------|--------------|
| engine `POST /internal/v1/parse` Stage A endpoint | [`engine-stage-a-internal-parse.md`](../../todos/pending/engine-stage-a-internal-parse.md) | engine | Phase 2 acceptance |
| engine cooperative-abort for cost-cap mid-pass cancel | [`engine-cooperative-abort.md`](../../todos/pending/engine-cooperative-abort.md) | engine | Phase 5 acceptance |
| Phase 6 dispatch + tenant Worker writes to `usage_events_outbox` | (covered by Phase 6 native plan; this phase consumes) | runtime | Phase 6 W2 |

## Sign-Off

Phase 8 acceptance gates:

- [x] Plan 01 (Wave 1) — auth middleware + migration + storage adapter + Inngest scaffold
- [x] Plan 02 (Wave 2) — Stripe webhook + outbox poller + setup script (FULL MOCKED)
- [x] Plan 03 (Wave 3) — real Stripe + Checkout + cost cap + quota
- [x] Plan 04 (Wave 4) — Drift Watcher + reconciliation + MAU + Resend
- [x] Plan 05 (Wave 5 pre-Phase-6) — synthetic-outbox E2E path verified
- [ ] Plan 05 (Wave 5 post-Phase-6) — real-dispatch E2E path **pending Phase 6 ship**

**Phase status:** READY for Phase 9 (Observability) intake. Phase 9 may begin
while the post-Phase-6 E2E re-verification remains as a Phase-8 deferred
acceptance gate.

## Pointers

- [`08-PHASE-DEVIATIONS.md`](./08-PHASE-DEVIATIONS.md) — 7 phase-level
  deviations + 8 Phase-10 carry-forwards + 3 cross-ws follow-ups.
- [`08-01-SUMMARY.md`](./08-01-SUMMARY.md) — Plan 01 (auth + schema + storage).
- [`08-02-SUMMARY.md`](./08-02-SUMMARY.md) — Plan 02 (Stripe webhook + outbox poller).
- [`08-03-SUMMARY.md`](./08-03-SUMMARY.md) — Plan 03 (quota + cost cap + Checkout/Portal).
- [`08-04-SUMMARY.md`](./08-04-SUMMARY.md) — Plan 04 (Drift Watcher + reconciler + MAU + Resend).
- [`08-05-SUMMARY.md`](./08-05-SUMMARY.md) — Plan 05 (E2E + phase closure).
- [`08-01-SCHEMA-PUSH-EVIDENCE.md`](./08-01-SCHEMA-PUSH-EVIDENCE.md) — Phase 8 migration applied to Neon dev (CTRL-04).
- [`apps/api/README.md`](../../../apps/api/README.md) Wave 5 — 4-terminal E2E run procedure.

---

*Phase 8 verified pre-Phase-6. Hand-off to Phase 9 (`ops` workstream
continues into Observability) — `INNGEST_FUNCTION_IDS` 7-entry register +
Sentry beforeSend redaction + gitleaks ground-truth all unblock the orphan
audit and Phase 9 SLO wiring.*
