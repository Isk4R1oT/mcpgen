// apps/inngest-dev/src/functions/usage-reconciler.ts
//
// Phase 6 Wave 4 (per RUN-06 + CTRL-09) — STABLE ID 'usage-reconciler-v1'.
// Daily 02:00 UTC SKELETON. Reads TimescaleDB hourly aggregates and logs the
// would-be Stripe Meters payload. Phase 8 (CTRL-06/07) wires the real Stripe
// Meters submission + drift alert.

import { sql } from 'drizzle-orm';

import { db } from '../db.js';
import { inngest } from '../inngest-client.js';

export const usageReconciler = inngest.createFunction(
  {
    // STABLE id (CTRL-09).
    id: 'usage-reconciler-v1',
    // Daily 02:00 UTC.
    triggers: [{ cron: '0 2 * * *' }],
  },
  async ({ step }) => {
    await step.run('compute-aggregates', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const rows = await db.execute(sql`
        SELECT deployment_id,
               tool_name,
               COUNT(*)::int AS tool_calls,
               COALESCE(SUM(tokens_in), 0)::int AS tokens_in,
               COALESCE(SUM(tokens_out), 0)::int AS tokens_out
          FROM usage_events
         WHERE time >= ${yesterday}
           AND time <  NOW()
         GROUP BY deployment_id, tool_name
      `);
      // Phase 6 SKELETON: log the would-be payload structure; do NOT submit.
      console.log(
        '[reconciler] would_be_stripe_payload:',
        JSON.stringify({ rows: rows.rows ?? rows }),
      );
    });
  },
);
