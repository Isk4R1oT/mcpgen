---
phase: 08-auth-billing
date: 2026-04-28
status: locked
type: phase-level-deferrals + cross-workstream-asks
revision: 1
mirrors: .planning/phases/01-foundation/01-PHASE-DEVIATIONS.md
---

# Phase 8 — Phase Deviations Log

> Phase-level deferrals + cross-workstream dependencies that survive Phase 8
> acceptance. Per-plan deviations live inside each plan's SUMMARY (08-01..08-04
> Deviations sections); this file aggregates only the cross-cutting items that
> Phase 9 / Phase 10 / sister workstreams must carry forward.
>
> Mirror format: `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` revision 2.

---

## Deviation 1 — R2 storage adapter is a NotImplementedError stub (Phase 10)

**Decision:** Plan 01 / D-23 ships `apps/api/src/lib/storage/r2.ts` as a
`NotImplementedError` stub. `LocalFsStorageAdapter`
(`.local-storage/{specs,artifacts,public-cache}/`) handles all I/O for Phases
1–9 per the local-compute pivot.

**Why:** Memory `project_local_compute.md` — Phases 1–9 run all compute
locally; CF + Fly deferred to Phase 10. Mirrors Phase 1 pivot revision 2 — no
CF Workers / R2 / Workers-for-Platforms deploy in Phases 1–9.

**Phase-10 carry-forward:**

- Implement `r2StorageAdapter` against Cloudflare R2 (S3-compatible). Pattern:
  `infrastructure/cloudflare/wrangler.toml` adds R2 bucket binding; adapter
  uses `c.env.R2_SPECS.put(key, body)`.
- Migrate existing `.local-storage/` contents (if any) to R2 via one-shot
  script.
- Switch BFF + Drift Watcher to construct-injected adapter at boot based on a
  `STORAGE_BACKEND=local|r2` env var.

**Owner:** `runtime` workstream (Phase 10).

---

## Deviation 2 — Wave 5 E2E ships pre-Phase-6 with synthetic-outbox fallback

**Decision:** Plan 05 E2E test (`apps/api/tests/e2e/billing-flow.test.ts`) has
TWO runtime modes selected via `PHASE_6_AVAILABLE`:

- `PHASE_6_AVAILABLE=0` (default; pre-Phase-6): seeds `usage_events_outbox`
  synthetically via `seedSyntheticOutbox` (Plan 02 named export).
- `PHASE_6_AVAILABLE=1` (post-Phase-6): consumes real outbox rows written by
  Phase 6 dispatch + tenant Workers.

**Why:** Phase 8 ops workstream runs in parallel with Phase 6 runtime
workstream (per `mcpgen-gsd-sprint-plan.md` §3 terminal allocation). Forcing
Phase 8 to wait for Phase 6 would serialize critical-path work. The
synthetic-outbox path verifies the BFF half (CTRL-06 webhook + CTRL-07 outbox
poller + cost cap + quota) end-to-end without Phase 6 dependency.

**Acceptance gate (TWO levels):**

- **Pre-Phase-6 (Wave 5 commit):** synthetic-outbox path passes 6 of 6 E2E
  steps (Step 3 may return 501 if generate endpoint is still a Phase-1 stub —
  recorded as Phase-8-known-gap, not a regression).
- **Post-Phase-6 (re-verification):** ops workstream re-runs
  `RUN_E2E_BILLING_TESTS=1 PHASE_6_AVAILABLE=1 pnpm --filter @mcpgen/api test
  e2e/billing-flow` after Phase 6 ships. All 6 steps must pass with real
  dispatch.

**Owner:** `ops` workstream (re-verification when Phase 6 lands).

---

## Deviation 3 — Cross-workstream ask: engine `POST /internal/v1/parse` Stage A endpoint (Q1)

**Decision:** Plan 04 Drift Watcher (`drift-watcher-check-v1`) requires the
engine to expose `POST /internal/v1/parse` per the contract pinned in
`packages/contracts/src/engine-internal-api.ts` (Plan 01). Until the engine
ships this endpoint, Drift Watcher gracefully no-ops with
`{ skipped: 'engine_unavailable' }` on 502 / 503 / timeout (10 s).

**Why:** Engine HTTP shell-out (NOT TS port) avoids duplicating the
prance[osv] + openapi-spec-validator stack and prevents drift between the TS
port and Python source — see RESEARCH §13 decision table.

**Cross-ws follow-up:** [`.planning/todos/pending/engine-stage-a-internal-parse.md`](../../todos/pending/engine-stage-a-internal-parse.md)
(filed in Plan 04).

**Owner:** `engine` workstream (Phase 2 acceptance gate adds this endpoint).

---

## Deviation 4 — Cross-workstream ask: engine cooperative-abort for cost-cap mid-pass cancel (Q2)

**Decision:** Plan 03 Cost Cap Enforcer (`cost-cap-enforcer-v1`) calls engine
`POST /internal/v1/cancel-generation` when cumulative cost exceeds the cap.
The engine MUST honor the cancel signal mid-pass; otherwise the user is billed
for already-spent tokens beyond the cap.

**Until engine ships cooperative abort:** cost cap is a soft cap — the
first-pass-after-cap completes (typical overage <$0.10), then enforcement
fires. Documented in `docs/decisions/2026-04-26-cost-cap-thresholds.md`
(paired with Plan 03 launch-criteria edit).

**Cross-ws follow-up:** [`.planning/todos/pending/engine-cooperative-abort.md`](../../todos/pending/engine-cooperative-abort.md)
(filed in Plan 03 done-list).

