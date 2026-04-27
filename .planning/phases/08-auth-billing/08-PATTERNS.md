# Phase 8: Auth + Billing — Pattern Map

**Mapped:** 2026-04-26
**Workstream:** `ops`
**Files analyzed:** 38 net (28 NEW, 10 MODIFIED)
**Analogs found:** 36 / 38 (2 with no in-repo analog → use RESEARCH.md excerpts)
**Sources scanned:** `apps/api/src/`, `apps/api/tests/`, `packages/contracts/src/`, `packages/contracts/tests/`, `infrastructure/{logto,neon}/`, `docs/decisions/`

> **Reading order for executors:** every Phase 8 task starts by reading the analog file in this map, then writes the new file by mirroring its structure (header comment, imports, exports, error shape). Where this map says "Copy excerpt from X lines N–M," the excerpt is reproduced inline below — but the executor still reads the analog file to verify line numbers haven't drifted.

---

## File Classification

### Hono application files (`apps/api/src/`)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `apps/api/src/middleware/auth.ts` *(NEW)* | middleware | request-response | `apps/api/src/instrumentation.ts` (env-callback shape); `infrastructure/logto/scaffold.ts` (Logto OIDC token fetch) | role-match (no existing middleware in repo) |
| `apps/api/src/middleware/quota.ts` *(NEW)* | middleware | request-response | `apps/api/src/middleware/auth.ts` (sibling, written first); `apps/api/src/routes/v1/generate.ts` | partial (uses `c.get('auth')` shape from `auth.ts`) |
| `apps/api/src/routes/v1/billing/checkout.ts` *(NEW)* | route | request-response | `apps/api/src/routes/v1/generate.ts` | exact (Hono route + JSON return) |
| `apps/api/src/routes/v1/billing/portal.ts` *(NEW)* | route | request-response | `apps/api/src/routes/v1/generate.ts` | exact |
| `apps/api/src/routes/v1/stripe-webhook.ts` *(NEW)* | route | request-response (signed) | `apps/api/src/routes/v1/generate.ts` (Hono shell); RESEARCH §6 D-08 (full body) | partial (raw-body verification is novel) |
| `apps/api/src/routes/v1/drift.ts` *(NEW)* | route | CRUD (drift_events) | `apps/api/src/routes/v1/generate.ts` | exact |
| `apps/api/src/routes/v1/deployments.ts` *(NEW — PATCH `auto_regenerate_on_drift`)* | route | CRUD | `apps/api/src/routes/v1/generate.ts` | exact |
| `apps/api/src/routes/internal/v1/cancel-generation.ts` *(NEW)* | route | request-response (M2M) | `apps/api/src/routes/v1/generate.ts` (shell); RESEARCH §10 (M2M dispatch) | partial |
| `apps/api/src/routes/internal/v1/sse-callback.ts` *(NEW)* | route | event ingestion (engine→BFF) | `apps/api/src/routes/v1/jobs/stream.ts`; RESEARCH §12 (cost-update emission) | partial |
| `apps/api/src/inngest/client.ts` *(NEW)* | config | n/a | `apps/api/src/instrumentation.ts` (single-export module shape) | role-match |
| `apps/api/src/inngest/functions/index.ts` *(NEW barrel)* | utility | n/a | `packages/contracts/src/index.ts` (barrel re-exports) | role-match |
| `apps/api/src/inngest/functions/drift-watcher.ts` *(NEW)* | service (cron) | event-driven (cron → fan-out) | RESEARCH §13 (full code); no in-repo Inngest analog | RESEARCH-only |
| `apps/api/src/inngest/functions/drift-watcher-check.ts` *(NEW fan-out target)* | service | event-driven | RESEARCH §13 | RESEARCH-only |
| `apps/api/src/inngest/functions/usage-reconciler.ts` *(NEW)* | service (cron) | batch / event-driven | RESEARCH §6 D-15 | RESEARCH-only |
| `apps/api/src/inngest/functions/stripe-meters-emit.ts` *(NEW)* | service (cron) | batch (outbox poller) | RESEARCH §6 D-22 | RESEARCH-only |
| `apps/api/src/inngest/functions/quota-period-rollover.ts` *(NEW)* | service (cron) | batch | RESEARCH §6 D-14 | RESEARCH-only |
| `apps/api/src/inngest/functions/logto-mau-watch.ts` *(NEW)* | service (cron) | request-response → email | RESEARCH §6 D-05 | RESEARCH-only |
| `apps/api/src/inngest/functions/cost-cap-enforcer.ts` *(NEW)* | service (event-triggered) | event-driven | RESEARCH §12 | RESEARCH-only |
| `apps/api/src/lib/quota.ts` *(NEW)* | utility | request-response (DB read) | `packages/contracts/src/idempotency.ts` (validators); RESEARCH §6 D-12 | partial |
| `apps/api/src/lib/quota-queries.ts` *(NEW)* | utility | request-response (DB read) | `packages/contracts/src/idempotency.ts` (pure-function exports); RESEARCH §11 | partial |
| `apps/api/src/lib/m2m-token.ts` *(NEW)* | utility | request-response | `infrastructure/logto/scaffold.ts` `fetchAccessToken` (lines 67–98) | exact |
| `apps/api/src/lib/storage/local-fs.ts` *(NEW)* | service (adapter) | file-I/O | `infrastructure/logto/scaffold.ts` (env-reading + simple module pattern) | role-match |
| `apps/api/src/lib/storage/r2.ts` *(NEW stub)* | service (adapter) | file-I/O | `apps/api/src/routes/v1/generate.ts` (501-stub return) | role-match |
| `apps/api/src/lib/drift/ir-diff.ts` *(NEW)* | utility | transform | `packages/contracts/src/idempotency.ts` (pure-function utility module) | role-match |
| `apps/api/src/lib/email/resend-client.ts` *(NEW)* | service (connector) | request-response → external SaaS | `infrastructure/logto/scaffold.ts` (single-purpose external-SaaS wrapper) | role-match |
| `apps/api/src/db.ts` *(NEW Drizzle client)* | config | n/a | `apps/api/src/instrumentation.ts` (single-export module shape) | role-match |
| `apps/api/src/index.ts` *(MODIFIED)* | controller (mount) | n/a | self (Phase 1 baseline) | exact |
| `apps/api/src/instrumentation.ts` *(MODIFIED — beforeSend extension)* | config | n/a | self (Phase 1 baseline) | exact |
| `apps/api/scripts/seed-synthetic-usage.ts` *(NEW)* | utility (one-shot) | batch | `infrastructure/logto/scaffold.ts` (run-once Bun script with IIFE entry) | exact |

### Tests (`apps/api/tests/`)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `apps/api/tests/auth.test.ts` *(NEW)* | test | n/a | `apps/api/tests/contract.test.ts`; `packages/contracts/tests/idempotency.test.ts` | exact |
| `apps/api/tests/stripe-webhook.test.ts` *(NEW)* | test | n/a | `apps/api/tests/contract.test.ts` (Hono `app.fetch`); RESEARCH §9 (`vi.mock('stripe')` hoist) | partial |
| `apps/api/tests/quota.test.ts` *(NEW)* | test | n/a | `packages/contracts/tests/idempotency.test.ts` (regex/validator structure) | partial |
| `apps/api/tests/drift/ir-diff.test.ts` *(NEW)* | test | n/a | `packages/contracts/tests/idempotency.test.ts` | exact |
| `apps/api/tests/drift/drift-watcher.test.ts` *(NEW)* | test | n/a | RESEARCH §8 (Inngest test executor) — no in-repo analog | RESEARCH-only |
| `apps/api/tests/inngest/*.test.ts` *(NEW × 4)* | test | n/a | RESEARCH §8 + `packages/contracts/tests/launch-criteria.test.ts` (cross-doc sanity) | partial |
| `apps/api/tests/billing/checkout.test.ts` *(NEW)* | test | n/a | `apps/api/tests/contract.test.ts` | exact |
| `apps/api/tests/storage/local-fs.test.ts` *(NEW)* | test | n/a | `packages/contracts/tests/idempotency.test.ts` | exact |

### Contracts (`packages/contracts/src/`)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `packages/contracts/src/inngest-functions.ts` *(NEW)* | model (constants) | n/a | `packages/contracts/src/launch-criteria.ts` | exact |
| `packages/contracts/src/storage.ts` *(NEW)* | model (interface) | n/a | `packages/contracts/src/idempotency.ts` (Zod-free interface w/ docstring header) | partial (interface, not Zod schema) |
| `packages/contracts/src/plan-tier.ts` *(NEW)* | model (constants) | n/a | `packages/contracts/src/launch-criteria.ts` | exact |
| `packages/contracts/src/engine-internal-api.ts` *(NEW)* | model (Zod schemas) | n/a | `packages/contracts/src/generation-api.ts` | exact |
| `packages/contracts/src/billing-types.ts` *(NEW)* | model (Zod + types) | n/a | `packages/contracts/src/usage-event.ts` | exact |
| `packages/contracts/src/db-schema.ts` *(MODIFIED)* | model (Drizzle) | n/a | self (Phase 1 baseline) | exact |
| `packages/contracts/src/db-types.ts` *(MODIFIED — add new $inferSelect/$inferInsert)* | model (TS types) | n/a | self (Phase 1 baseline) | exact |
| `packages/contracts/src/launch-criteria.ts` *(MODIFIED — add COST_CAP_*)* | model (constants) | n/a | self (Phase 1 baseline) | exact |
| `packages/contracts/src/generation-api.ts` *(MODIFIED — add `PartialResultCost`)* | model (Zod) | n/a | self (Phase 1 baseline) | exact |
| `packages/contracts/src/index.ts` *(MODIFIED — re-export new modules)* | utility (barrel) | n/a | self (Phase 1 baseline) | exact |

