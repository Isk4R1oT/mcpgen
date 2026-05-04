/**
 * Versioned-migration runner for the @mcpgen/contracts schema.
 *
 * Why a custom script (not just `drizzle-kit migrate`)
 * ---------------------------------------------------
 * Phase 1 bootstrapped this DB via `drizzle-kit push --force` (per
 * `infrastructure/neon/README.md` §"Running the migration locally"), and
 * subsequent schema changes shipped as versioned SQL migrations in
 * `infrastructure/neon/migrations/`. That hybrid history left the journal
 * table `drizzle.__drizzle_migrations` empty: a vanilla `drizzle-kit migrate`
 * would treat ALL files as unapplied and try to re-run the init schema on
 * top of existing tables (→ duplicate-table errors).
 *
 * The Drizzle team acknowledges this gap (see GitHub Discussion #1604,
 * "Migrate after push in local dev database"). The community-validated fix
 * — also recommended in their migration docs — is to **baseline** the
 * journal: insert hash entries for migrations the DB already has applied
 * (verified via sentinel-table / sentinel-column checks), then call
 * `migrate()` which uses high-water-mark logic and only runs the missing
 * tail (here: phase10 matview refresh, phase09.1 anon flow, phase11
 * playground).
 *
 * Why we DO NOT use `drizzle-kit push` here
 * -----------------------------------------
 * The Drizzle TS schema in `db-schema.ts` does not model the Phase 8
 * `usage_hourly` materialized view, the CHECK constraints on
 * `subscription_events.status` / `drift_events.status` / `generations.
 * triggered_by`, or the partial indexes (`generations_status_idx`,
 * `usage_events_outbox_pending_idx`). These were added by manual SQL in
 * `20260428000002_phase8_billing_drift.sql` because Drizzle Kit doesn't
 * emit them natively. A `push --force` would diff them as drift and DROP
 * them — which would silently break the `stripeMetersEmit` Inngest cron
 * that reads `usage_hourly` every 5 min.
 *
 * Therefore versioned migrations (this script) are the only safe forward
 * path on this DB.
 *
 * Run via:
 *   set -a && source .env.local && set +a
 *   pnpm --filter @mcpgen/contracts db:migrate
 *
 * The script is **idempotent**: re-running on an already-migrated DB is a
 * no-op (every migration's hash is already in the journal).
 *
 * References:
 *   - `infrastructure/neon/README.md` §"Running the migration locally"
 *     (the original `drizzle-kit push` bootstrap workflow).
 *   - GitHub: drizzle-team/drizzle-orm Discussion #1604 (canonical
 *     baselining recipe).
 *   - `docs/decisions/001-drizzle-timestamp-prefix-native-format.md`
 *     (timestamp-prefix `YYYYMMDDHHMMSS_<name>.sql`).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  console.error('DATABASE_URL not set; aborting.');
  process.exit(1);
}

// Path is resolved relative to this script (`packages/contracts/scripts/`).
const migrationsFolder = resolve(import.meta.dirname, '../../../infrastructure/neon/migrations');
const journalPath = resolve(migrationsFolder, 'meta/_journal.json');

interface JournalEntry {
  readonly idx: number;
  readonly when: number;
  readonly tag: string;
  readonly breakpoints: boolean;
}

interface Journal {
  readonly version: string;
  readonly dialect: string;
  readonly entries: ReadonlyArray<JournalEntry>;
}

// Sentinel = a tiny SQL probe that returns true iff this migration is
// already applied to the live DB. The sentinel is chosen to be a structural
// artifact each migration creates — a table, a column, or (for matview
// refreshes that don't change schema) the matview being populated.
//
// `tag` MUST match a journal entry tag exactly (Drizzle's `readMigrationFiles`
// requires the `<tag>.sql` file to exist).
type SentinelKind =
  | { readonly kind: 'table'; readonly name: string }
  | { readonly kind: 'column'; readonly table: string; readonly column: string }
  | { readonly kind: 'matview_populated'; readonly name: string };

interface SentinelDef {
  readonly tag: string;
  readonly sentinel: SentinelKind;
}

const SENTINELS: ReadonlyArray<SentinelDef> = [
  // Phase 1 (FND-08) — first migration that creates the canonical 9 tables.
  { tag: '20260427000000_init_schema', sentinel: { kind: 'table', name: 'deployments' } },
  // Adds `deployments.local_port` for local-dev port assignment (D-08 follow-up).
  { tag: '20260428000000_add_local_port_to_deployments', sentinel: { kind: 'column', table: 'deployments', column: 'local_port' } },
  // Adds `usage_events.idempotency_key` for Stripe Meters dedup.
  { tag: '20260428000001_add_idempotency_key_to_usage_events', sentinel: { kind: 'column', table: 'usage_events', column: 'idempotency_key' } },
  // Phase 8 (CTRL-04) — billing + drift tables.
  { tag: '20260428000002_phase8_billing_drift', sentinel: { kind: 'table', name: 'subscription_events' } },
  // Phase 9 (CTRL-08 / D-19) — public quality badge column.
  { tag: '20260430000000_phase9_badge_public', sentinel: { kind: 'column', table: 'deployments', column: 'public_badge' } },
  // Phase 10 (CTRL-08 / D-06) — initial REFRESH for the `usage_hourly` matview.
  // No schema change, so the sentinel checks the matview is populated.
  // This means re-running the script once `migrate()` has applied phase10
  // sees the matview as populated and treats phase10 as a separate journal
  // baseline candidate. We DO NOT include phase10 in the baseline pass —
  // we let `migrate()` apply it for real (REFRESH is idempotent).
  // Phase 09.1 (D-09 / D-11) — anonymous-hero-flow tables.
  // Phase 11 — playground runs/tests.
  // (Both intentionally omitted from baseline; `migrate()` applies them.)
];

async function probeSentinel(client: pg.Client, sentinel: SentinelKind): Promise<boolean> {
  if (sentinel.kind === 'table') {
    const r = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS exists`,
      [sentinel.name],
    );
    return r.rows[0]?.exists ?? false;
  }
  if (sentinel.kind === 'column') {
    const r = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2) AS exists`,
      [sentinel.table, sentinel.column],
    );
    return r.rows[0]?.exists ?? false;
  }
  // matview_populated
  const r = await client.query<{ relispopulated: boolean }>(
    `SELECT relispopulated FROM pg_class WHERE relkind='m' AND relname=$1`,
    [sentinel.name],
  );
  return r.rows[0]?.relispopulated ?? false;
}

// Drizzle computes the journal hash as sha256(file_content). Mirrors
// `readMigrationFiles` in drizzle-orm/migrator (verified against
// node_modules/.pnpm/drizzle-orm@0.45.2/.../migrator.js).
function computeMigrationHash(tag: string): string {
  const filePath = resolve(migrationsFolder, `${tag}.sql`);
  const content = readFileSync(filePath, 'utf8');
  return createHash('sha256').update(content).digest('hex');
}

async function main(): Promise<void> {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
  const tagToWhen = new Map<string, number>(journal.entries.map((e) => [e.tag, e.when]));

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // ─── Phase 0: ensure required PG extensions are installed ───────
    // Phase 09.1 (`anon_flow.sql`) calls `gen_random_bytes()` from pgcrypto
    // when seeding the daily-salt row. The extension ships with Neon but
    // requires explicit CREATE EXTENSION (matches the vector + timescaledb
    // pattern in `infrastructure/neon/README.md` §"One-time setup"). We
    // declare it here so a fresh dev branch self-heals on first migrate.
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    // ─── Phase 1: ensure the journal table exists ────────────────────
    // `migrate()` creates this lazily; we need it earlier to seed baselines.
    // Mirrors the DDL `migrate()` itself emits — kept in sync with
    // node_modules/.pnpm/drizzle-orm@0.45.2/.../node-postgres/migrator.js.
    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    // ─── Phase 2: probe sentinels, baseline applied migrations ───────
    const existingHashes = await client.query<{ hash: string }>(
      `SELECT hash FROM "drizzle"."__drizzle_migrations"`,
    );
    const known = new Set(existingHashes.rows.map((r) => r.hash));

    let baselined = 0;
    for (const def of SENTINELS) {
      const applied = await probeSentinel(client, def.sentinel);
      if (!applied) {
        console.log(`  ✘ ${def.tag} — sentinel missing; will be applied by migrate()`);
        continue;
      }
      const hash = computeMigrationHash(def.tag);
      if (known.has(hash)) {
        console.log(`  ✓ ${def.tag} — already in journal`);
        continue;
      }
      const when = tagToWhen.get(def.tag);
      if (when === undefined) {
        throw new Error(`Migration tag '${def.tag}' missing from journal _journal.json`);
      }
      await client.query(
        `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [hash, when],
      );
      console.log(`  ▸ ${def.tag} — baselined (hash=${hash.slice(0, 12)}…, when=${when})`);
      baselined += 1;
    }
    console.log(`\nBaseline complete: ${baselined} entries inserted.\n`);

    // ─── Phase 3: hand off to drizzle-orm migrate() ──────────────────
    // Reads journal, sees high-water-mark from the baselined entries, and
    // applies only migrations with folderMillis > lastApplied.created_at.
    // For us, that's phase10 / phase09.1 / phase11.
    console.log('Running drizzle migrate()…');
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    console.log('Migrations applied.\n');

    // ─── Phase 4: report final journal state ────────────────────────
    const final = await client.query<{ hash: string; created_at: string }>(
      `SELECT hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at`,
    );
    console.log(`Final journal: ${final.rows.length} migrations recorded`);
    for (const row of final.rows) {
      const tag = [...tagToWhen.entries()].find(([, w]) => String(w) === row.created_at)?.[0];
      console.log(`  - ${row.hash.slice(0, 12)}… ${tag ?? '(unknown tag)'} (${row.created_at})`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
