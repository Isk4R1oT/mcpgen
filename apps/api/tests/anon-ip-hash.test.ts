// apps/api/tests/anon-ip-hash.test.ts
//
// Phase 09.1 plan 05 Task 1 — TDD RED.
//
// Verifies the IP hashing primitives that will live in
// `apps/api/src/lib/anon-ip-hash.ts` (created in Task 2):
//
//   getCurrentSalts()      → returns { current, previous } SaltPair, cached 60s
//   hashIpForRateLimit(ip) → sha256(current_salt + ip), used on INSERT
//   hashIpsForLookup(ip)   → [sha256(current+ip), sha256(previous+ip)], 24h grace
//   extractRawIp(c)        → CF-Connecting-IP > x-forwarded-for[0] > 127.0.0.1
//   isLocalhostIp(ip)      → 127.0.0.1, ::1, 192.168.*, 10.*  (D-02 founder bypass)
//   __resetSaltCache()     → test-only helper to drop the in-memory cache
//
// All hash tests mock `../src/db.js` so we control the salt rows the helper
// reads (no DATABASE_URL dependency for the unit suite).
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §5 (lines 491-637)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md "Pitfall 5"
//     (lines 1434-1439 — salt-rotation race)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md "G-4" (line 1313)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-02 + D-11

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock db.js so getCurrentSalts() reads from a controllable store ───────
// `currentSalt` / `previousSalt` are mutated by individual test cases via the
// exported `__setMockSalts` helper. The mock factory returns a `db.execute`
// implementation that recognizes the `SELECT key, value FROM app_secrets ...`
// query and answers from the in-test store.

interface SaltStore {
  current: string | null;
  previous: string | null;
  selectCount: number;
}

const _saltStore: SaltStore = {
  current: 'salt_current_v1_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  previous: null,
  selectCount: 0,
};

vi.mock('../src/db.js', () => {
  function execute(_query: unknown): Promise<{ rows: unknown[] }> {
    _saltStore.selectCount++;
    const rows: { key: string; value: string }[] = [];
    if (_saltStore.current !== null) {
      rows.push({ key: 'daily_salt_current', value: _saltStore.current });
    }
    if (_saltStore.previous !== null) {
      rows.push({ key: 'daily_salt_previous', value: _saltStore.previous });
    }
    return Promise.resolve({ rows });
  }
  return { db: { execute } };
});

// Import AFTER vi.mock so the helper picks up the mocked db.
const {
  getCurrentSalts,
  hashIpForRateLimit,
  hashIpsForLookup,
  extractRawIp,
  isLocalhostIp,
  __resetSaltCache,
} = await import('../src/lib/anon-ip-hash.js');

// Hono Context type narrowing — we build a minimal stub that exposes the only
// surface extractRawIp uses (`c.req.header(name)`).
interface HeaderStub {
  req: { header: (name: string) => string | undefined };
}

function ctxWithHeaders(headers: Record<string, string>): HeaderStub {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    req: {
      header: (name: string) => lower[name.toLowerCase()],
    },
  };
}