### Infrastructure + docs

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `infrastructure/stripe/setup.ts` *(NEW)* | utility (setup script) | request-response (Stripe API) | `infrastructure/logto/scaffold.ts` | **exact** (canonical reference-only pattern) |
| `infrastructure/stripe/README.md` *(NEW)* | docs | n/a | `infrastructure/logto/README.md` | **exact** |
| `infrastructure/neon/migrations/20260428000000_phase8_billing_drift.sql` *(NEW)* | model (DDL) | n/a | `infrastructure/neon/migrations/20260427000000_init_schema.sql` | **exact** |
| `infrastructure/logto/README.md` *(MODIFIED — add `LOGTO_M2M_*` triple)* | docs | n/a | self | exact |
| `apps/api/README.md` *(NEW or MODIFIED)* | docs | n/a | `infrastructure/logto/README.md` (env contract + reachability sections) | exact |
| `docs/decisions/005-cost-cap-thresholds.md` *(NEW)* | docs | n/a | `docs/decisions/2026-04-26-launch-criteria-thresholds.md` | **exact** |
| `docs/runbooks/logto-tenant-setup.md` *(NEW)* | docs | n/a | `docs/runbooks/logto-pro-upgrade.md` (existing, similar runbook); `infrastructure/logto/README.md` "Self-host runbook" section (lines 95–108) | exact |
| `docs/runbooks/stripe-local-dev.md` *(NEW or content folded into `apps/api/README.md`)* | docs | n/a | `infrastructure/logto/README.md` | exact |
| `docs/runbooks/manual-customer-portal.md` *(NEW)* | docs | n/a | `docs/runbooks/logto-pro-upgrade.md` | exact |
| `.gitignore` *(MODIFIED — add `.local-storage/`)* | config | n/a | self | trivial |
| `apps/api/package.json` *(MODIFIED — add `jose`, `stripe`, `resend`, `@mcpgen/engine-fixtures`; remove `@logto/node` per RESEARCH §17 note)* | config | n/a | self | exact |

---

## Pattern Assignments

### A — Hono BFF skeleton + middleware composition

#### `apps/api/src/index.ts` *(MODIFIED)* — controller, mount-only

**Analog:** `apps/api/src/index.ts` (self, Phase 1 baseline at lines 1–37)

**Phase 1 baseline (verbatim, lines 1–37):**

```typescript
// apps/api/src/index.ts
//
// Hono BFF entry point — frozen contract surface (CTRL-01).
// Phase 1: 501 stubs for /api/v1/generate + SSE streamSSE stub for /api/v1/jobs/:id/stream.
// Phase 8 lands the real implementations.

import { Hono } from 'hono';
import { LAUNCH_CRITERIA } from '@mcpgen/contracts';

import { generateRoute } from './routes/v1/generate.js';
import { jobsStreamRoute } from './routes/v1/jobs/stream.js';
import { spikeSseRoute } from './routes/_spike/sse.js';

interface Bindings {
  HYPERDRIVE: Hyperdrive;
  SENTRY_DSN: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/health/launch-criteria', (c) => c.json(LAUNCH_CRITERIA));

app.route('/api/v1/generate', generateRoute);
app.route('/api/v1/jobs', jobsStreamRoute);
app.route('/_spike/sse', spikeSseRoute);

export default app;
```

**Phase 8 mounting order to ADD (mirror RESEARCH §18 "Hono middleware composition order"):**

| Layer | What | Why |
|-------|------|-----|
| 1 | `app.get('/health', ...)` + `/health/launch-criteria` | Public, BEFORE auth |
| 2 | `app.route('/api/v1/stripe/webhook', stripeWebhookRoute)` | Public — signature is the auth surface; mount BEFORE auth middleware |
| 3 | `app.on(['GET','PUT','POST'], '/api/inngest', serve({ client: inngest, functions }))` | Inngest dev server signs requests; no JWT |
| 4 | Internal sub-app: `internalApp.use('*', authMiddleware)` + `requireM2M` then `app.route('/internal/v1', internalApp)` | M2M-only |
| 5 | Public-API sub-app: `protectedApp.use('*', authMiddleware)` then `app.route('/api/v1', protectedApp)` | User JWT |

**Bindings type extends to add:**
```typescript
interface Bindings {
  HYPERDRIVE: Hyperdrive;
  SENTRY_DSN: string;
  ENVIRONMENT: string;
  // Phase 8 additions:
  LOGTO_ENDPOINT: string;
  LOGTO_BASE_URL: string;
  LOGTO_M2M_RESOURCE_INDICATOR: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_PRO: string;
  RESEND_API_KEY: string;
  OPS_EMAIL: string;
  ENGINE_ENDPOINT: string;
}
```

**Variables type:**
```typescript
interface Variables {
  auth?: AuthContext;  // set by middleware/auth.ts
}
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
```

**Pattern do's and don'ts:**
- ✅ Keep the existing `app.route('/api/v1/generate', generateRoute);` line — Phase 8 only **moves it** under the `protectedApp` sub-app, not deletes it.
- ✅ Keep the `/_spike/sse` route mounted as-is — it's still in scope for Phase 1 deviation tracking.
- ❌ Do NOT inline route logic; every route lives in its own file under `routes/`.
- ❌ Do NOT use `app.use('*', authMiddleware)` at the root — it would break `/health` and `/api/v1/stripe/webhook`.

---

#### `apps/api/src/middleware/auth.ts` *(NEW)* — middleware, request-response

**Analog:**
- `apps/api/src/instrumentation.ts` (env-callback shape, exported helper, no top-level side effects).
- `infrastructure/logto/scaffold.ts` lines 67–98 (`fetchAccessToken` shows the canonical Logto OIDC POST shape).

**Header comment pattern** (mirror `apps/api/src/instrumentation.ts` lines 1–13):

```typescript
// apps/api/src/middleware/auth.ts
//
// CTRL-02 / D-01 / D-02: Logto JWT verification middleware.
// Verifies bearer JWT against Logto JWKS via `jose`'s `createRemoteJWKSet`;
// caches JWKS for 10 min; rejects with 401 on missing/invalid/expired token.
// Distinguishes user JWTs (audience=LOGTO_BASE_URL) from M2M JWTs
// (audience=LOGTO_M2M_RESOURCE_INDICATOR) via the `aud` claim and stamps
// `c.var.auth = { isM2M, ... }` for downstream handlers.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-01, D-02
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-01, §10 (full token shapes)
//   - infrastructure/logto/README.md (env-var contract; LOGTO_M2M_* added Phase 8)
//   - https://github.com/panva/jose (createRemoteJWKSet + jwtVerify)
```

**Imports + module-level cache** (verbatim from RESEARCH §6 D-01):

```typescript
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { createMiddleware } from 'hono/factory';

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
```

**Exported types** (mirror RESEARCH §6 D-01):

```typescript
export interface AuthContext {
  subject: string;
  organizationId: string | null;
  isM2M: boolean;
  scopes: ReadonlyArray<string>;
  raw: JWTPayload;
}
```

**Middleware factory** (verbatim from RESEARCH §6 D-01, plus error-shape rule from project CLAUDE.md "Error Handling"):

```typescript
export const authMiddleware = createMiddleware<{
  Bindings: { LOGTO_ENDPOINT: string; LOGTO_BASE_URL: string; LOGTO_M2M_RESOURCE_INDICATOR: string };
  Variables: { auth: AuthContext };
}>(async (c, next) => {
  const authz = c.req.header('Authorization');
  if (!authz?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized', reason: 'missing_bearer' }, 401);
  }
  const token = authz.slice(7);
  try {
    const issuer = `${c.env.LOGTO_ENDPOINT}/oidc`;
    const { payload } = await jwtVerify(token, getJwks(c.env), {
      issuer,
      audience: [c.env.LOGTO_BASE_URL, c.env.LOGTO_M2M_RESOURCE_INDICATOR],
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

// Companion guard for M2M-only endpoints (mounted on /internal/v1 sub-app).
export const requireM2M = createMiddleware<{ Variables: { auth: AuthContext } }>(async (c, next) => {
  const auth = c.var.auth;
  if (!auth?.isM2M) return c.json({ error: 'forbidden', reason: 'm2m_required' }, 403);
  await next();
});
```

**Error envelope rule** (Phase 1 + project CLAUDE.md):
- Error body = `{ error: <stable-code>, reason: <machine-readable> }` — matches Phase 1 `routes/v1/generate.ts` line 18 pattern (`{ error: 'not_implemented_phase_8', ... }`).
- Status codes: 401 unauthorized, 403 forbidden. Always JSON. Never log the bearer token.

---

#### `apps/api/src/middleware/quota.ts` *(NEW)* — middleware, request-response

**Analog:** sibling `middleware/auth.ts` (composition shape) + RESEARCH §10 "Hono route protection example" (lines 1226–1248).

**Pattern** (mirror RESEARCH §10):

```typescript
// apps/api/src/middleware/quota.ts
//
// CTRL-07 / D-12: Pre-enqueue quota check.
// Reads TimescaleDB hourly aggregate (real-time quota truth per Pitfall #16);
// returns 429 + {quota_used, quota_limit, reset_at} when used >= limit.
// PAYG plan never blocks (every eval bills $0.50).
//
// Mounts AFTER authMiddleware (consumes c.var.auth.organizationId).

import { createMiddleware } from 'hono/factory';
import { checkQuota } from '../lib/quota.js';
import type { AuthContext } from './auth.js';

export function quotaGate(eventType: 'f3_eval' | 'generation') {
  return createMiddleware<{ Variables: { auth: AuthContext } }>(async (c, next) => {
    const orgId = c.var.auth?.organizationId;
    if (!orgId) return c.json({ error: 'no_org_context' }, 400);
    const quota = await checkQuota(/* db */, orgId, eventType);
    if (!quota.ok) {
      return c.json({
        error: 'quota_exceeded',
        quota_used: quota.used,
        quota_limit: quota.limit,
        reset_at: quota.reset_at.toISOString(),
      }, 429);
    }
    await next();
  });
}
```

**Mount example in `routes/v1/generate.ts`:**
```typescript
generateRoute.use('*', quotaGate('generation'));
```

---

### B — Route handlers (Hono shape)

#### `apps/api/src/routes/v1/billing/checkout.ts` *(NEW)*

