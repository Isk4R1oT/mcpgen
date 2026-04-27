# Phase 8: Auth + Billing - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning
**Mode:** Auto-mode discussion (`--auto --ws ops`); recommended option selected for each gray area; user provided explicit clarifications mid-discussion that locked several decisions (logged in `08-DISCUSSION-LOG.md`)
**Workstream:** `ops`

<domain>
## Phase Boundary

Wire user authentication, subscription billing, usage-based metering, quota enforcement, and Drift Watcher into the Hono BFF (`apps/api`) + control-plane database. Phase 1 already manually-configured the Logto Cloud `mcpgen-prod` tenant (email + GitHub providers) and shipped the env-var contract (`LOGTO_*` in `.env.local`); Phase 1 DB migration `20260427000000_init_schema.sql` already created `organizations`, `users`, `usage_events` (TimescaleDB hypertable), `pending_callbacks`, `deployments`, `tools`, `specs`, `generations`, `projects`. Phase 8 = the application code on top of those primitives.

**In scope:**
- Logto JWT verification middleware in Hono BFF — protects `POST /api/v1/generate`, `/dashboard/*`, `/billing/*`; M2M token wire-up for engine→BFF callbacks (`LOGTO_M2M_*` env-var pair, added in this phase).
- Logto dashboard configuration for email + GitHub OAuth providers (already done manually in Phase 1; Phase 8 verifies + adds runbook for re-creation in `mcpgen-staging`/`mcpgen-sandbox`).
- Stripe Billing + Stripe Meters: products + prices for Free / Pro / PAYG; Stripe-hosted Checkout for upgrade flow; webhook handler in `apps/api`; idempotent Meters event emission per `${deployment_id}_${minute_bucket_iso}_${tool_name}`.
- Server-side cost-cap enforcement ($0.50 free / $2.00 pro per generation): hard-fail with partial result + bill, never silent overrun.
- Quota enforcement (Free 1 F3 eval/mo, Pro 5/mo, PAYG $0.50/eval): TimescaleDB hourly aggregates as real-time quota truth; pre-enqueue check in BFF before engine job submission.
- Daily reconciliation Inngest cron: TimescaleDB hourly aggregates ↔ Stripe Meters event count; alert >2% drift (Pitfall #16).
- Drift Watcher: Inngest daily cron (stable function ID `drift-watcher-v1`); compares **parsed IR** (re-runs Stage A only, no LLM), not raw spec content hash; surfaces semantic diff (added/removed/changed endpoints/parameters); per-recipient Resend email rate-limit max 1/week.
- New Drizzle migration `20260428000000_phase8_billing_drift.sql` adds: `organizations.plan_tier` / `stripe_customer_id` / `subscription_status` / `quota_period_start`, `specs.parsed_ir_jsonb`, `deployments.auto_regenerate_on_drift`, new tables `drift_events` / `drift_email_log` (UNIQUE `(tenant_id, week_start)`) / `subscription_events` (UNIQUE `stripe_event_id` for webhook idempotency).
- Inngest function ID register (stable strings): `drift-watcher-v1`, `usage-reconciler-v1`, `stripe-meters-emit-v1`, `quota-period-rollover-v1` — recorded in `packages/contracts/src/inngest-functions.ts` (new file).
- Local dev wiring for Inngest (`npx inngest-cli@latest dev` on default port) and Stripe (`stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook`) documented in `apps/api/README.md`.

**Out of scope (deferred to other phases or explicitly out-of-scope per RULES.md):**
- Next.js / `apps/web` Logto wire-up (sign-in UI, session-cookie middleware, protected pages) — that's Frontend Phase 7 (FE-01 wires landing → `/api/v1/generate`; auth UI follows the locked design).
- Real CF Workers / CF Queue / Hyperdrive / R2 / Fly.io deploy — all CF + Fly compute deferred to Phase 10 per `project_local_compute.md`. Phase 8 runs entirely against local Bun BFF + local Inngest dev server + real Stripe (cloud SaaS, low-volume test events) + real Logto (cloud SaaS, manually configured).
- R2 bucket provisioning (CTRL-05) — deferred to Phase 10 with rest of CF; Phase 8 writes any artifacts (e.g., spec snapshots for IR-diff baseline) to local filesystem under `.local-storage/specs/` (gitignored), behind a `StorageAdapter` interface in `packages/contracts/src/storage.ts` so Phase 10 only swaps the backend implementation.
- Per-tenant CF KV cache for auth precheck (RUN-01 sub-feature) — Runtime Phase 6 owns dispatch-side caching; Phase 8 only owns control-plane auth.
- Logto Cloud Pro tier purchase — paid in W7 per D-14 (calendar action, not Phase 8 code); runbook `docs/runbooks/logto-pro-upgrade.md` already exists from Phase 1.
- Self-host Logto migration — runbook only, deferred to t+3mo per `docs/mcpgen-architecture.md` §19.
- Custom email templates in Logto — MVP uses Logto default templates (verification + password reset).
- OAuth providers beyond email + GitHub — explicit OUT-OF-SCOPE per `RULES.md §6` anti-pattern #5 ("OAuth zoo").
- Sentry / BetterStack / Langfuse DSN values — Phase 1 wired empty-DSN SDKs; Phase 9 fills DSNs.
- A/B deploys, custom domains, SSO/RBAC, Team plan — explicit v2/out-of-scope per PROJECT.md.

</domain>

<decisions>
## Implementation Decisions

### Logto wire-up depth (CTRL-02)
- **D-01:** **Logto JWT verification middleware in Hono BFF (`apps/api`) only — no `apps/web` work in Phase 8.** Middleware lives at `apps/api/src/middleware/auth.ts`; verifies bearer JWT against Logto JWKS via `jose`'s `createRemoteJWKSet(${LOGTO_ENDPOINT}/oidc/jwks)`; caches JWKS for 10 min; rejects with 401 on missing/invalid/expired token. Applied to `POST /api/v1/generate`, `/api/v1/billing/*`, `/api/v1/deployments/*`, `/api/v1/dashboard/*`. Public routes (`/api/v1/health`, `/api/v1/stripe/webhook`) stay unprotected. *Rationale:* user pinned this in mid-discussion clarification; `apps/web` wire-up is Frontend Phase 7 (FE-01..05) per ROADMAP.md, not ops.
- **D-02:** **M2M client credentials grant for engine→BFF callbacks.** Add `LOGTO_M2M_APP_ID` / `LOGTO_M2M_APP_SECRET` / `LOGTO_M2M_RESOURCE_INDICATOR` to `.env.local` (user provisions via Logto Console → Applications → "MCPGen Engine M2M"). Engine fetches token via `client_credentials` grant on startup (cached, refreshed before expiry); attaches `Authorization: Bearer ${token}` to every callback POST to BFF. BFF middleware accepts both user JWTs (audience = web app) and M2M JWTs (audience = M2M resource indicator) — distinguished by `aud` claim, dispatched to different handlers via the same middleware.
- **D-03:** **Logto dashboard provider config (email + GitHub only) is manual + idempotent procedure.** Phase 1 user manually configured `mcpgen-prod`; Phase 8 adds runbook `docs/runbooks/logto-tenant-setup.md` documenting the click-path (`Sign-in experience → email + password`, `Connectors → social → GitHub`) so `mcpgen-staging` + `mcpgen-sandbox` tenants can be re-created idempotently. The reference TypeScript scaffold script in `infrastructure/logto/scaffold.ts` (Phase 1) stays reference-only. NO Google/Twitter/Apple/passwordless-magic-link providers (RULES.md §6 anti-pattern #5).
- **D-04:** **Email verification + password reset use Logto default templates.** No custom HTML templates in MVP. Logto's branded default uses MCPGen tenant name + sender domain configured per-tenant in Logto dashboard.
- **D-05:** **Free-tier MAU monitoring is a daily Inngest cron** (`logto-mau-watch-v1`) that calls Logto Admin API `/api/dashboard/widgets/active-user-count`, writes to a TimescaleDB sample table, and alerts via Resend if MAU > 4K (75% of 5K free-tier cap). Logto Pro pre-buy at W7 per D-14 from Phase 1 = calendar action, not Phase 8 automation.

### Stripe Billing + Meters configuration (CTRL-06)
- **D-06:** **Stripe-hosted Checkout (NOT embedded) for upgrade flow.** BFF endpoint `POST /api/v1/billing/checkout-session` creates a Stripe Checkout Session (subscription mode, success/cancel URLs back to `apps/web`); returns `{url}`; frontend (Phase 7) redirects via `window.location`. *Rationale:* hosted Checkout is PCI-compliant out-of-the-box; no card data ever touches MCPGen; Stripe handles 3DS, SCA, tax automatically; embedded Elements adds frontend complexity for zero MVP value.
- **D-07:** **Stripe products + prices created via Phase 8 idempotent setup script** (`infrastructure/stripe/setup.ts`) using `stripe.products.create({ id: 'prod_mcpgen_pro', ... })` with stable IDs so re-runs are no-ops. Products: `prod_mcpgen_free` ($0/mo, included quota Free), `prod_mcpgen_pro` ($60/mo, included quota Pro), Stripe Meter `mcpgen_evals` (PAYG dimension, $0.50/event), Stripe Meter `mcpgen_tool_calls` (overage dimension, future), Stripe Meter `mcpgen_generations` (informational, no price in MVP). Setup script committed to repo + run manually in dev / staging / prod by user; output IDs land in `.env.local` as `STRIPE_PRICE_PRO`, `STRIPE_METER_EVALS_ID`. *Reference:* Stripe Meters v2 schema in `docs/mcpgen-architecture.md` §10.2.
- **D-08:** **Stripe webhook handler at `POST /api/v1/stripe/webhook` in apps/api.** Verifies signature via `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`; persists every event to `subscription_events` table with `stripe_event_id` UNIQUE (idempotency); processes synchronously inside the request (Stripe expects 2xx within 30s). Handled events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Unhandled events are persisted-and-acked (200) for forward compatibility.
- **D-09:** **`stripe-cli` is a Phase-8 local-dev requirement.** README in `apps/api/README.md` documents `brew install stripe/stripe-cli/stripe` + `stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook` workflow. Webhook secret captured into `.env.local` as `STRIPE_WEBHOOK_SECRET` (separate value for local-dev vs prod).
- **D-10:** **Wave-staged Stripe integration:** Wave 1–2 = synthetic test events only (mock Stripe responses in vitest, no real API calls); Wave 3+ = real Stripe sandbox keys + webhook forwarding via `stripe-cli`. User provides `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to `.env.local` at start of Wave 3 (matches user's mid-discussion clarification).
- **D-11:** **Plan tier is org-level, not user-level.** Stored on `organizations.plan_tier text not null default 'free'` + `organizations.stripe_customer_id text unique` + `organizations.subscription_status text` + `organizations.quota_period_start timestamptz`. *Rationale:* ICP-B (API provider) and ICP-C (internal-tools engineer) are org-shaped; ICP-A (solo dev) collapses to a 1-user org cleanly. Avoids re-modeling later for Team plan v2.

### Quota enforcement architecture (CTRL-07)
- **D-12:** **Quota check pre-enqueue in BFF, before engine job submission.** New BFF helper `checkQuota(orgId, eventType: 'f3_eval' | 'generation')` runs inside `POST /api/v1/generate` BEFORE creating `generations` row; reads current period's count from TimescaleDB hourly aggregate of `usage_events` (event_type = 'f3_eval', period = current `quota_period_start` to `+ interval '1 month'`); compares against tier limit (Free=1, Pro=5); returns 429 with `{quota_used, quota_limit, reset_at}` if exceeded; PAYG plan never blocks (every eval bills $0.50). *Rationale:* pre-enqueue check protects against engine LLM token waste; matches `docs/mcpgen-architecture.md` §10 "TimescaleDB = quota truth" principle.
- **D-13:** **Cost-cap enforcement is engine-driven, BFF-coordinated.** Engine streams per-pass cost back to BFF via existing SSE event envelope (D-10 from Phase 1 — extend `partial_result` to carry `cumulative_cost_usd`); BFF maintains a per-`generation_id` cost accumulator (in-memory + persisted to `generations.cumulative_cost_usd` after each event); on threshold cross ($0.50 free / $2.00 pro from `packages/contracts/launch-criteria.ts`), BFF sends an in-flight cancel signal to engine via M2M endpoint `POST /internal/v1/cancel-generation`; engine aborts current pass + writes partial QualityReport; BFF marks generation `status = 'cost_capped'`, persists partial result, emits a billable usage event for accumulated cost. Hard-fail with partial result + bill, never silent overrun (per PROJECT.md constraint).
- **D-14:** **Per-tenant `quota_period_start` rolls over on subscription anniversary, not calendar month.** Inngest function `quota-period-rollover-v1` runs hourly, finds orgs whose `quota_period_start + interval '1 month' < now()`, updates `quota_period_start = quota_period_start + interval '1 month'`. Synced with Stripe subscription period via `customer.subscription.updated` webhook (D-08).
- **D-15:** **Daily reconciliation Inngest cron `usage-reconciler-v1` (stable ID).** Runs at 02:00 UTC daily; reads previous day's TimescaleDB hourly aggregate counts per (`tenant_id`, `event_type`); reads Stripe Meters event count via `stripe.billing.meters.eventSummary.list`; computes drift % per (tenant, event_type); alerts via Resend to ops email if any drift >2% (Pitfall #16). Idempotent on `(reconciliation_date, event_type, tenant_id)`. Writes audit row to `reconciliation_log` table (new in Phase 8 migration).

### Drift Watcher: IR diff implementation (CTRL-03)
- **D-16:** **Drift Watcher is Inngest daily cron `drift-watcher-v1` (stable function ID), running in Hono BFF (TypeScript Inngest SDK), per Phase 1 D-03.** Schedule: daily 03:00 UTC. For each `deployments` row with `source_url IS NOT NULL`: fetch upstream spec → re-run Stage A parser only (no LLM, no Pass 0–5) → produce fresh RawIR → diff against `specs.parsed_ir_jsonb` snapshot → classify diff into added/removed/changed buckets. *Rationale:* Pitfall #34 — content-hash diff false-positives on cosmetic reformat; parsed-IR diff catches semantic-only changes.
- **D-17:** **Diff comparison ignores cosmetic fields.** Compared fields per endpoint: `path`, `method`, `parameters[].name`, `parameters[].in`, `parameters[].required`, `parameters[].schema.type`, `requestBody.content.*.schema`, `responses.*.content.*.schema`. Ignored: `summary`, `description`, `tags`, `externalDocs`, `x-*` extensions, key order in objects, whitespace. Empty diff → no-op. Non-empty diff → enqueue `drift_events` row.
- **D-18:** **Per-recipient email rate-limit max 1/week, enforced via `drift_email_log` table.** Insert with `(tenant_id, week_start)` UNIQUE constraint; on conflict → silently skip Resend send (drift_event row still persisted). Week boundary = ISO week starting Monday 00:00 UTC. Email batches all drifted deployments for that tenant in one message (one email = one or more `drift_event` rows summarized).
- **D-19:** **Drift events surface in dashboard with three actions per event:** (1) "Manual review" — opens diff modal showing added/removed/changed; (2) "One-click regenerate" — submits new generation against the latest spec; (3) "Auto-regenerate toggle" — sets `deployments.auto_regenerate_on_drift boolean default false` to true (opt-in only — auto-regenerating live tenant Workers is a destructive action per PROJECT.md). Phase 8 ships the data + API; UI surfacing belongs to Frontend Phase 7 (FE-04 dashboard) — Phase 8 wires the BFF endpoint `GET /api/v1/deployments/:id/drift-events` and `POST /api/v1/drift-events/:id/regenerate` so Phase 7 can consume.
- **D-20:** **Auto-regenerate path uses standard `POST /api/v1/generate` flow with `triggered_by = 'drift_auto'` flag persisted on the `generations` row.** Cost accrues against the org's normal quota / cost-cap rules (no special bypass).

### Local-mode adaptations (`project_local_compute.md` consequences)
- **D-21:** **Inngest runs locally via `npx inngest-cli@latest dev` (separate process on default port).** Documented in `apps/api/README.md` startup checklist + `package.json` scripts (`pnpm dev:inngest`). NO Inngest Cloud account in Phases 1–9; Phase 10 wires Cloud signing key + URL. Inngest function definitions are environment-agnostic (same code) — only the runtime endpoint differs. User clarification: matches the local-compute pivot pattern.
- **D-22:** **CF Queue is replaced by Postgres `usage_events_outbox` table for Phases 1–9.** Phase 6 (when it lands) writes usage events to the existing `usage_events` hypertable AND to `usage_events_outbox` (created in Phase 8 migration); Phase 8's `stripe-meters-emit-v1` Inngest function polls outbox every 60s, sends to Stripe Meters with idempotency key per D-11/D-08, marks rows as `sent_at = now()`. Switch to CF Queue is a one-line env-var flip in Phase 10 (`USAGE_EVENT_TRANSPORT=cf-queue|outbox`, default `outbox` Phases 1–9). Until Phase 6 lands, Wave 1–2 of Phase 8 emits synthetic outbox rows from a fixture seeder so the pipeline is testable end-to-end.
- **D-23:** **R2 buckets deferred to Phase 10 (parallel with CF deferral); Phase 8 uses local filesystem behind a `StorageAdapter`.** Interface in `packages/contracts/src/storage.ts`; implementations: `LocalFsStorageAdapter` (Phases 1–9, writes to `.local-storage/{specs,artifacts,public-cache}/` — gitignored) and `R2StorageAdapter` (Phase 10 stub, throws `NotImplementedError`). BFF + Drift Watcher consume the interface, never the concrete implementation. Documented in `08-PHASE-DEVIATIONS.md` (created in execute-phase).
- **D-24:** **TimescaleDB hypertable `usage_events` already exists from Phase 1 migration.** Phase 8 only adds query helpers (`packages/contracts/src/quota-queries.ts`) for hourly-aggregate quota counts; does NOT modify the hypertable schema (any change would require a migration with `create_hypertable` re-run, which is destructive).

### Cross-workstream dependencies + mitigations
- **D-25:** **Wave 4 (E2E test: signup → upgrade → generate → see invoice) requires Runtime Phase 6** (Dispatch Worker + tenant Worker shape) for real usage events. Mitigation per user clarification: Phase 8 Wave 1–2 uses synthetic usage events seeded from `packages/engine-fixtures/{stripe,github,notion,linear,slack}/` fixtures (already shipped in Phase 1); Wave 3 swaps in real Stripe sandbox; Wave 4 runs E2E only after Phase 6 lands. Plan order respects this — Wave 4 plan opens with a "BLOCKED on Phase 6" header until Runtime ws merges.
- **D-26:** **Engine workstream (Phases 2–5) is NOT a hard blocker** for Phase 8 Waves 1–3. Phase 8 reads `generations.status` + `generations.cumulative_cost_usd` from DB; engine writes them. Both columns are in Phase 1 schema (`generations` table per `infrastructure/neon/migrations/20260427000000_init_schema.sql`); Phase 8 migration adds `cumulative_cost_usd numeric(10,4) default 0` if missing.

### Inngest function ID register (CTRL-09 prep — Phase 9 audits)
- **D-27:** **Stable Inngest function IDs registered in `packages/contracts/src/inngest-functions.ts` (new file in Phase 8).** Initial set:
  - `drift-watcher-v1` — daily 03:00 UTC, IR-diff per deployment
  - `usage-reconciler-v1` — daily 02:00 UTC, TimescaleDB ↔ Stripe Meters drift alert
  - `stripe-meters-emit-v1` — every 60s, outbox poller → Stripe Meters
  - `quota-period-rollover-v1` — hourly, anniversary-based period rollover
  - `logto-mau-watch-v1` — daily 04:00 UTC, MAU 75%-of-cap alert
  - `cost-cap-enforcer-v1` — event-triggered (engine SSE) cost-cap enforcement
  Bump rules: any rename, schedule change, or trigger change requires version bump (`-v2`) + paired `docs/decisions/` entry; old ID stays disabled until orphan audit (Phase 9 per CTRL-09).

### Migration scope
- **D-28:** **Single Drizzle migration `20260428000000_phase8_billing_drift.sql`** (YYYYMMDDHHMMSS prefix per Phase 1 D-12). Covers all Phase 8 schema additions atomically:
  - ALTER `organizations` ADD `plan_tier text not null default 'free'`, `stripe_customer_id text unique`, `subscription_status text`, `quota_period_start timestamptz default now()`
  - ALTER `specs` ADD `parsed_ir_jsonb jsonb` (last-known IR for drift baseline)
  - ALTER `deployments` ADD `auto_regenerate_on_drift boolean not null default false`
  - ALTER `generations` ADD `cumulative_cost_usd numeric(10,4) not null default 0` (if missing), `triggered_by text default 'user'` (enum-shaped: 'user' | 'drift_auto' | 'drift_manual')
  - CREATE TABLE `drift_events` (id ulid pk, deployment_id fk, detected_at timestamptz, diff_json jsonb, status text default 'pending', resolved_at timestamptz)
  - CREATE TABLE `drift_email_log` (tenant_id fk, week_start date, sent_at timestamptz, UNIQUE (tenant_id, week_start))
  - CREATE TABLE `subscription_events` (id ulid pk, organization_id fk, event_type text, stripe_event_id text UNIQUE, payload jsonb, processed_at timestamptz, status text default 'received')
  - CREATE TABLE `usage_events_outbox` (id ulid pk, deployment_id fk, event_type text, event_payload jsonb, idempotency_key text UNIQUE, created_at timestamptz default now(), sent_at timestamptz)
  - CREATE TABLE `reconciliation_log` (id ulid pk, reconciliation_date date, event_type text, tenant_id fk, timescale_count int, stripe_count int, drift_pct numeric(6,3), alerted boolean, run_at timestamptz, UNIQUE (reconciliation_date, event_type, tenant_id))
  - CREATE INDEX on `drift_events(deployment_id, detected_at desc)`, `subscription_events(organization_id, processed_at desc)`, `usage_events_outbox(sent_at) WHERE sent_at IS NULL`

### Claude's Discretion
- Specific Hono middleware composition order (auth → rate-limit → handler).
- Specific shape of internal cancel-generation endpoint payload (engine ↔ BFF M2M).
- Specific Resend email HTML template for drift notifications + reconciliation drift alerts.
- Whether `infrastructure/stripe/setup.ts` is a Bun script or a Bun + Commander CLI helper.
- Specific shape of `LocalFsStorageAdapter` (synchronous vs async file ops).
- Whether Wave 3 stripe-cli forwarding doc lives in `apps/api/README.md` or a separate `docs/runbooks/stripe-local-dev.md`.

### Folded Todos
*None — no pending todos at start of Phase 8.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning Phase 8.**

### Source of truth for the entire project
- `RULES.md` — hard non-negotiable rules (esp. §6 anti-pattern #5: OAuth zoo).
- `CLAUDE.md` — operational map (esp. §3 stack, §6 runtime, §9 observability, §11 implementation plan, §12 workflow).

### Source of truth for Phase 8 scope
- `.planning/PROJECT.md` — Constraints (cost cap, pass-through default, Logto Pro at W7) + Key Decisions (Drift Watcher in BFF; quota-truth split).
- `.planning/REQUIREMENTS.md` CTRL-02..07 (six requirements assigned to Phase 8).
- `.planning/ROADMAP.md` Phase 8 entry (4 success criteria; pitfalls #13, #16, #17, #34).
- `.planning/phases/01-foundation/01-CONTEXT.md` D-03 (Drift Watcher in BFF), D-08 (3 CF namespaces — deferred), D-11 (idempotency-key shape, Stripe Meters identifier), D-12 (Drizzle YYYYMMDDHHMMSS prefix), D-13 (launch-criteria.ts thresholds), D-14 (Logto Pro at W7), D-17 (Hyperdrive — deferred), D-18 (Neon Scale-tier ≥4 vCPU/8GB by W8), D-21 (cross-workstream test ownership).
- `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` revision 2 (CF + Logto Pro staging dry-run deferred to Phase 10).

### Source of truth for stack and architecture (Phase 8 surface area)
- `docs/mcpgen-architecture.md` §6 (runtime plane — auth modes), §7 (data model), §10 (billing + Stripe Meters v2 + pricing rules), §10.2 (Stripe Meters event idempotency identifier shape), §11 (observability + redaction), §14 (security).
- `docs/mcpgen-git-workflow-rules.md` (Conventional Commits, atomic commits, NEVER `--no-verify`, pre-commit contract — applies to every Phase 8 commit).
- `docs/mcpgen-gsd-sprint-plan.md` §3 (workstream allocation — `ops` row), §4 (Phase 8 plan breakdown), §5 (cross-workstream coordination).
- `docs/mcpgen-implementation-plan.md` §11 (launch criteria + kill switches — Phase 8 must satisfy quota + cost-cap criteria).

### Source of truth for Phase 8 pitfalls
- `.planning/research/PITFALLS.md` §#13 (Usage Event Loss Under CF Queue Backpressure — outbox pattern + idempotent UUID + UNIQUE `(tenant_id, tool_call_id)`), §#16 (Stripe Meters Reporting Lag — TimescaleDB = quota truth, daily reconciliation alert >2%), §#17 (Logto Cloud Free Tier Account Lock — MAU monitoring + Pro pre-buy at W7), §#21 (Inngest Function Versioning — stable IDs `drift-watcher-v1` etc.), §#34 (Drift Detection False-Positives on Spec Reformat — parsed-IR diff, not content hash).

### Source of truth for credentials + local-mode workflow
- Memory: `project_local_compute.md` (Phases 1–9 local-only, port map, deferred items).
- Memory: `reference_credentials.md` (Logto / Neon / OpenRouter / Langfuse env-var contract in `.env.local`).
- `infrastructure/logto/README.md` (env-var contract `LOGTO_ENDPOINT` / `LOGTO_APP_ID` / `LOGTO_APP_SECRET` / `LOGTO_BASE_URL`; reference scaffold in `scaffold.ts`).
- `docs/runbooks/logto-pro-upgrade.md` (Phase 1 OPS-runbook for W7 paid-tier swap).

### Source of truth for DB schema (Phase 8 builds on)
- `infrastructure/neon/migrations/20260427000000_init_schema.sql` (Phase 1 migration — already pushed to Neon dev branch per `01-04-SCHEMA-PUSH-EVIDENCE.md`).
- `packages/contracts/src/db-schema.ts` (Drizzle table definitions — Phase 8 extends in-place).
- `infrastructure/neon/SCALING.md` (Neon Scale-tier guidance — Phase 8 must verify before W8).

### Source of truth for contracts Phase 8 consumes/extends
- `packages/contracts/src/generation-api.ts` (SSE event envelope from Phase 1 D-10 — Phase 8 extends `partial_result` for `cumulative_cost_usd`).
- `packages/contracts/src/usage-event.ts` (usage-event schema from Phase 1 FND-04).
- `packages/contracts/src/idempotency.ts` (idempotency-key shape from Phase 1 D-11 — Phase 8 uses `${deployment_id}_${minute_bucket_iso}_${tool_name}` for Stripe Meters).
- `packages/contracts/src/launch-criteria.ts` (cost-cap thresholds, F2/F3 thresholds — Phase 8 imports `COST_CAP_FREE_USD` / `COST_CAP_PRO_USD`).

### Source of truth for engine-fixtures (Wave 1–2 synthetic data)
- `packages/engine-fixtures/{stripe,github,notion,linear,slack}/` — 5 hand-tuned fixture sets from Phase 1 OPS-07; Phase 8 seeds usage_events_outbox from these for synthetic event flow before Phase 6 lands.

### Source of truth for Stripe + Inngest documentation (live)
- Stripe Billing API (subscriptions): https://docs.stripe.com/billing/subscriptions
- Stripe Meters v2 API: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage
- Stripe Webhook signature verification: https://docs.stripe.com/webhooks/signatures
- Stripe CLI local-dev: https://docs.stripe.com/stripe-cli (forward `--forward-to`)
- Inngest TypeScript SDK: https://www.inngest.com/docs/sdk/typescript
- Inngest dev server: https://www.inngest.com/docs/dev-server (`npx inngest-cli@latest dev`)
- Logto Admin API (MAU widget): https://docs.logto.io/api/operations
- Logto JWKS endpoint pattern: https://docs.logto.io/quick-starts/m2m

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1)
- **`packages/contracts/src/db-schema.ts`** — Drizzle schema with all 9 Phase 1 tables (`organizations`, `users`, `projects`, `specs`, `generations`, `deployments`, `tools`, `pending_callbacks`, `usage_events`); Phase 8 extends in-place with ALTER + CREATE TABLE in a new migration.
- **`packages/contracts/src/idempotency.ts`** — `TOOL_NAME_REGEX` + `DEPLOY_ID_REGEX` + ULID helpers; Phase 8 reuses for Stripe Meters idempotency keys.
- **`packages/contracts/src/launch-criteria.ts`** — runtime constants for thresholds; Phase 8 must add `COST_CAP_FREE_USD = 0.50` and `COST_CAP_PRO_USD = 2.00` (or import from existing constants if already there) — pre-commit enforces paired `docs/decisions/` entry on any change (D-13 from Phase 1).
- **`packages/contracts/src/generation-api.ts`** — SSE event envelope; Phase 8 extends `partial_result` to carry `cumulative_cost_usd`.
- **`packages/contracts/src/usage-event.ts`** — schema for usage events; Phase 8 emits to `usage_events_outbox` using this shape.
- **`apps/api/src/`** — Hono BFF skeleton from Phase 1 OPS-05 (`index.ts` + `instrumentation.ts` + `routes/`); Phase 8 adds `middleware/auth.ts`, `middleware/quota.ts`, `routes/billing.ts`, `routes/stripe-webhook.ts`, `routes/drift.ts`, `inngest/functions/*.ts`.
- **`apps/api/src/instrumentation.ts`** — Sentry `withSentry` wrapper from Phase 1; Phase 8 ensures `beforeSend` redaction strips `Authorization`, `X-Upstream-Auth`, `Cookie`, Stripe customer IDs, JWTs.
- **`infrastructure/logto/README.md` + `infrastructure/logto/scaffold.ts`** — env-var contract (Phase 1 reference-only); Phase 8 adds `LOGTO_M2M_*` triple to the contract documentation.
- **`infrastructure/neon/SCALING.md`** — Phase 8 must validate Scale-tier compute upgrade ≥4 vCPU / 8GB by W8 (per Phase 1 D-18).
- **`packages/engine-fixtures/{stripe,github,notion,linear,slack}/`** — Phase 8 Wave 1–2 seeds synthetic usage_events_outbox rows from these fixtures.

### Established Patterns (carry-forward from Phase 1)
- **YYYYMMDDHHMMSS Drizzle migration prefix** (Phase 1 D-12) — Phase 8 migration: `20260428000000_phase8_billing_drift.sql`.
- **Idempotency-key shape `${operation}_${ulid}`** (Phase 1 D-11) — Phase 8 reuses for Stripe Meters events: `${deployment_id}_${minute_bucket_iso}_${tool_name}`.
- **Stable Inngest function IDs** (per CTRL-09 + Pitfall #21) — Phase 8 establishes the register in `packages/contracts/src/inngest-functions.ts`; bumps require paired decision-log entry.
- **Cross-workstream test ownership** (Phase 1 D-21) — Phase 8 owns all `tests/billing/`, `tests/auth/`, `tests/drift/`; cross-cutting failures escalate to MAIN as `chore(contracts):` PR.
- **Reference-only infrastructure scripts** (Phase 1 OPS-07 pattern with Logto scaffold + CF namespace creator) — Phase 8 follows the same pattern for `infrastructure/stripe/setup.ts` (idempotent product/price creation, committed but run manually by user).
- **Local-compute pivot** (project_local_compute.md) — Phase 8 uses local Inngest dev server, local filesystem for R2 substitute, real cloud SaaS for Stripe + Logto + Neon + Langfuse-self-hosted.

### Integration Points
- **`apps/api` (Hono BFF) is consumed by `apps/web` (frontend Phase 7)** via `POST /api/v1/generate`, `POST /api/v1/billing/checkout-session`, `GET /api/v1/dashboard/*`, `GET /api/v1/deployments/:id/drift-events`, `POST /api/v1/drift-events/:id/regenerate`.
- **`apps/api` Inngest functions are consumed by `engine` workstream** — engine sends SSE callbacks (cost events) → BFF cost-cap enforcer → engine cancel signal via M2M.
- **`packages/contracts/src/inngest-functions.ts` (new)** is the registry consumed by Phase 9 orphan audit.
- **`packages/contracts/src/storage.ts` (new)** is the abstraction consumed by Phase 8 (LocalFsStorageAdapter) and Phase 10 (R2StorageAdapter).
- **TimescaleDB hypertable `usage_events` is read by Phase 8 quota check** (real-time hourly aggregate); written by Phase 6 (when it lands) + Phase 8 fixture seeder (interim).

</code_context>

<specifics>
## Specific Ideas

- **User clarified ops-vs-frontend split:** Phase 8 = JWT verification middleware in Hono BFF (no `apps/web` Logto wire-up — that's Frontend Phase 7). This is a hard scope boundary; downstream planner must NOT add Next.js auth code to ops plans.

- **User clarified wave-staged Stripe integration:** Wave 1–2 = synthetic test events via mocked `stripe` SDK + fixture-seeded outbox rows; Wave 3+ = real Stripe sandbox with `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (user provides at start of Wave 3) and `stripe-cli` local-forward. Plan 08-W3 opens with "RUN `stripe listen --forward-to ...` in second terminal" header.

- **User clarified Inngest local-dev model:** `npx inngest-cli@latest dev` — separate process, NOT Inngest Cloud. README + package.json scripts make this explicit. NO Inngest Cloud signing key in `.env.local` until Phase 10.

- **User clarified Runtime ws dependency:** Wave 4 (E2E test signup → upgrade → generate → see invoice) is BLOCKED on Phase 6 (Runtime). Mitigation: synthetic outbox rows from `packages/engine-fixtures/` for Waves 1–3.

- **Stripe-cli is a Phase-8 local-dev requirement:** README documents `brew install stripe/stripe-cli/stripe`; CI on Phase 8 PRs does NOT require it (mocked Stripe in tests).

- **MAU watcher is preventive, not reactive:** alerts at 4K (75% of 5K free-tier cap) so we have a week to react before lock; Pro pre-buy at W7 happens on calendar regardless of MAU level (per D-14 from Phase 1).

- **Cost-cap kill is "in-flight cancel," not "post-hoc reject":** engine MUST honor the cancel signal mid-pass (not after the pass completes); otherwise the user is billed for already-spent tokens beyond the cap. Engine workstream may need a Phase 5 follow-up if it does not currently support mid-pass abort.

- **Drift Watcher diff comparison is Stage-A-only:** does NOT re-run Pass 0–5 (would be expensive and defeat purpose of catching cosmetic-only changes early). Stage A = parser only ($0, deterministic).

- **Auto-regenerate is opt-in only and bills normally:** never bypasses cost cap, never bypasses quota; user opting in is taking on the cost obligation.

- **R2 substitute is local filesystem (not S3 emulator like minio):** matches CF deferral simplicity; minio adds dev-machine container surface for solo founder. `LocalFsStorageAdapter` writes to `.local-storage/{specs,artifacts,public-cache}/` (gitignored).

</specifics>

<deferred>
## Deferred Ideas

- **Custom Logto email templates** (verification, password reset) — MVP uses Logto defaults; revisit post-launch if conversion data shows template friction.
- **Stripe Tax automatic calculation** — Stripe-hosted Checkout supports tax automatically; Phase 8 enables the toggle but does not add tax-jurisdiction logic.
- **Granular per-tool quota tracking** — current model is per-org per-month total F3 evals; per-tool / per-deployment quota deferred to v2.
- **Webhook signature key rotation automation** — Phase 8 documents manual rotation; automated rotation deferred.
- **Subscription downgrade prorating UX** — Stripe handles prorate at API level; UI affordance for "downgrade at period end" deferred to Phase 7+ post-launch polish.
- **Drift Watcher per-tenant sensitivity threshold** (Pitfall #34 mentions but defers) — MVP uses one global semantic-diff classifier; per-tenant tuning deferred to v1.x.
- **Drift batch regenerate** (regenerate N drifted deployments in one click) — MVP is per-deployment; bulk operation deferred.
- **Stripe Customer Portal integration** — for end-user self-serve billing changes (update card, cancel subscription); deferred to W8 polish or v1.x.
- **Inngest replay/observability dashboard wiring** — Inngest Cloud has it free; local dev server has subset; Phase 9 may surface in BetterStack.
- **R2 → S3 emulator (minio) for local dev** — explicitly NOT chosen; local filesystem preferred for solo-founder simplicity.
- **`LOGTO_M2M_*` reference scaffold script** — Phase 8 documents manually; full reference scaffold deferred to time-permitting cleanup.
- **CF Queue migration code path** — wired behind env-var flag (`USAGE_EVENT_TRANSPORT=cf-queue|outbox`) but not exercised until Phase 10.

### Reviewed Todos (not folded)
*None — no pending todos at start of Phase 8.*

</deferred>

---

*Phase: 08-auth-billing*
*Workstream: ops*
*Context gathered: 2026-04-26*
