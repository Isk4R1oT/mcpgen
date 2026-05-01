// apps/api/src/routes/v1/claim.ts
//
// Phase 09.1 plan 09 — POST /api/v1/claim_generation full flow (D-04).
// Replaces the plan-03 501 stub. Atomically:
//   1. UPDATE anonymous_generations SET claimed_at = NOW(),
//        claimed_by_org_id = $orgId
//      WHERE anon_session_id = $cookie AND claimed_at IS NULL
//      RETURNING generation_id
//   2. SELECT id, cf_worker_name FROM deployments
//      WHERE anon_session_id = $cookie AND expires_at IS NOT NULL
//   3. retagScript(...) per deployment with
//        ['anon=false', 'claimed_by_org=<orgId>']
//   4. UPDATE deployments SET expires_at = NULL, anon_session_id = NULL
//      WHERE anon_session_id = $cookie
// All four steps run inside a single `db.transaction(...)` so the cleanup
// cron (plan 09.1-10) cannot observe a half-claimed row — both
// `expires_at` AND `anon_session_id` are cleared in the same atomic write.
//
// On success, the anon cookie is cleared (Set-Cookie: ...; Max-Age=0)
// AFTER the transaction commits and the response carries
// `{ claimed_count, deployments_retagged }`.
//
// Idempotency: the WHERE clause `claimed_at IS NULL` filters out already-
// claimed rows. A second POST with the same cookie + JWT is therefore a
// no-op (claimed_count=0, deployments_retagged=0).
//
// CSRF: defence-in-depth via Hono `csrf({ origin: fn })` middleware mounted
// on `protectedApp` in index.ts (NOT here). The Hono csrf middleware
// inspects requests with form-style Content-Type (text/plain,
// x-www-form-urlencoded, multipart/form-data) — JSON POSTs are not CSRF-
// vulnerable because cross-origin JSON requires CORS preflight.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §9 (lines 1024–1180)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-09-PLAN.md
//   - apps/api/src/lib/anon-session.ts (clearAnonSession + ANON_COOKIE_NAME)
//   - apps/api/src/lib/cf-platforms-deploy.ts (retagScript)

import { Hono } from 'hono';
import { sql } from 'drizzle-orm';

import type { AuthContext } from '../../middleware/auth.js';
import { ANON_COOKIE_NAME, clearAnonSession } from '../../lib/anon-session.js';
import { retagScript, type CfPlatformsEnv } from '../../lib/cf-platforms-deploy.js';
import { db } from '../../db.js';
import { getCookie } from 'hono/cookie';

interface ClaimRouteBindings extends CfPlatformsEnv {
  ENVIRONMENT: string;
}

interface ClaimRouteVariables {
  auth: AuthContext;
}

interface ClaimedGenerationRow {
  generation_id: string;
}

interface AnonDeploymentRow {
  id: string;
  cf_worker_name: string;
}

export const claimRoute = new Hono<{
  Bindings: ClaimRouteBindings;
  Variables: ClaimRouteVariables;
}>();

claimRoute.post('/', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_cannot_claim' }, 403);
  }
  const organizationId = auth.organizationId;
  if (!organizationId) {
    return c.json({ error: 'no_org_context' }, 400);
  }

  // Read the cookie via Hono's cookie helper directly. We deliberately do
  // NOT call readAnonSession() here because the cookie may have just been
  // rotated by the landing handler — the regex check is identical and we
  // want to preserve the canonical RESEARCH §9 shape.
  const anonSessionId = getCookie(c, ANON_COOKIE_NAME);
  if (!anonSessionId) {
    return c.json({ error: 'no_anon_session' }, 400);
  }

  // Single atomic transaction: claim → list deployments → retag → clear.
  // retagScript runs INSIDE the transaction so a CF retag failure aborts
  // the DB writes — eventual consistency: cleanup cron picks up the row on
  // the next cycle (it still has expires_at + anon_session_id NOT NULL).
  const { claimedCount, deploymentsRetagged } = await db.transaction(async (tx) => {
    const updated = await tx.execute(sql`
      UPDATE anonymous_generations
      SET claimed_at = NOW(), claimed_by_org_id = ${organizationId}
      WHERE anon_session_id = ${anonSessionId}
        AND claimed_at IS NULL
      RETURNING generation_id
    `);
    const claimedGenIds = (updated.rows as unknown as ClaimedGenerationRow[]).map(
      (r) => r.generation_id,
    );

    const deployments = await tx.execute(sql`
      SELECT id, cf_worker_name FROM deployments
      WHERE anon_session_id = ${anonSessionId}
        AND expires_at IS NOT NULL
    `);
    const deploymentRows = deployments.rows as unknown as AnonDeploymentRow[];

    // Re-tag THEN clear DB state. This ordering matches the cleanup-cron
    // race-protection invariant (T-9.1-08-06): the cleanup query reads
    // `expires_at IS NOT NULL AND anon_session_id IS NOT NULL` — the DB
    // UPDATE below clears BOTH atomically inside this transaction so the
    // cron cannot observe a partially-cleared row.
    for (const d of deploymentRows) {
      await retagScript(c.env, d.cf_worker_name, [
        'anon=false',
        `claimed_by_org=${organizationId}`,
      ]);
    }

    if (deploymentRows.length > 0) {
      await tx.execute(sql`
        UPDATE deployments
        SET expires_at = NULL, anon_session_id = NULL
        WHERE anon_session_id = ${anonSessionId}
      `);
    }

    return {
      claimedCount: claimedGenIds.length,
      deploymentsRetagged: deploymentRows.length,
    };
  });

  // Clear the anon cookie AFTER the transaction commits — the browser no
  // longer needs to send the anon ULID once the rows are bound to an org.
  clearAnonSession(c);

  return c.json({
    claimed_count: claimedCount,
    deployments_retagged: deploymentsRetagged,
  });
});
