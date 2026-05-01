// apps/api/src/routes/v1/permanent-deploy.ts
//
// Phase 09.1 plan 03 — split-out of the original Phase 9 deploy route. Per
// D-08 the post-claim permanent deploy endpoint becomes
// `POST /api/v1/deploy/permanent/:generationId`. The handler logic is
// identical to the previous Phase 9 implementation; only the file location
// + export name + mount path change so the public anon ephemeral path
// (deploy-ephemeral.ts) and the protected permanent path can co-exist
// cleanly under the same `/api/v1/deploy` prefix.
//
// Originally lived at apps/api/src/routes/v1/deploy.ts (Phase 9 D-18).
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
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-08
//   - apps/api/src/routes/v1/deploy.ts (now a barrel re-export — split per plan 03)

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

interface PermanentDeployBindings {
  LOGTO_BASE_URL: string;
}

export const permanentDeployRoute = new Hono<{
  Bindings: PermanentDeployBindings;
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

// POST /:generationId — protected permanent deploy. Mounted at
// `/api/v1/deploy/permanent/:generationId` by index.ts.
permanentDeployRoute.post('/:generationId', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_cannot_deploy' }, 403);
  }
  if (!auth.organizationId) {
    return c.json({ error: 'no_org_context' }, 400);
  }
  const generationId = c.req.param('generationId');
  const ok = await generationBelongsToOrg(generationId, auth.organizationId);
  if (!ok) {
    return c.json({ error: 'not_found' }, 404);
  }
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
  const body = DeployResponseSchema.parse({
    deployment_id: row.deployment_id,
    server_name: row.server_name,
    server_url: row.server_url,
    claude_desktop_config,
  });
  return c.json(body, 202);
});
