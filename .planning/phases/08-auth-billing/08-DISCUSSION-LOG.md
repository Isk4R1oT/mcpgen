# Phase 8: Auth + Billing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `08-CONTEXT.md` — this log preserves alternatives considered and the user's mid-discussion clarifications that locked them in.

**Date:** 2026-04-26
**Phase:** 08-auth-billing
**Workstream:** ops
**Mode:** `--auto` (Claude picks recommended option for each gray area; user provided explicit clarifications mid-discussion that overrode/locked several choices)
**Areas discussed:** Logto wire-up depth, Stripe products+webhook flow, Quota enforcement architecture, Drift Watcher IR-diff, Local-mode adaptations (CF/R2/Inngest), Stripe Meters consumer architecture, Migration scope

---

## Area 1 — Logto wire-up depth (CTRL-02)

| Option | Description | Selected |
|--------|-------------|----------|
| A. Full-stack Logto (BFF middleware + Next.js `@logto/next` SDK in `apps/web`) | Phase 8 owns end-to-end auth: BFF JWT verify + apps/web sign-in/sign-out UI + protected routes via Next middleware | |
| B. **BFF-only JWT middleware (Hono `apps/api`); apps/web auth wire-up belongs to Frontend Phase 7** | Phase 8 = ops slice only — JWT verification + JWKS caching + 401 on invalid; M2M token for engine→BFF callbacks; manual Logto dashboard config; default email templates | ✓ |
| C. Reverse-proxy auth (Caddy/nginx in front of BFF) | Auth at proxy layer; BFF gets pre-verified user header | |

**User's choice:** B (locked by user clarification: "JWT verification middleware в Hono BFF + email + GitHub OAuth provider configuration в Logto dashboard")
**Rationale:** Frontend Phase 7 owns `apps/web` per ROADMAP.md FE-01..05; ops phase owns control-plane. Splitting along workstream boundaries respects parallel-execution model.

---

## Area 2 — Stripe products + checkout + webhook flow (CTRL-06)

| Option | Description | Selected |
|--------|-------------|----------|
| A. Embedded Stripe Elements (custom checkout UI) | Frontend renders card form via Stripe Elements; full design control; PCI scope expands | |
| B. **Stripe-hosted Checkout (redirect-based) + idempotent setup script + webhook handler in `apps/api`** | BFF creates Checkout Session → frontend redirects → Stripe handles 3DS/SCA/tax → webhook lands at `/api/v1/stripe/webhook` (signature-verified) → persisted to `subscription_events` with UNIQUE `stripe_event_id` | ✓ |
| C. Subscriptions-only (no PAYG) | Drop $0.50/eval pay-as-you-go; force everyone to Free or Pro tier | |

**User's choice:** B (recommended; user clarified separately that Stripe products+prices are NOT in Phase 1, so Phase 8 owns the idempotent setup script `infrastructure/stripe/setup.ts`)
**Rationale:** PCI compliance via Stripe-hosted; simpler MVP; supports all three pricing buckets (Free / Pro / PAYG) via Stripe Meters dimension `mcpgen_evals`.

---

## Area 3 — Quota check enforcement point (CTRL-07)

| Option | Description | Selected |
|--------|-------------|----------|
| A. Pre-execution check in engine (engine asks BFF before each Pass) | Tighter cost control; round-trip per pass | |
| B. **Pre-enqueue check in BFF before engine job submission + cost-cap enforced via SSE-driven cancel signal** | BFF reads TimescaleDB hourly-aggregate quota count → returns 429 if exceeded; engine streams cumulative cost back via SSE; BFF kills engine via M2M cancel endpoint on threshold cross | ✓ |
| C. Post-hoc billing only (no quota block, charge overage) | No 429s ever; user gets surprise bill | |

**User's choice:** B (recommended; user pinned the "TimescaleDB hourly aggregates as quota truth" + "$0.50/$2.00 cost cap server-side hard-fail" model)
**Rationale:** Pre-enqueue protects against engine LLM token waste; aligns with `docs/mcpgen-architecture.md` §10 + Pitfall #16.

---

