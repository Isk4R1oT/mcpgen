// apps/tenant-worker-runner/src/db.ts
//
// Phase 6 — Drizzle client for the tenant-worker-runner supervisor. Reads
// DATABASE_URL from env (Neon dev locally; Hyperdrive in Phase 10 — same env-var
// name, different backing connection pool).
//
// Initialization is lazy on first DB call so import-time evaluation does not
// throw when DATABASE_URL is unset (e.g. unit tests that mock `db.select`).
// Mirrors apps/dispatch/src/db.ts.

import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';

let _client: NeonHttpDatabase | null = null;

function getClient(): NeonHttpDatabase {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. tenant-worker-runner requires Postgres connectivity ' +
        '(set DATABASE_URL in .env.local for local dev or via Hyperdrive binding in Phase 10).',
    );
  }
  _client = drizzle(neon(url));
  return _client;
}

export const db = new Proxy({} as NeonHttpDatabase, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
}) as NeonHttpDatabase;
