// apps/api/src/routes/v1/deploy.ts
//
// Plan 09-04 Task 2 (Phase 9 D-18 — 4 of 4 BFF carry-forward endpoints):
// POST /deploy/:generationId returns the deployment row produced by the
// generation pipeline plus a Claude Desktop config snippet ready for the
// dashboard's copy-to-clipboard / `claude://install` deep-link CTA.
//
// HTTP-method note: the route is POST (not GET as the plan body sketches)
// because the frontend Route Handler proxy at
// apps/web/src/app/api/v1/deploy/[generationId]/route.ts wires POST and
// the dashboard-client deploy() function performs POST with optional
// `{ override_name }` body and Idempotency-Key header. Following Plan
// 09-03's deviation pattern — frontend proxy contract wins over plan body.
//
// Authentication: protectedApp (authMiddleware). Rejects M2M tokens with
// 403 m2m_cannot_deploy.
// Authorization: per-handler `generationBelongsToOrg` 4-table JOIN check
// (generations → projects → org_id). Foreign-org / nonexistent generation
// → 404 (defense in depth — never confirms existence; PATTERNS.md key
// finding #2 / T-9-bff-auth-07).
//
// References:
//   - .planning/phases/09-observability-polish/09-04-PLAN.md Task 2
//   - .planning/phases/09-observability-polish/09-CONTEXT.md D-18 #3
//   - .planning/phases/09-observability-polish/09-PATTERNS.md
//   - apps/api/src/routes/v1/deployments.ts (in-phase analog)
//   - apps/web/src/lib/api/dashboard-client.ts (consumer — DeployResult
//     discriminated union expects 200/202 with DeployResponseSchema body)
//   - packages/contracts/src/dashboard-api.ts (DeployResponseSchema)

import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { DeployResponseSchema } from '@mcpgen/contracts/dashboard-api';

import { db } from '../../db.js';
import { generationBelongsToOrg } from '../../lib/auth-helpers.js';
import {
  buildClaudeDesktopConfig,
  type AuthMode,
} from '../../lib/claude-desktop-config.js';
import type { AuthContext } from '../../middleware/auth.js';

interface DeployRouteBindings {
  LOGTO_BASE_URL: string;
}

export const deployRoute = new Hono<{
  Bindings: DeployRouteBindings;
  Variables: { auth: AuthContext };
}>();

interface DeployFetchRow {
  deployment_id: string;
  server_name: string;
  server_url: string;
  auth_mode: AuthMode;
}

const VALID_AUTH_MODES: ReadonlySet<AuthMode> = new Set([
  'passthrough',
  'stored',
  'oauth',
]);

// ─── POST /deploy/:generationId ────────────────────────────────────────────
//
// Returns 202 with `{ deployment_id, server_name, server_url,
// claude_desktop_config }` shape per `DeployResponseSchema`. The 202 status
// matches the frontend Route Handler's success-path expectation
// (apps/web/src/app/api/v1/deploy/[generationId]/route.ts returns 202 on
// fixture-mode success and pipes upstream status verbatim in live mode).
deployRoute.post('/deploy/:generationId', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json(
      { error: 'forbidden', reason: 'm2m_cannot_deploy' },
      403,
    );
  }
  if (!auth.organizationId) {
    return c.json({ error: 'no_org_context' }, 400);
  }
  const generationId = c.req.param('generationId');
  // 3-table JOIN authz check (T-9-bff-auth-07). Returns false on either
  // "generation does not exist" or "exists but belongs to a different org"
  // — both surface as 404 (defense in depth).
  const ok = await generationBelongsToOrg(generationId, auth.organizationId);
  if (!ok) {
    return c.json({ error: 'not_found' }, 404);
  }
  // Look up the deployment for this generation. The deployment row was
  // created by the engine pipeline (Phase 6 / Phase 8 deploy step); this
  // BFF endpoint is read-only at runtime and just surfaces the resulting
  // metadata + claude_desktop_config snippet for the dashboard.
  const r = await db.execute(sql`
    SELECT
      d.id              AS deployment_id,
      d.cf_worker_name  AS server_name,
      d.url             AS server_url,
      d.auth_mode       AS auth_mode
    FROM deployments d
    JOIN generations g ON g.id = d.generation_id
    WHERE g.id = ${generationId}
    LIMIT 1
  `);
  const rows = r.rows as unknown as DeployFetchRow[];
  const row = rows[0];
  if (!row) {
    // Generation exists in the org but the deploy step has not produced a
    // deployment row yet. 404 keeps the response symmetric with the
    // foreign-org case so the dashboard can render a single not-found UI.
    return c.json({ error: 'not_found', reason: 'no_deployment_for_generation' }, 404);
  }
  const authMode: AuthMode = VALID_AUTH_MODES.has(row.auth_mode)
    ? row.auth_mode
    : 'passthrough';
  const claude_desktop_config = buildClaudeDesktopConfig({
    server_name: row.server_name,
    server_url: row.server_url,
    auth_mode: authMode,
  });
  // Validate response shape against the contract — Zod throws here rather
  // than letting an invalid payload reach the dashboard.
  const body = DeployResponseSchema.parse({
    deployment_id: row.deployment_id,
    server_name: row.server_name,
    server_url: row.server_url,
    claude_desktop_config,
  });
  // 202 Accepted: matches the frontend Route Handler's success-status
  // expectation (also accepts 200, but 202 conveys "deploy result ready,
  // proceed to dashboard").
  return c.json(body, 202);
});
