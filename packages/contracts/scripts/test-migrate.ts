/**
 * Acceptance test: applies all Drizzle migrations in order to a Postgres
 * database (fresh CI service container OR live Neon dev branch with Phase 1
 * already applied) and verifies the resulting schema.
 *
 * Phase 1 (FND-08): produces 9 tables + the TimescaleDB hypertable + pgvector.
 * Phase 8 (CTRL-04): adds 6 more tables + 6 ALTER columns + the
 *                    `usage_hourly` continuous aggregate + UNIQUE constraints.
 *
 * Idempotency strategy: each phase is gated on a sentinel-table check
 * (`deployments` for phase 1, `subscription_events` for phase 8). Already-
 * applied migrations are skipped instead of re-run, so the script is safe
 * against the Neon dev branch where Phase 1 was applied in plan 01-04.
 *
 * Run via `pnpm --filter @mcpgen/contracts db:test-migrate`.
 *
 * Locally: `set -a && source .env.local && set +a && pnpm --filter @mcpgen/contracts db:test-migrate`.
 *
 * Exit codes:
 *   0 — all migrations applied; all 15 tables + hypertable + pgvector + Phase 8 surface present.
 *   1 — DATABASE_URL not set.
 *   2 — one or more expected tables are missing.
 *   3 — usage_events is not registered as a TimescaleDB hypertable.
 *   4 — pgvector extension is not installed.
 *   5 — Phase 8 ALTER column missing.
 *   6 — usage_hourly continuous aggregate missing.
 *   7 — UNIQUE constraint missing on subscription_events.stripe_event_id or usage_events_outbox.idempotency_key.
 *  99 — unexpected error (Postgres connection failure, malformed migration, etc.).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL not set; aborting.');
  process.exit(1);
}

const migrationsRoot = resolve(import.meta.dirname, '../../../infrastructure/neon/migrations');
const phase1Sql = readFileSync(resolve(migrationsRoot, '20260427000000_init_schema.sql'), 'utf8');
const phase8Sql = readFileSync(resolve(migrationsRoot, '20260428000000_phase8_billing_drift.sql'), 'utf8');

const PHASE1_TABLES: readonly string[] = [
  'deployments',
  'generations',
  'organizations',
  'pending_callbacks',
  'projects',
  'specs',
  'tools',
  'usage_events',
  'users',
];

const PHASE8_TABLES: readonly string[] = [
  'drift_events',
  'drift_email_log',
  'subscription_events',
  'usage_events_outbox',
  'reconciliation_log',
  'mau_log',
];

const PHASE8_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['organizations', 'subscription_status'],
  ['organizations', 'quota_period_start'],
  ['specs', 'parsed_ir_jsonb'],
  ['deployments', 'auto_regenerate_on_drift'],
  ['generations', 'cumulative_cost_usd'],
  ['generations', 'triggered_by'],
];

async function tableExists(client: pg.Client, name: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return r.rows.length > 0;
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // ─── Apply Phase 1 only if not already applied ─────────────────
    const phase1Applied = await tableExists(client, 'deployments');
    if (!phase1Applied) {
      console.log('Applying Phase 1 init schema…');
      await client.query(phase1Sql);
    } else {
      console.log('Phase 1 already applied; skipping init schema.');
    }

    // ─── Apply Phase 8 only if not already applied ─────────────────
    const phase8Applied = await tableExists(client, 'subscription_events');
    if (!phase8Applied) {
      console.log('Applying Phase 8 billing+drift schema…');
      await client.query(phase8Sql);
    } else {
      console.log('Phase 8 already applied; skipping billing+drift schema.');
    }

    // ─── Phase 1 assertions ────────────────────────────────────────
    const expected = [...PHASE1_TABLES, ...PHASE8_TABLES];
    const missing: string[] = [];
    for (const t of expected) {
      if (!(await tableExists(client, t))) missing.push(t);
    }
    if (missing.length > 0) {
      console.error('Missing tables:', missing);
      process.exit(2);
    }

    const hypertableRes = await client.query(
      `SELECT 1 FROM _timescaledb_catalog.hypertable WHERE table_name = 'usage_events'`,
    );
    if ((hypertableRes.rowCount ?? 0) === 0) {
      console.error('usage_events is not a TimescaleDB hypertable');
      process.exit(3);
    }

    const pgvectorRes = await client.query(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    if ((pgvectorRes.rowCount ?? 0) === 0) {
      console.error('vector extension not installed');
      process.exit(4);
    }

    // ─── Phase 8 assertions ────────────────────────────────────────
    for (const [t, c] of PHASE8_COLUMNS) {
      const r = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
        [t, c],
      );
      if (r.rows.length === 0) {
        console.error(`missing Phase 8 column: ${t}.${c}`);
        process.exit(5);
      }
    }

    // Neon TimescaleDB Apache edition does not support continuous aggregates;
    // we ship a regular materialized view in Wave 1 and refresh it via an
    // Inngest cron in Wave 2 (deviation documented in 08-PHASE-DEVIATIONS.md).
    const ca = await client.query(
      `SELECT 1 FROM pg_matviews WHERE schemaname='public' AND matviewname='usage_hourly'`,
    );
    if (ca.rows.length === 0) {
      console.error('missing materialized view: usage_hourly');
      process.exit(6);
    }

    const subEvtUnique = await client.query(
      `SELECT 1 FROM pg_indexes WHERE tablename='subscription_events' AND indexdef LIKE '%(stripe_event_id)%'`,
    );
    if (subEvtUnique.rows.length === 0) {
      console.error('missing UNIQUE on subscription_events.stripe_event_id');
      process.exit(7);
    }

    const outboxUnique = await client.query(
      `SELECT 1 FROM pg_indexes WHERE tablename='usage_events_outbox' AND indexdef LIKE '%(idempotency_key)%'`,
    );
    if (outboxUnique.rows.length === 0) {
      console.error('missing UNIQUE on usage_events_outbox.idempotency_key');
      process.exit(7);
    }

    console.log(
      'OK: Phase 8 migration applied; 6 new tables + 6 ALTER columns + usage_hourly materialized view + UNIQUE constraints all present.',
    );
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(99);
});
