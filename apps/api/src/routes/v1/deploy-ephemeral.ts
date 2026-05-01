// apps/api/src/routes/v1/deploy-ephemeral.ts
//
// Phase 09.1 plan 03 — anon-cookie-scoped ephemeral deploy stub.
//
// Public route (mounted on the public app per D-07 + D-08). Anon caller
// presents the `mcpgen_anon_session` cookie, which scopes the request to
// the caller's prior generation rows. This plan ESTABLISHES THE SHAPE only:
//
//   POST /            — mints an ephemeral deployment record with
//                       expires_at = NOW() + 24h and a placeholder URL.
//                       Real CF Workers for Platforms tenant deploy lands
//                       in plan 09.1-08 (D-03).
//   GET  /:id         — returns ephemeral deployment status / URL.
//
// Cookie scoping: callers without a valid anon cookie cannot mint
// ephemeral deploys (the row would have nothing to bind to). Authed callers
// with a Logto JWT may also pass through — the protected /deploy/permanent
// endpoint is the canonical post-claim path.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-03, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-03-PLAN.md (Task 2)

import { Hono } from 'hono';
import { ulid } from 'ulid';
import { sql } from 'drizzle-orm';

import { db } from '../../db.js';
import type { AuthContext } from '../../middleware/auth.js';
import { readAnonSession } from '../../lib/anon-session.js';

interface EphemeralDeployBindings {
  ENVIRONMENT: string;
}

interface EphemeralDeployVariables {
  auth?: AuthContext;
}

export const ephemeralDeployRoute = new Hono<{
  Bindings: EphemeralDeployBindings;
  Variables: EphemeralDeployVariables;
}>();

// Best-effort row insert + URL synthesis. Same resilience pattern as
// generate.ts — unit tests without DATABASE_URL still get a 202 + URL back.
async function persistEphemeralDeploy(args: {
  deploymentId: string;
  generationId: string;
  anonSessionId: string;
  cfWorkerName: string;
  url: string;
}): Promise<boolean> {
  try {
    await db.execute(sql`
      INSERT INTO deployments (
        id, generation_id, cf_worker_name, dispatch_namespace, url, auth_mode,
        created_at, anon_session_id, expires_at
      ) VALUES (
        ${args.deploymentId},
        ${args.generationId},
        ${args.cfWorkerName},
        'mcpgen-sandbox',
        ${args.url},
        'passthrough',
        NOW(),
        ${args.anonSessionId},
        NOW() + INTERVAL '24 hours'
      )
      ON CONFLICT (cf_worker_name) DO NOTHING
    `);
    return true;
  } catch (err) {
    console.warn('persistEphemeralDeploy failed; continuing with placeholder URL', {
      deploymentId: args.deploymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// POST / — mint ephemeral deploy record.
ephemeralDeployRoute.post('/', async (c) => {
  const anonSessionId = readAnonSession(c);
  const auth = c.var.auth;
  const isAuthed = Boolean(auth?.organizationId);

  if (!anonSessionId && !isAuthed) {
    // No cookie + no JWT → caller has nothing to bind the deploy to. The
    // expected client flow is to call POST /generate first (which mints the
    // cookie) then POST /deploy/ephemeral.
    return c.json({ error: 'no_anon_session', pending_plan: '09.1-08' }, 400);
  }

  // Read the body (optional shape; plan 09.1-08 will tighten this — we
  // accept any JSON or no body for now).
  let body: { generation_id?: string } = {};
  try {
    body = (await c.req.json()) as { generation_id?: string };
  } catch {
    body = {};
  }
  const generationId = body.generation_id ?? `gen_${ulid()}`;

  // Synthesize placeholder URL — plan 09.1-08 deploys the actual tenant.
  const cfWorkerNameSuffix = ulid().toLowerCase().slice(0, 12);
  const cfWorkerName = `anon-${cfWorkerNameSuffix}`;
  const url = `https://${cfWorkerName}.mcpgen.app/mcp`;
  const deploymentId = crypto.randomUUID();

  if (anonSessionId) {
    await persistEphemeralDeploy({
      deploymentId,
      generationId,
      anonSessionId,
      cfWorkerName,
      url,
    });
  }

  return c.json(
    {
      deployment_id: deploymentId,
      url,
      expires_at_seconds: 24 * 60 * 60,
      pending_plan: '09.1-08',
    },
    202,
  );
});

// GET /:id — ephemeral deployment status.
ephemeralDeployRoute.get('/:id', (c) =>
  c.json(
    {
      deployment_id: c.req.param('id'),
      pending_plan: '09.1-08',
    },
    200,
  ),
);
