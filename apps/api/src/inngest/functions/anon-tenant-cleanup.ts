// apps/api/src/inngest/functions/anon-tenant-cleanup.ts
//
// Phase 09.1 plan 10 (D-06 retention / ANON-03 / Pitfall #3 cost-runaway):
// every-15-minute cron that deletes expired CFWP anon scripts via the CF REST
// API + cleans up the matching `deployments` rows. Bounded at 500 expired
// tenants per run (Inngest step time budget — T-9.1-10-06 mitigation); a
// backlog clears at 4 runs/hour × 500 = 2K expired tenants/hour.
//
// Stable function ID: INNGEST_FUNCTION_IDS.ANON_TENANT_CLEANUP.
// Schedule: every 15 minutes ('*/15 * * * *').
//
// BetterStack heartbeat (Pitfall #3 mandate — silent failure = cost runaway,
// worst case ~$80/day if cleanup stops working). Heartbeat fires at the end
// of every successful run regardless of delete count; missing heartbeat for
// 20 minutes triggers BetterStack alert. Heartbeat is a no-op when the env
// var is unset (D-01 graceful pattern, mirrors outbox-depth-monitor.ts).
//
// Local-compute mode: deleteScript() short-circuits when MCPGEN_LOCAL_COMPUTE=1
// (cf-platforms-deploy.ts owns that gate; the cron stays single-purpose).
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-06
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §3
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-08-SUMMARY.md
//     (deleteScript invariant: 404 = success)
//   - apps/api/src/lib/outbox-depth-monitor.ts (heartbeat pattern)

import { sql } from 'drizzle-orm';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { inngest } from '../client.js';
import { db } from '../../db.js';
import {
  deleteScript,
  type CfPlatformsEnv,
} from '../../lib/cf-platforms-deploy.js';

interface ExpiredDeploymentRow {
  id: string;
  cf_worker_name: string;
}

interface CleanupEnv {
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  ENVIRONMENT?: string;
  // Flipt env vars — local-compute mode is now driven by the
  // `runtime_local_compute_routing_ops` flag inside cf-platforms-deploy.
  // We just plumb the env through; the eval happens in deleteScript().
  FLIPT_URL?: string;
  FLIPT_ENVIRONMENT?: string;
  FLIPT_CLIENT_TOKEN?: string;
  BETTERSTACK_ANON_CLEANUP_HEARTBEAT_URL?: string;
}

// BetterStack heartbeat — graceful no-op when URL is unset (D-01 pattern).
// Mirrors apps/api/src/lib/outbox-depth-monitor.ts handler.
async function sendBetterStackHeartbeat(
  heartbeatUrl: string | undefined,
): Promise<void> {
  if (heartbeatUrl) {
    try {
      await fetch(heartbeatUrl, { method: 'GET' });
    } catch (err) {
      // Heartbeat failures are non-fatal — log and continue. The cleanup
      // itself succeeded; BetterStack will register a missing heartbeat on
      // its own clock and surface the alert.
      console.error(
        `[anon-tenant-cleanup] heartbeat fetch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

export const anonTenantCleanup = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.ANON_TENANT_CLEANUP,
    triggers: [{ cron: '*/15 * * * *' }],
  },
  async ({ step }) => {
    // Inngest 4.x Context does not expose `env`; use process.env (matches
    // existing function pattern — see logto-mau-watch.ts and usage-reconciler.ts).
    const e = process.env as unknown as CleanupEnv;
    // exactOptionalPropertyTypes — only set optional props when defined.
    const cfEnv: CfPlatformsEnv = {
      CF_API_TOKEN: e.CF_API_TOKEN,
      CF_ACCOUNT_ID: e.CF_ACCOUNT_ID,
      ...(e.ENVIRONMENT !== undefined ? { ENVIRONMENT: e.ENVIRONMENT } : {}),
      ...(e.FLIPT_URL !== undefined ? { FLIPT_URL: e.FLIPT_URL } : {}),
      ...(e.FLIPT_ENVIRONMENT !== undefined
        ? { FLIPT_ENVIRONMENT: e.FLIPT_ENVIRONMENT }
        : {}),
      ...(e.FLIPT_CLIENT_TOKEN !== undefined
        ? { FLIPT_CLIENT_TOKEN: e.FLIPT_CLIENT_TOKEN }
        : {}),
    };
    const heartbeatUrl = e.BETTERSTACK_ANON_CLEANUP_HEARTBEAT_URL;

    // T-9.1-10-05 mitigation: filter requires BOTH expires_at and
    // anon_session_id non-null so the claim flow's atomic transaction
    // (which sets both to NULL simultaneously, plan 09) cannot race.
    // T-9.1-10-06 mitigation: LIMIT 500 caps each run to fit the Inngest
    // step time budget; backlog clears at 4 runs/hour × 500 = 2K/hour.
    const expired = await step.run('list-expired', async () => {
      const r = await db.execute(sql`
        SELECT id, cf_worker_name
        FROM deployments
        WHERE expires_at IS NOT NULL
          AND expires_at < NOW()
          AND anon_session_id IS NOT NULL
        LIMIT 500
      `);
      return r.rows as unknown as ExpiredDeploymentRow[];
    });

    if (expired.length === 0) {
      await sendBetterStackHeartbeat(heartbeatUrl);
      return { deleted: 0 };
    }

    let deleted = 0;
    for (const d of expired) {
      // Per-row steps so Inngest memoizes individual successes — a partial
      // failure on row 3 does NOT redo rows 1–2 on retry. The CF wrapper
      // treats 404 as success, so a re-run that picks up the same row
      // converges on "deleted".
      await step.run(`delete-cf-${d.id}`, async () => {
        await deleteScript(cfEnv, d.cf_worker_name);
      });
      await step.run(`delete-db-${d.id}`, async () => {
        await db.execute(sql`DELETE FROM deployments WHERE id = ${d.id}`);
      });
      deleted += 1;
    }

    await sendBetterStackHeartbeat(heartbeatUrl);
    return { deleted };
  },
);
