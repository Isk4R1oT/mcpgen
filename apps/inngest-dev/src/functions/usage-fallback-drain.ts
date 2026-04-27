// apps/inngest-dev/src/functions/usage-fallback-drain.ts
//
// Phase 6 Wave 4 (per RUN-06 + CTRL-09) — STABLE ID 'usage-fallback-drain-v1'.
// Every 5 minutes: read events from local bun:sqlite fallback bucket and
// re-emit through the main pipeline. Idempotency key already set on each
// event so the ingest function dedupes via ON CONFLICT.

import { deleteFallback, readFallback } from '@mcpgen/runtime/usage';

import { inngest } from '../inngest-client.js';

export const usageFallbackDrain = inngest.createFunction(
  {
    // STABLE id (CTRL-09).
    id: 'usage-fallback-drain-v1',
    // Every 5 min.
    triggers: [{ cron: '*/5 * * * *' }],
  },
  async ({ step }) => {
    await step.run('drain-and-resend', async () => {
      const events = readFallback(1000);
      for (const ev of events) {
        try {
          const r = await fetch(
            process.env.INNGEST_DEV_URL ?? 'http://localhost:8288/e/mcpgen-dev',
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name: 'usage/event.recorded', data: ev }),
            },
          );
          if (r.ok) deleteFallback(ev.idempotency_key);
        } catch {
          // leave it in the bucket; next cron tick will retry
        }
      }
      console.log(`[fallback-drain] processed ${events.length} events`);
    });
  },
);
