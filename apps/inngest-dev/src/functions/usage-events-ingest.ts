// apps/inngest-dev/src/functions/usage-events-ingest.ts
//
// Phase 6 Wave 4 (per RUN-06 + CTRL-09) — STABLE ID 'usage-events-ingest-v1'.
// Inserts into TimescaleDB usage_events with
//   ON CONFLICT (deployment_id, idempotency_key, time) DO NOTHING
// for defence-in-depth dedup (UNIQUE constraint catches replays at DB layer).
//
// Per docs/decisions/005 §Consequences: the ON CONFLICT clause MUST list all
// three columns of the unique index (deployment_id, idempotency_key, time) —
// single- or two-column variants raise a Postgres `there is no unique or
// exclusion constraint matching the ON CONFLICT specification` error. The
// dedup semantic is preserved because `idempotency_key` already encodes the
// minute-bucket timestamp per Phase-1 D-11 shape.
//
// Source: 06-RESEARCH Example 8 (amended for the 3-column ON CONFLICT clause).

import { sql } from 'drizzle-orm';

import { UsageEvent } from '@mcpgen/contracts';

import { db } from '../db.js';
import { inngest } from '../inngest-client.js';

export const usageEventsIngest = inngest.createFunction(
  {
    // STABLE id (CTRL-09).
    id: 'usage-events-ingest-v1',
    concurrency: { limit: 25 },
    triggers: [{ event: 'usage/event.recorded' }],
  },
  async ({ event, step }) => {
    // WARNING-3: type-narrow event.data through the FROZEN UsageEvent Zod schema.
    const parsed: UsageEvent = UsageEvent.parse(event.data as unknown);
    await step.run('insert-timescale', async () => {
      await db.execute(sql`
        INSERT INTO usage_events (
          time, deployment_id, tool_name, tokens_in, tokens_out,
          upstream_latency_ms, worker_cpu_ms, status, client_type, error_class,
          idempotency_key
        ) VALUES (
          ${parsed.time}, ${parsed.deployment_id}, ${parsed.tool_name},
          ${parsed.tokens_in}, ${parsed.tokens_out},
          ${parsed.upstream_latency_ms}, ${parsed.worker_cpu_ms},
          ${parsed.status}, ${parsed.client_type}, ${parsed.error_class},
          ${parsed.idempotency_key}
        ) ON CONFLICT (deployment_id, idempotency_key, time) DO NOTHING
      `);
    });
  },
);
