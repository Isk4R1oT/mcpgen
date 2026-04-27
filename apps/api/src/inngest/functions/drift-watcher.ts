// apps/api/src/inngest/functions/drift-watcher.ts
//
// CTRL-03 / D-16 / Pitfall #34: Daily drift detection cron.
// Stable function ID: INNGEST_FUNCTION_IDS.DRIFT_WATCHER ('drift-watcher-v1').
// Schedule: 03:00 UTC daily.
//
// Algorithm:
//   1. list-active-deployments: JOIN deployments → generations → specs WHERE
//      specs.spec_url IS NOT NULL (only deployments whose source spec is
//      reachable for re-fetch are eligible for drift watching).
//   2. dispatch-checks: fan-out one `drift/check.requested` event per
//      deployment. Each downstream driftWatcherCheck retries independently;
//      a single bad spec_url cannot block siblings.
//
// Pitfall #21 mitigation: id sourced from INNGEST_FUNCTION_IDS register so the
// Phase 9 orphan audit can walk the create-function call sites.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-16, D-17, D-27
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-16, §13
//   - .planning/research/PITFALLS.md §#21, §#34

import { sql } from 'drizzle-orm';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { inngest } from '../client.js';
import { db } from '../../db.js';

interface ActiveDeploymentRow {
  deployment_id: string;
  spec_url: string;
}

export const driftWatcher = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.DRIFT_WATCHER,
    triggers: [{ cron: '0 3 * * *' }],
  },
  async ({ step }) => {
    const active = await step.run('list-active-deployments', async () => {
      const r = await db.execute(sql`
        SELECT d.id AS deployment_id, s.spec_url AS spec_url
        FROM deployments d
        JOIN generations g ON g.id = d.generation_id
        JOIN specs s ON s.id = g.spec_id
        WHERE s.spec_url IS NOT NULL
      `);
      return r.rows as unknown as ActiveDeploymentRow[];
    });

    if (active.length === 0) {
      return { dispatched: 0 };
    }

    await step.sendEvent(
      'dispatch-checks',
      active.map((d) => ({
        name: 'drift/check.requested',
        data: { deploymentId: d.deployment_id, specUrl: d.spec_url },
      })),
    );

    return { dispatched: active.length };
  },
);
