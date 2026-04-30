// apps/api/src/routes/v1/deployments.ts
//
// Plan 09-03 Task 2 (Phase 9 D-18): 2 of 4 BFF carry-forward endpoints owed
// to the Phase-7 dashboard.
//
//   GET   /deployments                       — list authenticated org's
//                                               deployments (4-table JOIN)
//   PATCH /deployments/:id/badge-public      — toggle public_badge boolean
//
// Authentication: protectedApp (authMiddleware). Both endpoints reject M2M
// tokens with 403 (m2m_cannot_*). Foreign-org deployment access returns 404
// (defense in depth — never confirms existence; PATTERNS.md key finding #2).
//
// HTTP method note: PATCH (not POST) and request body field `public_badge`
// (not `public`) deliberately match the frontend Route Handler proxy at
// apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/route.ts;
// changing either side would 502 the dashboard live mode.
//
// References:
//   - .planning/phases/09-observability-polish/09-03-PLAN.md
//   - .planning/phases/09-observability-polish/09-PATTERNS.md (analog: drift.ts)
//   - apps/web/src/lib/api/dashboard-client.ts (consumer)
//   - packages/contracts/src/dashboard-api.ts (wire schema)

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { deployments } from '@mcpgen/contracts/db-schema';
import { BadgePublicRequestSchema } from '@mcpgen/contracts/dashboard-api';

import { db } from '../../db.js';
import { deploymentBelongsToOrg } from '../../lib/auth-helpers.js';
import type { AuthContext } from '../../middleware/auth.js';

interface DeploymentsRouteBindings {
  LOGTO_BASE_URL: string;
}

export const deploymentsRoute = new Hono<{
  Bindings: DeploymentsRouteBindings;
  Variables: { auth: AuthContext };
}>();

// ─── DB row shape returned by GET /deployments JOIN ────────────────────────
//
// Column aliases match the wire schema in
// packages/contracts/src/dashboard-api.ts (DeploymentSchema). Keeping the
// JOIN column names in sync with the wire field names lets the BFF return
// the result rows directly without a separate mapping pass.

interface DeploymentListRow {
  deployment_id: string;
  generation_id: string;
  server_name: string;
  server_url: string;
  auth_mode: string;
  deployed_at: string; // ISO 8601
  quality_report: unknown;
  public_badge: boolean;
}

// ─── GET /deployments ──────────────────────────────────────────────────────
//
// Returns the authenticated org's deployments. The 4-table org-scope JOIN
// is the authz boundary (T-9-bff-auth-05): no caller can see deployments
// outside their org because the WHERE clause is parameterized on
// `auth.organizationId`.
deploymentsRoute.get('/deployments', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json(
      { error: 'forbidden', reason: 'm2m_cannot_list_deployments' },
      403,
    );
  }
  if (!auth.organizationId) {
    return c.json({ error: 'no_org_context' }, 400);
  }
  const r = await db.execute(sql`
    SELECT
      d.id              AS deployment_id,
      d.generation_id   AS generation_id,
      d.cf_worker_name  AS server_name,
      d.url             AS server_url,
      d.auth_mode       AS auth_mode,
      d.created_at      AS deployed_at,
      g.quality_report  AS quality_report,
      d.public_badge    AS public_badge
    FROM deployments d
    JOIN generations g ON g.id = d.generation_id
    JOIN projects p    ON p.id = g.project_id
    WHERE p.org_id = ${auth.organizationId}
    ORDER BY d.created_at DESC
  `);
  const rows = r.rows as unknown as DeploymentListRow[];
  return c.json({ deployments: rows });
});

// ─── PATCH /deployments/:id/badge-public ──────────────────────────────────
//
// Toggles `deployments.public_badge` for org-owned deployments.
// 404 (not 403) on foreign-org access per PATTERNS.md key finding #2.
deploymentsRoute.patch(
  '/deployments/:id/badge-public',
  zValidator('json', BadgePublicRequestSchema),
  async (c) => {
    const auth = c.var.auth;
    if (auth.isM2M) {
      return c.json(
        { error: 'forbidden', reason: 'm2m_cannot_toggle_badge' },
        403,
      );
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
      .set({ public_badge: body.public_badge })
      .where(eq(deployments.id, deploymentId));
    return c.json({
      deployment_id: deploymentId,
      public_badge: body.public_badge,
      updated_at: new Date().toISOString(),
    });
  },
);
