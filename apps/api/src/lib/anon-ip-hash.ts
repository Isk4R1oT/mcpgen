// apps/api/src/lib/anon-ip-hash.ts
//
// Phase 09.1 plan 05 — IP hashing primitives for the 1/IP/24h anon rate limit.
//
// Design (verbatim from RESEARCH §5 lines 559-625):
//   - Daily salt rotation (00:00 UTC, Plan 09.1-10) keeps two app_secrets rows
//     live: `daily_salt_current` and `daily_salt_previous`. Both are valid
//     for the 24h grace window described in G-4 (line 1313 of RESEARCH).
//   - On INSERT (rate-limit log row), the IP is hashed under the CURRENT salt
//     only — `hashIpForRateLimit(ip)`.
//   - On SELECT (rate-limit count check), the IP is hashed under BOTH salts
//     and either match counts as a prior request — `hashIpsForLookup(ip)`.
//     This closes the salt-rotation race (Pitfall #5): a request that
//     completed at 23:59:59 against salt_v1 is still found at 00:00:01 when
//     salt_v2 has just been written, because the lookup includes salt_v1
//     (now in `daily_salt_previous`) for the next 24h.
//   - In-memory cache (60s TTL) on getCurrentSalts() avoids a DB round-trip on
//     every anon request — the salts only change at 00:00 UTC daily, so a 60s
//     cache is a 1440x reduction in salt SELECTs per day at zero correctness
//     cost.
//
// IP source precedence (D-11 + extractRawIp):
//   1. CF-Connecting-IP — set by Cloudflare at the edge; client cannot spoof.
//   2. x-forwarded-for first hop — local-dev fallback only; never trusted in
//      production (CF strips client-supplied versions of these headers).
//   3. 127.0.0.1 — last resort, also triggers the localhost bypass below.
//
// D-02 founder/CI bypass:
//   isLocalhostIp() returns true for 127.0.0.1, ::1, 192.168.*, 10.*. The
//   middleware uses this to skip the gate so `pnpm test` and local-stack
//   smoke runs are never throttled. 172.16.0.0/12 is intentionally NOT in
//   the list — VPN exit nodes commonly land in that range and we want them
//   subject to the gate.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §5 (lines 491-637)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md "Pitfall 5"
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md "G-4" (line 1313)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-02 + D-11

import type { Context } from 'hono';
import { sql } from 'drizzle-orm';

import { db } from '../db.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SaltPair {
  current: string;
  previous: string | null;
}

interface SaltCacheEntry {
  pair: SaltPair;
  expires_at: number;
}

// ─── Module-level cache (resettable for tests via __resetSaltCache) ────────

let cachedSalts: SaltCacheEntry | null = null;
const SALT_CACHE_TTL_MS = 60_000;

interface SaltRow {
  key: string;
  value: string;
}

// ─── getCurrentSalts ───────────────────────────────────────────────────────
//
// Fetches the current + previous daily salts from `app_secrets`, caching the
// result for 60s to avoid hammering the DB on every anon request. The cache
// is invalidated automatically after TTL OR explicitly via __resetSaltCache
// (for tests + the daily-rotation cron).

export async function getCurrentSalts(): Promise<SaltPair> {
  const now = Date.now();
  if (cachedSalts !== null && cachedSalts.expires_at > now) {
    return cachedSalts.pair;
  }
  const r = await db.execute(sql`
    SELECT key, value FROM app_secrets
    WHERE key IN ('daily_salt_current', 'daily_salt_previous')
  `);
  const rows = r.rows as unknown as SaltRow[];
  const current = rows.find((x) => x.key === 'daily_salt_current')?.value;
  if (!current) {
    // Migration `20260501010000_phase09_1_anon_flow.sql` seeds this row with
    // `encode(gen_random_bytes(32), 'hex')`. Missing the row means the
    // migration has not been applied — fail loudly rather than silently
    // hashing under an empty salt (which would collapse all anon IPs into
    // the same hash and defeat the rate-limiter).
    throw new Error(
      'app_secrets.daily_salt_current row is missing; phase 09.1 migration not applied',
    );
  }
  const pair: SaltPair = {
    current,
    previous: rows.find((x) => x.key === 'daily_salt_previous')?.value ?? null,
  };
  cachedSalts = { pair, expires_at: now + SALT_CACHE_TTL_MS };
  return pair;
}

// ─── hashIpForRateLimit ────────────────────────────────────────────────────
//
// Used on INSERT into anon_generation_log. Always uses the current salt only
// — never the previous — so newly-inserted rows are tagged with the salt
// that is "in effect right now". The lookup path (hashIpsForLookup) handles
// the race window where a row tagged with yesterday's salt should still
// count.
//
// Hash format: lowercase hex sha256(`${salt}:${rawIp}`).

export async function hashIpForRateLimit(rawIp: string): Promise<string> {
  const { current } = await getCurrentSalts();
  return sha256Hex(`${current}:${rawIp}`);
}

// ─── hashIpsForLookup ──────────────────────────────────────────────────────
//
// Used on SELECT — returns BOTH current and previous hashes (24h grace per
// RESEARCH G-4). Caller passes the array straight into a SQL `WHERE ip_hash
// = ANY($hashes)` clause. Length is 1 when previous is NULL (first day after
// migration) and 2 once the rotation cron has run at least once.

export async function hashIpsForLookup(rawIp: string): Promise<string[]> {
  const { current, previous } = await getCurrentSalts();
  const salts: string[] = [];
  if (current) salts.push(current);
  if (previous !== null && previous !== '') salts.push(previous);
  const hashes: string[] = [];
  for (const salt of salts) {
    hashes.push(await sha256Hex(`${salt}:${rawIp}`));
  }
  return hashes;
}

// ─── extractRawIp ──────────────────────────────────────────────────────────
//
// Reads the request's source IP from the headers Cloudflare populates. The
// Context generic is left wide deliberately — every caller route would
// otherwise need to extend its Bindings just to compile this read.

export function extractRawIp(c: Context): string {
  // CF-Connecting-IP is set by Cloudflare at the edge and CANNOT be spoofed
  // by the client (CF strips any client-supplied version).
  const cfIp = c.req.header('CF-Connecting-IP');
  if (cfIp) return cfIp;
  // Local-dev fallback: x-forwarded-for first hop.
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0];
    if (first !== undefined) return first.trim();
  }
  // Last resort: localhost (also triggers the bypass below).
  return '127.0.0.1';
}

// ─── isLocalhostIp ─────────────────────────────────────────────────────────
//
// D-02 founder/CI bypass list. Anything in this set skips the rate-limit
// gate so `pnpm test` and local-stack smoke runs remain unthrottled.
// 172.16.0.0/12 is intentionally NOT included — VPN exit nodes commonly
// land there and we want them subject to the gate.

export function isLocalhostIp(ip: string): boolean {
  if (ip === '127.0.0.1') return true;
  if (ip === '::1') return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('10.')) return true;
  return false;
}

// ─── __resetSaltCache (test-only) ──────────────────────────────────────────
//
// Drops the in-memory cache so a test can simulate "salt rotation just
// happened" without sleeping 60 seconds. Also called by the rotation cron
// (Plan 09.1-10) immediately after writing the new salt rows to ensure the
// next request sees the fresh values.

export function __resetSaltCache(): void {
  cachedSalts = null;
}

// ─── Internal: sha256 hex helper ───────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