**Analog:** `apps/api/src/routes/v1/generate.ts` (entire file — 28 lines)

**Verbatim shell from analog (lines 1–28):**

```typescript
// apps/api/src/routes/v1/generate.ts
//
// CTRL-01 frozen contract surface. Phase 1: returns 501 with the frozen contract shape.
// Phase 8 implements the real generation kickoff (Inngest job trigger + SSE wiring).
//
// References:
//   - docs/mcpgen-architecture.md §5.8 (HTTP API contract)
//   - packages/contracts/src/idempotency.ts (Idempotency-Key header convention)

import { Hono } from 'hono';
import { IDEMPOTENCY_KEY_HEADER } from '@mcpgen/contracts';

export const generateRoute = new Hono();

generateRoute.post('/', (c) => {
  const idempotencyKey = c.req.header(IDEMPOTENCY_KEY_HEADER);
  return c.json(
    {
      error: 'not_implemented_phase_8',
      phase: 1,
      requested_idempotency_key: idempotencyKey,
      contract_version: '1.0.0',
    },
    501,
  );
});
```

**Phase 8 checkout shape** (mirror header style + Hono export pattern from above; body from RESEARCH §6 D-06):

```typescript
// apps/api/src/routes/v1/billing/checkout.ts
//
// CTRL-06 / D-06: Stripe-hosted Checkout Session creation.
// Returns {url} for frontend (Phase 7) to window.location-redirect to Stripe.
// Hosted (NOT embedded Elements) — PCI-compliant out of the box.
//
// References:
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-06 (full impl)
//   - https://docs.stripe.com/billing/subscriptions

import { Hono } from 'hono';
import Stripe from 'stripe';
import type { AuthContext } from '../../../middleware/auth.js';

export const checkoutRoute = new Hono<{
  Bindings: { STRIPE_SECRET_KEY: string; STRIPE_PRICE_PRO: string; LOGTO_BASE_URL: string };
  Variables: { auth: AuthContext };
}>();

checkoutRoute.post('/', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) return c.json({ error: 'forbidden', reason: 'm2m_cannot_checkout' }, 403);
  const orgId = auth.organizationId;
  if (!orgId) return c.json({ error: 'no_org_context' }, 400);

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
  // ... full session.create per RESEARCH §6 D-06 ...
  return c.json({ url: session.url });
});
```

**Pattern do's:**
- ✅ One file per route (mirror Phase 1 `routes/v1/generate.ts`).
- ✅ Use `new Hono<{ Bindings; Variables }>()` typed shell — Phase 1 uses unfortunately untyped `new Hono()` because it's just a 501 stub; Phase 8 routes that consume `c.var.auth` and `c.env` MUST type the generic.
- ✅ Always return JSON via `c.json(body, status)`.
- ❌ Do NOT log Stripe customer IDs (gets redacted by Sentry `beforeSend` extension below, but defense in depth).

---

#### `apps/api/src/routes/v1/stripe-webhook.ts` *(NEW)*

**Analog:** `apps/api/src/routes/v1/generate.ts` for shell; RESEARCH §6 D-08 for body (full code reproduced earlier).

**Critical pattern points (reproduced from RESEARCH §6 D-08):**
- Use **`stripe.webhooks.constructEventAsync`** (NOT sync `constructEvent`) — required on Bun + CF Workers Web Crypto.
- Read raw body via `await c.req.text()` BEFORE any JSON parsing.
- Persist event FIRST (`subscription_events.stripe_event_id UNIQUE`), then dispatch handler INSIDE same try-block.
- On `.onConflictDoNothing` returning empty → ack 200 with `{received: true, duplicate: true}`.
- On handler error → mark `status='error'`, persist `error_message`, then `throw` (Stripe retries non-2xx).
- Mount BEFORE `authMiddleware` — webhook signature is the authentication.

---

#### `apps/api/src/routes/v1/drift.ts` *(NEW)*

**Analog:** `apps/api/src/routes/v1/generate.ts` (route shape); RESEARCH §6 D-19 lines 622–626 (3 endpoints).

**Endpoints to expose:**
```typescript
driftRoute.get('/deployments/:id/drift-events', /* lists drift_events for deployment */);
driftRoute.post('/drift-events/:id/regenerate', /* enqueues new generation, triggered_by='drift_manual' */);
driftRoute.patch('/deployments/:id', /* body: { auto_regenerate_on_drift: boolean } */);
```

**Validation**: use `@hono/zod-validator` (already in `package.json`) with Zod schemas from `packages/contracts/src/billing-types.ts` (NEW).

---

#### `apps/api/src/routes/internal/v1/cancel-generation.ts` *(NEW)*

**Analog:** `apps/api/src/routes/v1/generate.ts` (shell). Body from RESEARCH §12 (engine cancel endpoint contract, lines 1462–1476 — note: that block is the **engine** side; BFF side is the **outbound caller** in `cost-cap-enforcer.ts` lines 1402–1409). The BFF route file `cancel-generation.ts` per CONTEXT.md is the **incoming** M2M-protected endpoint that the engine calls when it self-aborts (post-cancel ack). Implement as a thin status-update handler:

```typescript
// apps/api/src/routes/internal/v1/cancel-generation.ts
import { Hono } from 'hono';
import type { AuthContext } from '../../../middleware/auth.js';

export const cancelGenerationRoute = new Hono<{ Variables: { auth: AuthContext } }>();

cancelGenerationRoute.post('/', async (c) => {
  // requireM2M middleware already applied at sub-app mount
  const { job_id, reason } = await c.req.json<{ job_id: string; reason: string }>();
  // ... update generations.status = 'cancelled', persist reason
  return c.json({ ok: true });
});
```

---

#### `apps/api/src/routes/internal/v1/sse-callback.ts` *(NEW)*

**Analog:** `apps/api/src/routes/v1/jobs/stream.ts` (Hono shell using `streamSSE`). Body from RESEARCH §12 (lines 1435–1456).

---

### C — Inngest functions (cron + event-driven)

> **No in-repo analog exists** — Inngest is added in Phase 8. All seven function files follow the canonical SDK pattern from RESEARCH §6 D-14, D-15, D-16, D-22, §12 — verbatim.

#### `apps/api/src/inngest/client.ts` *(NEW)* — config

**Analog:** `apps/api/src/instrumentation.ts` (single-purpose module exporting one symbol).

**Pattern (RESEARCH §8):**

```typescript
// apps/api/src/inngest/client.ts
//
// CTRL-09 prep / D-21: Inngest TS SDK client.
// Phases 1–9: local dev server only (npx inngest-cli@latest dev).
// Phase 10: wires INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY for Cloud.

import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'mcpgen-api',
  // No INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY in Phases 1–9 (local dev mode).
});
```

#### `apps/api/src/inngest/functions/index.ts` *(NEW barrel)*

**Analog:** `packages/contracts/src/index.ts` (re-export barrel).

**Pattern:**
```typescript
// apps/api/src/inngest/functions/index.ts
// Phase 9 orphan audit relies on this list matching INNGEST_FUNCTION_IDS register.

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

#### `apps/api/src/inngest/functions/drift-watcher.ts` *(NEW)* — service (cron)

**Analog:** RESEARCH §13 lines 1530–1548 (verbatim).

**Pattern shape** (every Inngest function file follows this skeleton):

```typescript
// apps/api/src/inngest/functions/drift-watcher.ts
//
// CTRL-03 / D-16: Daily drift detection cron.
// Stable function ID: INNGEST_FUNCTION_IDS.DRIFT_WATCHER ('drift-watcher-v1').
// Schedule: 03:00 UTC daily.
// Algorithm: list active deployments → fan-out one event per deployment to
// driftWatcherCheck (independent retries per deployment).
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-16, D-17, D-27
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-16, §13

import { cron } from 'inngest';
import { eq, isNotNull } from 'drizzle-orm';
import { INNGEST_FUNCTION_IDS, deployments } from '@mcpgen/contracts';
import { inngest } from '../client.js';
import { db } from '../../db.js';

