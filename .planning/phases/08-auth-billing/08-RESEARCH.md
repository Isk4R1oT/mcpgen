# Phase 8: Auth + Billing — Research

**Researched:** 2026-04-26
**Domain:** Hono BFF (control plane) — Logto JWT auth + Stripe Billing/Meters + Inngest crons + Drift Watcher (Stage A re-parse) + cost-cap enforcement + TimescaleDB-backed quotas
**Workstream:** `ops`
**Confidence:** HIGH (per-decision implementation details verified against Context7 / npm registry / live project files; library versions pinned to versions verified 2026-04-26)

---

## 1. Executive Summary

Phase 8 lands the entire control-plane application code on top of the Phase-1 primitives: Hono BFF skeleton, frozen contracts, Drizzle schema, TimescaleDB hypertable, Logto Cloud `mcpgen-prod` tenant, and engine-fixtures shadow service. Every Phase 8 surface (auth middleware, billing routes, Inngest functions, drift watcher) is a NEW file under `apps/api/src/{middleware,routes,inngest}/`, plus four new `packages/contracts/src/{inngest-functions,storage,quota-queries,plan-tier}.ts` shared types, plus a single atomic Drizzle migration `20260428000000_phase8_billing_drift.sql`.

Implementation strategy: **(1)** Logto JWT verification middleware via `jose@^6.2.2` `createRemoteJWKSet` distinguishes user vs M2M tokens by `aud` claim; **(2)** Stripe-hosted Checkout (`stripe@^22.1.0`, no embedded Elements) with idempotent setup script; **(3)** webhook handler at `POST /api/v1/stripe/webhook` uses `stripe.webhooks.constructEventAsync` (CF Workers compatible) with `subscription_events.stripe_event_id UNIQUE` for dedup; **(4)** Inngest `^4.2.4` TS SDK, served via `inngest/hono`, dev-server via `npx inngest-cli@latest dev`; **(5)** quota check pre-enqueue reads TimescaleDB hourly aggregate (real-time truth) with daily reconciliation cron alerting >2% drift vs Stripe Meters; **(6)** Drift Watcher invokes the Python engine's Stage A endpoint (HTTP, not TS port) and diffs against `specs.parsed_ir_jsonb`; **(7)** all Phase 8 storage that would touch R2 lives behind `LocalFsStorageAdapter` per the local-compute pivot.

**Primary recommendation:** Wave 1 lands the Drizzle migration + Logto middleware + Inngest function-ID register first — these unblock every other Wave. Wave 2 lands Stripe setup script + webhook handler with mocked Stripe in tests. Wave 3 swaps in real Stripe sandbox + cost cap + quota check. Wave 4 lands Drift Watcher + reconciliation. Wave 5 (E2E) is BLOCKED on Phase 6; mitigated by synthetic outbox seeder from `packages/engine-fixtures/`.

---

## 2. Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| User JWT verification | Hono BFF middleware | — | D-01 explicit: NO `apps/web` auth in Phase 8 (Frontend Phase 7 owns); BFF is the trust boundary for `/api/v1/*` |
| M2M JWT verification (engine→BFF) | Hono BFF middleware | Logto Cloud (token issuance) | D-02: same middleware, dispatched by `aud` claim |
| OAuth flows for end-users | Logto Cloud (out of process) | — | Hosted; we never see passwords or OAuth state |
| Stripe Checkout Session creation | Hono BFF route | Stripe Checkout (hosted UI) | D-06: hosted, NOT embedded — PCI compliance free |
| Stripe webhook handling | Hono BFF route | Postgres `subscription_events` | D-08: synchronous handle <30s, persist for replay/audit |
| Stripe Meters event emission | Inngest function (60s poll) | Postgres `usage_events_outbox` | D-22: outbox replaces CF Queue for Phases 1–9 |
| Quota enforcement (real-time) | Hono BFF middleware (pre-enqueue) | TimescaleDB hourly aggregate | D-12: TimescaleDB = quota truth, Stripe = billing eventual |
| Cost-cap enforcement | Hono BFF (per-generation accumulator) + Engine (M2M cancel) | `generations.cumulative_cost_usd` column | D-13: in-flight cancel mid-pass, never silent overrun |
| Quota period rollover | Inngest function (hourly) | Postgres `organizations.quota_period_start` | D-14: anniversary-based, synced to Stripe webhook |
| TimescaleDB ↔ Stripe Meters reconciliation | Inngest function (daily 02:00 UTC) | Resend (alerts) | D-15: alert >2% drift; mitigates Pitfall #16 |
| Drift detection | Inngest function (daily 03:00 UTC) | Engine `/internal/v1/parse` (Stage A) | D-16: parsed-IR diff, not content-hash; mitigates Pitfall #34 |
| Drift email rate-limit | Postgres `drift_email_log` UNIQUE constraint | Resend SDK | D-18: max 1/recipient/week |
| Spec snapshot storage (drift baseline) | `LocalFsStorageAdapter` | Phase 10 → R2 swap | D-23: env-flag swap, no code change |
| Logto MAU monitoring | Inngest function (daily 04:00 UTC) | Logto Admin API | D-05: alert at 4K (75% of 5K free cap) |

---

## 3. Project Constraints (from CLAUDE.md)

Carry-forward project-wide directives that the Phase 8 plan MUST honor:

- **Conventional Commits 1.0.0 mandatory** — `type(scope): subject` ≤72 chars, imperative, no period; atomic commits; squash-merge only.
- **NEVER `--no-verify`** — pre-commit hooks (gitleaks, ruff, eslint, mypy, conventional-pre-commit) always run.
- **NEVER force-push to main**, NEVER history rewrite on shared branches, NEVER `git push --force` without explicit approval (per `docs/mcpgen-git-workflow-rules.md`).
- **Tech stack LOCKED** — no swap of Hono/Drizzle/Stripe/Logto/Inngest/Resend; vendor migrations require new Key Decision.
- **Privacy LOCKED** — never log spec content, upstream API responses, or upstream credentials. Sentry `beforeSend` MUST redact `Authorization`, `X-Upstream-Auth`, `Cookie` (already wired in Phase 1 `instrumentation.ts`); Phase 8 extends to redact Stripe customer IDs + JWTs in URLs.
- **Pass-through credentials default** — Phase 8 NEVER persists upstream API keys.
- **Cost cap LOCKED at $0.50 free / $2.00 pro** — exceeding → hard fail with partial result + bill, never silent overrun.
- **Pre-commit `launch-criteria-paired-decision.sh`** — any change to `packages/contracts/launch-criteria.ts` requires a paired `docs/decisions/<YYYY-MM-DD>-<slug>.md` entry. Phase 8 will add `COST_CAP_FREE_USD` + `COST_CAP_PRO_USD` to this file → must include paired decision entry in same commit.
- **Drizzle migration prefix `YYYYMMDDHHMMSS_<name>.sql`** (D-12) — Phase 8 file: `20260428000000_phase8_billing_drift.sql`.
- **No Google/Twitter/Apple OAuth providers** — RULES.md §6 anti-pattern #5; explicit OUT-OF-SCOPE.
- **No embedded Stripe Elements** — D-06 locks Stripe-hosted Checkout.
- **No CF Workers/Fly/R2 deployment in Phase 8** — local-compute pivot, deferred to Phase 10.
- **No UI work in Phase 8** — that's Frontend Phase 7.
- **No LLM calls in Phase 8** — Drift Watcher uses Stage A parser only ($0, deterministic).

---

## 4. User Constraints (from 08-CONTEXT.md)

### Locked Decisions (D-01 through D-28)

All 28 decisions from `.planning/phases/08-auth-billing/08-CONTEXT.md` `<decisions>` block are LOCKED. The implementation notes in §6 below map each decision to concrete code patterns.

### Claude's Discretion (from CONTEXT.md)

The planner has freedom on:
- Specific Hono middleware composition order (auth → rate-limit → handler) — recommendation in §9.
- Specific shape of internal cancel-generation endpoint payload (engine ↔ BFF M2M) — recommendation in §13.
- Specific Resend email HTML templates for drift + reconciliation alerts — minimal text-only templates recommended (no react-email in MVP).
- Whether `infrastructure/stripe/setup.ts` is a Bun script or Bun + Commander CLI — **recommend plain Bun script** (matches `infrastructure/logto/scaffold.ts` reference-only pattern from Phase 1).
- Specific shape of `LocalFsStorageAdapter` (sync vs async file ops) — **recommend async** (`fs/promises`); matches BFF Web-Standard request handling; future R2 adapter is async too.
- Whether stripe-cli forwarding doc lives in `apps/api/README.md` or `docs/runbooks/stripe-local-dev.md` — **recommend `apps/api/README.md`** (single source per local-dev convention from Phase 1; Logto README is at `infrastructure/logto/README.md`, but Stripe is local-dev workflow more than infra).

### Deferred Ideas (OUT OF SCOPE for Phase 8)

- Custom Logto email templates (MVP uses defaults).
- Stripe Tax automatic calculation (toggle enabled at Checkout, no jurisdiction logic).
- Granular per-tool quota tracking.
- Webhook signature key rotation automation.
- Subscription downgrade prorating UX.
- Drift Watcher per-tenant sensitivity threshold.
- Drift batch regenerate.
- Stripe Customer Portal integration.
- Inngest replay/observability dashboard wiring.
- R2 → S3 emulator (minio) for local dev.
- `LOGTO_M2M_*` reference scaffold script (manual setup).
- CF Queue migration code path (env-flag stub only).

---

## 5. Phase Requirements

Phase 8 owns six requirements from `.planning/REQUIREMENTS.md`:

