// apps/api/tests/migrations/anon-flow-migration.test.ts
//
// Phase 9.1 Plan 04 (D-09 / D-11 / OQ-2) — verifies that migration
// `20260501010000_phase09_1_anon_flow.sql` has been applied to the live dev
// DB and that the schema-shape contracts (tables, columns, indexes,
// hypertable chunk interval, foreign keys) are intact.
//
// Tier:
//   - Live-DB tests require DATABASE_URL; skip cleanly when unset (preserves
//     the D-01 empty-env no-op pattern shared with `badge-public.test.ts`).
//   - The hypertable chunk-interval check (Test 5) is the canonical RESEARCH
//     §"Pitfall #4" guard: 1-day chunks (86400000000 microseconds) are
//     mandatory; default 7-day chunks would silently coarsen retention.
//
// Resume signal: downstream Plans 05 (rate-limit log), 06 (cache hit lookup),
// 08 (deployments.expires_at), 09 (claim flow), 10 (cleanup crons) all
// depend on this schema being live.

import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { db } from '../../src/db.js';

interface RegclassRow {
  exists: string | null;
}

interface CountRow {
  count: number;
}

interface ColumnRow {
  column_name: string;
}

interface DimensionRow {
  hypertable_name: string;
  column_name: string;
  time_interval: string | null;
  integer_interval: string | null;
}

interface IndexRow {
  indexname: string;
}

describe.skipIf(!process.env['DATABASE_URL'])('anon-flow migration (live DB)', () => {
  it('Test 1: anonymous_generations table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('public.anonymous_generations')::text AS exists`);
    const rows = result.rows as unknown as RegclassRow[];
    expect(rows[0]?.exists).toBe('anonymous_generations');
  });

  it('Test 2: anon_generation_log table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('public.anon_generation_log')::text AS exists`);
    const rows = result.rows as unknown as RegclassRow[];
    expect(rows[0]?.exists).toBe('anon_generation_log');
  });

  it('Test 3: app_secrets table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('public.app_secrets')::text AS exists`);
    const rows = result.rows as unknown as RegclassRow[];
    expect(rows[0]?.exists).toBe('app_secrets');
  });

  it('Test 4: app_secrets initial seed contains daily_salt_current with 64-char hex value', async () => {
    const result = await db.execute(sql`
      SELECT key, length(value) AS count
      FROM app_secrets
      WHERE key = 'daily_salt_current'
    `);
    // 32 random bytes encoded as hex = 64 chars (Pitfall: ensure pgcrypto is enabled).
    const rows = result.rows as unknown as { key: string; count: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(64);
  });

  it('Test 5: anon_generation_log is a TimescaleDB hypertable with 1-day chunks (Pitfall #4)', async () => {
    // RESEARCH §"Pitfall #4" verification: chunk_time_interval => INTERVAL '1 day'
    // gives 30 chunks for 30-day retention (vs default 7d which gives only 4 chunks
    // and forces drop_chunks to drop 25% of data per call).
    const result = await db.execute(sql`
      SELECT hypertable_name, column_name, time_interval::text AS time_interval, integer_interval::text AS integer_interval
      FROM timescaledb_information.dimensions
      WHERE hypertable_name = 'anon_generation_log'
    `);
    const rows = result.rows as unknown as DimensionRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.column_name).toBe('created_at');
    // TimescaleDB exposes the chunk interval as either time_interval (interval text)
    // or integer_interval (microseconds). 1 day = 86400000000 microseconds = '1 day'.
    const matches1Day =
      rows[0]?.time_interval === '1 day' ||
      rows[0]?.time_interval === '1 day 00:00:00' ||
      rows[0]?.integer_interval === '86400000000';
    expect(matches1Day, `expected 1-day chunk interval, got time=${rows[0]?.time_interval} integer=${rows[0]?.integer_interval}`).toBe(true);
  });

  it('Test 6: generations table includes cached_from_generation_id column', async () => {
    const result = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'generations' AND column_name = 'cached_from_generation_id'
    `);
    const rows = result.rows as unknown as ColumnRow[];
    expect(rows).toHaveLength(1);
  });

  it('Test 7: deployments table includes anon_session_id and expires_at columns', async () => {
    const result = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'deployments' AND column_name IN ('anon_session_id', 'expires_at')
      ORDER BY column_name
    `);
    const rows = result.rows as unknown as ColumnRow[];
    expect(rows.map((r) => r.column_name)).toEqual(['anon_session_id', 'expires_at']);
  });

  it('Test 8: anonymous_generations has at least 2 foreign keys (generation_id, claimed_by_org_id)', async () => {
    const result = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM information_schema.table_constraints
      WHERE constraint_type = 'FOREIGN KEY'
        AND table_name = 'anonymous_generations'
    `);
    const rows = result.rows as unknown as CountRow[];
    expect(rows[0]?.count).toBeGreaterThanOrEqual(2);
  });

  it('Test 9: all 5 expected indexes exist (anon_gen_session_idx, anon_gen_unclaimed_idx, anon_log_ip_time_idx, deploy_expires_idx, gen_cached_from_idx)', async () => {
    const result = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN (
        'anon_gen_session_idx',
        'anon_gen_unclaimed_idx',
        'anon_log_ip_time_idx',
        'deploy_expires_idx',
        'gen_cached_from_idx'
      )
      ORDER BY indexname
    `);
    const rows = result.rows as unknown as IndexRow[];
    expect(rows.map((r) => r.indexname)).toEqual([
      'anon_gen_session_idx',
      'anon_gen_unclaimed_idx',
      'anon_log_ip_time_idx',
      'deploy_expires_idx',
      'gen_cached_from_idx',
    ]);
  });
});
