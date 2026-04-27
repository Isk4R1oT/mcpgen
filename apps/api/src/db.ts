// apps/api/src/db.ts
//
// FND-08 carry-forward: Drizzle ORM client init.
// Local Bun: uses pooled DATABASE_URL via @neondatabase/serverless HTTP driver.
// Migrations only: use DATABASE_URL_UNPOOLED (per Phase 1 PHASE-DEVIATIONS rev 2; RESEARCH §20 Q5).

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '@mcpgen/contracts/db-schema';

function makeDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Lazy: any actual query throws at first use; tests that don't query don't need DB.
    return drizzle(neon('postgresql://invalid:invalid@localhost:5432/invalid'), { schema });
  }
  return drizzle(neon(url), { schema });
}

export const db = makeDb();
export type DbClient = typeof db;