| ID | Description | Research Support |
|----|-------------|------------------|
| **CTRL-02** | Auth via Logto Cloud (email + GitHub providers; no Google/Twitter/Apple) | §6 D-01..05; §10 (JWT verification details); §13 (Pitfall #17 — MAU watcher) |
| **CTRL-03** | Drift Watcher (daily Inngest cron) compares parsed IR (not content hash); per-recipient email rate-limit max 1/week | §6 D-16..20; §11 (Drift Watcher implementation); §13 (Pitfall #34) |
| **CTRL-04** | Drizzle migrations cover full data model on Neon Postgres 16 + TimescaleDB + pgvector with Scale-tier (≥4 vCPU/8GB) for production | §6 D-28; §7 (Drizzle migration SQL) |
| **CTRL-05** | R2 holds three buckets (mcpgen-specs, mcpgen-artifacts 30-day TTL, mcpgen-public-cache); no PII or credentials persisted | **DEFERRED to Phase 10** per local-compute pivot; Phase 8 ships `LocalFsStorageAdapter` interface (D-23) so Phase 10 swaps backend with no code changes |
| **CTRL-06** | Stripe Billing + Meters API supports Free / Pro / PAYG with per-generation cost cap ($0.50 / $2.00) enforced server-side | §6 D-06..11; §8 (Stripe local-dev); §10 (cost-cap SSE protocol) |
| **CTRL-07** | Quota uses TimescaleDB hourly aggregates as quota truth; daily reconciliation alerts >2% drift; cost cap exceeded → hard fail with partial + bill | §6 D-12..15; §9 (TimescaleDB quota query) |

CTRL-08, CTRL-09 are Phase 9 (observability + Inngest orphan audit). Phase 8 prepares for CTRL-09 by establishing the function-ID register in `packages/contracts/src/inngest-functions.ts` (D-27).

---

## 6. Per-Decision Implementation Notes

### Logto wire-up (D-01..D-05)

**D-01 — Logto JWT verification middleware in Hono BFF only:**
- File: `apps/api/src/middleware/auth.ts` (NEW).
- Library: `jose@^6.2.2` (verified 2026-04-26 via npm registry; Web-standard, runs on Bun + CF Workers + Node identically) — already added to `apps/api/package.json` requires no new dep (jose currently absent; **add `jose@^6.2.2`** to `apps/api/dependencies`).
- Pattern (verified via Context7 `/panva/jose` docs):
  ```typescript
  import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
  import { createMiddleware } from 'hono/factory';

  // Module-level: cached JWKS resolver. createRemoteJWKSet caches keys for
  // 10 minutes by default and re-fetches on cache miss.
  let jwksResolver: ReturnType<typeof createRemoteJWKSet> | null = null;
  function getJwks(env: { LOGTO_ENDPOINT: string }) {
    if (!jwksResolver) {
      jwksResolver = createRemoteJWKSet(
        new URL(`${env.LOGTO_ENDPOINT}/oidc/jwks`),
        { cooldownDuration: 30_000, cacheMaxAge: 600_000 },
      );
    }
    return jwksResolver;
  }

  export interface AuthContext {
    subject: string;
    organizationId: string | null;
    isM2M: boolean;
    scopes: ReadonlyArray<string>;
    raw: JWTPayload;
  }

  export const authMiddleware = createMiddleware<{
    Bindings: { LOGTO_ENDPOINT: string; LOGTO_M2M_RESOURCE_INDICATOR: string };
    Variables: { auth: AuthContext };
  }>(async (c, next) => {
    const authz = c.req.header('Authorization');
    if (!authz?.startsWith('Bearer ')) {
      return c.json({ error: 'unauthorized', reason: 'missing_bearer' }, 401);
    }
    const token = authz.slice(7);
    try {
      const issuer = `${c.env.LOGTO_ENDPOINT}/oidc`;
      // Audience differs by token type:
      //   user JWT     → audience = LOGTO_BASE_URL (web app indicator)
      //   M2M JWT      → audience = LOGTO_M2M_RESOURCE_INDICATOR
      // We accept both via `audience` array; downstream code checks aud claim.
      const { payload } = await jwtVerify(token, getJwks(c.env), {
        issuer,
        audience: [c.env.LOGTO_M2M_RESOURCE_INDICATOR /* + LOGTO_BASE_URL via env */],
      });
      const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
      const isM2M = aud === c.env.LOGTO_M2M_RESOURCE_INDICATOR;
      c.set('auth', {
        subject: payload.sub ?? '',
        organizationId: (payload.organization_id as string | undefined) ?? null,
        isM2M,
        scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
        raw: payload,
      });
      await next();
      return;
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'jwt_verify_failed';
      return c.json({ error: 'unauthorized', reason: code }, 401);
    }
  });
  ```
- Mounting (in `apps/api/src/index.ts`):
  ```typescript
  // Public routes BEFORE app.use(authMiddleware) — health + Stripe webhook.
  app.get('/health', ...);
  app.get('/health/launch-criteria', ...);
  app.route('/api/v1/stripe/webhook', stripeWebhookRoute); // raw body; signature is its own auth
  // Protected routes via dedicated sub-app:
  const protectedApp = new Hono();
  protectedApp.use('*', authMiddleware);
  protectedApp.route('/generate', generateRoute);
  protectedApp.route('/billing', billingRoute);
  protectedApp.route('/dashboard', dashboardRoute);
  protectedApp.route('/deployments', deploymentsRoute);
  app.route('/api/v1', protectedApp);
  ```
- ENV vars consumed (already present in `.env.local` per Phase 1; M2M triple is NEW in Phase 8):
  - `LOGTO_ENDPOINT` — existing.
  - `LOGTO_M2M_APP_ID`, `LOGTO_M2M_APP_SECRET`, `LOGTO_M2M_RESOURCE_INDICATOR` — NEW; user provisions via Logto Console → Applications → "MCPGen Engine M2M".

**D-02 — M2M client_credentials grant:**
- Engine fetches token at startup via Python `httpx`:
  ```python
  # apps/generation-engine/src/mcpgen_engine/auth/m2m.py (NEW in Phase 8)
  resp = await httpx.post(
      f"{LOGTO_ENDPOINT}/oidc/token",
      auth=(LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET),
      data={
          "grant_type": "client_credentials",
          "resource": LOGTO_M2M_RESOURCE_INDICATOR,
          "scope": "all",
      },
  )
  token = resp.json()["access_token"]
  expires_at = time.time() + resp.json()["expires_in"] - 60  # 60s safety margin
  ```
- Token is cached at module level in engine; refresh when `time.time() > expires_at`.
- Engine attaches `Authorization: Bearer ${token}` to ALL callbacks → BFF (`POST /internal/v1/sse-callback`, `POST /internal/v1/cost-event`, `POST /api/v1/jobs/${id}/stream` resume).
- BFF middleware distinguishes user vs M2M via `aud` claim — separate handler dispatch happens in route handlers, not middleware (middleware sets `c.var.auth.isM2M`).

**D-03 — Logto dashboard config is manual + idempotent procedure:**
- Phase 8 adds `docs/runbooks/logto-tenant-setup.md` documenting click-path:
  1. Create tenant (`mcpgen-staging` / `mcpgen-sandbox`).
  2. Sign-in experience → enable email + password.
  3. Connectors → social → GitHub → paste OAuth app credentials.
  4. Applications → create traditional-web app "MCPGen Web" + M2M app "MCPGen Engine M2M".
  5. Resources → create `https://api.mcpgen.dev/m2m` (resource indicator for M2M).
  6. Export App IDs → `.env.local`.
- `infrastructure/logto/scaffold.ts` (existing, reference-only) extended to LIST connectors + applications and warn if missing — still NOT auto-create (Phase 1 D-14 pattern).

**D-04 — Default email templates:**
- No code change; Logto Console branding only.

**D-05 — Daily MAU watcher cron:**
- File: `apps/api/src/inngest/functions/logto-mau-watch.ts` (NEW).
- Stable function ID: `logto-mau-watch-v1` (D-27).
- Schedule: `cron('0 4 * * *')` — daily 04:00 UTC.
- Logto Admin API call (verified via `/websites/logto_io` Context7):
  ```typescript
  // Get M2M token first (Logto Management API audience)
  const tokenRes = await fetch(`${env.LOGTO_ENDPOINT}/oidc/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${env.LOGTO_M2M_APP_ID}:${env.LOGTO_M2M_APP_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: `https://${new URL(env.LOGTO_ENDPOINT).host}/api`,
      scope: 'all',
    }),
  });
  const { access_token } = await tokenRes.json();

  // Read MAU widget
  const mauRes = await fetch(
    `${env.LOGTO_ENDPOINT}/api/dashboard/widgets/active-user-count`,
    { headers: { Authorization: `Bearer ${access_token}` } },
  );
  const { count: mau } = await mauRes.json();
  ```
- Threshold: `mau > 4000` → send Resend email to ops + write to `mau_log` table (NEW in migration — small table for trend, NOT a hypertable).
- Pitfall #17 mitigation.

### Stripe Billing + Meters (D-06..D-11)

**D-06 — Stripe-hosted Checkout (NOT embedded):**
- Library: `stripe@^22.1.0` (verified 2026-04-26 via npm; latest stable; v22 uses API version `2025-09-30.clover` per Stripe Node v22 release; v18+ migrated to Basil API per Context7).
- Pattern (verified via Context7 `/stripe/stripe-node`):
  ```typescript
  // apps/api/src/routes/billing/checkout.ts (NEW)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: org.stripe_customer_id ?? undefined,  // Stripe creates if absent
    customer_email: org.stripe_customer_id ? undefined : user.email,
    line_items: [{ price: env.STRIPE_PRICE_PRO, quantity: 1 }],
    success_url: `${env.LOGTO_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.LOGTO_BASE_URL}/billing/cancel`,
    metadata: { org_id: org.id },
    subscription_data: { metadata: { org_id: org.id } },
  });
  return c.json({ url: session.url });
  ```
- v22 note: subscriptions are NOT created until customer completes payment (Basil API change); webhook flow handles `checkout.session.completed` → look up subscription via `session.subscription`.

**D-07 — Idempotent Stripe setup script:**
- File: `infrastructure/stripe/setup.ts` (NEW; reference-only pattern matching `infrastructure/logto/scaffold.ts`).
- Strategy: use stable IDs so re-runs are no-ops:
  ```typescript
  // Try to retrieve product by stable ID; if missing, create with that ID.
  // Note: Stripe DOES allow custom IDs at creation via `id` field for Products/Prices.
  let proProduct;
  try {
    proProduct = await stripe.products.retrieve('prod_mcpgen_pro');
  } catch (err) {
    if ((err as Stripe.errors.StripeError).code === 'resource_missing') {
      proProduct = await stripe.products.create({
        id: 'prod_mcpgen_pro',
        name: 'MCPGen Pro',
        description: 'Pro plan: 5 F3 evals/mo + cost cap $2.00/generation',
        metadata: { tier: 'pro' },
      });
    } else throw err;
  }
  // Idempotency: prices CANNOT be updated; if attributes differ, create new + archive old (manual decision).
  ```
- Output: `STRIPE_PRICE_PRO`, `STRIPE_METER_EVALS_ID`, `STRIPE_METER_TOOL_CALLS_ID`, `STRIPE_METER_GENERATIONS_ID` printed to stdout for `.env.local`.
- Meters created with V2 API:
  ```typescript
  await stripe.billing.meters.create({
    display_name: 'MCPGen F3 Evals',
    event_name: 'mcpgen_evals',
    default_aggregation: { formula: 'count' },
    customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
    value_settings: { event_payload_key: 'value' },
  });
  ```
- Run manually by user: `bun run infrastructure/stripe/setup.ts` (no CI).

**D-08 — Stripe webhook handler:**
- File: `apps/api/src/routes/stripe-webhook.ts` (NEW).
- CRITICAL: webhook must use **raw body** for signature verification — Hono's default `c.req.text()` works. CF Workers compatibility requires `constructEventAsync` (NOT sync `constructEvent`) per Context7:
  ```typescript
  // apps/api/src/routes/stripe-webhook.ts
  import { Hono } from 'hono';
  import Stripe from 'stripe';

  export const stripeWebhookRoute = new Hono<{ Bindings: { STRIPE_SECRET_KEY: string; STRIPE_WEBHOOK_SECRET: string } }>();

  stripeWebhookRoute.post('/', async (c) => {
    const sig = c.req.header('stripe-signature');
    const rawBody = await c.req.text();
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, sig!, c.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return c.json({ error: 'invalid_signature' }, 400);
    }

    // Idempotency: persist FIRST, dispatch handler INSIDE same transaction.
    const inserted = await db.insert(subscription_events).values({
      id: ulid(),
      organization_id: extractOrgId(event),  // from event.data.object.metadata.org_id
      event_type: event.type,
      stripe_event_id: event.id,
      payload: event,
      status: 'received',
    }).onConflictDoNothing({ target: subscription_events.stripe_event_id }).returning();

    if (inserted.length === 0) {
      // Already seen; ack 200.
      return c.json({ received: true, duplicate: true });
    }

    try {
      await dispatchSubscriptionEvent(event);  // your switch statement
      await db.update(subscription_events)
        .set({ status: 'processed', processed_at: new Date() })
        .where(eq(subscription_events.stripe_event_id, event.id));
    } catch (handlerErr) {
      await db.update(subscription_events)
        .set({ status: 'error', error_message: String(handlerErr) })
        .where(eq(subscription_events.stripe_event_id, event.id));
      throw handlerErr;  // Stripe retries non-2xx
    }

    return c.json({ received: true });
  });
  ```
- Handled events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Unhandled: persisted with `status='received'`, ack 200 (forward-compat).
- Webhook MUST be mounted BEFORE auth middleware (signature is the auth surface).

**D-09 — `stripe-cli` local-dev requirement:**
- Documented in `apps/api/README.md` (Phase 8 amendment):
  ```bash
  brew install stripe/stripe-cli/stripe
  stripe login
  stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook
  # Capture: > Ready! Your webhook signing secret is whsec_xxx
  # Add to .env.local: STRIPE_WEBHOOK_SECRET=whsec_xxx
  ```
- **Webhook secret rule:** `whsec_xxx` issued by `stripe listen` is **stable across restarts** per Context7 (different from Dashboard secret used in production); this is the value used in dev.

**D-10 — Wave-staged Stripe integration:**
- Wave 1–2: `vi.mock('stripe', ...)` in vitest; type-only import of `Stripe` from `stripe`. NO real API calls.
- Wave 3+: real `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` from `.env.local`; `stripe-cli` running in second terminal.
- Mock pattern for Wave 1–2 webhook tests:
  ```typescript
  // apps/api/tests/stripe-webhook.test.ts
  import { vi } from 'vitest';
  vi.mock('stripe', () => ({
    default: vi.fn().mockImplementation(() => ({
      webhooks: {
        constructEventAsync: vi.fn().mockResolvedValue({
          id: 'evt_test_1',
          type: 'customer.subscription.created',
          data: { object: { id: 'sub_test_1', metadata: { org_id: 'org-test-1' } } },
        }),
      },
    })),
  }));
  ```

**D-11 — Plan tier on `organizations` table:**
- Already present in Phase 1 schema: `plan_tier text not null default 'free'` + `stripe_customer_id text` (NOT unique in current schema; Phase 8 ALTER will ADD UNIQUE constraint).
- Phase 8 ADDS: `subscription_status text` + `quota_period_start timestamptz default now()` + tightens `stripe_customer_id` to UNIQUE.

### Quota enforcement (D-12..D-15)

**D-12 — Pre-enqueue quota check:**
- New helper: `apps/api/src/lib/quota.ts` (or `packages/contracts/src/quota-queries.ts` if cross-package consumption needed; **recommend `apps/api/src/lib/`** since it's BFF-internal).
- Logic:
  ```typescript
  type QuotaResult =
    | { ok: true; used: number; limit: number; reset_at: Date }
    | { ok: false; reason: 'quota_exceeded'; used: number; limit: number; reset_at: Date };

  export async function checkQuota(
    db: DbClient,
    orgId: string,
    eventType: 'f3_eval' | 'generation',
  ): Promise<QuotaResult> {
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    if (!org) throw new Error('org_not_found');

    // PAYG plan never blocks — every eval bills $0.50.
    if (org.plan_tier === 'payg') return { ok: true, used: 0, limit: Infinity, reset_at: new Date() };

    const limit = QUOTA_LIMITS[org.plan_tier]?.[eventType] ?? 0;
    const reset = new Date(org.quota_period_start);
    reset.setMonth(reset.getMonth() + 1);

    // Quota truth = TimescaleDB hourly aggregate (Pitfall #16; D-12).
    const used = await db.execute(sql`
      SELECT COALESCE(SUM(call_count), 0)::int AS used
      FROM usage_hourly
      WHERE org_id = ${orgId}
        AND event_type = ${eventType}
        AND bucket >= ${org.quota_period_start}
        AND bucket < ${reset}
    `);
    const usedCount = (used.rows[0] as { used: number }).used;

    if (usedCount >= limit) {
      return { ok: false, reason: 'quota_exceeded', used: usedCount, limit, reset_at: reset };
    }
    return { ok: true, used: usedCount, limit, reset_at: reset };
  }
  ```
- Constants in `packages/contracts/src/plan-tier.ts` (NEW):
  ```typescript
  export const QUOTA_LIMITS = {
    free: { f3_eval: 1, generation: 3 },
    pro: { f3_eval: 5, generation: 25 },
    payg: { f3_eval: Infinity, generation: Infinity },
  } as const;
  ```
- Called from `POST /api/v1/generate` BEFORE creating `generations` row.
- Returns 429 with `{quota_used, quota_limit, reset_at}` on exceed.

**D-13 — Cost-cap enforcement (engine-driven, BFF-coordinated):**
- See §10 below for full SSE protocol.
- New launch-criteria constants in `packages/contracts/src/launch-criteria.ts`:
  ```typescript
  export const LAUNCH_CRITERIA = {
    F2_SMELL_MIN: 4.0,
    F3_AGENT_PASS_RATE_MIN: 0.7,
    BUNDLE_SIZE: { PASS_KB: 800, WARN_KB: 950, FAIL_KB_EXCLUSIVE: 950 },
    COVERAGE_PCT_MIN: 100,
    COST_CAP_FREE_USD: 0.50,    // NEW Phase 8 — D-13
    COST_CAP_PRO_USD: 2.00,     // NEW Phase 8 — D-13
  } as const;
  ```
- Pre-commit `launch-criteria-paired-decision.sh` enforces paired `docs/decisions/2026-04-XX-cost-cap-thresholds.md` entry in same commit.

**D-14 — Anniversary-based quota period rollover:**
- Inngest function `quota-period-rollover-v1` runs hourly:
  ```typescript
  inngest.createFunction(
    { id: 'quota-period-rollover-v1', triggers: [cron('0 * * * *')] },
    async ({ step }) => {
      await step.run('rollover-due-orgs', async () => {
        await db.execute(sql`
          UPDATE organizations
          SET quota_period_start = quota_period_start + INTERVAL '1 month'
          WHERE quota_period_start + INTERVAL '1 month' < NOW()
        `);
      });
    },
  );
  ```
- On `customer.subscription.updated` webhook event, also UPDATE `quota_period_start` to match Stripe's `current_period_start` for sync.

**D-15 — Daily reconciliation Inngest cron:**
- File: `apps/api/src/inngest/functions/usage-reconciler.ts`.
- Stable ID: `usage-reconciler-v1` (D-27).
- Schedule: `cron('0 2 * * *')` — daily 02:00 UTC.
- Steps:
  1. For each (tenant, event_type) seen yesterday: compute TimescaleDB count from `usage_hourly` for the previous calendar day.
  2. Read Stripe count via `stripe.billing.meters.eventSummaries.list({ id: METER_ID, customer: stripe_customer_id, start_time: yesterday_00, end_time: today_00 })`.
  3. Compute drift_pct = abs(timescale_count - stripe_count) / max(timescale_count, 1) * 100.
  4. Insert `reconciliation_log` row with `(reconciliation_date, event_type, tenant_id)` UNIQUE (idempotent re-run).
  5. If drift_pct > 2.0 → Resend email to ops + set `alerted=true`.
- Pitfall #16 mitigation.

### Drift Watcher (D-16..D-20)

**D-16 — Drift Watcher Inngest daily cron:**
- File: `apps/api/src/inngest/functions/drift-watcher.ts`.
- Stable ID: `drift-watcher-v1` (D-27).
- Schedule: `cron('0 3 * * *')` — daily 03:00 UTC.
- Logic:
  ```typescript
  inngest.createFunction(
    { id: 'drift-watcher-v1', triggers: [cron('0 3 * * *')] },
    async ({ step }) => {
      const deployments = await step.run('list-active', async () =>
        db.query.deployments.findMany({
          where: and(
            isNotNull(deployments.source_url),  // Phase 8 ADDs source_url col? NO — already on `specs.spec_url`; query joins via spec
          ),
          with: { generation: { with: { spec: true } } },
        }),
      );
      for (const d of deployments) {
        await step.invoke(`check-drift-${d.id}`, {
          function: checkDriftForDeployment,
          data: { deploymentId: d.id, specUrl: d.generation.spec.spec_url },
        });
      }
    },
  );
  ```
- Sub-function `checkDriftForDeployment` per deployment (Inngest fan-out pattern, allows independent retries):
  ```typescript
  const checkDriftForDeployment = inngest.createFunction(
    { id: 'drift-watcher-check-v1', triggers: [{ event: 'drift/check.requested' }] },
    async ({ event, step }) => {
      const { deploymentId, specUrl } = event.data;
      // 1. Fetch upstream spec
      const upstreamSpec = await step.run('fetch-upstream', async () =>
        fetchWithTimeout(specUrl, 30_000));
      // 2. Re-parse Stage A via engine HTTP
      const newIr = await step.run('parse-stage-a', async () =>
        callEngineStageA(upstreamSpec));
      // 3. Read baseline IR
      const spec = await step.run('load-baseline', async () =>
        db.query.specs.findFirst({ where: ... }));
      const baselineIr = spec.parsed_ir_jsonb;
      // 4. Diff (cosmetic-ignored per D-17)
      const diff = computeIrDiff(baselineIr, newIr);
      if (diff.empty) return { changed: false };
      // 5. Persist drift_event
      const driftEvent = await step.run('persist-event', async () =>
        db.insert(drift_events).values({
          id: ulid(),
          deployment_id: deploymentId,
          detected_at: new Date(),
          diff_json: diff,
          status: 'pending',
        }).returning());
      // 6. Send email (rate-limited per D-18)
      await step.run('maybe-email', async () =>
        sendDriftEmailIfAllowed(tenantId, driftEvent));
      return { changed: true, diffSummary: diff.summary };
    },
  );
  ```

**D-17 — Diff comparison ignores cosmetic fields:**
- File: `apps/api/src/lib/drift/ir-diff.ts` (NEW).
- Compared fields per endpoint: `path`, `method`, `parameters[].name`, `parameters[].in`, `parameters[].required`, `parameters[].schema.type`, `requestBody.content.*.schema`, `responses.*.content.*.schema`.
- Ignored: `summary`, `description`, `tags`, `externalDocs`, `x-*` extensions, key order in objects, whitespace.
- Algorithm: deep-clone both IRs, recursively strip ignored fields, then `JSON.stringify` with sorted keys + diff via simple key-set comparison (added/removed/changed buckets):
  ```typescript
  export interface IrDiff {
    empty: boolean;
    added: ReadonlyArray<{ path: string; method: string; reason: string }>;
    removed: ReadonlyArray<{ path: string; method: string }>;
    changed: ReadonlyArray<{ path: string; method: string; field: string; before: unknown; after: unknown }>;
    summary: string;
  }
  ```
- Recommended dep: NONE (custom impl is ~150 LOC; `microdiff` would work but adds dep for one use). **Recommend custom impl.**

**D-18 — Per-recipient email rate-limit max 1/week via DB UNIQUE:**
- Insert into `drift_email_log` with `(tenant_id, week_start)` UNIQUE constraint:
  ```typescript
  async function sendDriftEmailIfAllowed(tenantId: string, drift: DriftEvent): Promise<void> {
    const weekStart = isoWeekStart(new Date());  // Monday 00:00 UTC
    try {
      await db.insert(drift_email_log).values({
        tenant_id: tenantId,
        week_start: weekStart,
        sent_at: new Date(),
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Already sent this week — silently skip; drift_event still persisted.
        return;
      }
      throw err;
    }
    // Batch all this week's drift events for this tenant in one email
    const allDrifts = await db.query.drift_events.findMany({
      where: and(
        eq(drift_events.deployment_id, drift.deployment_id),
        gte(drift_events.detected_at, weekStart),
      ),
    });
    await resend.emails.send({
      from: 'MCPGen <drift@mcpgen.dev>',
      to: [user.email],
      subject: `Spec changes detected for ${allDrifts.length} deployment(s)`,
      text: renderDriftEmailText(allDrifts),
    });
  }
  ```

**D-19 — Drift events surface in dashboard with three actions:**
- Phase 8 wires BFF endpoints; UI is Phase 7 (FE-04):
  - `GET /api/v1/deployments/:id/drift-events` — list pending drift events for a deployment.
  - `POST /api/v1/drift-events/:id/regenerate` — submits new generation against latest spec; returns `{job_id, sse_url}` (same shape as `POST /api/v1/generate`).
  - `PATCH /api/v1/deployments/:id` — body `{ auto_regenerate_on_drift: boolean }` — toggle opt-in auto-regenerate.

**D-20 — Auto-regenerate uses standard generate flow:**
- New `triggered_by` enum-shaped column: `'user' | 'drift_auto' | 'drift_manual'` on `generations`.
- Cost cap + quota apply normally (no bypass).

### Local-mode adaptations (D-21..D-24)

**D-21 — Local Inngest dev server:**
- README addition in `apps/api/README.md`:
  ```bash
  # Terminal 1
  bun run apps/api/src/index.ts  # localhost:8787

  # Terminal 2
  npx inngest-cli@latest dev -u http://localhost:8787/api/inngest
  # Auto-discovers functions registered via `inngest/hono` serve handler

  # Terminal 3 (Wave 3+ only)
  stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook
  ```
- `package.json` script:
  ```json
  "dev:inngest": "npx --ignore-scripts=false inngest-cli@latest dev -u http://localhost:8787/api/inngest"
  ```
- Inngest serve mount in `apps/api/src/index.ts`:
  ```typescript
  import { serve } from 'inngest/hono';
  import { inngest } from './inngest/client.js';
  import { functions } from './inngest/functions/index.js';
  app.on(['GET', 'PUT', 'POST'], '/api/inngest', serve({ client: inngest, functions }));
  ```
- `apps/api/src/inngest/client.ts`:
  ```typescript
  import { Inngest } from 'inngest';
  export const inngest = new Inngest({
    id: 'mcpgen-api',
    // No INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY in Phases 1–9 (local dev mode).
  });
  ```

**D-22 — Postgres `usage_events_outbox` replaces CF Queue:**
- New table per migration §7. Outbox row shape:
  ```sql
  CREATE TABLE usage_events_outbox (
    id text PRIMARY KEY,                          -- ULID
    deployment_id uuid REFERENCES deployments(id),
    event_type text NOT NULL,                     -- 'tool_call' | 'f3_eval' | 'generation'
    event_payload jsonb NOT NULL,                 -- UsageEvent shape
    idempotency_key text NOT NULL UNIQUE,         -- per D-11 STRIPE_METERS_KEY_REGEX shape
    created_at timestamptz DEFAULT now(),
    sent_at timestamptz                           -- null = pending
  );
  CREATE INDEX usage_events_outbox_pending_idx
    ON usage_events_outbox(sent_at) WHERE sent_at IS NULL;
  ```
- Inngest function `stripe-meters-emit-v1` (D-27):
  ```typescript
  inngest.createFunction(
    { id: 'stripe-meters-emit-v1', triggers: [cron('* * * * *')] },  // every minute
    async ({ step }) => {
      const pending = await step.run('claim-batch', async () => db.execute(sql`
        SELECT * FROM usage_events_outbox
        WHERE sent_at IS NULL
        ORDER BY created_at
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      `));
      for (const row of pending.rows) {
        await step.run(`send-${row.id}`, async () => {
          await stripe.billing.meterEvents.create({
            event_name: row.event_type,
            payload: row.event_payload,
            identifier: row.idempotency_key,  // D-11 dedup key
          });
          await db.update(usage_events_outbox)
            .set({ sent_at: new Date() })
            .where(eq(usage_events_outbox.id, row.id));
        });
      }
    },
  );
  ```
- Env-flag stub: `USAGE_EVENT_TRANSPORT=outbox|cf-queue` (default `outbox` Phases 1–9; Phase 10 flips to `cf-queue` after CF Queue provisioned).

**D-23 — `LocalFsStorageAdapter`:**
- File: `packages/contracts/src/storage.ts` (NEW shared interface).
- Async by recommendation:
  ```typescript
  export interface StorageAdapter {
    put(bucket: 'specs' | 'artifacts' | 'public-cache', key: string, body: Uint8Array | string, opts?: { contentType?: string }): Promise<void>;
    get(bucket: 'specs' | 'artifacts' | 'public-cache', key: string): Promise<Uint8Array | null>;
    delete(bucket: 'specs' | 'artifacts' | 'public-cache', key: string): Promise<void>;
  }
  ```
- Implementations:
  - `apps/api/src/lib/storage/local-fs.ts` — `import { promises as fs } from 'fs'`; writes to `.local-storage/{specs,artifacts,public-cache}/`.
  - `apps/api/src/lib/storage/r2.ts` — Phase 10 stub; throws `NotImplementedError`.
- BFF + Drift Watcher consume the interface via constructor injection.
- `.local-storage/` gitignored (add to `.gitignore` in Wave 1).

**D-24 — TimescaleDB hypertable schema unchanged:**
- Phase 8 only adds query helpers + the `usage_hourly` continuous aggregate (skeleton placeholder in Phase 1 migration; Phase 8 migration adds the actual `CREATE MATERIALIZED VIEW` per §7 + §9).

### Cross-workstream dependencies (D-25..D-26)

**D-25 — Wave 4 BLOCKED on Phase 6:**
- Wave 5 (E2E) plan opens with header `BLOCKED ON PHASE 6 — see 08-PHASE-DEVIATIONS.md`. Synthetic outbox seeder for Waves 1–3 in `apps/api/scripts/seed-synthetic-usage.ts`:
  ```typescript
  // Seeds usage_events_outbox + usage_events from engine-fixtures
  import { stripe as stripeFixture } from '@mcpgen/engine-fixtures';
  for (const tool of stripeFixture.finalTools) {
    await db.insert(usage_events_outbox).values({
      id: ulid(),
      deployment_id: TEST_DEPLOYMENT_ID,
      event_type: 'tool_call',
      event_payload: makeFakeUsageEvent(tool.name),
      idempotency_key: makeIdempotencyKey(TEST_DEPLOYMENT_ID, new Date(), tool.name),
    });
  }
  ```

**D-26 — Engine NOT a hard blocker:**
- Engine writes `generations.status` + `generations.cumulative_cost_usd`; BFF reads them.
- Migration adds `cumulative_cost_usd numeric(10,4) not null default 0` (if absent in Phase 1; check shows existing `llm_cost_usd numeric(10,6)` — Phase 8 adds NEW `cumulative_cost_usd` for cost-cap accumulator that resets per-generation, distinct from final `llm_cost_usd`).

### Inngest function ID register (D-27)

**D-27 — Stable IDs in `packages/contracts/src/inngest-functions.ts`:**
- New file:
  ```typescript
  // packages/contracts/src/inngest-functions.ts
  // CTRL-09 Phase 9 audit consumes this register.
  // Bump rules (per D-27): any rename / schedule change / trigger change → version bump (-v2)
  //   + paired docs/decisions/<date>-inngest-<name>-v2.md entry. Pre-commit guard.
  // Old ID stays disabled until orphan audit (Phase 9).

  export const INNGEST_FUNCTION_IDS = {
    DRIFT_WATCHER:           'drift-watcher-v1',
    DRIFT_WATCHER_CHECK:     'drift-watcher-check-v1',
    USAGE_RECONCILER:        'usage-reconciler-v1',
    STRIPE_METERS_EMIT:      'stripe-meters-emit-v1',
    QUOTA_PERIOD_ROLLOVER:   'quota-period-rollover-v1',
    LOGTO_MAU_WATCH:         'logto-mau-watch-v1',
    COST_CAP_ENFORCER:       'cost-cap-enforcer-v1',
  } as const;
  export type InngestFunctionId = (typeof INNGEST_FUNCTION_IDS)[keyof typeof INNGEST_FUNCTION_IDS];
  ```
- Re-exported from `packages/contracts/src/index.ts`.
- Phase 9 orphan audit: lists all `inngest.createFunction({ id: ... })` IDs across repo; asserts every ID is in `INNGEST_FUNCTION_IDS`.

### Migration scope (D-28)

**D-28 — Single atomic migration `20260428000000_phase8_billing_drift.sql`:**
- See full SQL in §7 below.
- Workflow: edit `packages/contracts/src/db-schema.ts` → `pnpm --filter @mcpgen/contracts drizzle-kit:generate` → review generated SQL → manually augment with `CREATE MATERIALIZED VIEW usage_hourly` (Drizzle doesn't emit Timescale continuous aggregates) → commit BOTH the schema TS change AND the SQL atomically.

---

## 7. Drizzle Migration SQL — `20260428000000_phase8_billing_drift.sql`

**File path:** `infrastructure/neon/migrations/20260428000000_phase8_billing_drift.sql`

```sql
-- ─── Phase 8 billing + drift schema additions (CTRL-02..07) ──────────────
-- Generated by drizzle-kit from packages/contracts/src/db-schema.ts edits, then
-- manually augmented with the TimescaleDB continuous aggregate + indexes.
-- DO NOT auto-regenerate this file.
--
-- Filename `20260428000000_phase8_billing_drift.sql` is FROZEN per D-28 + D-12.

-- ─── 1. ALTER organizations: plan tier + Stripe customer + subscription state ─
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "subscription_status" text,
  ADD COLUMN IF NOT EXISTS "quota_period_start" timestamptz NOT NULL DEFAULT now();
-- plan_tier + stripe_customer_id already exist from Phase 1 (FND-08).
-- Tighten stripe_customer_id to UNIQUE (Phase 1 had it nullable, no UNIQUE).
-- IMPORTANT: requires no duplicate non-null values exist; Phase 1 dev DB has zero rows.
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_stripe_customer_id_unique" UNIQUE ("stripe_customer_id");

-- ─── 2. ALTER specs: parsed-IR baseline for drift detection ──────────────
ALTER TABLE "specs" ADD COLUMN IF NOT EXISTS "parsed_ir_jsonb" jsonb;

-- ─── 3. ALTER deployments: opt-in auto-regenerate on drift ──────────────
ALTER TABLE "deployments"
  ADD COLUMN IF NOT EXISTS "auto_regenerate_on_drift" boolean NOT NULL DEFAULT false;

-- ─── 4. ALTER generations: cumulative cost + trigger source ─────────────
ALTER TABLE "generations"
  ADD COLUMN IF NOT EXISTS "cumulative_cost_usd" numeric(10, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "triggered_by" text NOT NULL DEFAULT 'user'
    CHECK (triggered_by IN ('user', 'drift_auto', 'drift_manual'));

-- ─── 5. CREATE drift_events ──────────────────────────────────────────────
CREATE TABLE "drift_events" (
  "id" text PRIMARY KEY NOT NULL,                -- ULID
  "deployment_id" uuid NOT NULL REFERENCES "deployments"("id") ON DELETE CASCADE,
  "detected_at" timestamptz NOT NULL DEFAULT now(),
  "diff_json" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewing', 'regenerating', 'resolved', 'dismissed')),
  "resolved_at" timestamptz,
  "resolved_by_generation_id" uuid REFERENCES "generations"("id") ON DELETE SET NULL
);
CREATE INDEX "drift_events_deployment_detected_idx"
  ON "drift_events"("deployment_id", "detected_at" DESC);

-- ─── 6. CREATE drift_email_log (per-recipient rate-limit per D-18) ──────
CREATE TABLE "drift_email_log" (
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "week_start" date NOT NULL,                    -- ISO week starting Monday 00:00 UTC
  "sent_at" timestamptz NOT NULL DEFAULT now(),
  "drift_event_count" integer NOT NULL DEFAULT 1,
  CONSTRAINT "drift_email_log_pk" PRIMARY KEY ("tenant_id", "week_start")
);
-- PK doubles as the (tenant_id, week_start) UNIQUE constraint per D-18.

-- ─── 7. CREATE subscription_events (Stripe webhook idempotency per D-08) ─
CREATE TABLE "subscription_events" (
  "id" text PRIMARY KEY NOT NULL,                -- ULID
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,                    -- e.g. 'customer.subscription.created'
  "stripe_event_id" text NOT NULL UNIQUE,        -- evt_xxx — dedup target
  "payload" jsonb NOT NULL,                      -- full Stripe.Event for replay
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz,
  "status" text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'error')),
  "error_message" text
);
CREATE INDEX "subscription_events_org_received_idx"
  ON "subscription_events"("organization_id", "received_at" DESC);