// Reset cache + counter between cases so cache-TTL behavior is deterministic.
beforeEach(() => {
  _saltStore.current =
    'salt_current_v1_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  _saltStore.previous = null;
  _saltStore.selectCount = 0;
  __resetSaltCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hashIpForRateLimit + hashIpsForLookup (RESEARCH §5)', () => {
  // ─── hash test 1 ──────────────────────────────────────────────────────────
  it('returns 64-char lowercase hex sha256 string', async () => {
    const h = await hashIpForRateLimit('1.2.3.4');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  // ─── hash test 2 (cache + determinism) ────────────────────────────────────
  it('called twice within 60s cache TTL returns SAME hash AND does only ONE SELECT', async () => {
    const a = await hashIpForRateLimit('1.2.3.4');
    const b = await hashIpForRateLimit('1.2.3.4');
    expect(a).toBe(b);
    expect(_saltStore.selectCount).toBe(1);
  });

  // ─── hash test 3 (salt rotation invalidates cache via __reset) ────────────
  it('rotating the salt and resetting cache yields a DIFFERENT hash', async () => {
    const before = await hashIpForRateLimit('1.2.3.4');
    _saltStore.current = 'salt_current_v2_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    __resetSaltCache();
    const after = await hashIpForRateLimit('1.2.3.4');
    expect(after).not.toBe(before);
  });

  // ─── hash test 4 (lookup with no previous) ────────────────────────────────
  it('hashIpsForLookup returns array of length 1 when daily_salt_previous is NULL', async () => {
    _saltStore.previous = null;
    __resetSaltCache();
    const arr = await hashIpsForLookup('1.2.3.4');
    expect(arr).toHaveLength(1);
    expect(arr[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  // ─── hash test 5 (lookup with both salts; distinct hashes) ────────────────
  it('hashIpsForLookup returns 2 DIFFERENT hashes when both salts populated', async () => {
    _saltStore.previous =
      'salt_previous_v0_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    __resetSaltCache();
    const arr = await hashIpsForLookup('1.2.3.4');
    expect(arr).toHaveLength(2);
    expect(arr[0]).not.toBe(arr[1]);
    expect(arr[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(arr[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  // ─── hash test 6 (current-hash present in lookup output) ──────────────────
  it('hashIpForRateLimit value appears as the FIRST element of hashIpsForLookup', async () => {
    _saltStore.previous =
      'salt_previous_v0_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
    __resetSaltCache();
    const ipHashOnInsert = await hashIpForRateLimit('5.6.7.8');
    const lookup = await hashIpsForLookup('5.6.7.8');
    expect(lookup[0]).toBe(ipHashOnInsert);
  });

  // ─── hash test 7 (cache TTL — 1 SELECT within 60s, second SELECT after) ───
  it('cache TTL of 60s — within window 1 SELECT, after window second SELECT', async () => {
    vi.useFakeTimers();
    const baseTime = Date.now();
    vi.setSystemTime(baseTime);
    await getCurrentSalts();
    expect(_saltStore.selectCount).toBe(1);

    // Within TTL — no extra SELECT.
    vi.setSystemTime(baseTime + 30_000);
    await getCurrentSalts();
    expect(_saltStore.selectCount).toBe(1);

    // Past TTL — second SELECT.
    vi.setSystemTime(baseTime + 60_001);
    await getCurrentSalts();
    expect(_saltStore.selectCount).toBe(2);
  });
});

describe('extractRawIp (RESEARCH §5 + D-11 IP source rules)', () => {
  // ─── extract test 8 ───────────────────────────────────────────────────────
  it("returns CF-Connecting-IP value when header is set", () => {
    const c = ctxWithHeaders({ 'CF-Connecting-IP': '8.8.8.8' });
    expect(extractRawIp(c as never)).toBe('8.8.8.8');
  });

  // ─── extract test 9 ───────────────────────────────────────────────────────
  it("falls back to first hop of x-forwarded-for when CF-Connecting-IP absent", () => {
    const c = ctxWithHeaders({ 'x-forwarded-for': '5.6.7.8, 1.1.1.1' });
    expect(extractRawIp(c as never)).toBe('5.6.7.8');
  });

  // ─── extract test 10 ──────────────────────────────────────────────────────
  it('returns 127.0.0.1 when no proxy headers present (local dev fallback)', () => {
    const c = ctxWithHeaders({});
    expect(extractRawIp(c as never)).toBe('127.0.0.1');
  });
});

describe('isLocalhostIp (D-02 founder/CI bypass list)', () => {
  // ─── extract test 11 ──────────────────────────────────────────────────────
  it('classifies 127.0.0.1, ::1, 192.168.*, 10.* as localhost; everything else not', () => {
    expect(isLocalhostIp('127.0.0.1')).toBe(true);
    expect(isLocalhostIp('::1')).toBe(true);
    expect(isLocalhostIp('192.168.1.42')).toBe(true);
    expect(isLocalhostIp('10.0.0.5')).toBe(true);
    expect(isLocalhostIp('1.2.3.4')).toBe(false);
    expect(isLocalhostIp('8.8.8.8')).toBe(false);
    expect(isLocalhostIp('172.16.0.1')).toBe(false); // intentionally NOT in bypass list
  });
});
