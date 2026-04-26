/**
 * FND-08 acceptance test: the first Drizzle migration applies cleanly to a
 * fresh Postgres database (or any throwaway dev branch) and produces all 9
 * tables + the TimescaleDB hypertable + the pgvector extension.
 *
 * Run via `pnpm --filter @mcpgen/contracts db:test-migrate`.
 *
 * Locally: `set -a && source .env.local && set +a && pnpm --filter @mcpgen/contracts db:test-migrate`.
 * In CI: the ops job in `main-ci.yml` declares a Postgres service container with
 * timescaledb + pgvector pre-installed and exports DATABASE_URL pointed at it.
 *
 * Exit codes:
 *   0 — migration applied cleanly; all 9 tables + hypertable + pgvector present.
 *   1 — DATABASE_URL not set.
 *   2 — one or more expected tables are missing.
 *   3 — usage_events is not registered as a TimescaleDB hypertable.
 *   4 — pgvector extension is not installed.
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

const migrationPath = resolve(
  import.meta.dirname,
  '../../../infrastructure/neon/migrations/20260427000000_init_schema.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

const expectedTables: readonly string[] = [
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

interface TableRow {
  table_name: string;
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(migration);

    const tablesRes = await client.query<TableRow>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const actual: readonly string[] = tablesRes.rows.map((r) => r.table_name).sort();
    const missing: readonly string[] = expectedTables.filter((t) => !actual.includes(t));
    if (missing.length > 0) {
      console.error('Missing tables:', missing);
      process.exit(2);
    }

    // Verify hypertable
    const hypertableRes = await client.query(
      `SELECT 1 FROM _timescaledb_catalog.hypertable WHERE table_name = 'usage_events'`,
    );
    if ((hypertableRes.rowCount ?? 0) === 0) {
      console.error('usage_events is not a TimescaleDB hypertable');
      process.exit(3);
    }

    // Verify pgvector extension
    const pgvectorRes = await client.query(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    if ((pgvectorRes.rowCount ?? 0) === 0) {
      console.error('vector extension not installed');
      process.exit(4);
    }

    console.log(
      'OK: migration applied; all 9 tables present; usage_events is a hypertable; pgvector enabled.',
    );
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(99);
});