-- ─── 8. CREATE usage_events_outbox (CF Queue substitute per D-22) ────────
CREATE TABLE "usage_events_outbox" (
  "id" text PRIMARY KEY NOT NULL,                -- ULID
  "deployment_id" uuid NOT NULL REFERENCES "deployments"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,                    -- 'tool_call' | 'f3_eval' | 'generation'
  "event_payload" jsonb NOT NULL,                -- UsageEvent shape (Zod-validated by emitter)
  "idempotency_key" text NOT NULL UNIQUE,        -- STRIPE_METERS_KEY_REGEX shape (D-11)
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "sent_at" timestamptz                          -- null = pending; non-null = sent to Stripe Meters
);
CREATE INDEX "usage_events_outbox_pending_idx"
  ON "usage_events_outbox"("sent_at") WHERE "sent_at" IS NULL;

-- ─── 9. CREATE reconciliation_log (TimescaleDB ↔ Stripe per D-15) ────────
CREATE TABLE "reconciliation_log" (
  "id" text PRIMARY KEY NOT NULL,
  "reconciliation_date" date NOT NULL,
  "event_type" text NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "timescale_count" integer NOT NULL,
  "stripe_count" integer NOT NULL,
  "drift_pct" numeric(6, 3) NOT NULL,
  "alerted" boolean NOT NULL DEFAULT false,
  "run_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reconciliation_log_unique"
    UNIQUE ("reconciliation_date", "event_type", "tenant_id")
);

