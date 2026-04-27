// packages/runtime-sdk/src/runtime/usage/fallback.ts
//
// Phase 6 Wave 4 (per D-12 / pitfall #13) — usage-event fallback bucket.
// When Inngest dev is unreachable (or returns non-2xx), the tenant Worker
// writes the event here; the Inngest cron `usage-fallback-drain-v1` reads
// + deletes every 5 min. Local-only — Phase 10 deletes this file (CF Queue
// replaces it).
//
// Backed by bun:sqlite — same pattern as Wave-3 stored credentials.

import { Database } from 'bun:sqlite';

import type { UsageEvent } from '@mcpgen/contracts';

const db = new Database(process.env.USAGE_FALLBACK_DB ?? 'usage-fallback.sqlite');
db.exec(`
  CREATE TABLE IF NOT EXISTS usage_fallback (
    idempotency_key TEXT PRIMARY KEY,
    event_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

export function writeFallback(event: UsageEvent): void {
  db.query(
    'INSERT OR REPLACE INTO usage_fallback (idempotency_key, event_json, created_at) VALUES (?, ?, ?)',
  ).run(event.idempotency_key, JSON.stringify(event), Date.now());
}

export function readFallback(limit = 1000): ReadonlyArray<UsageEvent> {
  const rows = db
    .query('SELECT event_json FROM usage_fallback ORDER BY created_at LIMIT ?')
    .all(limit) as { event_json: string }[];
  return rows.map((r) => JSON.parse(r.event_json) as UsageEvent);
}

export function deleteFallback(idempotencyKey: string): void {
  db.query('DELETE FROM usage_fallback WHERE idempotency_key = ?').run(idempotencyKey);
}

export function _clearFallbackForTest(): void {
  db.exec('DELETE FROM usage_fallback');
}
