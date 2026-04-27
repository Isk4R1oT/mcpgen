// apps/inngest-dev/src/db.ts
//
// Phase 6 Wave 4 — Drizzle Postgres client (Neon dev locally; Hyperdrive in
// Phase 10 — same env-var name). Lazy initialization so import-time evaluation
// does not throw when DATABASE_URL is unset (e.g. in unit tests that mock
// `db.execute`).

import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';

let _client: NeonHttpDatabase | null = null;

function getClient(): NeonHttpDatabase {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. inngest-dev requires Postgres connectivity (set DATABASE_URL in .env.local).',
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