## Area 4 — Drift Watcher IR-diff implementation (CTRL-03)

| Option | Description | Selected |
|--------|-------------|----------|
| A. Content-hash diff (sha256 of raw spec) | Cheap, simple; high false-positive rate on cosmetic reformat (Pitfall #34) | |
| B. **Stage-A-only re-parse + structured diff against last-known IR snapshot stored in `specs.parsed_ir_jsonb`; cosmetic fields ignored; semantic-only buckets (added/removed/changed)** | Catches real changes; ignores key reorder, whitespace, descriptions, x-* extensions; daily Inngest cron `drift-watcher-v1` (stable ID per CTRL-09) | ✓ |
| C. Full Pass 0–5 re-run + IR-diff at end | Most accurate but expensive (free runs would be unsustainable) | |

**User's choice:** B (recommended; aligns with Phase 1 D-03 "Drift Watcher in BFF" + Pitfall #34 mitigation prescribed by ROADMAP.md Phase 8 row)
**Rationale:** Parsed-IR diff matches `docs/mcpgen-pass-0-design.md` §"Spec drift" detection model; Stage A is $0 deterministic so daily cron is sustainable.

---

## Area 5 — R2 buckets + CF Queue substitution in local-compute mode

| Option | Description | Selected |
|--------|-------------|----------|
| A. Provision R2 + CF Queue early, run real CF infra in Phase 8 | Earliest validation; conflicts with `project_local_compute.md` pivot | |
| B. **Defer R2 + CF Queue to Phase 10; substitute with local filesystem (`LocalFsStorageAdapter`) + Postgres `usage_events_outbox` table; abstract behind interfaces in `packages/contracts/`** | Matches Phase 1 deferral pattern; one-line env-var flip in Phase 10 (`USAGE_EVENT_TRANSPORT=cf-queue|outbox`); fixture-seeded outbox rows for Wave 1–2 testing | ✓ |
| C. minio S3-emulator + Redis-as-queue for local dev | Closer to prod shape; adds container surface for solo founder | |

**User's choice:** B (recommended; matches `project_local_compute.md` and user's mid-discussion clarification about Inngest dev server local model)
**Rationale:** Solo-founder-friendly; deferral path proven in Phase 1; outbox pattern is industry-standard transactional reliability.

---

## Area 6 — Stripe Meters event consumer architecture

| Option | Description | Selected |
|--------|-------------|----------|
| A. Direct emission inline (tenant Worker → Stripe Meters API per tool call) | Simplest; couples tool latency to Stripe latency | |
| B. **Inngest function `stripe-meters-emit-v1` (stable ID) polls `usage_events_outbox` every 60s, batches to Stripe Meters with idempotent `${deployment_id}_${minute_bucket_iso}_${tool_name}` key, marks `sent_at = now()`** | Decouples; survives Stripe outages; idempotent; daily reconciler `usage-reconciler-v1` alerts on >2% drift | ✓ |
| C. Direct CF Queue → Inngest cloud (production model from architecture.md §10.1) | Final-state architecture; deferred to Phase 10 alongside CF | |

**User's choice:** B (recommended; CF Queue is deferred per `project_local_compute.md`, so outbox is the local-mode equivalent)
**Rationale:** Pitfall #13 (usage event loss under backpressure) prevention via outbox + idempotent UUID + UNIQUE `(tenant_id, tool_call_id)`; survives broker outages.

---

## Area 7 — Drizzle migration scope (atomic vs split)

| Option | Description | Selected |
|--------|-------------|----------|
| A. Split into 4 migrations (auth, billing, drift, outbox) | Smaller diffs per migration; harder to roll back as a unit | |
| B. **Single migration `20260428000000_phase8_billing_drift.sql` covering all Phase 8 schema additions atomically** | One migration = one phase = one rollback unit; matches Phase 1 pattern (single 9-table init migration); YYYYMMDDHHMMSS prefix per Phase 1 D-12 | ✓ |
| C. Per-table migrations (one per CREATE TABLE / ALTER) | Maximum granularity; 8+ migration files for one phase | |

