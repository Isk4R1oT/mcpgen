// apps/api/src/index.ts
//
// Hono BFF entry point — Phase 09.1 plan 02 refactor.
//
// Auth boundary moved from blanket `app.use('/api/v1/*', authMiddleware)`
// (Phase 8) to per-route policy via mounted sub-apps (D-07). Which routes
// land on the public vs protected side is decided at registration time
// from `env.BFF_ANONYMOUS_GATE` (D-01 flex requirement). The Logto JWT
// verification logic in `middleware/auth.ts` is unchanged — only the
// boundary moves.
//
// Layered structure:
//   • Public layer 1+2: /health, /health/launch-criteria
//   • Public layer 3:   /_spike/sse, /api/inngest, /api/v1/stripe/webhook
//   • Public layer 4:   anon-allowed /api/v1 routes (generate, jobs,
//                       deploy/ephemeral) + conditionally preview/quality/
//                       playground per BFF_ANONYMOUS_GATE
//   • Protected layer 5 (M2M): /internal/v1/* (engine→BFF callbacks)
//   • Protected layer 6 (user JWT): /api/v1 catch-all sub-app — dashboard,
//                                   billing, drift, deployments, usage,
//                                   deploy/:id, claim_generation, download,
//                                   and gate-conditional preview/quality/
//                                   playground.
//
// Critical ordering gotchas (Hono routing, "first match wins"):
//   1. `protectedApp.use('*', authMiddleware)` MUST run BEFORE any
//      `protectedApp.route(...)` registration.
//   2. Public `app.route('/api/v1/X', ...)` MUST be registered BEFORE
//      `app.route('/api/v1', protectedApp)` — otherwise the catch-all
//      protected sub-app shadows the public registrations.
//
// References:
//   - docs/mcpgen-architecture.md §5.8
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-01, D-07
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §2 (lines 144-246)
//   - .planning/phases/08-auth-billing/08-PATTERNS.md §A (5-layer mounting precedent)

import { Hono } from 'hono';
import { serve } from 'inngest/hono';
import { LAUNCH_CRITERIA } from '@mcpgen/contracts';

import { authMiddleware, requireM2M, type AuthContext, type AuthEnv } from './middleware/auth.js';
import { generateRoute } from './routes/v1/generate.js';
import { jobsAnonRoute } from './routes/v1/jobs/anon.js';
import { stripeWebhookRoute } from './routes/v1/stripe-webhook.js';
import { billingRoutes } from './routes/v1/billing/index.js';
import { sseCallbackRoute } from './routes/internal/v1/sse-callback.js';
import { cancelGenerationRoute } from './routes/internal/v1/cancel-generation.js';
import { spikeSseRoute } from './routes/_spike/sse.js';
import { driftRoute } from './routes/v1/drift.js';
import { deploymentsRoute } from './routes/v1/deployments.js';
import { usageRoute } from './routes/v1/usage.js';
import { deployRoute } from './routes/v1/deploy.js';
import { previewRoute } from './routes/v1/preview.js';
import { qualityRoute } from './routes/v1/quality.js';
import { playgroundRoute } from './routes/v1/playground.js';
import { claimRoute } from './routes/v1/claim.js';
import { ephemeralDeployRoute } from './routes/v1/deploy-ephemeral.js';
import { downloadRoute } from './routes/v1/download.js';
import { dashboardRoutes } from './routes/v1/dashboard.js';
import { inngest } from './inngest/client.js';
import { functions } from './inngest/functions/index.js';

// ─── Bindings + Variables ──────────────────────────────────────────────────

// D-01: BFF_ANONYMOUS_GATE is a literal-typed config switch. Default is
// 'playground' (anon flow gates at the playground step). Other positions
// open more steps to anonymous traffic; useful for product experiments
// without a code change ("надо сделать гибко").
export type BffAnonymousGate = 'playground' | 'preview' | 'quality' | 'deploy';

export interface Bindings extends AuthEnv {
  HYPERDRIVE: Hyperdrive;
  SENTRY_DSN: string;
  ENVIRONMENT: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_PRO: string;
  ENGINE_ENDPOINT: string;
  LOGTO_M2M_APP_ID: string;
  LOGTO_M2M_APP_SECRET: string;
  // D-01 flex gate. Allow undefined at the type level — the implementation
  // narrows undefined to 'playground' (default).
  BFF_ANONYMOUS_GATE?: BffAnonymousGate;
}

export interface Variables {
  auth?: AuthContext;
}

// ─── buildApp(env) factory ─────────────────────────────────────────────────
//
// Reads env.BFF_ANONYMOUS_GATE at registration time and assembles a Hono
// app where each route sits on the correct side of the auth boundary.
// Tests construct the app with mocked env values to verify the gate moves
// without touching middleware or handler code.

