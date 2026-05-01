// apps/api/src/inngest/functions/anon-salt-rotate.ts
//
// Phase 09.1 plan 10 (D-11 / T-9.1-10-02 race / T-9.1-10-03 disclosure):
// daily 00:00 UTC cron that rotates the IP-hash salt. Promotes the current
// salt into `daily_salt_previous` (24h grace window per RESEARCH §5; pairs
// with hashIpsForLookup() returning two hashes — current AND previous — so
// requests in flight at midnight UTC don't lose their rate-limit identity)
// and writes a fresh 32-byte hex salt into `daily_salt_current`.
//
// Stable function ID: INNGEST_FUNCTION_IDS.ANON_SALT_ROTATE.
// Schedule: daily 00:00 UTC ('0 0 * * *').
//
// Atomicity (T-9.1-10-02): both UPSERTs run inside a single step.run so a
// partial failure (e.g. promote succeeds, fresh-write fails) leaves the
// step un-memoized — Inngest retries the WHOLE step from scratch. Two
// separate steps would risk leaving `previous` set without `current`,
// breaking the dual-salt lookup.
//
// Information disclosure (T-9.1-10-03): the return value exposes only
// `salt_prefix` (first 8 hex chars) for observability. The full salt is
// NEVER returned, logged, or surfaced via Inngest dashboard step output.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-11
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §5
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-04-SUMMARY.md
//     (app_secrets = (key, value, created_at, rotates_at) KV table)

import { sql } from 'drizzle-orm';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { inngest } from '../client.js';
import { db } from '../../db.js';

export const anonSaltRotate = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.ANON_SALT_ROTATE,
    triggers: [{ cron: '0 0 * * *' }],
  },
  async ({ step }) => {
    // Generate-then-store split into two steps so Inngest memoizes the new
    // salt: a retry of `rotate-salts` reuses the same `newSalt` rather
    // than rolling a different value (which would orphan the just-promoted
    // `daily_salt_previous`). 32 bytes / 64 hex chars = 256 bits of entropy
    // per RESEARCH §5 verbatim shape.
    const newSalt = await step.run('generate-salt', async () => {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    });

    await step.run('rotate-salts', async () => {
      // T-9.1-10-02: both UPSERTs in the same step.run for atomicity.
      // 1. Promote current → previous (24h grace window starts NOW).
      await db.execute(sql`
        INSERT INTO app_secrets (key, value, rotates_at)
        VALUES (
          'daily_salt_previous',
          (SELECT value FROM app_secrets WHERE key = 'daily_salt_current'),
          NOW() + INTERVAL '24 hours'
        )
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, rotates_at = EXCLUDED.rotates_at
      `);
      // 2. Write fresh current.
      await db.execute(sql`
        INSERT INTO app_secrets (key, value, rotates_at)
        VALUES ('daily_salt_current', ${newSalt}, NOW() + INTERVAL '24 hours')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, rotates_at = EXCLUDED.rotates_at
      `);
    });

    // T-9.1-10-03: only the prefix is returned — Inngest step output is
    // surfaced in the dashboard and we MUST NOT expose the full salt.
    return {
      rotated: true,
      salt_prefix: newSalt.slice(0, 8),
    };
  },
);