export const driftWatcher = inngest.createFunction(
  { id: INNGEST_FUNCTION_IDS.DRIFT_WATCHER, triggers: [cron('0 3 * * *')] },
  async ({ step }) => {
    const active = await step.run('list-active-deployments', () =>
      db.query.deployments.findMany({ /* ... */ }),
    );
    await step.sendEvent(
      'dispatch-checks',
      active.map((d) => ({
        name: 'drift/check.requested',
        data: { deploymentId: d.id, specUrl: d.generation.spec.spec_url },
      })),
    );
  },
);
```

**Pattern do's** (apply to all 7 cron files):
- ✅ Always import `id` from `INNGEST_FUNCTION_IDS` constant — never hard-code the string. Phase 9 orphan audit walks this register.
- ✅ Each file exports exactly one function (named after the file) so the `index.ts` barrel can re-export cleanly.
- ✅ Wrap every DB call in `step.run('descriptive-step-name', async () => ...)` — Inngest snapshots step results for retry idempotency.
- ✅ Use `step.sendEvent(...)` for fan-out (not raw `inngest.send`) — keeps fan-out atomic with the cron step.
- ❌ Do NOT use `setTimeout` / `setInterval` — Inngest manages timers.
- ❌ Do NOT swallow errors — let them bubble; Inngest retries per the function's `retries: N` config.

#### `apps/api/src/inngest/functions/cost-cap-enforcer.ts` *(NEW)* — event-triggered

**Analog:** RESEARCH §12 lines 1373–1430 (verbatim).

**Critical config:**
```typescript
{
  id: INNGEST_FUNCTION_IDS.COST_CAP_ENFORCER,
  triggers: [{ event: 'generation/cost.updated' }],
  concurrency: { limit: 1, key: 'event.data.job_id' },  // serialize per generation
}
```

The `concurrency` key is the **Pitfall mitigation** — without it, two simultaneous cost events for the same generation could both pass the threshold check before either updates `generations.status='cost_capped'`.

#### `apps/api/src/inngest/functions/stripe-meters-emit.ts` *(NEW)* — outbox poller

**Analog:** RESEARCH §6 D-22 lines 681–706 (verbatim).

**Critical pattern — `FOR UPDATE SKIP LOCKED` claim (verbatim):**

```typescript
const pending = await step.run('claim-batch', async () => db.execute(sql`
  SELECT * FROM usage_events_outbox
  WHERE sent_at IS NULL
  ORDER BY created_at
  LIMIT 100
  FOR UPDATE SKIP LOCKED
`));
```

This is the **Pitfall #13 mitigation** — concurrent pollers do not double-process rows.

---

### D — Library / utility files

#### `apps/api/src/lib/m2m-token.ts` *(NEW)*

**Analog:** `infrastructure/logto/scaffold.ts` `fetchAccessToken` function (lines 67–98).

**Excerpt to copy from analog (lines 67–98) — verbatim:**

```typescript
async function fetchAccessToken(env: LogtoEnv): Promise<string> {
  const tenantHost = env.endpoint.replace(/^https?:\/\//, '');
  const audience = `https://${tenantHost}/api`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    resource: audience,
    scope: 'all',
  });

  const credentials = Buffer.from(`${env.appId}:${env.appSecret}`).toString('base64');
  const res = await fetch(`${env.endpoint}/oidc/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Logto token grant failed: ${String(res.status)} ${text}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('Logto token grant returned no access_token');
  }
  return json.access_token;
}
```

**Phase 8 wrapper** (extends with module-level cache + 60s safety margin per RESEARCH §10):

```typescript
// apps/api/src/lib/m2m-token.ts
//
// D-02: Cached M2M token for BFF→engine internal calls (cancel-generation, parse).
// Module-level cache; refresh when within 60s of expiry.

let cached: { token: string; expiresAt: number } | null = null;

export async function getM2mTokenForEngine(env: M2mEnv): Promise<string> {
  if (cached && Date.now() / 1000 < cached.expiresAt) return cached.token;
  // ... copy fetchAccessToken body verbatim, then:
  const body = await res.json() as { access_token: string; expires_in: number };
  cached = {
    token: body.access_token,
    expiresAt: Date.now() / 1000 + body.expires_in - 60,  // 60s safety margin
  };
  return cached.token;
}
```

**Pattern note:** Bun + CF Workers do NOT have `Buffer` globally — replace `Buffer.from(...).toString('base64')` with `btoa(...)`. Verified pattern in RESEARCH §6 D-05 lines 240–245 (Logto MAU watcher uses `btoa` directly).

#### `apps/api/src/lib/quota.ts` *(NEW)* + `apps/api/src/lib/quota-queries.ts` *(NEW)*

**Analog:** `packages/contracts/src/idempotency.ts` (pure-function utility module shape, lines 73–90 export pattern).

**Header pattern from analog:**
```typescript
// packages/contracts/src/idempotency.ts
//
// FND-14 / D-11: Idempotency keys at all 4 surfaces use a `${operation}_${ulid}`
// shape (with one exception — Stripe Meters dedup uses a composite key shape).
// ...
```

**Phase 8 `quota.ts` body** — verbatim from RESEARCH §6 D-12 lines 416–449. **`quota-queries.ts`** — verbatim from RESEARCH §11 lines 1273–1294.

#### `apps/api/src/lib/storage/local-fs.ts` *(NEW)*

**Analog:** `infrastructure/logto/scaffold.ts` (single-purpose module pattern + IIFE-free export).

**Implements interface defined in `packages/contracts/src/storage.ts` (NEW)** — see RESEARCH §6 D-23 lines 712–718.

**Implementation note (RESEARCH §4 "Claude's Discretion" recommendation):** use `fs/promises` async (`import { promises as fs } from 'node:fs'`); future R2 adapter is async too.

#### `apps/api/src/lib/storage/r2.ts` *(NEW stub)*

**Analog:** `apps/api/src/routes/v1/generate.ts` lines 17–27 (501 stub return pattern).

**Pattern** — mirror Phase 1 stub style:

```typescript
// apps/api/src/lib/storage/r2.ts
//
// CTRL-05 / D-23: R2 storage adapter — Phase 10 implementation.
// Phase 8 ships a NotImplementedError stub so the StorageAdapter interface
// has both implementations registered; LocalFsStorageAdapter is used in
// Phases 1–9 per the local-compute pivot.

import type { StorageAdapter } from '@mcpgen/contracts';

export const r2StorageAdapter: StorageAdapter = {
  async put() { throw new Error('NotImplementedError: R2 adapter is Phase 10'); },
  async get() { throw new Error('NotImplementedError: R2 adapter is Phase 10'); },
  async delete() { throw new Error('NotImplementedError: R2 adapter is Phase 10'); },
};
```

#### `apps/api/src/lib/drift/ir-diff.ts` *(NEW)*

**Analog:** `packages/contracts/src/idempotency.ts` (pure-function utility module).

**Algorithm** (RESEARCH §6 D-17 lines 575–585): deep-clone both IRs, recursively strip ignored fields (`summary`, `description`, `tags`, `externalDocs`, `x-*`, key order, whitespace), then diff via key-set comparison into `added` / `removed` / `changed` buckets. **Custom impl recommended** (~150 LOC, no dep). Output type `IrDiff` exported from this module.

#### `apps/api/src/lib/email/resend-client.ts` *(NEW)*

**Analog:** `infrastructure/logto/scaffold.ts` (single-purpose external-SaaS connector).

**Pattern** — RESEARCH §14 lines 1700–1736 (verbatim — three send functions: `sendDriftEmail`, `sendReconciliationAlert`, `sendMauAlert`).

#### `apps/api/src/db.ts` *(NEW)*

**Analog:** `apps/api/src/instrumentation.ts` (single-export module shape).

**Pattern:**
```typescript
// apps/api/src/db.ts
//
// FND-08 carry-forward: Drizzle ORM client init.
// Local Bun: uses pooled DATABASE_URL via @neondatabase/serverless HTTP driver.
// Migrations only: use DATABASE_URL_UNPOOLED (per Phase 1 PHASE-DEVIATIONS rev 2; RESEARCH §20 Q5).

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '@mcpgen/contracts/db-schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
export type DbClient = typeof db;
```

---

### E — Contracts (`packages/contracts/src/`)

#### `packages/contracts/src/inngest-functions.ts` *(NEW)*

**Analog:** `packages/contracts/src/launch-criteria.ts` (constants + `as const` + paired-decision contract).

**Header from analog (lines 1–27, copy structure):**

```typescript
// packages/contracts/src/launch-criteria.ts
//
// Frozen contract #4: IMMUTABLE runtime constants for launch / publishability gates.
//
// !! DO NOT change values without a paired docs/decisions/<YYYY-MM-DD>-<slug>.md entry !!
//
// Three-layer defense (T-1-03 / D-13 / Pitfall #29 — "AI-fix-by-lowering-threshold"):
//   1. Pre-commit hook .pre-commit-hooks/launch-criteria-paired-decision.sh
//      requires the same commit to also stage docs/decisions/<YYYY-MM-DD>-<slug>.md.
//   2. CI job `launch-criteria-assertion` in .github/workflows/main-ci.yml uses
//      `grep -qF` (fixed-string) to assert each constant matches the documented
//      threshold in docs/mcpgen-implementation-plan.md §11.7.
//   3. This file: values are exported as `as const` so TS infers literal types
//      (no widening to `number`). Importers cannot accidentally mutate them.
```

**Phase 8 register file** (verbatim from RESEARCH §6 D-27):

```typescript
// packages/contracts/src/inngest-functions.ts
//
// CTRL-09 / D-27: Stable Inngest function ID register.
// Phase 9 orphan audit walks every `inngest.createFunction({ id: ... })` in the
// repo and asserts the id is in this register.
//
// Bump rules (per D-27): any rename / schedule change / trigger change → version
// bump (-v2) + paired docs/decisions/<YYYY-MM-DD>-inngest-<name>-v2.md entry.
// Old id stays disabled until orphan audit (Phase 9).

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

#### `packages/contracts/src/storage.ts` *(NEW)*

**Analog:** `packages/contracts/src/idempotency.ts` (header-comment + types-only export).

**Pattern:**
```typescript
// packages/contracts/src/storage.ts
//
// CTRL-05 / D-23: StorageAdapter interface for spec/artifact/public-cache buckets.
// Phases 1–9 implementation: LocalFsStorageAdapter (apps/api/src/lib/storage/local-fs.ts)
// Phase 10 implementation: R2StorageAdapter (apps/api/src/lib/storage/r2.ts) — currently NotImplementedError stub.
// Env-flag swap: STORAGE_BACKEND=local|r2 (default 'local' Phases 1–9).

export type StorageBucket = 'specs' | 'artifacts' | 'public-cache';

export interface StorageAdapter {
  put(bucket: StorageBucket, key: string, body: Uint8Array | string, opts?: { contentType?: string }): Promise<void>;
  get(bucket: StorageBucket, key: string): Promise<Uint8Array | null>;
  delete(bucket: StorageBucket, key: string): Promise<void>;
}
```

#### `packages/contracts/src/plan-tier.ts` *(NEW)*

**Analog:** `packages/contracts/src/launch-criteria.ts`.

**Pattern (RESEARCH §6 D-12 lines 452–458):**

```typescript
// packages/contracts/src/plan-tier.ts
//
// D-11 / D-12: Plan-tier quotas (free / pro / payg).
// Per-month limits enforced pre-enqueue by apps/api/src/middleware/quota.ts.

export const PLAN_TIERS = ['free', 'pro', 'payg'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const QUOTA_LIMITS = {
  free: { f3_eval: 1, generation: 3 },
  pro:  { f3_eval: 5, generation: 25 },
  payg: { f3_eval: Infinity, generation: Infinity },
} as const;
```

#### `packages/contracts/src/engine-internal-api.ts` *(NEW)*

**Analog:** `packages/contracts/src/generation-api.ts` (entire file — Zod schemas + types + header pattern).

**Header from analog (lines 1–23, copy structure):**

```typescript
// packages/contracts/src/generation-api.ts
//
// Frozen contract #2: Generation API + SSE event envelope.
// ...
import { z } from 'zod';
```

**Phase 8 file shape** (Zod schemas for `/internal/v1/parse` + `/internal/v1/cancel-generation` per RESEARCH §13 lines 1503–1521 + §12 lines 1463–1466):

```typescript
// packages/contracts/src/engine-internal-api.ts
//
// Engine ↔ BFF internal HTTP contract (M2M-protected).
// Two endpoints:
//   POST /internal/v1/parse              (BFF → engine; Stage A only, no LLM)
//   POST /internal/v1/cancel-generation  (BFF → engine; mid-pass cancel)
//
// Cross-ws ask: engine workstream implements against this contract when Phase 2 lands.

import { z } from 'zod';
import { GenIdSchema } from './idempotency.js';

export const ParseRequest = z.object({
  spec_url: z.string().url().optional(),
  spec_content: z.string().optional(),
}).refine(r => Boolean(r.spec_url) !== Boolean(r.spec_content), 'exactly one of spec_url/spec_content');

export const ParseResponse = z.object({
  raw_ir: z.record(z.string(), z.unknown()),
  endpoint_count: z.number().int().nonnegative(),
  spec_format: z.literal('openapi3'),
});

export const CancelReason = z.enum(['cost_cap_exceeded', 'user_requested', 'timeout']);
export const CancelGenerationRequest = z.object({
  job_id: GenIdSchema,
  reason: CancelReason,
  cap_usd: z.number().nonnegative().optional(),
});
```

#### `packages/contracts/src/billing-types.ts` *(NEW)*

**Analog:** `packages/contracts/src/usage-event.ts` (Zod schemas + enums).

**Phase 8 contents:**
- `SubscriptionStatus` enum (`active`, `past_due`, `canceled`, `trialing`, `unpaid`).
- `BillingEventType` enum (Stripe webhook events we handle).
- Zod schemas for `POST /api/v1/billing/checkout-session` request/response.
- Zod schemas for `PATCH /api/v1/deployments/:id` body (`{ auto_regenerate_on_drift: boolean }`).

#### `packages/contracts/src/db-schema.ts` *(MODIFIED)*

**Analog:** self (Phase 1 baseline, lines 1–219).

**ALTERs to add to existing tables (in-place edit per FND-08 contract — header line 16 says "Edit this file → run drizzle-kit:generate → commit BOTH"):**

```typescript
// extend organizations (lines 52–59)
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  logto_org_id: text('logto_org_id').notNull().unique(),
  name: text('name').notNull(),
  plan_tier: text('plan_tier').notNull().default('free'),
  stripe_customer_id: text('stripe_customer_id').unique(),  // ADD .unique()
  subscription_status: text('subscription_status'),  // NEW
  quota_period_start: timestamp('quota_period_start', { withTimezone: true }).notNull().defaultNow(),  // NEW
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// extend specs (lines 83–100)
parsed_ir_jsonb: jsonb('parsed_ir_jsonb'),  // NEW

// extend deployments (lines 133–143)
auto_regenerate_on_drift: boolean('auto_regenerate_on_drift').notNull().default(false),  // NEW

// extend generations (lines 105–124)
cumulative_cost_usd: numeric('cumulative_cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),  // NEW
triggered_by: text('triggered_by').notNull().default('user'),  // NEW (CHECK in SQL via raw augment)
```

**NEW tables to add** (mirror existing-table style — `pgTable('name', {...}, t => ({indexes}))`): `drift_events`, `drift_email_log`, `subscription_events`, `usage_events_outbox`, `reconciliation_log`, `mau_log`. Full Drizzle definitions follow the column types in RESEARCH §7 SQL (DDL section). Copy column type style from existing tables:

| SQL type | Drizzle equivalent | Example in current schema |
|----------|-------------------|---------------------------|
| `text NOT NULL` | `text('col').notNull()` | line 67 `email` |
| `text PRIMARY KEY` | `text('col').primaryKey()` | (use for ULID PKs in new tables; existing uses `uuid` PK) |
| `uuid REFERENCES ...` | `uuid('col').notNull().references(() => parent.id, { onDelete: 'cascade' })` | line 64 `org_id` |
| `jsonb NOT NULL` | `jsonb('col').notNull()` | line 116 `options` |
| `timestamp with tz` | `timestamp('col', { withTimezone: true })` | line 58 `created_at` |
| UNIQUE composite | `(t) => ({ pk: primaryKey({ columns: [t.a, t.b] }) })` | lines 188–192 `pending_callbacks` |

**Pattern do's:**
- ✅ Mirror the dividing-line comments (`// ────────...────────`) per Phase 1 lines 36, 49, 71, 102, 126, 145, 169, 194 — group new tables by domain (`Billing`, `Drift Watcher`, `Usage outbox`, `Reconciliation`).
- ✅ For ULID-PK tables (`drift_events`, `subscription_events`, `usage_events_outbox`, `reconciliation_log`), use `text('id').primaryKey()` (not `uuid`) — ULIDs are 26-char Crockford base32 strings, not UUIDs.
- ✅ After editing, run `pnpm --filter @mcpgen/contracts drizzle-kit:generate` to emit the migration SQL — then **rename** the output to `20260428000000_phase8_billing_drift.sql` (frozen prefix per D-28).
- ❌ Do NOT edit `20260427000000_init_schema.sql` (frozen per FND-08 header line 5–6).

#### `packages/contracts/src/db-types.ts` *(MODIFIED)*

**Analog:** self (Phase 1 baseline).

**Add new `$inferSelect` / `$inferInsert` exports for every new table** — mirror existing pattern lines 21–37:

```typescript
export type DriftEvent = typeof drift_events.$inferSelect;
export type NewDriftEvent = typeof drift_events.$inferInsert;
// ... and so on for drift_email_log, subscription_events, usage_events_outbox, reconciliation_log, mau_log.
```

#### `packages/contracts/src/launch-criteria.ts` *(MODIFIED)*

**Analog:** self (Phase 1 baseline, lines 28–37).

**Add inside the `LAUNCH_CRITERIA` const (verbatim from RESEARCH §6 D-13 lines 467–472):**

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

**MANDATORY PAIRED FILE:** `docs/decisions/005-cost-cap-thresholds.md` — pre-commit hook `.pre-commit-hooks/launch-criteria-paired-decision.sh` will reject the commit otherwise. See "Shared Patterns" → "Paired-decision discipline" below.

#### `packages/contracts/src/generation-api.ts` *(MODIFIED)*

**Analog:** self (Phase 1 baseline, lines 64–80).

**Add discriminated-union to `partial_result` (verbatim from RESEARCH §12 lines 1326–1338):**

```typescript
export const PartialResultCost = z.object({
  type: z.literal('cost_update'),
  pass_name: z.enum(['pass_0','pass_1','pass_2','pass_3','pass_4','pass_5','stage_e','stage_f1','stage_f2','stage_f3']),
  pass_cost_usd: z.number().nonnegative(),
  cumulative_cost_usd: z.number().nonnegative(),
});
export type PartialResultCost = z.infer<typeof PartialResultCost>;

export const PartialResult = z.discriminatedUnion('type', [
  PartialResultCost,
  // future partial-result shapes added by other passes
]);
```

The existing `partial_result: z.record(z.string(), z.unknown()).optional()` (line 69) stays for backward compatibility — Phase 8 adds the typed union as a NEW export, not a breaking replacement.

#### `packages/contracts/src/index.ts` *(MODIFIED — add new re-exports)*

**Analog:** self (current barrel).

**Add to current 6-line file:**
```typescript
export * from './inngest-functions.js';
export * from './storage.js';
export * from './plan-tier.js';
export * from './engine-internal-api.js';
export * from './billing-types.js';
```

---

### F — Drizzle migration

#### `infrastructure/neon/migrations/20260428000000_phase8_billing_drift.sql` *(NEW)*

**Analog:** `infrastructure/neon/migrations/20260427000000_init_schema.sql` (entire file — 138 lines).

**Header comment style (verbatim from analog, lines 1–7):**

```sql
-- ─── Phase 1 init schema (FND-08) ─────────────────────────────────────────
-- Generated by drizzle-kit, then manually augmented with extension + hypertable DDL.
-- DO NOT auto-regenerate this file; subsequent schema changes go in NEW migration
-- files with timestamp prefix > 20260427000000.
--
-- Filename `20260427000000_init_schema.sql` is FROZEN per FND-08; the timestamp
-- prefix mitigates T-1-04 (migration filename collision) and Pitfall #18.
```

**Phase 8 migration header (mirror style + RESEARCH §7 line 789):**

```sql
-- ─── Phase 8 billing + drift schema additions (CTRL-02..07) ──────────────
-- Generated by drizzle-kit from packages/contracts/src/db-schema.ts edits, then
-- manually augmented with the TimescaleDB continuous aggregate + indexes.
-- DO NOT auto-regenerate this file.
--
-- Filename `20260428000000_phase8_billing_drift.sql` is FROZEN per D-28 + D-12.
```

**Section-divider pattern (analog lines 9–13 + 131–133):**

Phase 1 uses three layers of comments to mark generated vs manual augmentation:
1. Top-of-file header (lines 1–7) — file metadata.
2. `-- (Drizzle-generated CREATE TABLE statements follow — DO NOT edit below this comment manually; ...)` (line 12) — boundary marker.
3. `-- ─── ... ───` section dividers (line 131 for "TimescaleDB hypertable").

**Phase 8 mirrors this:**
- Top header: `-- ─── Phase 8 billing + drift schema additions (CTRL-02..07) ──────────────` etc.
- Section markers per RESEARCH §7 every numbered ALTER/CREATE block:
  ```sql
  -- ─── 1. ALTER organizations: plan tier + Stripe customer + subscription state ─
  -- ─── 5. CREATE drift_events ──────────────────────────────────────────────
  -- ─── 11. TimescaleDB continuous aggregate for hourly quota ──────────────
  ```

**Manual-augmentation conventions (Phase 1 lines 132–137):**

```sql
-- ─── TimescaleDB hypertable for usage_events (architecture §7.2) ──────────
-- Convert usage_events to a hypertable partitioned by `time` column.
SELECT create_hypertable('usage_events', 'time', if_not_exists => TRUE);
```

Phase 8 follows the same pattern for the continuous aggregate:

```sql
-- ─── 11. TimescaleDB continuous aggregate for hourly quota ──────────────
-- Reads `usage_events` hypertable (Phase 1) + joins `deployments` for org_id.
-- WITH NO DATA initial create; TimescaleDB scheduler refreshes per policy below.
CREATE MATERIALIZED VIEW "usage_hourly" WITH (timescaledb.continuous) AS ...
SELECT add_continuous_aggregate_policy('usage_hourly', ...);
```

**Drizzle-generated section conventions (analog lines 14–129):**
- Every `CREATE TABLE` followed by `--> statement-breakpoint` (Drizzle convention).
- Foreign keys appear at the BOTTOM, as `ALTER TABLE ... ADD CONSTRAINT` statements (analog lines 118–124).
- Indexes at the very bottom (analog lines 125–128).

**`COMMENT ON COLUMN` for future-maintainer hints** (Phase 8 RESEARCH §7 lines 933–941):
```sql
COMMENT ON COLUMN "organizations"."quota_period_start"
  IS 'Anniversary-based per-org quota period start. Rolls forward via Inngest cron quota-period-rollover-v1.';
```

**Generation workflow (RESEARCH §7 lines 944–950):**
1. Edit `packages/contracts/src/db-schema.ts`.
2. `pnpm --filter @mcpgen/contracts drizzle-kit:generate` → emits `20260428xxxxxx_<name>.sql`.
3. Rename to `20260428000000_phase8_billing_drift.sql` (frozen prefix).
4. Manually augment with sections 11 + 12 (continuous aggregate + Phase 8 indexes — Drizzle does not emit Timescale CREATE MATERIALIZED VIEW WITH (timescaledb.continuous)).
5. Add `COMMENT ON COLUMN` rows.
6. `pnpm --filter @mcpgen/contracts db:test-migrate` against Neon dev branch.

---

### G — Tests

#### `apps/api/tests/auth.test.ts` *(NEW)*

**Analog:** `apps/api/tests/contract.test.ts` (Hono `app.fetch` pattern, lines 1–64).

**Verbatim shell from analog (lines 1–17 — header + imports + describe):**

```typescript
// apps/api/tests/contract.test.ts
//
// CTRL-01 contract tests. Asserts the frozen-contract endpoints return the
// shapes downstream waves depend on:
//   - GET /health → 200
//   - GET /health/launch-criteria → matches @mcpgen/contracts LAUNCH_CRITERIA
//   - POST /api/v1/generate → 501 with Idempotency-Key echo + contract_version
//   - GET /api/v1/jobs/:id/stream → text/event-stream content-type

import { describe, it, expect } from 'vitest';

import { LAUNCH_CRITERIA } from '@mcpgen/contracts';
import app from '../src/index.js';

describe('apps/api contract', () => {
  it('GET /health returns 200', async () => {
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
  });
```

**Phase 8 `auth.test.ts` shape:**

```typescript
// apps/api/tests/auth.test.ts
//
// CTRL-02 / D-01 + D-02: Logto JWT verification middleware.
// Tests:
//   - missing Authorization → 401 with reason='missing_bearer'
//   - non-Bearer scheme → 401
//   - invalid signature → 401 with jose-derived reason
//   - expired token → 401 with reason='ERR_JWT_EXPIRED'
//   - valid user JWT (aud=LOGTO_BASE_URL) → 200 with c.var.auth.isM2M=false
//   - valid M2M JWT (aud=LOGTO_M2M_RESOURCE_INDICATOR) → 200 with c.var.auth.isM2M=true
//   - public routes (/health, /api/v1/stripe/webhook) bypass middleware

import { describe, it, expect, vi } from 'vitest';

// Mock jose: hoisted before app import per vitest rules
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn().mockReturnValue('mock-jwks'),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from 'jose';
import app from '../src/index.js';

describe('authMiddleware', () => {
  it('rejects missing Authorization with 401', async () => { /* ... */ });
  // etc.
});
```

**Test fixture pattern from `packages/contracts/tests/idempotency.test.ts` lines 19–20:**
```typescript
const VALID_ULID = '01HXP3J8Y0K9V8R7N6M5K4K3J2'; // 26 chars Crockford base32 (no I/L/O/U)
const VALID_UUID = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789';
```

Phase 8 auth tests use synthetic JWT payloads — never real tokens. Mock `jwtVerify` to return a structured payload per scenario.

#### `apps/api/tests/stripe-webhook.test.ts` *(NEW)*

**Analog:** `apps/api/tests/contract.test.ts` (Hono shell) + RESEARCH §9 lines 1086–1131 (full hoisted-mock pattern).

**Critical pattern — hoist `vi.mock('stripe')` BEFORE any import that touches Stripe (verbatim from RESEARCH §9):**

```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';

// Hoist the mock so it applies before any import that uses Stripe.
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      webhooks: {
        constructEventAsync: vi.fn().mockImplementation(async (rawBody: string) => {
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
```

**CI gate pattern (RESEARCH §9):** real Stripe integration tests are gated by `RUN_STRIPE_INTEGRATION_TESTS=1`:

```typescript
const runIntegration = process.env.RUN_STRIPE_INTEGRATION_TESTS === '1';
describe.skipIf(!runIntegration)('stripe-webhook (integration, real sandbox)', () => { /* ... */ });
```

This mirrors Phase 1's `RUN_CODEGEN_TESTS=1` pattern referenced in CONTEXT.md.

#### `apps/api/tests/quota.test.ts` *(NEW — integration vs Neon dev DB)*

**Analog:** `packages/contracts/tests/idempotency.test.ts` (validators) + `packages/contracts/tests/launch-criteria.test.ts` lines 50–93 (cross-doc consistency check pattern — uses `readFileSync` to verify against canonical docs).

**Pattern note:** quota tests need a real Neon dev branch — use `DATABASE_URL_UNPOOLED` per Phase 1 PHASE-DEVIATIONS rev 2 (CONTEXT.md `<canonical_refs>` reference). Skip pattern:

```typescript
const HAS_DB = Boolean(process.env.DATABASE_URL_UNPOOLED);
describe.skipIf(!HAS_DB)('checkQuota integration', () => { /* ... */ });
```

#### `apps/api/tests/drift/ir-diff.test.ts` *(NEW)*

**Analog:** `packages/contracts/tests/idempotency.test.ts` (per-case `describe` with multiple `it` blocks — analog has 4 describe blocks across 6 cases each).

**Fixture source:** `packages/engine-fixtures/stripe/ir.json` (Phase 1 deliverable per CONTEXT.md `code_context`). Hand-mutate the fixture to produce three test variants:
- Cosmetic-only (description / summary changes) → expects `diff.empty === true`.
- Parameter added → expects `diff.changed.length === 1`.
- Endpoint removed → expects `diff.removed.length === 1`.

#### `apps/api/tests/inngest/*.test.ts` *(NEW × 4)*

**Analog:** RESEARCH §8 lines 1015–1033 (Inngest test executor pattern) — no in-repo analog.

**Pattern (verbatim from RESEARCH §8):**

```typescript
// apps/api/tests/inngest/drift-watcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { driftWatcher } from '../../src/inngest/functions/drift-watcher.js';

describe('drift-watcher-v1', () => {
  it('fans out to per-deployment checks', async () => {
    const result = await driftWatcher.execute({
      steps: [
        {
          id: 'list-active-deployments',
          handler: () => [{ id: 'dep-1', generation: { spec: { spec_url: 'https://api.stripe.com/openapi.json' } } }],
        },
      ],
    });
    expect(result.invokeCallCount).toBe(1);
  });
});
```

#### `apps/api/tests/storage/local-fs.test.ts` *(NEW)*

**Analog:** `packages/contracts/tests/idempotency.test.ts` (multiple describe blocks per behavior).

**Use Node `fs/promises` + `os.tmpdir()` to write under a per-test temp dir; clean up in `afterEach`.**

---

### H — Infrastructure

#### `infrastructure/stripe/setup.ts` *(NEW)*

**Analog:** `infrastructure/logto/scaffold.ts` (entire file — 196 lines) — **canonical reference-only idempotent setup script pattern**.

**Verbatim header pattern from analog (lines 1–25):**

```typescript
// REFERENCE ONLY — user has manually configured the Logto tenant. This script
// exists as canonical procedure for re-creation/dev-org setup (e.g., bootstrapping
// `mcpgen-staging` or `mcpgen-sandbox` from scratch, or onboarding a new dev to
// a fresh tenant).
//
// DO NOT run in CI; DO NOT run as part of Phase 1 verification. The Phase 1 user
// has already provisioned the tenant via the Logto dashboard.
//
// What this script does (idempotent — safe to re-run):
//   1. Reads LOGTO_ENDPOINT / LOGTO_APP_ID / LOGTO_APP_SECRET from process.env.
//   ...
//
// Run with: `pnpm tsx infrastructure/logto/scaffold.ts`.
//
// References:
//   - https://docs.logto.io/docs/recipes/protect-your-api/management-api/
//   - ...
```

**Phase 8 mirror header:**

```typescript
// REFERENCE ONLY — idempotent Stripe setup for products / prices / meters.
// Committed to repo + run manually by user (NEVER in CI; Wave 3 prerequisite per D-10).
//
// Run with: `bun run infrastructure/stripe/setup.ts` (or `pnpm tsx ...`).
//
// What this script does (idempotent — safe to re-run):
//   1. Reads STRIPE_SECRET_KEY from process.env.
//   2. Tries to retrieve product 'prod_mcpgen_pro' by stable ID; creates if missing.
//   3. Tries to retrieve product 'prod_mcpgen_free'; creates if missing.
//   4. Creates Stripe Meters (mcpgen_evals, mcpgen_tool_calls, mcpgen_generations) if missing.
//   5. Prints created IDs to stdout for user to copy into .env.local.
//      NEVER prints secrets.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-07
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-07 (full impl)
//   - https://docs.stripe.com/billing/subscriptions
//   - https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage
```

**Idempotent retrieve-or-create pattern (verbatim from RESEARCH §6 D-07 lines 290–303):**

```typescript
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
```

**IIFE entry pattern (verbatim from analog lines 191–196):**

```typescript
void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

**Pattern do's:**
- ✅ Stable IDs at creation (`id: 'prod_mcpgen_pro'`) so re-runs are no-ops.
- ✅ Retrieve-then-create-on-`resource_missing` — idempotent.
- ✅ Print created IDs to stdout (NEVER secrets) — user copies into `.env.local`.
- ✅ Companion `infrastructure/stripe/README.md` documents env-var contract (mirror `infrastructure/logto/README.md`).
- ❌ Do NOT auto-update existing prices — Stripe prices are immutable; if attributes differ, document a manual archive+create procedure instead.

#### `infrastructure/stripe/README.md` *(NEW)*

**Analog:** `infrastructure/logto/README.md` (entire file — 125 lines).

**Section structure to mirror (analog lines 1–125):**
1. **Title + Status** — "Status (Phase 8): user manually configured + scripted via setup.ts."
2. **Env-var contract** (table) — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (local-dev `whsec_xxx`), `STRIPE_PRICE_PRO`, `STRIPE_METER_EVALS_ID`, etc.
3. **Reachability check** — `curl` command to verify `STRIPE_SECRET_KEY` works (`stripe products list --limit 1`).
4. **Wave-staged transition** — copy from RESEARCH §9 lines 1135–1139.
5. **Local-dev workflow** — `stripe-cli` setup + `stripe listen` command.

#### `infrastructure/logto/README.md` *(MODIFIED)*

**Analog:** self.

**Section to add (after line 36 "M2M app" reference):**

> ## `LOGTO_M2M_*` env-var triple (Phase 8)
>
> | Var                                | Source | Used by |
> |------------------------------------|--------|---------|
> | `LOGTO_M2M_APP_ID`                 | Logto Console → Applications → "MCPGen Engine M2M" → App ID | apps/api (token verification), apps/generation-engine (token issuance) |
> | `LOGTO_M2M_APP_SECRET`             | Same dialog → App Secret. **Never commit; never log.** | apps/generation-engine (client_credentials grant) |
> | `LOGTO_M2M_RESOURCE_INDICATOR`     | Logto Console → API Resources → "https://api.mcpgen.dev/m2m" → Resource Indicator | apps/api (audience match), apps/generation-engine (token request resource) |

---

### I — Documentation

#### `docs/decisions/005-cost-cap-thresholds.md` *(NEW)*

**Analog:** `docs/decisions/2026-04-26-launch-criteria-thresholds.md` (the existing paired-decision file for the original 6 thresholds).

**Section structure to mirror (analog lines 1–40+):**

1. **Title** — `# 2026-04-XX — Cost cap thresholds (free $0.50, pro $2.00 per generation)`.
2. **Status** — `Accepted.`
3. **Context** — table of new constants + reference to pre-commit hook.
4. **Decision** — verbatim values + rationale.
5. **Consequences** — billing model implications.

**Pre-commit hook trigger:** `.pre-commit-hooks/launch-criteria-paired-decision.sh` requires this file in the SAME commit that touches `packages/contracts/src/launch-criteria.ts`. Filename convention: existing decisions use both `005-cost-cap-thresholds.md` and `2026-04-XX-cost-cap-thresholds.md` formats — match whichever the hook script accepts (read it before naming).

#### `docs/runbooks/logto-tenant-setup.md` *(NEW)*

**Analog:**
- `docs/runbooks/logto-pro-upgrade.md` (existing runbook in same directory).
- `infrastructure/logto/README.md` lines 95–108 ("Self-host runbook" section — mirrors numbered-step procedure).

**Section structure (mirror analog):**
1. **When to run** — re-creating `mcpgen-staging` or `mcpgen-sandbox` from scratch.
2. **Prerequisites** — Logto Cloud account access.
3. **Numbered steps** (per RESEARCH §6 D-03 lines 222–227):
   1. Create tenant.
   2. Sign-in experience → enable email + password.
   3. Connectors → social → GitHub.
   4. Applications → traditional-web app + M2M app.
   5. Resources → create resource indicator.
   6. Export App IDs → `.env.local`.
4. **Verification** — copy reachability check from `infrastructure/logto/README.md` lines 39–62.

#### `docs/runbooks/stripe-local-dev.md` *(NEW or folded into apps/api/README.md)*

**Analog:** `infrastructure/logto/README.md` (env contract + reachability + numbered procedure).

**Per RESEARCH §4 "Claude's Discretion" recommendation: fold into `apps/api/README.md`** (single source per local-dev convention from Phase 1; Logto README is at `infrastructure/logto/README.md` because it's tenant config; Stripe is local-dev workflow more than infra).

#### `docs/runbooks/manual-customer-portal.md` *(NEW)*

**Analog:** `docs/runbooks/logto-pro-upgrade.md` (operator-procedure runbook).

**Body** (RESEARCH §20 Q3 recommendation): document founder workflow to manually invoke `stripe.billingPortal.sessions.create({ customer: cus_xxx })` and email URL to user. Single Bun script + `bun run scripts/manual-portal.ts cus_xxx user@example.com`.

#### `apps/api/README.md` *(NEW or MODIFIED)*

**Analog:** `infrastructure/logto/README.md` (env-var contract + reachability + section structure).

**Sections to author:**
1. **Local-dev port map** — Bun BFF on `localhost:8787`, Inngest dev server on `localhost:8288`, stripe-cli forwarding (Wave 3+).
2. **Three-terminal startup checklist** (RESEARCH §6 D-21 lines 636–644):
   ```bash
   # Terminal 1 — BFF
   bun run apps/api/src/index.ts        # localhost:8787
   # Terminal 2 — Inngest
   pnpm dev:inngest                      # localhost:8288
   # Terminal 3 (Wave 3+) — Stripe CLI
   stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook
   ```
3. **Env-var contract** — full list with ✓/✗ Phase markers.
4. **DATABASE_URL vs DATABASE_URL_UNPOOLED note** (RESEARCH §20 Q5).

---

### J — Other modifications

#### `apps/api/package.json` *(MODIFIED)*

**Analog:** self (Phase 1 baseline, lines 13–34).

**Add to `dependencies` (RESEARCH §17):**
```json
"jose": "^6.2.2",
"stripe": "^22.1.0",
"resend": "^6.12.2",
"@mcpgen/engine-fixtures": "workspace:*"
```

**Remove from `dependencies`** per RESEARCH §17 note: `@logto/node` (`^3.1.10`) — never used in BFF; Phase 7 will add to `apps/web` for OIDC client flows.

**Add to `scripts`:**
```json
"dev:inngest": "npx --ignore-scripts=false inngest-cli@latest dev -u http://localhost:8787/api/inngest"
```

#### `apps/api/src/instrumentation.ts` *(MODIFIED)*

**Analog:** self (Phase 1 baseline, lines 25–40).

**Verbatim Phase 1 `beforeSend` (lines 30–38):**

```typescript
beforeSend(event: { request?: { headers?: Record<string, string> } }) {
  const headers = event.request?.headers;
  if (headers) {
    for (const k of ['Authorization', 'X-Upstream-Auth', 'Cookie']) {
      if (k in headers) headers[k] = '[REDACTED]';
    }
  }
  return event;
},
```

**Phase 8 extension** — add Stripe customer IDs (`cus_*`), Stripe API keys (`sk_*`), and JWT-shaped strings to redaction. Keep the helper shape (`sentryOptionsFor(env)` still returns options object; do NOT change exported function signature — Phase 1 `withSentry` re-export at line 44 must continue to work).

```typescript
beforeSend(event: { request?: { headers?: Record<string, string> }; request_url?: string; message?: string }) {
  const headers = event.request?.headers;
  if (headers) {
    for (const k of ['Authorization', 'X-Upstream-Auth', 'Cookie']) {
      if (k in headers) headers[k] = '[REDACTED]';
    }
  }
  // Phase 8: redact Stripe customer IDs + API keys + JWT-shaped strings from URLs and message
  const STRIPE_CUS = /cus_[A-Za-z0-9]{14,}/g;
  const STRIPE_SK = /sk_(live|test)_[A-Za-z0-9]{24,}/g;
  const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
  const scrub = (s: string) => s.replace(STRIPE_CUS, '[cus_REDACTED]').replace(STRIPE_SK, '[sk_REDACTED]').replace(JWT, '[jwt_REDACTED]');
  if (typeof event.request_url === 'string') event.request_url = scrub(event.request_url);
  if (typeof event.message === 'string') event.message = scrub(event.message);
  return event;
},
```

**Pattern do's:**
- ✅ Keep the empty-DSN tolerance (Phase 1 line 27 `dsn: env.SENTRY_DSN ?? ''`) — Phase 9 fills DSN; Phase 8 must not break empty-DSN startup.
- ✅ Keep the `withSentry` re-export (line 44) untouched — `apps/api/src/index.ts` Phase 9 will wrap default export with it.
- ❌ Do NOT add new exports from this file — extend `beforeSend` in place.

---

## Shared Patterns

These cross-cutting concerns apply to multiple Phase 8 files. Mention them in the relevant plan tasks but do not duplicate the body across plans.

### Shared Pattern 1 — Hono route file shape

**Source:** `apps/api/src/routes/v1/generate.ts` (lines 1–28)

**Apply to:** every NEW route file in `apps/api/src/routes/`.

**Mandatory elements:**
1. Header comment with file path + frozen-contract reference (CTRL-XX) + Phase reference + canonical doc reference.
2. `import { Hono } from 'hono';` first.
3. `import { ... } from '@mcpgen/contracts';` for shared types (header constants, Zod schemas).
4. `export const <name>Route = new Hono<{ Bindings; Variables }>();` — typed for Phase 8 (the Phase 1 stub doesn't type because it has no consumers).
5. Methods registered as `<name>Route.<method>('/path', async (c) => { ... });`.
6. Always return `c.json(body, status)` — never raw `Response`.

### Shared Pattern 2 — Idempotency-key shape

**Source:** `packages/contracts/src/idempotency.ts` (lines 1–90)

**Apply to:**
- `apps/api/src/routes/v1/generate.ts` (re-implementation in Phase 8) — uses `GEN_ID_REGEX` validator on inbound `Idempotency-Key` header.
- `apps/api/src/inngest/functions/stripe-meters-emit.ts` — uses `STRIPE_METERS_KEY_REGEX` validator on outbox rows.
- Any new code that constructs an idempotency key — use `${operation}_${ulid()}` pattern.

**Verbatim regexes from analog (lines 30–56):**

```typescript
export const ULID_INNER_REGEX = '[0-9A-HJKMNP-TV-Z]{26}';
export const ULID_REGEX = new RegExp(`^${ULID_INNER_REGEX}$`);
export const GEN_ID_REGEX = new RegExp(`^gen_${ULID_INNER_REGEX}$`);
export const DEPLOY_ID_REGEX = /^deploy_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const STRIPE_METERS_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}_[a-z][a-z0-9_]{0,63}$/;
export const TOOL_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;
```

### Shared Pattern 3 — Error envelope

**Source:** `apps/api/src/routes/v1/generate.ts` lines 17–26 + project CLAUDE.md "Error Handling" section.

**Apply to:** every error response across `apps/api/`.

**Shape:**
```typescript
return c.json({
  error: '<stable_machine_code>',          // never user-facing English
  reason: '<additional_machine_context>',  // optional
  ...debugFields,                          // request_id, requested_idempotency_key, etc.
}, statusCode);
```

**Stable error codes already in use (mirror these where applicable):**
- `not_implemented_phase_8` (Phase 1 generate.ts)
- `unauthorized` + `reason: 'missing_bearer' | 'jwt_verify_failed' | ...` (Phase 8 auth)
- `forbidden` + `reason: 'm2m_required' | 'm2m_cannot_initiate_generation' | ...`
- `quota_exceeded` (Phase 8 quota gate)
- `cost_cap_exceeded` (already enumerated in `generation-api.ts` `GenerationErrorCode` enum line 130)
- `invalid_signature` (Phase 8 stripe-webhook)
- `no_org_context`

**Project CLAUDE.md rule:** "Always raise errors explicitly, never silently ignore them. Use specific error types that clearly indicate what went wrong. No catch-all handlers that hide the root cause."

### Shared Pattern 4 — Sentry redaction (privacy)

**Source:** `apps/api/src/instrumentation.ts` lines 30–38

**Apply to:** any new logging surface (Resend client, Inngest function step names, Stripe SDK initialization).

**Rule:** the `beforeSend` extension is the LAST defense. New code must not emit secrets to logs in the first place. Specifically:
- `apps/api/src/lib/m2m-token.ts` — never log the token; only log `expires_at`.
- `apps/api/src/lib/email/resend-client.ts` — never log email body; only log subject + recipient count.
- `apps/api/src/routes/v1/stripe-webhook.ts` — never log raw event payload; only log `event.id` + `event.type`.

### Shared Pattern 5 — Paired-decision discipline (`launch-criteria.ts` edits)

**Source:** `packages/contracts/src/launch-criteria.ts` lines 5–15 (header rules); `docs/decisions/2026-04-26-launch-criteria-thresholds.md` (existing paired entry).

**Apply to:** the `launch-criteria.ts` MODIFIED task ONLY.

**Rule:** **the same git commit** that adds `COST_CAP_FREE_USD` + `COST_CAP_PRO_USD` MUST also add `docs/decisions/005-cost-cap-thresholds.md` (or equivalent date-prefixed file). The pre-commit hook `.pre-commit-hooks/launch-criteria-paired-decision.sh` rejects the commit otherwise.

**Plan-task wording:** "Edit `launch-criteria.ts` AND author paired decision file in SAME commit. Pre-commit will reject otherwise. Conventional Commits subject: `feat(contracts): add cost-cap thresholds (free $0.50, pro $2.00)`."

### Shared Pattern 6 — Stable Inngest function ID enforcement

**Source:** Phase 8 `packages/contracts/src/inngest-functions.ts` (NEW, see §E above)

**Apply to:** every new Inngest function file.

**Rule:**
- Function file imports `INNGEST_FUNCTION_IDS` from `@mcpgen/contracts`.
- `inngest.createFunction({ id: INNGEST_FUNCTION_IDS.<NAME> }, ...)` — never hard-code the string literal.
- Phase 9 orphan audit will walk every `createFunction` call and assert the id resolves through the register.
- Bumping a function (rename, schedule, trigger) requires `-v2` suffix + paired `docs/decisions/` entry per D-27.

### Shared Pattern 7 — Drizzle migration generation workflow

**Source:** `packages/contracts/src/db-schema.ts` header comment (lines 16–19) + `infrastructure/neon/drizzle.config.ts` + RESEARCH §7 lines 944–950.

**Apply to:** the Phase 8 migration task (Wave 1 plan).

**Steps:**
1. Edit `packages/contracts/src/db-schema.ts` (add columns + tables).
2. `pnpm --filter @mcpgen/contracts drizzle-kit:generate` — emits `<auto-timestamp>_<auto-name>.sql` under `infrastructure/neon/migrations/`.
3. Rename to `20260428000000_phase8_billing_drift.sql` (frozen prefix per D-28).
4. Manually augment with the TimescaleDB continuous aggregate + Phase 8 indexes + `COMMENT ON COLUMN` rows (Drizzle does NOT emit Timescale or COMMENT DDL).
5. Add section-divider comments (`-- ─── N. <title> ───`) per Phase 1 style.
6. Edit `packages/contracts/src/db-types.ts` to add `$inferSelect` / `$inferInsert` exports for new tables.
7. `pnpm --filter @mcpgen/contracts drizzle-kit:check` — validates no out-of-order timestamps.
8. `pnpm --filter @mcpgen/contracts db:test-migrate` — applies to Neon dev branch.
9. Commit ALL of {schema TS edit, generated SQL, db-types extension, augmentation} atomically (Conventional Commits: `feat(db): phase 8 billing + drift schema`).

### Shared Pattern 8 — Vitest module-level mock hoisting

**Source:** RESEARCH §9 lines 1086–1108.

**Apply to:** every test that mocks a module (`stripe`, `jose`, `resend`, `fetch`).

**Rule:** `vi.mock(...)` calls MUST appear BEFORE any `import` that pulls in the mocked module. Vitest hoists `vi.mock` to the top of the file at parse time, but importing the SUT (`app from '../src/index.js'`) AFTER the mock declaration is the convention that signals intent.

**Anti-pattern:** placing `import` first then `vi.mock` later — works due to hoisting but is misleading; lint rules in some projects enforce mock-first ordering.

### Shared Pattern 9 — Cross-doc consistency tests (when adding new constants)

**Source:** `packages/contracts/tests/launch-criteria.test.ts` lines 49–93.

**Apply to:** the test for any modification to `launch-criteria.ts` (i.e., the cost-cap thresholds).

**Pattern:** read the canonical doc files (`docs/mcpgen-stage-f-design.md`, `CLAUDE.md`) at test runtime and assert the doc text mentions the same threshold — catches doc/code drift before CI.

---

## No Analog Found

Files where no close match exists in the codebase. Planner should reference RESEARCH.md sections directly.

| File | Role | Data Flow | Reason | RESEARCH Section |
|------|------|-----------|--------|------------------|
| `apps/api/src/inngest/functions/*.ts` (7 files) | service (cron / event) | event-driven | Inngest is added in Phase 8 — no existing TS Inngest function in repo | §6 D-14, D-15, D-16, D-22; §12; §13 |
| `apps/api/tests/inngest/*.test.ts` (4 files) | test | n/a | Inngest test executor pattern is novel to Phase 8 | §8 (test harness pattern lines 1015–1033) |
| `apps/api/src/lib/drift/ir-diff.ts` | utility | transform | No existing diff utility in repo; ~150 LOC custom impl | §6 D-17 (algorithm + interface) |

For these files, the executor must:
1. Read the cited RESEARCH §X section in full.
2. Mirror the header-comment + import + export-shape conventions from the closest sibling-pattern file (e.g., `inngest/client.ts` follows `instrumentation.ts` shape).
3. Run `pnpm --filter @mcpgen/api test` after each file to catch regressions early.

---

## Metadata

**Analog search scope:** `apps/api/src/`, `apps/api/tests/`, `packages/contracts/src/`, `packages/contracts/tests/`, `infrastructure/logto/`, `infrastructure/neon/`, `infrastructure/neon/migrations/`, `docs/decisions/`, `docs/runbooks/`.

**Files scanned (full read):** 14 source files + 1 migration SQL + 1 README + 1 scaffold + 4 test files + 1 vitest config + 1 drizzle config + 1 decision doc + 1 package.json + 1 contracts package.json = 26 files.

**RESEARCH.md sections consumed:** §1 (executive summary) · §4 (user constraints / discretion) · §5 (phase requirements) · §6 D-01..D-28 (per-decision impl notes) · §7 (full migration SQL) · §8 (Inngest local dev + test harness) · §9 (Stripe local dev + vitest mock pattern) · §10 (Logto JWT verification details) · §11 (TimescaleDB quota query) · §12 (cost cap SSE protocol) · §13 (Drift Watcher implementation) · §14 (Resend email patterns) · §17 (dependency footprint + remove `@logto/node` recommendation) · §18 (Pattern Map file structure additions + Hono mounting order) · §19 (validation architecture / Wave 0 test gaps) · §20 (open questions and recommendations).

**Pattern extraction date:** 2026-04-26.

**Confidence:** HIGH — every Hono / route / Drizzle / vitest / Logto pattern is grounded in a directly-inspected Phase 1 file. Inngest patterns are RESEARCH-only because Phase 8 introduces Inngest; risk is minimal because the SDK is well-documented (Context7 verified) and the pattern is consistent across all 7 functions.