-- ─── 10. CREATE mau_log (Logto MAU sample per D-05) ──────────────────────
CREATE TABLE "mau_log" (
  "sample_date" date PRIMARY KEY NOT NULL,
  "mau_count" integer NOT NULL,
  "alerted" boolean NOT NULL DEFAULT false,
  "sampled_at" timestamptz NOT NULL DEFAULT now()
);

-- ─── 11. TimescaleDB continuous aggregate for hourly quota ──────────────
-- Reads `usage_events` hypertable (Phase 1) + joins `deployments` for org_id.
-- WITH NO DATA initial create; TimescaleDB scheduler refreshes per policy below.
CREATE MATERIALIZED VIEW "usage_hourly"
WITH (timescaledb.continuous) AS
SELECT
  d.id AS org_id_proxy,                          -- placeholder; quota query joins via deployment
  ue.deployment_id,
  ue.tool_name,
  CASE WHEN ue.tool_name = '__f3_eval__' THEN 'f3_eval'
       WHEN ue.tool_name = '__generation__' THEN 'generation'
       ELSE 'tool_call'
  END AS event_type,
  time_bucket(INTERVAL '1 hour', ue.time) AS bucket,
  COUNT(*) AS call_count,
  COALESCE(SUM(ue.tokens_in), 0) AS tokens_in_total,
  COALESCE(SUM(ue.tokens_out), 0) AS tokens_out_total
FROM usage_events ue
JOIN deployments d ON d.id = ue.deployment_id
GROUP BY d.id, ue.deployment_id, ue.tool_name, bucket
WITH NO DATA;

-- Refresh policy: every 30 min, looking back 2 hours, looking forward 0.
SELECT add_continuous_aggregate_policy('usage_hourly',
  start_offset => INTERVAL '2 hours',
  end_offset   => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '30 minutes');

-- IMPORTANT: the org_id_proxy column is a placeholder. Phase 8 quota query
-- joins usage_hourly → deployments → generations → projects → organizations
-- (4-table join is fine — small per-org cardinality). Do NOT denormalize
-- org_id into the hypertable itself (would require schema change to usage_events).

-- ─── 12. Indexes for Phase 8 query patterns ─────────────────────────────
CREATE INDEX IF NOT EXISTS "generations_status_idx"
  ON "generations"("status") WHERE "status" IN ('queued', 'running');
-- Cost-cap accumulator polls running generations; partial index keeps it tight.

-- Comments for future maintainers
COMMENT ON COLUMN "organizations"."quota_period_start"
  IS 'Anniversary-based per-org quota period start. Rolls forward via Inngest cron quota-period-rollover-v1.';
COMMENT ON COLUMN "specs"."parsed_ir_jsonb"
  IS 'Last-known parsed IR for drift baseline (D-16). Drift Watcher diffs against this.';
COMMENT ON COLUMN "deployments"."auto_regenerate_on_drift"
  IS 'Opt-in (default false) per D-19. Auto-regen consumes normal quota + cost cap.';
COMMENT ON COLUMN "generations"."cumulative_cost_usd"
  IS 'Cost-cap accumulator (D-13). Updated incrementally as engine streams cost events. Distinct from llm_cost_usd which is the final post-completion total.';
```

**Generation workflow:**
1. Edit `packages/contracts/src/db-schema.ts` to add the new columns + tables (Drizzle TS schema).
2. Run `pnpm --filter @mcpgen/contracts drizzle-kit:generate` → produces `20260428xxxxxx_phase8_billing_drift.sql`.
3. Rename to `20260428000000_phase8_billing_drift.sql` (frozen prefix per D-28).
4. Manually augment with sections 11 + 12 (Drizzle does not emit Timescale `CREATE MATERIALIZED VIEW WITH (timescaledb.continuous)`).
5. Add comment markers `-- ─── ... ───` to delineate manual vs Drizzle-generated sections (matches Phase 1 pattern).
6. Push via `pnpm --filter @mcpgen/contracts db:test-migrate` against Neon dev branch.

---

## 8. Inngest Local Dev Setup

### Startup procedure

```bash
# Terminal 1 — BFF
cd /path/to/mcpgen-ops
bun run apps/api/src/index.ts                      # localhost:8787

# Terminal 2 — Inngest dev server
npx --ignore-scripts=false inngest-cli@latest dev -u http://localhost:8787/api/inngest
# Output: Inngest Dev Server running on http://localhost:8288
# Auto-discovers functions registered at /api/inngest endpoint.
```

### Function registration

`apps/api/src/inngest/client.ts`:
```typescript
import { Inngest } from 'inngest';
export const inngest = new Inngest({ id: 'mcpgen-api' });
```

`apps/api/src/inngest/functions/index.ts`:
```typescript
import { driftWatcher } from './drift-watcher.js';
import { driftWatcherCheck } from './drift-watcher-check.js';
import { usageReconciler } from './usage-reconciler.js';
import { stripeMetersEmit } from './stripe-meters-emit.js';
import { quotaPeriodRollover } from './quota-period-rollover.js';
import { logtoMauWatch } from './logto-mau-watch.js';
import { costCapEnforcer } from './cost-cap-enforcer.js';

export const functions = [
  driftWatcher,
  driftWatcherCheck,
  usageReconciler,
  stripeMetersEmit,
  quotaPeriodRollover,
  logtoMauWatch,
  costCapEnforcer,
];
```

`apps/api/src/index.ts`:
```typescript
import { serve } from 'inngest/hono';
import { inngest } from './inngest/client.js';
import { functions } from './inngest/functions/index.js';

app.on(['GET', 'PUT', 'POST'], '/api/inngest', serve({
  client: inngest,
  functions,
  // signingKey + servePath optional; in dev no signing key needed.
}));
```

### Testing pattern for cron functions

Inngest TS SDK provides a test harness (verified via Context7 `/websites/inngest`):

```typescript
// apps/api/tests/inngest/drift-watcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { driftWatcher } from '../../src/inngest/functions/drift-watcher.js';

describe('drift-watcher-v1', () => {
  it('fans out to per-deployment checks', async () => {
    const result = await driftWatcher.execute({
      // Inngest test executor — see https://www.inngest.com/docs/reference/typescript/testing
      steps: [
        {
          id: 'list-active',
          handler: () => [{ id: 'dep-1', generation: { spec: { spec_url: 'https://api.stripe.com/openapi.json' } } }],
        },
      ],
    });
    expect(result.invokeCallCount).toBe(1);
  });
});
```

### `package.json` additions

`apps/api/package.json`:
```json
{
  "scripts": {
    "dev": "bun run src/index.ts",
    "dev:inngest": "npx --ignore-scripts=false inngest-cli@latest dev -u http://localhost:8787/api/inngest",
    "build": "tsc --noEmit",
    "test": "vitest --run"
  }
}
```

---

## 9. Stripe Local Dev Setup

### `stripe-cli` workflow

```bash
brew install stripe/stripe-cli/stripe                        # one-time
stripe login                                                  # browser handshake
stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook
```

Output:
```
> Ready! Your webhook signing secret is whsec_xxx (^C to quit)
```

Copy `whsec_xxx` into `.env.local` as `STRIPE_WEBHOOK_SECRET`. **The local-dev secret differs from the production Dashboard secret** — both must be in env per environment.

### Trigger test events

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
```

Each emits a webhook to the listener; BFF processes per §6 D-08.

### vitest mock pattern (Wave 1–2)

```typescript
// apps/api/tests/stripe-webhook.test.ts
import { describe, it, expect, vi, beforeAll } from 'vitest';

// Hoist the mock so it applies before any import that uses Stripe.
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      webhooks: {
        constructEventAsync: vi.fn().mockImplementation(async (rawBody: string) => {
          // Tests pass JSON in rawBody; mock returns parsed event.
          return JSON.parse(rawBody);
        }),
      },
      checkout: {
        sessions: { create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test/abc' }) },
      },
      billing: {
        meterEvents: { create: vi.fn().mockResolvedValue({ identifier: 'mock-id' }) },
        meters: {
          eventSummaries: { list: vi.fn().mockResolvedValue({ data: [{ aggregated_value: 5 }] }) },
        },
      },
    })),
  };
});

import { app } from '../src/index.js';

describe('POST /api/v1/stripe/webhook', () => {
  it('persists event with stripe_event_id UNIQUE', async () => {
    const event = { id: 'evt_test_1', type: 'customer.subscription.created', data: { object: { id: 'sub_1', metadata: { org_id: 'org-1' } } } };
    const res = await app.request('/api/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'mock-sig' },
      body: JSON.stringify(event),
    });
    expect(res.status).toBe(200);

    // Re-send same event; UNIQUE on stripe_event_id makes it a no-op.
    const res2 = await app.request('/api/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'mock-sig' },
      body: JSON.stringify(event),
    });
    const body2 = await res2.json();
    expect(body2.duplicate).toBe(true);
  });
});
```

### Wave-staged transition

Per D-10:
- **Wave 1–2:** all tests use `vi.mock('stripe')` above. No `.env.local` Stripe vars needed. NO real API calls. Tests run on `pnpm --filter @mcpgen/api test` in CI without Stripe credentials.
- **Wave 3:** user adds `STRIPE_SECRET_KEY=sk_test_...` + `STRIPE_WEBHOOK_SECRET=whsec_...` to `.env.local`; runs `bun run infrastructure/stripe/setup.ts` once to create products + meters; runs `stripe listen --forward-to ...` in second terminal during dev.
- **CI:** never has real Stripe keys; Wave 3 integration tests are gated by `RUN_STRIPE_INTEGRATION_TESTS=1` env var (similar to Phase 1's `RUN_CODEGEN_TESTS=1` pattern).

---

## 10. Logto JWT Verification Details

### JWKS endpoint

`${LOGTO_ENDPOINT}/oidc/jwks` — e.g., `https://abc123.logto.app/oidc/jwks`. Logto rotates keys; `createRemoteJWKSet` handles `kid` selection automatically.

### Token shape

User JWT (issued via web app sign-in):
```json
{
  "iss": "https://abc123.logto.app/oidc",
  "aud": "https://app.mcpgen.dev",          // = LOGTO_BASE_URL (web app indicator)
  "sub": "user_xxx",
  "client_id": "<LOGTO_APP_ID>",
  "organization_id": "org_xxx",              // present when user is org-member
  "scope": "openid profile email",
  "exp": 1730000000,
  "iat": 1729996400
}
```

M2M JWT (issued via client_credentials grant):
```json
{
  "iss": "https://abc123.logto.app/oidc",
  "aud": "https://api.mcpgen.dev/m2m",       // = LOGTO_M2M_RESOURCE_INDICATOR
  "sub": "<LOGTO_M2M_APP_ID>",
  "client_id": "<LOGTO_M2M_APP_ID>",
  "scope": "all",
  "exp": 1730000000
}
```

Distinguishing:
```typescript
const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
const isM2M = aud === env.LOGTO_M2M_RESOURCE_INDICATOR;
```

### M2M client_credentials grant (engine side)

```python
# apps/generation-engine/src/mcpgen_engine/auth/m2m.py (NEW)
import httpx, time
from typing import Optional

_token: Optional[str] = None
_expires_at: float = 0

async def get_m2m_token(settings) -> str:
    global _token, _expires_at
    if _token and time.time() < _expires_at:
        return _token

    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{settings.logto_endpoint}/oidc/token",
            auth=(settings.logto_m2m_app_id, settings.logto_m2m_app_secret),
            data={
                "grant_type": "client_credentials",
                "resource": settings.logto_m2m_resource_indicator,
                "scope": "all",
            },
            timeout=10.0,
        )
        r.raise_for_status()
        body = r.json()
        _token = body["access_token"]
        _expires_at = time.time() + body["expires_in"] - 60
        return _token
```

Engine attaches to every BFF callback:
```python
async def post_callback(url: str, payload: dict, settings):
    token = await get_m2m_token(settings)
    async with httpx.AsyncClient() as client:
        await client.post(url, json=payload, headers={"Authorization": f"Bearer {token}"})
```

### Hono route protection example

```typescript
// apps/api/src/routes/v1/generate.ts (Phase 8 implementation)
generateRoute.post('/', async (c) => {
  const auth = c.get('auth');
  if (auth.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_cannot_initiate_generation' }, 403);
  }
  const orgId = auth.organizationId;
  if (!orgId) return c.json({ error: 'no_org_context' }, 400);

  // Quota check (D-12)
  const quota = await checkQuota(db, orgId, 'generation');
  if (!quota.ok) {
    return c.json({
      error: 'quota_exceeded',
      quota_used: quota.used,
      quota_limit: quota.limit,
      reset_at: quota.reset_at.toISOString(),
    }, 429);
  }

  // ... continue with generation enqueue
});
```

---

## 11. TimescaleDB Quota Query

The continuous aggregate `usage_hourly` (created in §7) holds per-(deployment, tool, hour, event_type) rollups. Quota query joins through to `organizations`:

```sql
-- Phase 8 helper: `apps/api/src/lib/quota-queries.ts`
SELECT COALESCE(SUM(uh.call_count), 0)::int AS used
FROM usage_hourly uh
JOIN deployments d ON d.id = uh.deployment_id
JOIN generations g ON g.id = d.generation_id
JOIN projects p ON p.id = g.project_id
WHERE p.org_id = $1
  AND uh.event_type = $2                            -- 'f3_eval' or 'generation'
  AND uh.bucket >= $3                                -- org.quota_period_start
  AND uh.bucket < $4;                                -- org.quota_period_start + interval '1 month'
```

Drizzle equivalent (in `apps/api/src/lib/quota-queries.ts`):

```typescript
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export async function getQuotaUsage(
  orgId: string,
  eventType: 'f3_eval' | 'generation',
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(uh.call_count), 0)::int AS used
    FROM usage_hourly uh
    JOIN deployments d ON d.id = uh.deployment_id
    JOIN generations g ON g.id = d.generation_id
    JOIN projects p ON p.id = g.project_id
    WHERE p.org_id = ${orgId}
      AND uh.event_type = ${eventType}
      AND uh.bucket >= ${periodStart}
      AND uh.bucket < ${periodEnd}
  `);
  return (result.rows[0] as { used: number }).used;
}
```

### Edge case: continuous aggregate refresh lag

The aggregate refreshes every 30 min looking back 2 h. For the most recent hour, raw `usage_events` may be ahead of `usage_hourly`. For Phase 8 quota purposes (Free=1/mo, Pro=5/mo) this 30-min lag is acceptable — F3 evals cost ~$1–3 and run ~minutes, so a single rapid double-fire is rare. If it becomes a problem, fallback query hits raw `usage_events`:

```sql
-- Fallback for "near-real-time" quota check (skips continuous aggregate):
SELECT COUNT(*)::int AS used
FROM usage_events ue
JOIN deployments d ON d.id = ue.deployment_id
JOIN generations g ON g.id = d.generation_id
JOIN projects p ON p.id = g.project_id
WHERE p.org_id = $1
  AND ue.tool_name = '__f3_eval__'                   -- synthetic event_type marker
  AND ue.time >= $2
  AND ue.time < $3;