**User's choice:** B (recommended; matches Phase 1 D-12 prefix convention + single-migration-per-phase pattern)
**Rationale:** Single transactional unit; simpler `drizzle-kit check` workflow; rollback story is "drop the phase 8 migration" not "drop 4 migrations in dependency order."

---

## User mid-discussion clarifications (locked beyond gray-area Q&A)

These were provided by the user as a single batch that overrode/locked decisions across multiple gray areas:

1. **Logto credentials** — already in `.env.local` from Phase 1 Wave 6; Phase 8 = JWT verification middleware in BFF + email/GitHub provider config in Logto dashboard. → Locked in D-01, D-02, D-03.
2. **Stripe Meters API** — Wave 1–2 on synthetic events; real Stripe in final wave (`STRIPE_SECRET_KEY` + webhook secret arrive at Wave 3 start). → Locked in D-10.
3. **Drift Watcher via Inngest dev server locally** (`npx inngest-cli@latest dev`), NOT Inngest Cloud. → Locked in D-21.
4. **TimescaleDB `usage_events` hypertable already in DB schema** from Phase 1 commit 01-04; Phase 8 writes quota enforcement via hourly aggregates. → Locked in D-12, D-24.
5. **Cost-cap server-side hard-fail:** $0.50 free / $2.00 pro per generation. → Locked in D-13.
6. **Quota:** Free 1 F3 eval/mo, Pro 5/mo, PAYG $0.50/eval. → Locked in D-12.
7. **NO Stripe products/prices configuration in Phase 1** → Phase 8 owns it. → Locked in D-07.
8. **TimescaleDB → Stripe Meters reconciliation daily cron alert on >2% drift** (per Pitfall #16). → Locked in D-15.
9. **Email verification + password reset via Logto default templates** (no custom email templates in MVP). → Locked in D-04.
10. **OAuth providers in Logto dashboard:** email + GitHub only (RULES.md §6 anti-pattern: OAuth zoo). → Locked in D-03; reaffirmed in deferred ideas.
11. **Logto Pro pre-buy planned for W7** (CONTEXT D-14) — runbook already exists in Phase 1 OPS-runbooks. → Carried forward; Phase 8 adds MAU watcher (D-05) for early warning.

## User-provided risk register (incorporated into `<specifics>` + `<deferred>`)

1. **Stripe webhook testing locally requires `stripe-cli`** — `brew install stripe/stripe-cli/stripe`; not blocking discuss/plan, blocks execute Wave 3+. → Locked in D-09.
2. **Runtime workstream (Phase 6) dependency** — quota enforcement E2E lives in Dispatch Worker; Wave 4 (signup → upgrade → generate → invoice) blocked until Phase 6 lands. Mitigation: `packages/engine-fixtures/` for synthetic tenant Workers. → Locked in D-25.
3. **TimescaleDB quotas need real `usage_events`** which only emit after Phase 6. Wave 1–2 on synthetic data is OK. → Locked in D-22, D-25.
4. **Inngest dev server is a separate process** (`npx inngest-cli@latest dev`) — not blocking discuss/plan, needed for execute. → Locked in D-21.

## Claude's Discretion

Per CONTEXT.md `<decisions>` section:
- Hono middleware composition order (auth → rate-limit → handler)
- Internal cancel-generation endpoint payload shape (engine ↔ BFF M2M)
- Resend email HTML template (drift notifications + reconciliation alerts)
- `infrastructure/stripe/setup.ts` shape (Bun script vs CLI helper)
- `LocalFsStorageAdapter` shape (sync vs async file ops)
- Where stripe-cli forwarding doc lives (`apps/api/README.md` vs `docs/runbooks/stripe-local-dev.md`)

## Deferred Ideas

Per CONTEXT.md `<deferred>` section: Custom Logto templates, Stripe Tax logic, granular per-tool quota, webhook signature rotation automation, downgrade prorating UX, drift per-tenant sensitivity, drift bulk regenerate, Stripe Customer Portal, Inngest observability dashboard, minio R2 emulator, full LOGTO_M2M scaffold script, CF Queue exercise (gated behind env-var flag for Phase 10).

---

*Discussion captured: 2026-04-26*
