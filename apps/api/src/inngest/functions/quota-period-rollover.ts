// apps/api/src/inngest/functions/quota-period-rollover.ts
//
// CTRL-07 / D-14: Anniversary-based quota period rollover.
// Stable function ID: INNGEST_FUNCTION_IDS.QUOTA_PERIOD_ROLLOVER.
// Schedule: hourly ('0 * * * *').
// Single SQL UPDATE: rolls forward orgs whose quota_period_start + 1 month <
// NOW(). Synced with Stripe webhook customer.subscription.updated dispatch
// (D-08); Stripe is source of truth, this cron catches stale rows under DST/
// network-partition windows.
//
// IMPORTANT: anniversary-based (NOT calendar month) — T-8-20 mitigation
// reduces midnight-boundary attack surface to 12 events/year/org rather than
// monthly midnight.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-14
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-14
//   - .planning/phases/08-auth-billing/08-02-SUMMARY.md (Inngest 4.x 2-arg signature)

import { sql } from 'drizzle-orm';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { inngest } from '../client.js';
import { db } from '../../db.js';

export const quotaPeriodRollover = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.QUOTA_PERIOD_ROLLOVER,
    triggers: [{ cron: '0 * * * *' }],
  },
  async ({ step }) => {
    const rolled = await step.run('rollover-due-orgs', async () => {
      const r = await db.execute(sql`
        UPDATE organizations
        SET quota_period_start = quota_period_start + INTERVAL '1 month'
        WHERE quota_period_start + INTERVAL '1 month' < NOW()
        RETURNING id
      `);
      return r.rows.length;
    });
    return { rolled_over: rolled };
  },
);
