// apps/inngest-dev/src/functions/warm-keep-active-tenants.ts
//
// Phase 6 Wave 4 (per RUN-02 + CTRL-09 + D-18) — STABLE ID 'warm-keep-active-tenants-v1'.
// Every 5 minutes: HEAD /health on each active tenant Worker (those with
// non-NULL local_port). Local Bun has near-zero cold start so this cron is
// a parity scaffold for the Phase-10 prod cron.

import { isNotNull } from 'drizzle-orm';

import { deployments } from '@mcpgen/contracts';

import { db } from '../db.js';
import { inngest } from '../inngest-client.js';

export const warmKeepActiveTenants = inngest.createFunction(
  {
    // STABLE id (CTRL-09).
    id: 'warm-keep-active-tenants-v1',
    // Every 5 min.
    triggers: [{ cron: '*/5 * * * *' }],
  },
  async ({ step }) => {
    await step.run('ping-active-tenants', async () => {
      const rows = await db
        .select({
          cf_worker_name: deployments.cf_worker_name,
          local_port: deployments.local_port,
        })
        .from(deployments)
        .where(isNotNull(deployments.local_port));
      const results: Array<{ scriptName: string; ok: boolean }> = [];
      for (const r of rows) {
        try {
          const resp = await fetch(`http://localhost:${r.local_port}/health`, {
            method: 'HEAD',
          });
          results.push({ scriptName: r.cf_worker_name, ok: resp.ok });
        } catch {
          results.push({ scriptName: r.cf_worker_name, ok: false });
        }
      }
      console.log(`[warm-keep] pinged ${results.length} active tenants`);
    });
  },
);