```

Recommend: use the continuous aggregate for Phase 8; Phase 9 evaluates whether the lag matters in production.

---

## 12. Cost Cap SSE Protocol

### Engine → BFF event shape (extension to existing SSE envelope)

The Phase 1 `GenerationSseEvent` schema (`packages/contracts/src/generation-api.ts`) already has an optional `partial_result: z.record(z.string(), z.unknown())`. Phase 8 extends with a typed sub-schema:

```typescript
// packages/contracts/src/generation-api.ts (Phase 8 amendment)
export const PartialResultCost = z.object({
  type: z.literal('cost_update'),
  pass_name: z.enum(['pass_0', 'pass_1', 'pass_2', 'pass_3', 'pass_4', 'pass_5', 'stage_e', 'stage_f1', 'stage_f2', 'stage_f3']),
  pass_cost_usd: z.number().nonnegative(),
  cumulative_cost_usd: z.number().nonnegative(),
});
export type PartialResultCost = z.infer<typeof PartialResultCost>;

// Partial-result discriminated union for type narrowing on the BFF side
export const PartialResult = z.discriminatedUnion('type', [
  PartialResultCost,
  // other partial-result shapes added by engine phases
]);
```

Engine emits one cost event per pass:

```python
# apps/generation-engine — engine pass wrapper
async def emit_cost_event(job_id: str, pass_name: str, pass_cost: float, cumulative: float):
    await post_callback(
        f"{settings.bff_endpoint}/internal/v1/sse-callback",
        {
            "direction": "engine_to_bff",
            "event": {
                "job_id": job_id,
                "event_id": new_ulid(),
                "stage": pass_name_to_stage(pass_name),
                "status": "started",
                "partial_result": {
                    "type": "cost_update",
                    "pass_name": pass_name,
                    "pass_cost_usd": pass_cost,
                    "cumulative_cost_usd": cumulative,
                },
            },
        },
        settings,
    )
```

### BFF cost-cap enforcer

The Inngest function `cost-cap-enforcer-v1` (D-27) is event-triggered, NOT cron — fires when BFF receives an SSE event with `partial_result.type === 'cost_update'`:

```typescript
// apps/api/src/inngest/functions/cost-cap-enforcer.ts
export const costCapEnforcer = inngest.createFunction(
  {
    id: 'cost-cap-enforcer-v1',
    triggers: [{ event: 'generation/cost.updated' }],
    concurrency: { limit: 1, key: 'event.data.job_id' },  // serialize per generation
  },
  async ({ event, step }) => {
    const { jobId, cumulativeCostUsd } = event.data;

    // 1. Persist accumulator
    await step.run('persist-cost', async () => {
      await db.update(generations)
        .set({ cumulative_cost_usd: cumulativeCostUsd })
        .where(eq(generations.id, jobId));
    });

    // 2. Look up org plan + cap
    const gen = await step.run('lookup-org', async () =>
      db.query.generations.findFirst({
        where: eq(generations.id, jobId),
        with: { project: { with: { organization: true } } },
      }),
    );
    const cap = gen.project.organization.plan_tier === 'pro'
      ? LAUNCH_CRITERIA.COST_CAP_PRO_USD
      : LAUNCH_CRITERIA.COST_CAP_FREE_USD;

    // 3. Threshold check
    if (cumulativeCostUsd > cap) {
      await step.run('cancel-engine', async () => {
        const m2mToken = await getM2mTokenForBff();  // BFF acts as M2M client to engine
        await fetch(`${env.ENGINE_ENDPOINT}/internal/v1/cancel-generation`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${m2mToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, reason: 'cost_cap_exceeded', cap_usd: cap }),
        });
      });

      await step.run('mark-cost-capped', async () => {
        await db.update(generations)
          .set({ status: 'cost_capped' })
          .where(eq(generations.id, jobId));
      });

      // 4. Bill the partial cost (emit usage event for accumulated spend)
      await step.run('emit-billable-event', async () => {
        await db.insert(usage_events_outbox).values({
          id: ulid(),
          deployment_id: null,                  // no deployment yet — generation aborted
          event_type: 'generation_cost_capped',
          event_payload: { job_id: jobId, billed_cost_usd: cumulativeCostUsd },
          idempotency_key: `${jobId}_cost_capped`,
        });
      });
    }
  },
);
```

The BFF SSE-callback handler emits the Inngest event:

```typescript
// apps/api/src/routes/internal/sse-callback.ts (NEW Phase 8)
sseCallbackRoute.post('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.isM2M) return c.json({ error: 'forbidden' }, 403);

  const { event } = await c.req.json();
  // Persist event for SSE replay (uses pending_callbacks table)
  await persistCallback(event);

  // Cost-update events trigger the enforcer
  if (event.partial_result?.type === 'cost_update') {
    await inngest.send({
      name: 'generation/cost.updated',
      data: {
        jobId: event.job_id,
        cumulativeCostUsd: event.partial_result.cumulative_cost_usd,
      },
    });
  }

  return c.json({ ok: true });
});
```

### Engine cancel endpoint contract

```python
# apps/generation-engine — POST /internal/v1/cancel-generation
class CancelRequest(BaseModel):
    job_id: str
    reason: Literal["cost_cap_exceeded", "user_requested", "timeout"]
    cap_usd: float | None = None

@router.post("/internal/v1/cancel-generation")
async def cancel_generation(req: CancelRequest, _ = Depends(verify_m2m_token)):
    job = JOB_REGISTRY.get(req.job_id)
    if not job:
        return {"ok": False, "reason": "job_not_found"}
    job.cancel(reason=req.reason)
    # Engine MUST honor mid-pass cancel — Phase 5 follow-up may be needed
    # to add abort hooks inside Pass 0–5 LLM calls (per CONTEXT.md specifics).
    return {"ok": True}
```

### Race conditions to mitigate

1. **Concurrent cost events:** Inngest `concurrency: { limit: 1, key: 'event.data.job_id' }` serializes processing per-generation; threshold check sees consistent state.
2. **Cancel-mid-pass arrives after pass already completed:** engine's `cancel()` is a no-op if pass already settled; BFF still marks `cost_capped` and bills partial.
3. **Cumulative cost briefly above cap due to in-flight pass:** acceptable — cap is a soft target ($0.50 free), final billed cost may exceed by one pass's worth (<$0.05); documented in `apps/api/README.md`.
4. **SSE callback dropped before cost-update event reaches BFF:** Phase 1 `pending_callbacks` retry mechanism handles delivery; cost cap may trigger one pass late but engine has independent self-imposed cap of $3 (engine's own safety) per `docs/mcpgen-architecture.md` §10. Phase 8 documents the dual-cap contract in `docs/decisions/2026-04-XX-cost-cap-thresholds.md`.

---

## 13. Drift Watcher Implementation

### Stage A invocation strategy — recommendation: HTTP shell-out, NOT TS port

Two options considered:

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **HTTP call to engine `/internal/v1/parse`** | No code duplication; engine owns Stage A canonical impl; updates propagate; M2M auth already in place | Requires engine running locally during Drift Watcher cron; cross-process latency (~50–200ms per spec) | ✅ **CHOSEN** |
| TS port of `prance[osv]` + `openapi-spec-validator` | Drift Watcher self-contained; no engine dependency | Two implementations to maintain; drift between TS port and Python source = silent diffs in baseline; ~600+ LOC | ❌ rejected |

Engine MUST expose `POST /internal/v1/parse` (Phase 2's responsibility, but Phase 8 needs it):

```python
# apps/generation-engine/src/mcpgen_engine/routes/internal_parse.py (NEW Phase 8 cross-ws ask)
class ParseRequest(BaseModel):
    spec_url: str | None = None
    spec_content: str | None = None

class ParseResponse(BaseModel):
    raw_ir: dict
    endpoint_count: int
    spec_format: Literal["openapi3"]

@router.post("/internal/v1/parse", response_model=ParseResponse)
async def parse_only(req: ParseRequest, _ = Depends(verify_m2m_token)):
    # Stage A only — no LLM passes. ~$0, deterministic.
    raw_ir = await stage_a.parse(req.spec_url or req.spec_content)
    return ParseResponse(
        raw_ir=raw_ir.model_dump(),
        endpoint_count=len(raw_ir.endpoints),
        spec_format="openapi3",
    )
```

**Cross-workstream coordination:** This endpoint is BOTH a Phase 8 ops requirement AND a Phase 2 engine deliverable. The Phase 8 plan should add a `chore(contracts): pin Stage A parse endpoint contract` PR up front (Wave 1) that adds `packages/contracts/src/engine-internal-api.ts` defining the request/response shape — engine workstream then implements against the contract when Phase 2 starts.

### Drift Watcher orchestration

```typescript
// apps/api/src/inngest/functions/drift-watcher.ts
import { Inngest, cron } from 'inngest';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts';
import { inngest } from '../client.js';

export const driftWatcher = inngest.createFunction(
  { id: INNGEST_FUNCTION_IDS.DRIFT_WATCHER, triggers: [cron('0 3 * * *')] },
  async ({ step }) => {
    const deployments = await step.run('list-active-deployments', async () =>
      db.query.deployments.findMany({
        where: isNotNull(deployments.url),
        with: { generation: { with: { spec: true } } },
      }),
    );
    // Fan-out: one event per deployment → individual function for retry isolation.
    await step.sendEvent('dispatch-checks', deployments.map(d => ({
      name: 'drift/check.requested',
      data: { deploymentId: d.id, specUrl: d.generation.spec.spec_url },
    })));
  },
);

export const driftWatcherCheck = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.DRIFT_WATCHER_CHECK,
    triggers: [{ event: 'drift/check.requested' }],
    retries: 3,
  },
  async ({ event, step }) => {
    const { deploymentId, specUrl } = event.data;
    if (!specUrl) return { skipped: 'no_source_url' };

    const newIr = await step.run('parse-stage-a', async () => {
      const m2m = await getM2mTokenForEngine();
      const resp = await fetch(`${env.ENGINE_ENDPOINT}/internal/v1/parse`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${m2m}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec_url: specUrl }),
      });
      if (!resp.ok) throw new Error(`engine parse failed: ${resp.status}`);
      return (await resp.json()).raw_ir;
    });

    const baseline = await step.run('load-baseline-ir', async () => {
      const dep = await db.query.deployments.findFirst({
        where: eq(deployments.id, deploymentId),
        with: { generation: { with: { spec: true } } },
      });
      return dep?.generation.spec.parsed_ir_jsonb ?? null;
    });

    if (!baseline) {
      // First-time baseline — write current IR and exit (no diff possible).
      await step.run('seed-baseline', async () => {
        await db.update(specs)
          .set({ parsed_ir_jsonb: newIr })
          .where(eq(specs.id, specId));
      });
      return { changed: false, baseline: 'seeded' };
    }

    const diff = await step.run('compute-diff', async () => computeIrDiff(baseline, newIr));
    if (diff.empty) return { changed: false };

    const driftEvent = await step.run('persist-drift-event', async () => {
      const id = ulid();
      await db.insert(drift_events).values({
        id, deployment_id: deploymentId, diff_json: diff, status: 'pending',
      });
      return id;
    });

    const tenantId = await step.run('lookup-tenant', async () => /* join through deployments→generations→projects→organizations.id */);

    await step.run('maybe-email', async () => sendDriftEmailIfAllowed(tenantId, driftEvent));

    return { changed: true, summary: diff.summary };
  },
);
```

### IR diff algorithm

```typescript
// apps/api/src/lib/drift/ir-diff.ts (NEW)
const IGNORED_FIELDS = ['summary', 'description', 'tags', 'externalDocs'];
const X_PREFIX = 'x-';

function stripCosmetic(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripCosmetic);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (IGNORED_FIELDS.includes(k) || k.startsWith(X_PREFIX)) continue;
      out[k] = stripCosmetic(v);
    }
    // Sort keys for deterministic stringification
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(out).sort()) sorted[k] = out[k];
    return sorted;
  }
  return node;
}

export interface IrDiff {
  empty: boolean;
  added: ReadonlyArray<{ path: string; method: string }>;
  removed: ReadonlyArray<{ path: string; method: string }>;
  changed: ReadonlyArray<{ path: string; method: string; field: string }>;
  summary: string;
}

