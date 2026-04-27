// apps/dispatch/src/db.ts
//
// Phase 6 — Drizzle client for the dispatch worker. Reads DATABASE_URL from
// env (Neon dev locally; Hyperdrive in Phase 10 — same env-var name, different
// backing connection pool).
//
// Per CONTEXT D-02: Postgres `deployments` table is the source of truth for
// tenant routing; the in-memory `tenant-cache.ts` puts a 5-min TTL in front.
//
// Initialization is lazy on first DB call so import-time evaluation does not
// throw when DATABASE_URL is unset (e.g. in unit tests that mock `db.select`).

import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';

let _client: NeonHttpDatabase | null = null;

function getClient(): NeonHttpDatabase {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Dispatch tenant lookup requires Postgres connectivity (set DATABASE_URL in .env.local for local dev or via Hyperdrive binding in Phase 10).',
    );
  }
  _client = drizzle(neon(url));
  return _client;
}

// Proxy preserves the `db.select(...)` call shape used in middleware while
// deferring the neon() call to first use. Tests can `vi.spyOn(db, 'select')`
// without ever triggering the underlying neon() initialization.
export const db = new Proxy({} as NeonHttpDatabase, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
}) as NeonHttpDatabase;
