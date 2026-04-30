// apps/api/tests/migrations/badge-public.test.ts
//
// Phase 9 Plan 02 (D-19 / CTRL-08) — verifies that migration
// `20260430000000_phase9_badge_public.sql` has been applied to the live dev
// DB and that the Drizzle schema source agrees on the column shape.
//
// Tier:
//   - Live-DB tests (Test 1–4) require DATABASE_URL; skip cleanly when unset
//     (preserves D-01 empty-env no-op pattern).
//   - Static-source test (Test 5) always runs (no DB needed).
//
// Resume signal: Wave 2 BFF endpoint plans 09-03 / 09-04 read this column.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';

import { db } from '../../src/db.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SRC = readFileSync(
  resolve(HERE, '../../../../packages/contracts/src/db-schema.ts'),
  'utf-8',
);

interface ColumnInfoRow {
  column_name: string;
  data_type: string;
  column_default: string | null;
  is_nullable: 'YES' | 'NO';
}

describe.skipIf(!process.env['DATABASE_URL'])('badge-public migration (live DB)', () => {
  it('Test 1: information_schema returns exactly one public_badge column on deployments', async () => {
    const result = await db.execute(sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'deployments' AND column_name = 'public_badge'
    `);
    const rows = result.rows as unknown as ColumnInfoRow[];
    expect(rows).toHaveLength(1);
  });

  it('Test 2: column data_type is boolean', async () => {
    const result = await db.execute(sql`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'deployments' AND column_name = 'public_badge'
    `);
    const rows = result.rows as unknown as ColumnInfoRow[];
    expect(rows[0]?.data_type).toBe('boolean');
  });

  it('Test 3: column default is false', async () => {
    const result = await db.execute(sql`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'deployments' AND column_name = 'public_badge'
    `);
    const rows = result.rows as unknown as ColumnInfoRow[];
    expect(rows[0]?.column_default).toBe('false');
  });

  it('Test 4: column is NOT NULL', async () => {
    const result = await db.execute(sql`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'deployments' AND column_name = 'public_badge'
    `);
    const rows = result.rows as unknown as ColumnInfoRow[];
    expect(rows[0]?.is_nullable).toBe('NO');
  });
});

describe('badge-public migration (static source contract)', () => {
  it('Test 5: packages/contracts/src/db-schema.ts contains public_badge', () => {
    expect(SCHEMA_SRC).toContain('public_badge');
  });
});
