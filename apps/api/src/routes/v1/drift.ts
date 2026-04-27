// apps/api/src/routes/v1/drift.ts
//
// CTRL-03 / D-19 / T-8-14: 3 drift-management endpoints under /api/v1.
//
// Authentication: protectedApp (authMiddleware applied; M2M and user JWTs
// both reach this route).
// Authorization: each endpoint
//   1. rejects M2M tokens with 403 (M2M cannot act on behalf of an org —
//      mirrors Plan 03 checkout/portal route pattern)
//   2. verifies caller's auth.organizationId matches the deployment's owner
//      org via 4-table JOIN (deployments → generations → projects →
//      organizations); mismatch returns 404 (defense-in-depth: never confirm
//      existence of foreign-org resources).
//
// Endpoints:
//   GET   /deployments/:id/drift-events
//   POST  /drift-events/:id/regenerate
//   PATCH /deployments/:id            (DeploymentDriftPatchRequest body)
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-19, D-20
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-19
//   - apps/api/src/routes/v1/billing/checkout.ts (M2M-rejection pattern analog)

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { DeploymentDriftPatchRequest } from '@mcpgen/contracts/billing-types';
import { drift_events, deployments, generations } from '@mcpgen/contracts/db-schema';
import { db } from '../../db.js';
import type { AuthContext } from '../../middleware/auth.js';

interface DriftRouteBindings {
  // Required only for SSE-URL composition; no Stripe / Logto here.
  LOGTO_BASE_URL: string;
}

export const driftRoute = new Hono<{
  Bindings: DriftRouteBindings;
  Variables: { auth: AuthContext };
}>();

interface DeploymentOwnershipRow {
  org_id: string;
}

async function deploymentBelongsToOrg(
  deploymentId: string,
  orgId: string,
): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT p.org_id AS org_id
    FROM deployments d
    JOIN generations g ON g.id = d.generation_id
    JOIN projects p ON p.id = g.project_id
    WHERE d.id = ${deploymentId}
    LIMIT 1
  `);
  const rows = r.rows as unknown as DeploymentOwnershipRow[];
  return rows[0]?.org_id === orgId;
}

interface DriftEventOwnershipRow {
  org_id: string;
  spec_id: string;
  project_id: string;
  deployment_id: string;
}

async function driftEventBelongsToOrg(
  driftEventId: string,
  orgId: string,
): Promise<DriftEventOwnershipRow | null> {
  const r = await db.execute(sql`
    SELECT
      p.org_id        AS org_id,
      g.spec_id       AS spec_id,
      g.project_id    AS project_id,
      de.deployment_id AS deployment_id
    FROM drift_events de
    JOIN deployments d ON d.id = de.deployment_id
    JOIN generations g ON g.id = d.generation_id
    JOIN projects p ON p.id = g.project_id
    WHERE de.id = ${driftEventId}
    LIMIT 1
  `);
  const rows = r.rows as unknown as DriftEventOwnershipRow[];
  const row = rows[0];
  if (!row) return null;
  if (row.org_id !== orgId) return null;
  return row;
}

// ─── GET /deployments/:id/drift-events ──────────────────────────────────────
driftRoute.get('/deployments/:id/drift-events', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_cannot_read_drift' }, 403);
  }
  if (!auth.organizationId) {
    return c.json({ error: 'no_org_context' }, 400);
  }
  const deploymentId = c.req.param('id');
  // 4-table JOIN authz check (T-8-14 IDOR mitigation)
  const ok = await deploymentBelongsToOrg(deploymentId, auth.organizationId);
  if (!ok) {
    return c.json({ error: 'not_found' }, 404);
  }
  const events = await db
    .select()
    .from(drift_events)
    .where(eq(drift_events.deployment_id, deploymentId));
  return c.json({ drift_events: events });
});

// ─── POST /drift-events/:id/regenerate ──────────────────────────────────────
driftRoute.post('/drift-events/:id/regenerate', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_cannot_regenerate' }, 403);
  }
  if (!auth.organizationId) {
    return c.json({ error: 'no_org_context' }, 400);
  }
  const driftEventId = c.req.param('id');
  const ownership = await driftEventBelongsToOrg(driftEventId, auth.organizationId);
  if (!ownership) {
    return c.json({ error: 'not_found' }, 404);
  }
  const newGenId = ulid();
  await db.insert(generations).values({
    id: newGenId,
    spec_id: ownership.spec_id,
    project_id: ownership.project_id,
    status: 'queued',
    triggered_by: 'drift_manual',
    options: {},
  });
  await db
    .update(drift_events)
    .set({ status: 'regenerating', resolved_by_generation_id: newGenId })
    .where(eq(drift_events.id, driftEventId));
  return c.json({
    job_id: newGenId,
    sse_url: `/api/v1/jobs/${newGenId}/stream`,
  });
});

// ─── PATCH /deployments/:id ─────────────────────────────────────────────────
driftRoute.patch(
  '/deployments/:id',
  zValidator('json', DeploymentDriftPatchRequest),
  async (c) => {
    const auth = c.var.auth;
    if (auth.isM2M) {
      return c.json({ error: 'forbidden', reason: 'm2m_cannot_patch_deployment' }, 403);
    }
    if (!auth.organizationId) {
      return c.json({ error: 'no_org_context' }, 400);
    }
    const deploymentId = c.req.param('id');
    const ok = await deploymentBelongsToOrg(deploymentId, auth.organizationId);
    if (!ok) {
      return c.json({ error: 'not_found' }, 404);
    }
    const body = c.req.valid('json');
    await db
      .update(deployments)
      .set({ auto_regenerate_on_drift: body.auto_regenerate_on_drift })
      .where(eq(deployments.id, deploymentId));
    return c.json({
      ok: true,
      auto_regenerate_on_drift: body.auto_regenerate_on_drift,
    });
  },
);
