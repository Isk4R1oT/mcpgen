// tests/runtime/stored-credentials-aes.test.ts
//
// Phase 6 Wave 3 (RUN-04 / T-6-INFRA-05) — SQL injection mitigation test.
// Bun-only (depends on bun:sqlite); runs via `pnpm test:bun` not vitest.
//
// Asserts a malicious tenantId payload cannot drop the tenant_creds table —
// parameterised queries (`?` placeholders) in stored.ts neutralise the
// injection. Uses the bun:test API which is vitest-compatible.

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

import {
  _clearStoredCredsForTest,
  encryptStored,
} from '@mcpgen/runtime/auth/stored';

function randomB64(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf));
}

const SAVED_KEK = process.env.RUNTIME_KEK;
const SAVED_DB = process.env.STORED_CREDS_DB;

beforeAll(() => {
  process.env.RUNTIME_KEK = randomB64(32);
});

afterAll(() => {
  if (SAVED_KEK === undefined) delete process.env.RUNTIME_KEK;
  else process.env.RUNTIME_KEK = SAVED_KEK;
  if (SAVED_DB === undefined) delete process.env.STORED_CREDS_DB;
  else process.env.STORED_CREDS_DB = SAVED_DB;
});

describe('stored credentials — SQL injection mitigation', () => {
  it('malicious tenantId cannot drop tenant_creds (parameterised queries enforce safety)', async () => {
    _clearStoredCredsForTest();
    const malicious = "alice'; DROP TABLE tenant_creds; --";
    // Should NOT throw — the bind is treated as a literal value, not SQL.
    await encryptStored(malicious, 'github', 'ghp_xyz');

    // Re-open the same SQLite file the stored module is using (default path).
    const dbPath = process.env.STORED_CREDS_DB ?? 'stored-creds.sqlite';
    const probe = new Database(dbPath);
    // The `AS c` alias is REQUIRED — bun:sqlite's `.get()` returns the row keyed
    // by the literal column expression, so without `AS c` the access path is
    // `row['count(*)']`, which produces a TypeError when written as `.c`
    // (per WARNING-6 in the plan).
    const row = probe
      .query('SELECT count(*) AS c FROM sqlite_master WHERE name = ?')
      .get('tenant_creds') as { c: number } | null;
    expect(row).not.toBeNull();
    expect(row!.c).toBe(1);
    probe.close();
  });
});
