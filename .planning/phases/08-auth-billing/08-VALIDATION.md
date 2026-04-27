---
phase: 8
slug: auth-billing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `08-RESEARCH.md` §19 "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest@^1.6.0 (existing Phase 1 pin; matches all `apps/*` and `packages/*`) |
| **Config file** | `apps/api/vitest.config.ts` (existing from Phase 1 OPS-05) |
| **Quick run command** | `pnpm --filter @mcpgen/api test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~5–10 seconds (quick, after Wave 1 baseline); ~30–45 seconds (full workspace) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mcpgen/api test`
- **After every plan wave:** Run `pnpm -r test` (workspace-wide)
- **Before `/gsd-verify-work`:** Full suite must be green PLUS `pnpm -r typecheck && pnpm -r lint`
- **Phase-8-specific verifier-agent gates:**
  - `bun run apps/api/src/index.ts` + `npx inngest-cli@latest dev` for 30s startup smoke (no crashes)
  - `pnpm --filter @mcpgen/contracts drizzle-kit:check` (no pending migration drift)
- **Max feedback latency:** 30 seconds (full workspace)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-XX | 01 | 1 | CTRL-02 | T-8-01 | Logto JWT middleware rejects missing/invalid/expired tokens; accepts valid user JWT (sets `c.var.auth.isM2M=false`); accepts valid M2M JWT (sets `isM2M=true`) via `aud` claim distinction | unit (mocked JWKS via `jose` mock) | `pnpm --filter @mcpgen/api test auth` | ❌ W0 | ⬜ pending |
| 8-01-XX | 01 | 1 | CTRL-02 | T-8-02 | Auth middleware applied only to `/api/v1/*` and `/internal/v1/*`; `/health` + `/api/v1/stripe/webhook` remain public | integration (in-process Hono request) | `pnpm --filter @mcpgen/api test auth-mounting` | ❌ W0 | ⬜ pending |
| 8-01-XX | 01 | 1 | CTRL-04 | — | Drizzle migration `20260428000000_phase8_billing_drift.sql` applies cleanly to Neon dev branch; all Phase 8 ALTERs + 4 new tables + 3 indexes + continuous aggregate present | integration (`db:test-migrate` script) | `pnpm --filter @mcpgen/contracts db:test-migrate` | ✅ exists; extend assertions in W1 | ⬜ pending |
| 8-01-XX | 01 | 1 | CTRL-04 | — | TimescaleDB continuous aggregate `usage_hourly` exists and refreshes per `add_continuous_aggregate_policy` | integration (real Neon, fixture data) | `pnpm --filter @mcpgen/api test quota` | ❌ W0 (skeleton); W3 (real query) | ⬜ pending |
| 8-01-XX | 01 | 1 | CTRL-05 | T-8-03 | `LocalFsStorageAdapter` writes/reads/deletes under `.local-storage/{specs,artifacts,public-cache}/`; `R2StorageAdapter` throws `NotImplementedError`; gitignored | unit | `pnpm --filter @mcpgen/api test storage` | ❌ W0 | ⬜ pending |
| 8-02-XX | 02 | 2 | CTRL-06 | T-8-04 | Stripe webhook handler verifies signature via `constructEventAsync` (mocked); persists event with `stripe_event_id UNIQUE`; replay → ack 200 with `duplicate: true`; unhandled event → ack 200 with `status='received'` | unit (`vi.mock('stripe', ...)` hoisted) | `pnpm --filter @mcpgen/api test stripe-webhook` | ❌ W0 | ⬜ pending |
| 8-02-XX | 02 | 2 | CTRL-07 | T-8-05 | Stripe meters outbox poller: claims pending rows with `FOR UPDATE SKIP LOCKED`; emits via `stripe.billing.meterEvents.create`; marks `sent_at`; UNIQUE on `idempotency_key` prevents duplicates | integration (W2: vi.mock stripe; W3: real sandbox stripe-cli) | `pnpm --filter @mcpgen/api test inngest/stripe-meters-emit` | ❌ W0 | ⬜ pending |
| 8-03-XX | 03 | 3 | CTRL-06 | T-8-06 | Stripe Checkout Session creation returns valid `{url}`; metadata includes `org_id`; success_url + cancel_url point to `apps/web` | unit (vi.mock stripe) | `pnpm --filter @mcpgen/api test billing/checkout` | ❌ W0 | ⬜ pending |
| 8-03-XX | 03 | 3 | CTRL-06 | T-8-07 | Cost-cap enforcer cancels generation when `cumulative_cost_usd > cap`; calls engine `/internal/v1/cancel-generation` with M2M token; persists `status='cost_capped'`; emits billable usage event for accumulated cost | unit (vi.mock fetch) + integration (concurrency: { key: event.data.job_id }) | `pnpm --filter @mcpgen/api test inngest/cost-cap-enforcer` | ❌ W0 | ⬜ pending |
| 8-03-XX | 03 | 3 | CTRL-07 | T-8-08 | `checkQuota` returns 429 when `used >= limit` (Free=1, Pro=5); PAYG plan never blocks; period rollover updates `quota_period_start` to next month on subscription anniversary | integration (real Neon, seeded usage_events) | `pnpm --filter @mcpgen/api test quota` | ❌ W0 | ⬜ pending |
| 8-04-XX | 04 | 4 | CTRL-03 | T-8-09 | IR diff strips cosmetic fields (summary/description/tags/x-*/key order/whitespace); `summary` change → empty diff; parameter added → `changed` entry in classifier output | unit | `pnpm --filter @mcpgen/api test drift/ir-diff` | ❌ W0 | ⬜ pending |
| 8-04-XX | 04 | 4 | CTRL-03 | T-8-10 | Drift watcher fan-out: `drift-watcher-v1` cron fires daily 03:00 UTC → `drift/check.requested` event sent per active deployment with `source_url IS NOT NULL` | unit (mocked Inngest test executor via `function.execute({ steps })`) | `pnpm --filter @mcpgen/api test inngest/drift-watcher` | ❌ W0 | ⬜ pending |
| 8-04-XX | 04 | 4 | CTRL-03 | T-8-11 | Drift email rate-limit: second INSERT for same `(tenant_id, week_start)` raises UNIQUE; silently swallowed; first email sent via Resend mock | integration (real Neon dev DB) | `pnpm --filter @mcpgen/api test drift/email-rate-limit` | ❌ W0 | ⬜ pending |
| 8-04-XX | 04 | 4 | CTRL-07 | T-8-12 | Reconciliation cron `usage-reconciler-v1` (daily 02:00 UTC) computes drift_pct per (tenant, event_type); alerts via Resend mock when >2%; `(reconciliation_date, event_type, tenant_id)` UNIQUE prevents double-alerting on re-run | unit (vi.mock resend) + integration (real Neon) | `pnpm --filter @mcpgen/api test inngest/usage-reconciler` | ❌ W0 | ⬜ pending |
| 8-04-XX | 04 | 4 | CTRL-02 (Pitfall #17) | T-8-13 | `logto-mau-watch-v1` cron emails ops at >4K MAU (mocked Logto Admin API); idempotent on (date) | unit (vi.mock fetch + resend) | `pnpm --filter @mcpgen/api test inngest/logto-mau-watch` | ❌ W0 | ⬜ pending |
| 8-05-XX | 05 | 5 (BLOCKED on Phase 6) | CTRL-06, CTRL-07 | — | E2E flow: signup → upgrade Free→Pro via Stripe Checkout → real webhook → quota check → generate → SSE cost stream → cost-cap enforcement → billable event → invoice on Stripe dashboard | E2E (real Stripe sandbox, real Neon, real Logto, **real Phase 6 Dispatch Worker** OR fixture-seeded outbox if Phase 6 not yet landed) | `pnpm --filter @mcpgen/api test e2e/billing-flow` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Threat refs (T-8-XX) will be assigned by gsd-planner during planning + filled by `/gsd-secure-phase` retroactively.*

---

## Wave 0 Requirements

- [ ] `apps/api/tests/auth.test.ts` — covers CTRL-02 middleware behavior; needs `jose` mock pattern for JWKS responses (RESEARCH §19 + §8)
- [ ] `apps/api/tests/auth-mounting.test.ts` — verifies middleware applied only to protected route prefixes
- [ ] `apps/api/tests/quota.test.ts` — covers CTRL-07; needs Neon dev DB connection (use `DATABASE_URL` pooled per RESEARCH §20 Q5)
- [ ] `apps/api/tests/storage/local-fs.test.ts` — covers CTRL-05 LocalFsStorageAdapter
- [ ] `apps/api/tests/stripe-webhook.test.ts` — needs `vi.mock('stripe', ...)` hoisted at module level; needs raw-body-passthrough fixture
- [ ] `apps/api/tests/billing/checkout.test.ts` — Stripe Checkout Session creation
- [ ] `apps/api/tests/inngest/` directory — Inngest TS test harness via `function.execute({ steps: [...] })` per Context7 (RESEARCH §6 + §20 A2); verify pattern in W1
  - [ ] `apps/api/tests/inngest/drift-watcher.test.ts`
  - [ ] `apps/api/tests/inngest/cost-cap-enforcer.test.ts`
  - [ ] `apps/api/tests/inngest/stripe-meters-emit.test.ts`
  - [ ] `apps/api/tests/inngest/usage-reconciler.test.ts`
  - [ ] `apps/api/tests/inngest/logto-mau-watch.test.ts`
  - [ ] `apps/api/tests/inngest/quota-period-rollover.test.ts` — Plan 03 Task 2 (quota-period-rollover-v1 stable-ID + INTERVAL '1 month' + NOW() static assertions)
- [ ] `apps/api/tests/drift/ir-diff.test.ts` — needs `RawIR` fixtures for baseline + variants (cosmetic-only / parameter-added / endpoint-removed). **Source from `packages/engine-fixtures/stripe/ir.json`** + hand-mutate
- [ ] `apps/api/tests/drift/email-rate-limit.test.ts` — needs Neon dev DB + Resend mock
- [ ] `apps/api/tests/routes/drift.test.ts` — Plan 04 Task 3 (3 drift-management endpoints — GET drift-events / POST regenerate / PATCH toggle; M2M-rejection + IDOR mitigation tests)
- [ ] `apps/api/tests/e2e/billing-flow.test.ts` — gated on Phase 6 landing; otherwise uses fixture-seeded outbox per CONTEXT.md D-25
- [ ] Vitest mock for Resend SDK (shared helper `apps/api/tests/_mocks/resend.ts`)
- [ ] Vitest mock for Stripe SDK (shared helper `apps/api/tests/_mocks/stripe.ts`) — captures `vi.mock` hoisting boilerplate

*Cross-workstream test ownership (Phase 1 D-21 carry-forward):*
- `apps/api/tests/**` — owned by `ops` workstream (Phase 8 owner)
- `packages/contracts/tests/**` (idempotency, generation-api, usage-event, launch-criteria) — owned by `main`; Phase 8 edits extend without changing ownership
- `packages/engine-fixtures/tests/**` — owned by `main`; Phase 8 only consumes (doesn't edit)
- Cross-cutting failures (e.g., schema change breaks engine-fixtures shape test) escalate as `chore(contracts):` PR per D-21

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Logto Console: `mcpgen-staging` + `mcpgen-sandbox` tenants reproduced from runbook | CTRL-02 | Logto provider config is dashboard-only; no Admin-API path covers SignInExperience setup | Follow `docs/runbooks/logto-tenant-setup.md`; verify email + GitHub providers active; verify reachability check (per `infrastructure/logto/README.md`) returns valid token |
| Stripe Dashboard: products `prod_mcpgen_free` + `prod_mcpgen_pro` + meter `mcpgen_evals` exist with correct prices | CTRL-06 | Stripe products + prices created via `infrastructure/stripe/setup.ts` script (idempotent); manual verification only needed if user re-runs against new env | Run `bun infrastructure/stripe/setup.ts` then verify in Stripe Dashboard → Products + Billing → Meters |
| Stripe webhook delivery via `stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook` shows successful 200 responses | CTRL-06 | Local-dev workflow can't be automated in CI without stripe-cli installed | Documented in `apps/api/README.md`; manual smoke test before each Wave 3+ commit touching webhook code |
| Resend Console: `drift@mcpgen.dev` + `ops@mcpgen.dev` sender domains verified (SPF/DKIM/DMARC) | CTRL-03 (drift email) | DNS configuration is one-time, manual; per RESEARCH §20 Q4 fallback to `onboarding@resend.dev` is acceptable for dev | User verifies domain in Resend Console → Domains; if pending, fallback applies; production launch criterion adds DNS setup at W7 |
| Logto Cloud Pro pre-bought before W7 (CONTEXT.md D-14) | CTRL-02 (Pitfall #17) | Calendar action — payment + plan upgrade in Logto Cloud billing page | User upgrades via Logto Console → Billing → Plans; runbook in `docs/runbooks/logto-pro-upgrade.md` |
| Neon Scale-tier compute upgraded to ≥4 vCPU/8GB before W8 (Phase 1 D-18) | CTRL-04 | Calendar action — Neon Console autoscaling config | User upgrades via Neon Console → Project Settings → Compute; runbook in `infrastructure/neon/SCALING.md` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (per RESEARCH §19 table)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (16 test files staged in `apps/api/tests/`)
- [ ] No watch-mode flags (CI-friendly)
- [ ] Feedback latency < 30s for full workspace
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 closes + first wave of plans pass checker)

**Approval:** pending
