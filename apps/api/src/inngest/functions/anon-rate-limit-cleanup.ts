// apps/api/src/inngest/functions/anon-rate-limit-cleanup.ts
//
// Phase 09.1 plan 10 (D-06 retention / Pitfall #4): daily 04:00 UTC cron that
// drops old TimescaleDB chunks from the `anon_generation_log` hypertable AND
// deletes orphaned `anonymous_generations` rows older than 7 days.
//
// Stable function ID: INNGEST_FUNCTION_IDS.ANON_RATE_LIMIT_CLEANUP.
// Schedule: daily 04:00 UTC ('0 4 * * *').
//
// Why two operations in one cron:
//   - `drop_chunks('anon_generation_log', INTERVAL '30 days')` deletes a
//     whole 1-day chunk in O(1) — Pitfall #4 mitigation. The retention
//     window is 30 days (D-06).
//   - `DELETE FROM anonymous_generations WHERE claimed_at IS NULL AND
//     created_at < NOW() - INTERVAL '7 days'` reclaims session rows that
//     were never claimed. Claimed rows are kept indefinitely (project link).
//
// T-9.1-10-04 mitigation: the table name `'anon_generation_log'` is a
// hardcoded literal — no interpolation, no env-driven table routing — so a
// typo or attacker payload cannot redirect drop_chunks at usage_events or
// any other hypertable.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-06
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §4
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-04-SUMMARY.md
//     (anon_generation_log = TimescaleDB hypertable, 1-day chunks)

import { sql } from 'drizzle-orm';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { inngest } from '../client.js';
import { db } from '../../db.js';

export const anonRateLimitCleanup = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.ANON_RATE_LIMIT_CLEANUP,
    triggers: [{ cron: '0 4 * * *' }],
  },
  async ({ step }) => {
    const dropped = await step.run('drop-old-chunks', async () => {
      // T-9.1-10-04: hardcoded literal table name — never interpolate.
      const r = await db.execute(
        sql`SELECT drop_chunks('anon_generation_log', INTERVAL '30 days')`,
      );
      return r.rows.length;
    });

    const deleted = await step.run('delete-old-unclaimed', async () => {
      const r = await db.execute(sql`
        DELETE FROM anonymous_generations
        WHERE claimed_at IS NULL
          AND created_at < NOW() - INTERVAL '7 days'
        RETURNING anon_session_id
      `);
      return r.rows.length;
    });

    return { dropped_chunks: dropped, deleted_sessions: deleted };
  },
);