export function computeIrDiff(baseline: RawIR, current: RawIR): IrDiff {
  const baselineEndpoints = new Map<string, unknown>();
  for (const e of baseline.endpoints) {
    baselineEndpoints.set(`${e.method.toUpperCase()} ${e.path}`, stripCosmetic(e));
  }
  const currentEndpoints = new Map<string, unknown>();
  for (const e of current.endpoints) {
    currentEndpoints.set(`${e.method.toUpperCase()} ${e.path}`, stripCosmetic(e));
  }

  const added: Array<{ path: string; method: string }> = [];
  const removed: Array<{ path: string; method: string }> = [];
  const changed: Array<{ path: string; method: string; field: string }> = [];

  for (const [key, val] of currentEndpoints) {
    if (!baselineEndpoints.has(key)) {
      const [method, path] = key.split(' ', 2);
      added.push({ path, method });
    } else if (JSON.stringify(val) !== JSON.stringify(baselineEndpoints.get(key))) {
      const [method, path] = key.split(' ', 2);
      changed.push({ path, method, field: 'shape' });  // could deep-diff for finer field
    }
  }
  for (const key of baselineEndpoints.keys()) {
    if (!currentEndpoints.has(key)) {
      const [method, path] = key.split(' ', 2);
      removed.push({ path, method });
    }
  }

  const empty = added.length === 0 && removed.length === 0 && changed.length === 0;
  const summary = empty ? 'No semantic changes' :
    `${added.length} added, ${removed.length} removed, ${changed.length} changed`;
  return { empty, added, removed, changed, summary };
}
```

### Cosmetic-field ignore list (D-17)

| Field | Path | Reason |
|---|---|---|
| `summary` | endpoint.summary | Description text |
| `description` | endpoint.description, parameter.description, etc. | Description text |
| `tags` | endpoint.tags | Categorization metadata |
| `externalDocs` | endpoint.externalDocs | Documentation link metadata |
| `x-*` extensions | anywhere | Vendor extensions, often auto-generated |
| Object key order | anywhere | Serialization detail |
| Whitespace | n/a | Pre-parse (parser handles) |

---

## 14. Resend Email Patterns

### Library

`resend@^6.12.2` (verified via npm 2026-04-26).

### Send pattern (text-only, no react-email in MVP)

```typescript
// apps/api/src/lib/email/resend-client.ts (NEW)
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendDriftEmail(toEmail: string, drifts: DriftEvent[]): Promise<void> {
  await resend.emails.send({
    from: 'MCPGen Drift Watcher <drift@mcpgen.dev>',
    to: [toEmail],
    subject: `Spec changes detected for ${drifts.length} deployment(s)`,
    text: drifts.map(d =>
      `Deployment: ${d.deployment_url}\n` +
      `Detected: ${d.detected_at.toISOString()}\n` +
      `Summary: ${d.diff_json.summary}\n` +
      `Review: ${env.LOGTO_BASE_URL}/dashboard/drift/${d.id}\n`
    ).join('\n---\n'),
  });
}

export async function sendReconciliationAlert(driftPct: number, eventType: string, tenantId: string): Promise<void> {
  await resend.emails.send({
    from: 'MCPGen Ops Alert <ops@mcpgen.dev>',
    to: [env.OPS_EMAIL],
    subject: `Reconciliation drift ${driftPct.toFixed(2)}% on ${eventType}`,
    text: `Tenant: ${tenantId}\nEvent type: ${eventType}\nDrift: ${driftPct.toFixed(2)}%\n` +
          `Threshold: 2%\nAction: investigate Stripe Meters lag or BFF outbox health.`,
  });
}

export async function sendMauAlert(mau: number): Promise<void> {
  await resend.emails.send({
    from: 'MCPGen Ops Alert <ops@mcpgen.dev>',
    to: [env.OPS_EMAIL],
    subject: `Logto MAU at ${mau} (75% of free-tier 5K cap)`,
    text: `MAU has crossed 4K. Pro upgrade calendar action: W7.\n` +
          `Runbook: docs/runbooks/logto-pro-upgrade.md`,
  });
}
```

### Rate-limit enforcement via DB UNIQUE (D-18)

Already covered in §6 D-18. Pattern: try INSERT into `drift_email_log (tenant_id, week_start)` PRIMARY KEY; on UNIQUE violation, silently skip. The `drift_event` row is always persisted regardless of email status (so dashboard always shows the drift; email is opt-in throttling).

### Resend's own rate-limit (per Context7 verification)

Resend default account rate-limit is 2 emails/second on free tier; production tier is 100 emails/second. Phase 8 emits at most ~1 email per drift batch per tenant per week + ~1 reconciliation alert per day + ~1 MAU alert per week → far under any tier limit.

For batch sending (future, when MCPGen has many tenants), use `resend.batch.send([...])` (max 100 emails/batch, 50 recipients/email) — NOT needed in MVP.

### Operational email contract

- **Sender domains:** `drift@mcpgen.dev` (drift), `ops@mcpgen.dev` (reconciliation + MAU alerts). DNS records (SPF/DKIM/DMARC) pre-configured by user via Resend Console — Phase 8 doesn't manage DNS.
- **`OPS_EMAIL` env var:** new in Phase 8 `.env.local`; recipient for reconciliation + MAU alerts. Default to founder's personal email.

---

## 15. Pitfall Mitigations

| Pitfall | Severity | Phase 8 Mitigation Strategy | Implementation Pointer |
|---|---|---|---|
| **#13 Usage Event Loss Under CF Queue Backpressure** | P0 | Outbox pattern (`usage_events_outbox` Postgres table) replaces CF Queue for Phases 1–9 (D-22). UNIQUE on `idempotency_key` (STRIPE_METERS_KEY_REGEX shape per D-11) prevents duplicates. Phase 6 Wave 2 (when it lands) writes to BOTH `usage_events` AND `usage_events_outbox`. Inngest `stripe-meters-emit-v1` polls outbox every 60s with `FOR UPDATE SKIP LOCKED` for safe concurrent claim. | §6 D-22; §7 migration §8 |
| **#16 Stripe Meters Reporting Lag → False-Positive Quota Block** | P1 | Quota truth = TimescaleDB `usage_hourly` (real-time). Stripe Meters = billing eventual. Daily reconciliation cron `usage-reconciler-v1` (D-15) compares counts; alerts via Resend on >2% drift. Documented asymmetry in `apps/api/README.md`. | §6 D-12, D-15; §11 query; §14 alert |
| **#17 Logto Cloud Free Tier Account Lock at MAU Boundary** | P0 at launch | Daily MAU watcher cron `logto-mau-watch-v1` (D-05) reads Logto Admin API `/api/dashboard/widgets/active-user-count`; alerts at 4K (75% of 5K). Pro pre-buy calendar action at W7 per Phase 1 D-14. Self-host runbook at `docs/runbooks/logto-pro-upgrade.md` (Phase 1 deliverable). | §6 D-05; §14 alert pattern |
| **#21 Inngest Function Versioning** | P2 | Stable string IDs in `packages/contracts/src/inngest-functions.ts` (D-27). Bump rules: `-v2` suffix + paired `docs/decisions/` entry. Phase 9 audits orphans via `INNGEST_FUNCTION_IDS` register. | §6 D-27 |
| **#34 Drift Detection False-Positives on Spec Reformat** | P2 | Parsed-IR diff (D-16, D-17) — re-runs Stage A only ($0, no LLM), strips cosmetic fields (`summary`/`description`/`tags`/`externalDocs`/`x-*`/key order/whitespace). Per-recipient email rate-limit 1/week via `drift_email_log (tenant_id, week_start)` PRIMARY KEY (D-18). | §13; §6 D-16..D-18 |

---

## 16. Wave Sequencing Recommendation

Recommended 5-wave breakdown given dependencies and the Wave 4 BLOCKED-on-Phase-6 constraint:

### Wave 1 — Foundation: migration + auth + Inngest scaffold
**Plan file:** `08-01-PLAN.md`
**Goal:** Land Phase 8 schema, JWT middleware, Inngest function-ID register.
**Tasks (sketch):**
1. Add `jose@^6.2.2` dep + `apps/api/src/middleware/auth.ts` + tests (mock JWKS).
2. Add `packages/contracts/src/inngest-functions.ts` + re-export from index.
3. Add `packages/contracts/src/storage.ts` + `apps/api/src/lib/storage/local-fs.ts`.
4. Edit `packages/contracts/src/db-schema.ts` with all Phase 8 columns + tables.
5. `pnpm --filter @mcpgen/contracts drizzle-kit:generate` → `20260428000000_phase8_billing_drift.sql`.
6. Manually augment with `usage_hourly` continuous aggregate + comments.
7. `pnpm --filter @mcpgen/contracts db:test-migrate` against Neon dev.
8. Add `.local-storage/` to `.gitignore`.
9. Mount Inngest serve handler at `/api/inngest`.
10. Add `dev:inngest` script to `apps/api/package.json`.
11. Update `apps/api/README.md` with local-dev port map + Inngest startup.

**Acceptance:** middleware unit tests pass; migration applied to Neon; `bun run apps/api/src/index.ts` + `npx inngest-cli@latest dev` starts cleanly with zero functions registered (functions arrive in Waves 2–4).

### Wave 2 — Stripe setup + webhook handler (mocked)
**Plan file:** `08-02-PLAN.md`
**Goal:** Wire Stripe webhook handler with full mocking; add idempotent setup script; register `stripe-meters-emit-v1` Inngest function.
**Tasks:**
1. `infrastructure/stripe/setup.ts` reference script (creates products + prices + meters with stable IDs).
2. `apps/api/src/routes/stripe-webhook.ts` with `constructEventAsync` + idempotency.
3. `apps/api/src/inngest/functions/stripe-meters-emit.ts` (outbox poller).
4. `apps/api/src/lib/storage/local-fs.ts` consumed where needed.
5. vitest mocks for Stripe across all webhook + meter tests.
6. Synthetic outbox seeder script `apps/api/scripts/seed-synthetic-usage.ts`.
7. New launch-criteria constants (`COST_CAP_FREE_USD`, `COST_CAP_PRO_USD`) + paired `docs/decisions/2026-04-XX-cost-cap-thresholds.md`.

**Acceptance:** webhook handler test sends mock `customer.subscription.created` → row in `subscription_events`; replay → `duplicate: true`; outbox seeder produces 100 rows from `engine-fixtures` Stripe; `stripe-meters-emit-v1` claims and ack-marks all 100 in vitest.

### Wave 3 — Real Stripe sandbox + cost cap + quota
**Plan file:** `08-03-PLAN.md`
**Goal:** Swap mocked Stripe for real sandbox; wire cost-cap enforcer + quota check; user provides `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` at start of this Wave.
**Tasks:**
1. Plan opens with header: `RUN stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook IN SECOND TERMINAL`.
2. `apps/api/src/routes/billing/checkout.ts` → real Checkout Session creation.
3. `apps/api/src/lib/quota.ts` + `apps/api/src/lib/quota-queries.ts`.
4. `apps/api/src/inngest/functions/cost-cap-enforcer.ts` (event-triggered).
5. `apps/api/src/routes/internal/sse-callback.ts` (M2M-protected; emits `generation/cost.updated` event on cost partial-result).
6. `apps/api/src/inngest/functions/quota-period-rollover.ts` (hourly cron).
7. Extend `packages/contracts/src/generation-api.ts` with `PartialResultCost` discriminated-union.
8. `apps/api/src/routes/v1/generate.ts` real implementation: auth → quota check → DB row → enqueue (outbox or direct Inngest event).
9. Integration tests gated by `RUN_STRIPE_INTEGRATION_TESTS=1`.

**Acceptance:** real Checkout Session URL returned from BFF endpoint; `stripe trigger customer.subscription.created` flows through to `subscription_events.status='processed'`; quota check returns 429 for synthetic over-quota org; cost-cap enforcer cancels generation when synthetic cost-update event exceeds threshold (engine cancel mocked at this stage; real engine cancel comes when Phase 5 lands or via stub).

### Wave 4 — Drift Watcher + reconciliation + MAU watcher
**Plan file:** `08-04-PLAN.md`
**Goal:** Wire daily crons: drift detection, usage reconciliation, MAU watch.
**Tasks:**
1. `apps/api/src/inngest/functions/drift-watcher.ts` + `drift-watcher-check.ts` (fan-out).
2. `apps/api/src/lib/drift/ir-diff.ts` (cosmetic-stripping diff).
3. `apps/api/src/inngest/functions/usage-reconciler.ts`.
4. `apps/api/src/inngest/functions/logto-mau-watch.ts`.
5. `apps/api/src/lib/email/resend-client.ts` (drift, reconciliation, MAU).
6. `apps/api/src/routes/v1/deployments.ts` + `apps/api/src/routes/v1/drift-events.ts` (`GET .../drift-events`, `POST .../regenerate`, `PATCH .../auto_regenerate_on_drift`).
7. Engine contract: `packages/contracts/src/engine-internal-api.ts` defining Stage A `/internal/v1/parse` endpoint shape (cross-ws dependency — engine workstream implements when Phase 2 lands).
8. Tests:
   - IR diff: cosmetic-only change → empty diff;
   - IR diff: parameter added → `changed` entry;
   - Drift email rate-limit: second insert raises UNIQUE violation, silently swallowed.
   - Reconciliation: drift > 2% → Resend mock called once.

**Acceptance:** drift watcher cron registered in dev server; manual trigger via Inngest dev UI fans out to 0 deployments (none yet); reconciler runs cleanly against synthetic outbox data; MAU watcher mocks Logto Admin API and emails on >4K.

### Wave 5 — E2E (BLOCKED on Phase 6)
**Plan file:** `08-05-PLAN.md`
**Goal:** Full signup → upgrade → generate → see invoice flow end-to-end with REAL usage events from Phase 6 dispatch+tenant Worker.
**Status header:** `BLOCKED ON PHASE 6 — see 08-PHASE-DEVIATIONS.md. Until Phase 6 lands, run synthetic outbox seeder for partial validation; Wave 5 acceptance gate is post-Phase-6 verification.`
**Tasks (placeholder):**
1. Sign up via Logto on apps/web (Phase 7 needs to be live too — soft dependency).
2. `POST /api/v1/billing/checkout-session` → Stripe-hosted Checkout completes (test mode).
3. `customer.subscription.created` webhook flows → org.plan_tier='pro'.
4. `POST /api/v1/generate` succeeds (quota=5/5 available).
5. Engine runs → emits real usage events → tenant Worker dispatches a tool call → outbox row created → Inngest emits to Stripe Meters → meter events visible in Stripe Dashboard.
6. Daily reconciliation runs → 0% drift verified.
7. Drift Watcher manual trigger → no false positives on the spec we just generated.
8. Cost cap test: spec that costs >$2 forces hard fail with partial result + bill.

**Acceptance:** all 8 steps green; phase-level `08-SUMMARY.md` authored; verifier-agent runs `gsd-verify-work`.

---

## 17. Dependency Footprint

### `apps/api/package.json` — additions

```json
{
  "dependencies": {
    "hono": "^4.12.15",                     // existing Phase 1
    "@hono/zod-validator": "^0.4.0",         // existing Phase 1 (verify version: latest is 0.7.6)
    "zod": "^4.3.6",                         // existing Phase 1
    "@mcpgen/contracts": "workspace:*",      // existing
    "@mcpgen/ir": "workspace:*",             // existing
    "@mcpgen/engine-fixtures": "workspace:*",// NEW — for synthetic outbox seeder
    "drizzle-orm": "^0.45.2",                // existing Phase 1
    "@neondatabase/serverless": "^1.1.0",    // existing Phase 1
    "inngest": "^4.2.4",                     // existing Phase 1
    "@logto/node": "^3.1.10",                // existing Phase 1 (NOT used; recommend remove — see note below)
    "@sentry/cloudflare": "^10.50.0",        // existing Phase 1
    "ulid": "^2.4.0",                        // existing Phase 1
    "jose": "^6.2.2",                        // NEW — JWT verification
    "stripe": "^22.1.0",                     // NEW — Stripe SDK
    "resend": "^6.12.2"                      // NEW — email
  },
  "devDependencies": {
    "@mcpgen/shared-config": "workspace:*",
    "wrangler": "^4.85.0",
    "@cloudflare/workers-types": "^4.20240605.0",
    "typescript": "^6.0.3",
    "vitest": "^1.6.0"
  }
}
```

**Note on `@logto/node`:** Phase 1 added `@logto/node@^3.1.10`. This SDK is for OIDC client flows (sign-in pages, callback handlers) — Phase 7 (Frontend) consumes it. The BFF (`apps/api`) only verifies JWTs against JWKS via `jose`, so `@logto/node` is unused in `apps/api`. **Recommend Wave 1 removes it from `apps/api` `package.json`** (it was speculative in Phase 1; Phase 7 will add to `apps/web`).

### `packages/contracts/package.json` — no additions (uses existing zod + drizzle).

### Workspace-level — no additions to root `package.json`; pnpm workspace handles per-package deps.

---

## 18. Pattern Map — File Structure Additions

```
packages/contracts/src/
├── inngest-functions.ts          NEW — D-27 stable function ID register
├── storage.ts                    NEW — D-23 abstract StorageAdapter interface
├── plan-tier.ts                  NEW — D-12 QUOTA_LIMITS constants
├── engine-internal-api.ts        NEW — Stage A parse endpoint contract (cross-ws ask)
├── db-schema.ts                  EDIT — add Phase 8 columns + tables
├── launch-criteria.ts            EDIT — add COST_CAP_FREE_USD + COST_CAP_PRO_USD
├── generation-api.ts             EDIT — add PartialResultCost discriminated-union
└── (existing files unchanged)

