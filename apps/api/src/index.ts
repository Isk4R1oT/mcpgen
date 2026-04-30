// apps/api/src/index.ts
//
// Hono BFF entry point — frozen contract surface (CTRL-01) + Phase 8 layered mounting.
// Phase 8 wave 1: Logto JWT middleware protects /api/v1/* (user JWT) and
// /internal/v1/* (M2M JWT); /health, /health/launch-criteria, /_spike/sse,
// /api/inngest, and (Wave 3+) /api/v1/stripe/webhook bypass auth.
//
// References:
//   - docs/mcpgen-architecture.md §5.8 (HTTP API contract)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-09 (SSE Last-Event-ID resume)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-15 (90s SSE spike)
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-01, D-02 (auth middleware)
//   - .planning/phases/08-auth-billing/08-PATTERNS.md §A (5-layer mounting)

import { Hono } from 'hono';
import { serve } from 'inngest/hono';
import { LAUNCH_CRITERIA } from '@mcpgen/contracts';

import { authMiddleware, requireM2M, type AuthContext, type AuthEnv } from './middleware/auth.js';
import { generateRoute } from './routes/v1/generate.js';
import { jobsStreamRoute } from './routes/v1/jobs/stream.js';
import { stripeWebhookRoute } from './routes/v1/stripe-webhook.js';
import { checkoutRoute } from './routes/v1/billing/checkout.js';
import { portalRoute } from './routes/v1/billing/portal.js';
import { sseCallbackRoute } from './routes/internal/v1/sse-callback.js';
import { cancelGenerationRoute } from './routes/internal/v1/cancel-generation.js';
import { spikeSseRoute } from './routes/_spike/sse.js';
import { driftRoute } from './routes/v1/drift.js';
import { deploymentsRoute } from './routes/v1/deployments.js';
import { inngest } from './inngest/client.js';
import { functions } from './inngest/functions/index.js';

interface Bindings extends AuthEnv {
  HYPERDRIVE: Hyperdrive;
  SENTRY_DSN: string;
  ENVIRONMENT: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_PRO: string;
  ENGINE_ENDPOINT: string;
  LOGTO_M2M_APP_ID: string;
  LOGTO_M2M_APP_SECRET: string;
}

interface Variables { auth?: AuthContext }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ─── Layer 1+2: Public routes (BEFORE auth) ─────────────────────────────────
// Health, launch criteria, spike SSE, Inngest serve, and (Wave 3+) Stripe webhook.
app.get('/health', (c) => c.json({ status: 'ok' }));

// Diagnostic endpoint — proves frozen launch-criteria constants reach runtime.
app.get('/health/launch-criteria', (c) => c.json(LAUNCH_CRITERIA));

app.route('/_spike/sse', spikeSseRoute);

// Stripe webhook signature is the auth surface; mount in the PUBLIC layer
// BEFORE authMiddleware. CTRL-06 / D-08.
app.route('/api/v1/stripe/webhook', stripeWebhookRoute);

// Layer 3: Inngest dev server discovers + invokes functions via this endpoint
// (no JWT in dev mode — Inngest signing key is empty in Phases 1–9).
app.on(['GET', 'PUT', 'POST'], '/api/inngest', serve({ client: inngest, functions: [...functions] }));

// ─── Layer 4: Internal M2M-protected sub-app ────────────────────────────────
// Phase 8 routes (engine→BFF /internal/v1/sse-callback, /internal/v1/cancel-generation)
// land in Wave 3. authMiddleware verifies the JWT; requireM2M rejects user JWTs.
const internalApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
internalApp.use('*', authMiddleware);
internalApp.use('*', requireM2M);
internalApp.route('/sse-callback', sseCallbackRoute);
internalApp.route('/cancel-generation', cancelGenerationRoute);
app.route('/internal/v1', internalApp);

// ─── Layer 5: Public-API protected sub-app (user JWT) ───────────────────────
const protectedApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
protectedApp.use('*', authMiddleware);
protectedApp.route('/generate', generateRoute);
protectedApp.route('/jobs', jobsStreamRoute);
protectedApp.route('/billing/checkout', checkoutRoute);
protectedApp.route('/billing/portal', portalRoute);
// CTRL-03 / D-19: drift management endpoints (M2M rejected inside route);
// driftRoute self-prefixes /deployments/:id/drift-events,
// /drift-events/:id/regenerate, and /deployments/:id (PATCH).
protectedApp.route('/', driftRoute);
// Plan 09-03 / D-18: Phase-7 BFF carry-forward — list deployments + toggle
// public_badge. deploymentsRoute self-prefixes /deployments and
// /deployments/:id/badge-public so it composes with driftRoute (different
// methods + paths; no collision).
protectedApp.route('/', deploymentsRoute);
app.route('/api/v1', protectedApp);

export default app;