export function buildApp(env: Bindings): Hono<{ Bindings: Bindings; Variables: Variables }> {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

  // ─── Layer 1+2: Public health + launch-criteria ───────────────────────
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/health/launch-criteria', (c) => c.json(LAUNCH_CRITERIA));

  // ─── Layer 3: Public spike SSE + Inngest + Stripe webhook ─────────────
  app.route('/_spike/sse', spikeSseRoute);
  app.route('/api/v1/stripe/webhook', stripeWebhookRoute);
  app.on(
    ['GET', 'PUT', 'POST'],
    '/api/inngest',
    serve({ client: inngest, functions: [...functions] }),
  );

  // ─── Layer 4: Protected M2M sub-app (engine → BFF callbacks) ──────────
  // Internal/v1 stays gated behind M2M JWT and is unaffected by
  // BFF_ANONYMOUS_GATE — that switch only governs the public/v1 boundary.
  const internalApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  internalApp.use('*', authMiddleware);
  internalApp.use('*', requireM2M);
  internalApp.route('/sse-callback', sseCallbackRoute);
  internalApp.route('/cancel-generation', cancelGenerationRoute);
  app.route('/internal/v1', internalApp);

  // ─── Layer 5: Protected user-JWT sub-app (composed below) ─────────────
  // Auth middleware is registered BEFORE any sub-routes (gotcha #1).
  const protectedApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  protectedApp.use('*', authMiddleware);

  // ─── Public /api/v1 routes — ALWAYS anonymous-allowed (D-07 + D-08) ───
  // Mount BEFORE the protected catch-all (gotcha #2 — first match wins).
  app.route('/api/v1/generate', generateRoute);
  app.route('/api/v1/jobs', jobsAnonRoute);
  app.route('/api/v1/deploy/ephemeral', ephemeralDeployRoute);

  // ─── Conditional public routes per BFF_ANONYMOUS_GATE (D-01) ──────────
  // Default 'playground' = most-restrictive: only generate/jobs/ephemeral
  // are public. Higher gate values open more steps progressively.
  const gate: BffAnonymousGate = env.BFF_ANONYMOUS_GATE ?? 'playground';

  if (gate === 'deploy') {
    // Most permissive: preview + quality + playground all public.
    app.route('/api/v1/preview', previewRoute);
    app.route('/api/v1/quality', qualityRoute);
    app.route('/api/v1/playground', playgroundRoute);
  } else if (gate === 'quality') {
    app.route('/api/v1/preview', previewRoute);
    app.route('/api/v1/quality', qualityRoute);
    protectedApp.route('/playground', playgroundRoute);
  } else if (gate === 'preview') {
    app.route('/api/v1/preview', previewRoute);
    protectedApp.route('/quality', qualityRoute);
    protectedApp.route('/playground', playgroundRoute);
  } else {
    // 'playground' (default) — most-restrictive: all three gated.
    protectedApp.route('/preview', previewRoute);
    protectedApp.route('/quality', qualityRoute);
    protectedApp.route('/playground', playgroundRoute);
  }

  // ─── Always-protected /api/v1 routes ──────────────────────────────────
  protectedApp.route('/dashboard', dashboardRoutes);
  protectedApp.route('/billing', billingRoutes);
  protectedApp.route('/download', downloadRoute);
  protectedApp.route('/claim_generation', claimRoute);
  // Existing self-prefixed routes — composed at the protectedApp root so
  // their internal /deployments, /drift-events, /usage/hourly, and
  // /deploy/:generationId prefixes resolve verbatim.
  protectedApp.route('/', driftRoute);
  protectedApp.route('/', deploymentsRoute);
  protectedApp.route('/', usageRoute);
  protectedApp.route('/', deployRoute);

  // Mount the protected sub-app LAST so all explicit public routes above
  // win against its catch-all (`/api/v1/*`).
  app.route('/api/v1', protectedApp);

  return app;
}

// ─── CF Workers default export ─────────────────────────────────────────────
//
// Cloudflare Workers invokes `default.fetch(req, env, ctx)`. Re-build the
// app on every request — Hono's app construction is cheap and this keeps
// the BFF_ANONYMOUS_GATE env var live without a Worker restart in dev.
// Tests import `buildApp` directly to avoid the per-request rebuild cost.
//
// The signature mirrors Hono's variadic `app.fetch` so existing tests
// calling `app.fetch(req, env)` (2-arg) keep compiling. `env` is loosely
// typed here (as a partial subset of Bindings) because individual route
// tests stub only the bindings they exercise; CF Workers always passes
// the full env at runtime.

export default {
  fetch: (req: Request, env: Partial<Bindings>, ctx?: ExecutionContext) =>
    buildApp(env as Bindings).fetch(req, env, ctx),
};