apps/api/src/
├── index.ts                      EDIT — mount auth middleware + Inngest serve + new routes
├── instrumentation.ts            EDIT — extend beforeSend to redact Stripe customer IDs
├── db.ts                         NEW — Drizzle client init (Neon HTTP for local + edge)
├── middleware/
│   └── auth.ts                   NEW — D-01 jose-based JWT middleware
├── lib/
│   ├── quota.ts                  NEW — D-12 checkQuota helper
│   ├── quota-queries.ts          NEW — TimescaleDB hourly-aggregate query
│   ├── m2m-token.ts              NEW — BFF→engine M2M token cache
│   ├── drift/
│   │   └── ir-diff.ts            NEW — D-17 cosmetic-stripping diff
│   ├── email/
│   │   └── resend-client.ts      NEW — drift + reconciliation + MAU email senders
│   └── storage/
│       ├── local-fs.ts           NEW — D-23 LocalFsStorageAdapter
│       └── r2.ts                 NEW — D-23 Phase 10 stub (NotImplementedError)
├── routes/
│   ├── v1/
│   │   ├── generate.ts           EDIT — full impl: auth → quota → enqueue
│   │   ├── billing/
│   │   │   └── checkout.ts       NEW — D-06 Stripe Checkout Session
│   │   ├── deployments.ts        NEW — D-19 list / patch deployment
│   │   ├── drift-events.ts       NEW — D-19 list / regenerate
│   │   └── dashboard.ts          NEW — D-01 protected dashboard data
│   ├── stripe-webhook.ts         NEW — D-08 webhook handler (mounted before auth middleware)
│   └── internal/
│       └── sse-callback.ts       NEW — engine→BFF callback (M2M-protected)
├── inngest/
│   ├── client.ts                 NEW — Inngest TS client init
│   └── functions/
│       ├── index.ts              NEW — barrel export
│       ├── drift-watcher.ts      NEW — D-16 daily 03:00 UTC
│       ├── drift-watcher-check.ts NEW — fan-out per-deployment check
│       ├── usage-reconciler.ts   NEW — D-15 daily 02:00 UTC
│       ├── stripe-meters-emit.ts NEW — D-22 every 60s outbox poller
│       ├── quota-period-rollover.ts NEW — D-14 hourly anniversary rollover
│       ├── logto-mau-watch.ts    NEW — D-05 daily 04:00 UTC MAU alert
│       └── cost-cap-enforcer.ts  NEW — D-13 event-triggered ('generation/cost.updated')
└── scripts/
    └── seed-synthetic-usage.ts   NEW — Wave 1–2 outbox seeder from engine-fixtures

apps/api/tests/
├── auth.test.ts                  NEW — JWT middleware contract
├── stripe-webhook.test.ts        NEW — mocked Stripe + idempotency replay
├── quota.test.ts                 NEW — checkQuota against fixture-seeded usage_events
├── drift/
│   ├── ir-diff.test.ts           NEW — cosmetic-stripping correctness
│   └── drift-watcher.test.ts     NEW — Inngest fan-out + diff persist + email rate-limit
├── inngest/
│   ├── stripe-meters-emit.test.ts NEW — outbox claim + send + mark-sent
│   ├── usage-reconciler.test.ts  NEW — drift compute + alert mock
│   └── cost-cap-enforcer.test.ts NEW — threshold cross + cancel call
└── billing/
    └── checkout.test.ts          NEW — Checkout Session URL returned

infrastructure/
├── stripe/
│   ├── setup.ts                  NEW — D-07 idempotent product/price/meter creator
│   └── README.md                 NEW — local-dev workflow + manual run instructions
├── neon/migrations/
│   └── 20260428000000_phase8_billing_drift.sql  NEW — D-28 single atomic migration
└── logto/                        EDIT — README adds LOGTO_M2M_* triple

docs/
├── decisions/
│   └── 2026-04-XX-cost-cap-thresholds.md  NEW — paired with launch-criteria.ts edit
└── runbooks/
    └── logto-tenant-setup.md     NEW — D-03 manual click-path procedure

apps/api/README.md                EDIT — local-dev port map (Bun + Inngest + stripe-cli);
                                          Wave 3 trigger: `stripe listen --forward-to ...`

.gitignore                        EDIT — add `.local-storage/`

