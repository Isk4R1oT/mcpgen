// apps/api/src/lib/auth-helpers.ts
//
// Plan 09-03 Task 2 (Phase 9 D-18) — shared org-scope authorization helpers
// used by every BFF route that operates on a deployment-bound resource.
// Centralizing the 4-table JOIN guarantees the IDOR mitigation pattern
// (T-8-14 / T-9-bff-auth-02) is applied identically across drift, deployment
// list / badge-public, future deploy-status routes, etc.
//
// `deploymentBelongsToOrg` was extracted verbatim from drift.ts:48-62 (Plan
// 8 D-19) — moving it here lets new routes import the same predicate without
// copy-paste drift. drift.ts now imports from this module.
//
// References:
//   - apps/api/src/routes/v1/drift.ts (origin)
//   - .planning/phases/09-observability-polish/09-PATTERNS.md key finding #2
//     (return 404 not 403 for foreign-org resources — defense in depth)
//   - .planning/phases/09-observability-polish/09-RESEARCH.md
//     §"Don't hand-roll" guidance

import { sql } from 'drizzle-orm';

import { db } from '../db.js';

interface DeploymentOwnershipRow {
  org_id: string;
}

/**
 * Returns true iff `deploymentId` is owned by `orgId` per the canonical
 * 4-table JOIN: deployments → generations → projects → org_id.
 *
 * Returns false for both "deployment does not exist" and "deployment exists
 * but belongs to a different org" — call sites MUST translate that boolean
 * into a 404 response (never 403) so the BFF never confirms existence of a
 * foreign-org deployment to the caller (defense in depth).
 */
export async function deploymentBelongsToOrg(
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