**Owner:** `engine` workstream (Phase 5 acceptance gate adds cooperative-abort
hooks inside Pass 0–5 LLM calls).

---

## Deviation 5 — Stripe Customer Portal limited integration (Q3 — manual founder workflow)

**Decision:** Plan 02 + Plan 03 ship `apps/api/src/routes/v1/billing/portal.ts`
(single endpoint) + `docs/runbooks/manual-customer-portal.md` (founder
workflow). Full self-service Customer Portal integration (cancellation flows,
plan switches, payment-method updates) deferred to v1.x.

**Why:** Solo founder ops, low expected churn in W7–W10 per CONTEXT.md
"Stripe Customer Portal integration deferred to v1.x" deferred-idea entry.

**Trigger for v1.x fast-follow:** Churn > 5 % in W7–W10 → fast-follow Customer
Portal in v1.0.1.

**Owner:** Phase 9 / launch follow-up.

---

## Deviation 6 — Resend domain verification depends on user DNS access (Q4)

**Decision:** Plan 04 ships `docs/runbooks/resend-domain-setup.md` documenting
`mcpgen.dev` domain verification + `onboarding@resend.dev` fallback. If the
user has not yet verified the domain, `DRIFT_FROM_EMAIL` and `OPS_FROM_EMAIL`
env-var overrides redirect to `onboarding@resend.dev` for unblocked dev.

**Why:** DNS configuration is a one-time manual user action; cannot be
automated by Phase 8.

**Production launch criterion:** W7 — domain verified before MVP public
launch.

**Owner:** User (DNS configuration); ops workstream adds the launch-criterion
check at Phase 10.

---

## Deviation 7 — INNGEST_FUNCTION_IDS register has 7 entries; CONTEXT.md D-27 enumerated 6 (W1)

**Decision:** Plan 01 lands `packages/contracts/src/inngest-functions.ts` with
7 stable IDs:

| # | Stable ID | Owning plan | Trigger |
|---|---|---|---|
| 1 | `drift-watcher-v1` | Plan 04 | daily 03:00 UTC cron (fan-out parent) |
| 2 | `drift-watcher-check-v1` | Plan 04 | event `drift/check.requested` (per-deployment follower) |
| 3 | `usage-reconciler-v1` | Plan 04 | daily 02:00 UTC cron |
| 4 | `stripe-meters-emit-v1` | Plan 02 | minute cron (outbox poller) |
| 5 | `quota-period-rollover-v1` | Plan 03 | hourly cron (anniversary-based) |
| 6 | `logto-mau-watch-v1` | Plan 04 | daily cron (5 K MAU cap watch) |
| 7 | `cost-cap-enforcer-v1` | Plan 03 | event `generation/cost.updated` |

CONTEXT.md D-27 enumerates 6 IDs; `drift-watcher-check-v1` is the 7th, added
as the fan-out follower of `drift-watcher-v1` per Plan 04 implementation.

**Why:** Plan 04 splits the daily Drift Watcher cron (`drift-watcher-v1`) from
the per-deployment check (`drift-watcher-check-v1`) for independent retries —
fan-out via `step.sendEvent` requires a separately registered Inngest
function (per RESEARCH §13).

**Owner:** ops workstream (Plan 01 + Plan 04 already shipped the 7-entry
register; this entry just documents the supersession of D-27's 6-ID
enumeration so the Phase 9 orphan audit has the correct ground truth).

---

## Phase-10 carry-forward summary

Aggregating per-deviation Phase-10 follow-up items:

1. R2 storage adapter implementation (Deviation 1) — `runtime` workstream.
2. CF Queue migration from `usage_events_outbox` (D-25 toggle
   `USAGE_EVENT_TRANSPORT=outbox|cf-queue`) — `runtime` workstream.
3. Inngest Cloud production wire-up (`INNGEST_EVENT_KEY`,
   `INNGEST_SIGNING_KEY`) — `ops` workstream.
4. Logto Cloud Pro pre-buy calendar action (W7, per Phase 1 D-14 + Pitfall
   #17) — user.
5. Resend domain verification for `mcpgen.dev` (Deviation 6) — user.
6. Stripe Customer Portal full integration if churn > 5 % (Deviation 5) —
   Phase 9 / launch follow-up.
7. Real CF + multi-region deploy verification (paired-decision update to
   `launch-criteria.ts` per T-1-03 paired-decision pattern) — `runtime`
   workstream.
8. Re-run E2E with `PHASE_6_AVAILABLE=1` once Phase 6 ships (Deviation 2) —
   `ops` workstream.

## Cross-workstream follow-ups

| Item | Filed in | Target workstream | Target phase |
|---|---|---|---|
| engine `POST /internal/v1/parse` Stage A endpoint | [`engine-stage-a-internal-parse.md`](../../todos/pending/engine-stage-a-internal-parse.md) | engine | Phase 2 acceptance |
| engine cooperative-abort for cost-cap mid-pass cancel | [`engine-cooperative-abort.md`](../../todos/pending/engine-cooperative-abort.md) | engine | Phase 5 acceptance |
| Phase 6 dispatch + tenant Worker writes to `usage_events_outbox` | (covered by Phase 6 native plan; Phase 8 consumes) | runtime | Phase 6 W2 |

## Revision history

- **revision 1** (2026-04-28): initial phase-level aggregation authored by
  Plan 05 Wave 5 closure. 7 deviations + 8 Phase-10 carry-forwards + 3
  cross-ws follow-ups.