.env.local                        EDIT — user adds:
                                    LOGTO_M2M_APP_ID
                                    LOGTO_M2M_APP_SECRET
                                    LOGTO_M2M_RESOURCE_INDICATOR
                                    STRIPE_SECRET_KEY (Wave 3)
                                    STRIPE_WEBHOOK_SECRET (Wave 3)
                                    STRIPE_PRICE_PRO (after setup.ts run)
                                    STRIPE_METER_EVALS_ID
                                    STRIPE_METER_TOOL_CALLS_ID
                                    STRIPE_METER_GENERATIONS_ID
                                    RESEND_API_KEY
                                    OPS_EMAIL
                                    ENGINE_ENDPOINT (default http://localhost:8000)
```

### Hono middleware composition order (recommended)

```typescript
// apps/api/src/index.ts
const app = new Hono<{ Bindings: Bindings; Variables: { auth?: AuthContext } }>();

// Layer 1: Sentry instrumentation (wraps everything; non-blocking)
// (already wired via withSentry export at end of file)

// Layer 2: Public unauthenticated routes (BEFORE auth)
app.get('/health', ...);
app.get('/health/launch-criteria', ...);
app.route('/api/v1/stripe/webhook', stripeWebhookRoute);   // signature is its own auth
app.on(['GET', 'PUT', 'POST'], '/api/inngest', serve({     // Inngest signs requests (or unsigned in dev)
  client: inngest, functions,
}));

// Layer 3: Internal M2M-protected routes (auth middleware enforces M2M token)
const internalApp = new Hono();
internalApp.use('*', authMiddleware);
internalApp.use('*', requireM2M);  // additional check: c.var.auth.isM2M === true
internalApp.route('/sse-callback', sseCallbackRoute);
app.route('/internal/v1', internalApp);

// Layer 4: Public-API protected routes (user JWT)
const protectedApp = new Hono();
protectedApp.use('*', authMiddleware);
protectedApp.route('/generate', generateRoute);
protectedApp.route('/billing', billingRoute);
protectedApp.route('/dashboard', dashboardRoute);
protectedApp.route('/deployments', deploymentsRoute);
protectedApp.route('/drift-events', driftEventsRoute);
app.route('/api/v1', protectedApp);

export default { fetch: app.fetch };  // local Bun
// CF Workers: export default withSentry(env => sentryOptionsFor(env), app);
```

---

## 19. Validation Architecture

> Phase 8 has `workflow.nyquist_validation` enabled (no opt-out in `.planning/config.json`). This section defines the Nyquist validation strategy that VALIDATION.md will codify.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest@^1.6.0 (existing Phase 1 pin; matches all `apps/*` and `packages/*`) |
| Config file | `apps/api/vitest.config.ts` (existing) |
| Quick run command | `pnpm --filter @mcpgen/api test` |
| Full suite command | `pnpm -r test` (workspace-wide; ~30s on Phase 1 baseline) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **CTRL-02** | Logto JWT middleware rejects missing/invalid/expired tokens; accepts valid user JWT (sets `c.var.auth.isM2M=false`); accepts valid M2M JWT (sets `isM2M=true`) | unit (mocked JWKS) | `pnpm --filter @mcpgen/api test auth` | ❌ Wave 1 |
| **CTRL-02** | Auth middleware applied only to `/api/v1/*` and `/internal/v1/*`; `/health` + `/api/v1/stripe/webhook` remain public | integration (in-process Hono request) | `pnpm --filter @mcpgen/api test auth-mounting` | ❌ Wave 1 |
| **CTRL-03** | IR diff strips cosmetic fields; `summary`/`description` change → empty diff; parameter added → `changed` entry | unit | `pnpm --filter @mcpgen/api test drift/ir-diff` | ❌ Wave 4 |
| **CTRL-03** | Drift watcher fan-out: cron fires → `drift/check.requested` event sent per active deployment | unit (mocked Inngest test executor) | `pnpm --filter @mcpgen/api test inngest/drift-watcher` | ❌ Wave 4 |
| **CTRL-03** | Drift email rate-limit: second INSERT for same (tenant_id, week_start) raises UNIQUE; silently swallowed; first email sent | integration (real Neon dev DB) | `pnpm --filter @mcpgen/api test drift/email-rate-limit` | ❌ Wave 4 |
| **CTRL-04** | Drizzle migration applies cleanly to Neon dev branch; all Phase 8 columns + tables + continuous aggregate present | integration (`db:test-migrate` script) | `pnpm --filter @mcpgen/contracts db:test-migrate` | ✅ exists; extend assertions in Wave 1 |
| **CTRL-04** | TimescaleDB continuous aggregate `usage_hourly` refreshes; quota query returns expected count | integration (real Neon, seeded fixture data) | `pnpm --filter @mcpgen/api test quota` | ❌ Wave 1 (skeleton); Wave 3 (real query) |
| **CTRL-05** | `LocalFsStorageAdapter` writes/reads/deletes under `.local-storage/{specs,artifacts,public-cache}/`; `R2StorageAdapter` throws `NotImplementedError` | unit | `pnpm --filter @mcpgen/api test storage` | ❌ Wave 1 |
| **CTRL-06** | Stripe webhook handler verifies signature (mocked); persists event with `stripe_event_id UNIQUE`; replay → `duplicate: true`; unhandled event → ack 200 with `status='received'` | unit (vi.mock stripe) | `pnpm --filter @mcpgen/api test stripe-webhook` | ❌ Wave 2 |
| **CTRL-06** | Stripe Checkout Session creation returns valid `{url}`; metadata includes `org_id` | unit (vi.mock stripe) | `pnpm --filter @mcpgen/api test billing/checkout` | ❌ Wave 3 |
| **CTRL-06** | Cost-cap enforcer cancels generation when `cumulative_cost_usd > cap`; calls engine `/internal/v1/cancel-generation` with M2M token; persists `status='cost_capped'`; emits billable usage event | unit (vi.mock fetch) | `pnpm --filter @mcpgen/api test inngest/cost-cap-enforcer` | ❌ Wave 3 |
| **CTRL-07** | `checkQuota` returns 429 when `used >= limit`; PAYG plan never blocks; period rollover updates `quota_period_start` to next month | integration (real Neon, seeded usage_events) | `pnpm --filter @mcpgen/api test quota` | ❌ Wave 3 |
| **CTRL-07** | Stripe meters outbox: poller claims pending rows with `FOR UPDATE SKIP LOCKED`; emits via `stripe.billing.meterEvents.create`; marks `sent_at`; UNIQUE on `idempotency_key` prevents duplicates | integration (Wave 2: vi.mock stripe; Wave 3: real sandbox stripe-cli) | `pnpm --filter @mcpgen/api test inngest/stripe-meters-emit` | ❌ Wave 2 |
| **CTRL-07** | Reconciliation cron computes drift_pct; alerts via Resend mock when >2%; `(reconciliation_date, event_type, tenant_id)` UNIQUE prevents double-alerting on re-run | unit (vi.mock resend) + integration (real Neon) | `pnpm --filter @mcpgen/api test inngest/usage-reconciler` | ❌ Wave 4 |
| **Cross-cutting (Pitfall #17)** | Logto MAU watcher cron emails ops at >4K (mocked Logto API) | unit (vi.mock fetch + resend) | `pnpm --filter @mcpgen/api test inngest/logto-mau-watch` | ❌ Wave 4 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @mcpgen/api test` (~5–10s after Wave 1 baseline; <30s by Wave 5).
- **Per wave merge:** `pnpm -r test` (workspace-wide; ~30–45s).
- **Phase gate:** `pnpm -r test && pnpm -r typecheck && pnpm -r lint` before `gsd-verify-work` runs. The phase-8 verifier-agent additionally runs:
  - `bun run apps/api/src/index.ts` + `npx inngest-cli@latest dev` for 30s startup smoke (no crashes).
  - `pnpm --filter @mcpgen/contracts drizzle-kit:check` (no pending migration drift).

### Wave 0 Gaps

- [ ] `apps/api/tests/auth.test.ts` — covers CTRL-02 middleware behavior; needs jose mock pattern for JWKS responses.
- [ ] `apps/api/tests/quota.test.ts` — covers CTRL-07; needs Neon dev DB connection (use `DATABASE_URL_UNPOOLED` per Phase 1 PHASE-DEVIATIONS.md rev 2).
- [ ] `apps/api/tests/inngest/` directory — Inngest TS test harness via `function.execute({ steps: [...] })` per Context7; verify pattern in Wave 1.
- [ ] `apps/api/tests/stripe-webhook.test.ts` — needs `vi.mock('stripe', ...)` hoisted at module level; needs raw-body-passthrough fixture.
- [ ] `apps/api/tests/drift/ir-diff.test.ts` — needs `RawIR` fixtures for baseline + variants (cosmetic-only / parameter-added / endpoint-removed). **Source from `packages/engine-fixtures/stripe/ir.json`** + hand-mutate.
- [ ] Vitest mock for Resend SDK — straightforward, no fixture needed.

### Cross-workstream test ownership (D-21 Phase 1 carry-forward)

- **`apps/api/tests/**`** — owned by `ops` workstream.
- **`packages/contracts/tests/**`** (idempotency, generation-api, usage-event, launch-criteria) — owned by `main` workstream; Phase 8 edits extend without changing ownership.
- **`packages/engine-fixtures/tests/**`** — owned by `main` workstream; Phase 8 only consumes (doesn't edit).
- Cross-cutting failures (e.g., schema change breaks engine-fixtures shape test) escalate as `chore(contracts):` PR per D-21.

---

## 20. Open Questions (RESOLVED)

### Q1 — Engine `/internal/v1/parse` endpoint (Phase 2 cross-ws ask)

The Drift Watcher needs Stage A parsing but Stage A code lives in the Python engine. Phase 8 must NOT duplicate parsing logic in TS (per §13 recommendation). This requires the engine workstream to expose `POST /internal/v1/parse` — which technically is a Phase 2 deliverable.

**Recommendation:** Phase 8 Wave 4 plan adds a `chore(contracts): pin Stage A internal parse endpoint` PR up front (Wave 1, actually) defining the request/response shape in `packages/contracts/src/engine-internal-api.ts`. Engine workstream implements against the contract when Phase 2 starts (Phase 2 Wave 1 task). If Phase 2 has not landed by Phase 8 Wave 4, Drift Watcher can either:
- (a) skip drift detection until engine ships;
- (b) shell out to `python -m mcpgen_engine.stage_a parse <url>` from a Bun child process (clunky, but unblocks Wave 4 testability).

**Resolution needed:** Planner should pick (a) — Drift Watcher is daily cron, no urgency; testable end-to-end only when engine lands. Wave 4 acceptance gate documents this dependency.

**RESOLVED:** Recommendation (a) — Drift Watcher gracefully skips drift detection until engine `/internal/v1/parse` lands; contract pinned in Plan 08-01.

### Q2 — Engine cancel-mid-pass support (Phase 5 follow-up)

Per CONTEXT.md specifics: "Engine workstream may need a Phase 5 follow-up if it does not currently support mid-pass abort." Cost cap enforcement REQUIRES the engine to honor cancel signals mid-pass; otherwise user is billed for already-spent tokens beyond the cap.

**Recommendation:** Phase 8 Wave 3 ships the cost-cap enforcer + cancel endpoint contract. Engine workstream commits to honoring cancel by Phase 5 close (Phase 5 verification gate adds: "engine cancel signal aborts current pass within 5s of receipt"). Until then, the cost cap acts as a soft cap — first-pass-after-cap completes (typical overage <$0.10), then enforcement fires.

**Resolution needed:** Planner files a `chore(engine): support mid-pass cancel via cooperative abort` issue tagged for engine workstream Phase 5 acceptance.

**RESOLVED:** Cost cap acts as soft cap until Phase 5; follow-up issue filed at `.planning/todos/pending/engine-cooperative-abort.md` per Plan 08-03 Task 4.

### Q3 — Stripe Customer Portal (deferred per CONTEXT.md, but billing UX gap)

CONTEXT.md defers Stripe Customer Portal integration to v1.x. But MVP Pro users WILL need to update payment methods or cancel. Without Customer Portal, the only path is "email support."

**Recommendation:** Acceptable for MVP — solo founder ops, low expected churn in W7–W10. Phase 8 documents in `docs/runbooks/manual-customer-portal.md` how the founder manually invokes `stripe.billingPortal.sessions.create({ customer: ... })` and emails the URL. If churn > 5% in W7–W10 → fast-follow Customer Portal in v1.0.1.

**RESOLVED:** MVP uses manual operator-invoked Stripe Billing Portal session per `docs/runbooks/manual-customer-portal.md`; full Customer Portal deferred to v1.x.

### Q4 — Resend domain ownership (`drift@mcpgen.dev` / `ops@mcpgen.dev`)

Resend requires DNS records (SPF/DKIM/DMARC) on the sender domain. Does the user already own `mcpgen.dev` and have it pointed at Cloudflare?

**Recommendation:** Pre-Wave-4 prerequisite: user verifies domain in Resend Console; `drift@` and `ops@` aliases created. If domain is not yet owned, Phase 8 falls back to `onboarding@resend.dev` (Resend's shared sender) for dev; production launch criterion adds DNS setup at W7.

**RESOLVED:** Resend domain ownership documented as W4 prereq; fallback to `onboarding@resend.dev` until DNS configured.

### Q5 — `DATABASE_URL` vs `DATABASE_URL_UNPOOLED` for Inngest cron functions

Phase 1 Plan 04 uses `DATABASE_URL_UNPOOLED` for migrations (DDL preferred-direct). Inngest cron functions run frequent short-lived queries that benefit from connection pooling (`DATABASE_URL`). But cost-cap enforcer needs strong consistency on `generations.cumulative_cost_usd` UPDATE — pooler-side prepared-statement caching can interact badly with frequent ALTER-able schema (it shouldn't, but Phase 1 docs noted edge cases).

**Recommendation:** All Phase 8 BFF + Inngest queries use `DATABASE_URL` (pooled — Neon's PgBouncer handles ~5K concurrent connections well). Migrations only use `DATABASE_URL_UNPOOLED`. Document in `apps/api/README.md`.

**RESOLVED:** All Phase 8 BFF + Inngest queries use pooled `DATABASE_URL`; only migrations use `DATABASE_URL_UNPOOLED`. Documented in `apps/api/README.md` per Plan 08-01.

---

## 21. Sources

### Primary (HIGH confidence)

- **Stripe Node SDK:** Context7 `/stripe/stripe-node` (verified version `22.1.0`, latest dist-tag 2026-04-26 via `npm view stripe version`); v22 uses API version `2025-09-30.clover`; v18+ migrated to Basil API.
  - https://github.com/stripe/stripe-node/wiki/Migration-guide-for-v18 (Basil API breaking changes)
  - Webhook signature: `constructEventAsync` mandatory for CF Workers / Bun async crypto.
- **Stripe Billing Meters v2:** Context7 `/stripe/stripe-node` — `stripe.v2.billing.meterEventStream.create` for high-throughput; `stripe.billing.meterEvents.create` for standard.
- **Stripe CLI:** Context7 `/stripe/stripe-cli` — `stripe listen --forward-to ...` issues a stable `whsec_xxx` per machine.
- **Inngest TypeScript SDK:** Context7 `/inngest/inngest-js` + `/websites/inngest` (verified version `4.2.4` via `npm view inngest version`).
  - https://www.inngest.com/docs/dev-server (`npx inngest-cli@latest dev`)
  - https://www.inngest.com/docs/learn/serving-inngest-functions (Hono adapter `inngest/hono`)
  - https://www.inngest.com/docs/reference/typescript/testing (test harness pattern)
- **jose:** Context7 `/panva/jose` (verified version `6.2.2` via `npm view jose version`); Web-standard, runs on Bun + CF Workers + Node.
  - `createRemoteJWKSet` + `jwtVerify` with `audience` array for multi-aud distinction.
- **Logto Cloud Admin API:** Context7 `/websites/logto_io` — `client_credentials` grant; `/api/dashboard/widgets/active-user-count` for MAU; JWKS at `${LOGTO_ENDPOINT}/oidc/jwks`.
- **Resend SDK:** Context7 `/websites/resend` (verified version `6.12.2` via `npm view resend version`); `resend.emails.send` + `resend.batch.send` (max 100/batch); rate-limit 2 req/s free tier, 100 req/s production.
- **Hono framework:** Context7 `/websites/hono_dev` (existing Phase 1 pin `^4.12.15`); `createMiddleware` from `hono/factory` for typed middleware.
- **Drizzle ORM:** Context7 `/drizzle-team/drizzle-orm-docs` (existing Phase 1 pins `drizzle-orm@^0.45.2`, `drizzle-kit@^0.31.10`); ALTER TABLE patterns; UNIQUE constraints.
- **Existing project files** (HIGH confidence — directly inspected this session):
  - `packages/contracts/src/db-schema.ts` — Phase 1 Drizzle schema.
  - `packages/contracts/src/idempotency.ts` — STRIPE_METERS_KEY_REGEX + ULID helpers.
  - `packages/contracts/src/launch-criteria.ts` — runtime constants + paired-decision contract.
  - `packages/contracts/src/generation-api.ts` — SSE event envelope.
  - `packages/contracts/src/usage-event.ts` — UsageEvent schema.
  - `apps/api/src/index.ts` + `instrumentation.ts` + `routes/v1/generate.ts` + `routes/v1/jobs/stream.ts` — Hono BFF skeleton.
  - `infrastructure/neon/migrations/20260427000000_init_schema.sql` — Phase 1 init schema.
  - `infrastructure/logto/README.md` — env-var contract.
  - `infrastructure/neon/SCALING.md` — Scale-tier upgrade procedure.
  - `packages/engine-fixtures/{stripe,github,notion,linear,slack}/` — Wave 1–2 outbox seed source.

### Secondary (MEDIUM confidence — referenced from project docs)

- `docs/mcpgen-architecture.md` §10 (billing + Stripe Meters v2), §10.2 (Stripe Meters event identifier shape), §10.3 (pricing rules), §6 (runtime auth modes), §11 (observability redaction).
- `docs/mcpgen-pass-0-design.md` §13 (drift detection model).
- `docs/mcpgen-git-workflow-rules.md` (Conventional Commits, atomic commits, NEVER `--no-verify`).
- `.planning/research/PITFALLS.md` §#13, §#16, §#17, §#21, §#34.

### Tertiary (LOW confidence — none required for Phase 8)

- All Phase 8 implementation choices are backed by direct library docs or existing project files. No `[ASSUMED]` claims required.

---

## 22. Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Stripe Node v22 `constructEventAsync` works on Bun runtime same as CF Workers (both use Web Crypto) | §6 D-08 | Webhook signature verification fails; mitigated by Wave 2 integration test against `stripe trigger` real events |
| A2 | Inngest TS SDK 4.2.4 supports `cron()` helper (verified in Context7 docs but not directly tested in this codebase) | §6 D-15..D-20 | Function registration fails; mitigated by Wave 1 acceptance: dev server starts cleanly with empty function list |
| A3 | Logto Admin API endpoint `/api/dashboard/widgets/active-user-count` returns `{count: number}` shape | §6 D-05 | MAU watcher emits incorrect alert; mitigated by Wave 4 acceptance: endpoint response shape verified against live `mcpgen-prod` tenant |
| A4 | TimescaleDB continuous aggregate refresh policy (`add_continuous_aggregate_policy`) works on Neon's TimescaleDB 2.17.1 (existing in Phase 1) | §7 migration §11 | Quota query returns stale data; mitigated by Wave 1 db:test-migrate verifies aggregate exists; Wave 3 quota test seeds usage_events and waits for refresh |
| A5 | Engine workstream will deliver `/internal/v1/parse` endpoint by Phase 2 close (cross-ws ask) | §13; §20 Q1 | Drift Watcher Wave 4 cannot execute end-to-end until engine lands; documented as known dependency, not blocker for Phase 8 plan completion |
| A6 | Engine workstream will support mid-pass cancel by Phase 5 close (cross-ws ask) | §12; §20 Q2 | Cost cap enforcement is soft cap (one extra pass spend); documented as Phase 5 follow-up |
| A7 | User domain `mcpgen.dev` is owned and can have `drift@` / `ops@` Resend senders configured | §14; §20 Q4 | Drift + reconciliation emails fail to send; mitigated by fallback to `onboarding@resend.dev` until DNS configured |
| A8 | `@hono/zod-validator` version `^0.4.0` in Phase 1 pin works with current zod `^4.3.6` (latest validator is 0.7.6 per npm) | §17 dependency footprint | Validator API mismatch on route handlers; mitigated by checking validator pin during Wave 1; bump to `^0.7.6` if needed (low-risk, semver-major bump but no breaking API changes per validator changelog) |

If users push back on any [ASSUMED] item: re-discuss before Wave begins.

---

## 23. Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | apps/api local dev | ✓ (assumed; existing Phase 1) | latest | — |
| Node.js | npm/pnpm scripts | ✓ | ≥18 | — |
| pnpm | workspace tooling | ✓ (existing Phase 1) | 9.x | — |
| Neon Postgres dev branch | Phase 8 db:test-migrate + integration tests | ✓ (live per Phase 1 Plan 04) | PG 16 + TimescaleDB 2.17.1 + pgvector 0.8.0 | — |
| Logto Cloud `mcpgen-prod` tenant | JWT verification + MAU watcher | ✓ (manually configured Phase 1) | Cloud free tier | — |
| Logto M2M app | engine→BFF callbacks | ✗ (NEW Phase 8) | — | User provisions via Logto Console; documented in `docs/runbooks/logto-tenant-setup.md` |
| OpenRouter | (not used in Phase 8) | ✓ | — | n/a |
| Stripe sandbox account | Wave 3+ real Stripe testing | ✗ (Wave 3 prerequisite) | — | User signs up + gets `sk_test_...`; documented in `apps/api/README.md` |
| `stripe-cli` | Wave 3+ webhook forwarding | ✗ | — | `brew install stripe/stripe-cli/stripe`; documented in `apps/api/README.md` |
| Resend account | drift + reconciliation + MAU emails | ✗ (Wave 4 prerequisite) | — | User signs up + verifies domain; documented in `apps/api/README.md` |
| Resend sender domain (`mcpgen.dev`) | from-address for emails | ⚠ (assumed available) | — | Fallback to `onboarding@resend.dev` until DNS configured |
| Inngest dev server | Wave 1+ local cron testing | ✓ via `npx inngest-cli@latest dev` (no install) | latest | — |
| Inngest Cloud account | NOT used Phases 1–9 | n/a | — | Phase 10 only |
| Python engine local | Drift Watcher `/internal/v1/parse` | ⚠ (Phase 2 dependency) | — | Wave 4 partial: skip drift detection until engine lands |

**Missing dependencies blocking Phase 8 execution:** none. Wave 1–2 can start immediately (everything needed is local + Neon dev branch); Wave 3 needs user-provided Stripe keys (one-time setup); Wave 4 needs user-provided Resend account (one-time setup) + engine `/internal/v1/parse` (cross-ws coordination).

---

## 24. Metadata

**Confidence breakdown:**
- Standard stack (libraries + versions): **HIGH** — every package version verified via `npm view` 2026-04-26; APIs verified via Context7.
- Architecture / file structure: **HIGH** — directly extending existing Phase 1 patterns (verified in `apps/api/src/`, `packages/contracts/`, `infrastructure/`).
- Pitfall mitigations: **HIGH** — patterns map 1:1 to Pitfalls #13/#16/#17/#21/#34 documented strategies.
- Cross-workstream dependencies (engine /parse + cancel): **MEDIUM** — depends on Phase 2 / Phase 5 cooperation; documented as Q1/Q2 in §20 with fallback plans.
- Resend domain ownership: **MEDIUM** — assumes user owns `mcpgen.dev` (likely but not verified); fallback to `onboarding@resend.dev` documented.

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (30 days for stable libraries; Stripe SDK is the fastest-moving — re-verify if planning slips past 14 days).

---

*Phase: 08-auth-billing*
*Workstream: ops*
*Research authored: 2026-04-26*
*Source-of-truth hierarchy applied: RULES.md > model-override > git-rules > sprint-plan > pass/stage-design > v2 engine > architecture > implementation-plan > ux-flow*
