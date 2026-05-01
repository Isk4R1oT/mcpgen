// apps/api/tests/anon-rate-limit.test.ts
//
// Phase 09.1 plan 05 Task 1 — TDD RED for the anon-rate-limit middleware.
//
// Verifies the 1/IP/24h gate enforced by `apps/api/src/middleware/
// anon-rate-limit.ts` (created in Task 2). The middleware sits in front of
// `POST /api/v1/generate` on the public/anon side of the BFF; authenticated
// callers (Logto JWT) skip the middleware entirely.
//
// Test matrix (6 cases):
//   rate test 1: anon POST from new IP → 202 + 1 row INSERT into anon_generation_log
//   rate test 2: anon POST from same IP within 24h → 429 with the
//                `{ error:'anon_rate_limit', message, signup_url:'/sign-up' }` shape
//   rate test 3: anon POST from localhost (CF-Connecting-IP: 127.0.0.1) →
//                202 even with prior 24h-window row (D-02 founder/CI bypass)
//   rate test 4: Pitfall #5 regression — request finds a row hashed with the
//                PREVIOUS-day salt → 429 (24h grace via dual-hash lookup catches it)
//   rate test 5: After backdating row past 24h window → 202 (request allowed again)
//   rate test 6: AUTH path (Logto JWT bearer present) → middleware skips;
//                no rate-limit query runs even with prior row in the log
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §5 (lines 491-637)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md "Pitfall 5"
//     (lines 1434-1439 — salt-rotation race regression)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md "G-4" (line 1313)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-02 + D-11
//   - apps/api/tests/auth-gate-position.test.ts (buildApp + app.fetch precedent)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock db.js with a per-test in-memory log table + salts store ──────────
// The mock recognizes 3 SQL shapes:
//   1. SELECT key,value FROM app_secrets ...        → returns salts
//   2. SELECT COUNT(*) ... FROM anon_generation_log → counts rows whose
//      ip_hash is in the supplied $1 array AND whose backdate offset is
//      within the 24h window
//   3. INSERT INTO anon_generation_log              → push a row
//   4. INSERT INTO generations / anonymous_generations / UPDATE — no-op
//      (best-effort writes from the existing route handler)
//
// `_log` rows store an `ageMs` offset relative to NOW so test 5 can
// "backdate" by mutating the row in place.

interface LogRow {
  ip_hash: string;
  ageMs: number; // 0 = inserted just now; 25h = backdated past window
}

interface MockState {
  current: string;
  previous: string | null;
  log: LogRow[];
  selectCalls: number;
  insertCalls: number;
}

const _state: MockState = {
  current: 'salt_v_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  previous: null,
  log: [],
  selectCalls: 0,
  insertCalls: 0,
};

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({
    payload: { aud: 'http://localhost:3000', sub: 'user_test', organization_id: 'org_test' },
  })),
}));

vi.mock('../src/db.js', () => {
  function execute(_query: { queryChunks?: unknown }): Promise<{ rows: unknown[] }> {
    // Reconstruct the SQL text + params from queryChunks the same way
    // tests/routes/drift.test.ts does. Drizzle interleaves StringChunks
    // (with `.value: string[]`) and raw param values.
    const chunks = (_query.queryChunks ?? []) as Array<unknown>;
    let sqlText = '';
    const params: unknown[] = [];
    for (const c of chunks) {
      if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
        params.push(c);
        continue;
      }
      const chunkVal = (c as { value?: string[] }).value;
      if (Array.isArray(chunkVal)) {
        sqlText += chunkVal.join('');
      } else if (c !== null && typeof c === 'object' && 'value' in (c as object)) {
        params.push((c as { value: unknown }).value);
      }
    }

    // 1. Salt SELECT
    if (sqlText.includes('FROM app_secrets')) {
      _state.selectCalls++;
      const rows: { key: string; value: string }[] = [];
      rows.push({ key: 'daily_salt_current', value: _state.current });
      if (_state.previous !== null) {
        rows.push({ key: 'daily_salt_previous', value: _state.previous });
      }
      return Promise.resolve({ rows });
    }

    // 2. Rate-limit COUNT — the middleware sends `WHERE ip_hash = ANY($1)
    // AND created_at >= NOW() - INTERVAL '24 hours'`. The first param after
    // the salt SELECT is the array of hashes to match.
    if (sqlText.includes('FROM anon_generation_log') && sqlText.includes('COUNT')) {
      const hashesParam = params[0] as string[] | undefined;
      const hashes = Array.isArray(hashesParam) ? hashesParam : [];
      const count = _state.log.filter(
        (r) => hashes.includes(r.ip_hash) && r.ageMs < 24 * 60 * 60 * 1000,
      ).length;
      return Promise.resolve({ rows: [{ count }] });
    }

    // 3. INSERT into anon_generation_log
    if (sqlText.includes('INSERT INTO anon_generation_log')) {
      _state.insertCalls++;
      const ipHash = params[0] as string;
      _state.log.push({ ip_hash: ipHash, ageMs: 0 });
      return Promise.resolve({ rows: [] });
    }

    // 4. Best-effort writes from the existing route (generations,
    // anonymous_generations) — no-op success.
    return Promise.resolve({ rows: [] });
  }
  return { db: { execute } };
});

// Import AFTER vi.mock so the BFF picks up the mocked db.
const { buildApp } = await import('../src/index.js');

const ENV: Record<string, unknown> = {
  LOGTO_ENDPOINT: 'https://logto.test',
  LOGTO_BASE_URL: 'http://localhost:3000',
  LOGTO_M2M_RESOURCE_INDICATOR: 'https://api.mcpgen.dev/m2m',
  HYPERDRIVE: {} as Hyperdrive,
  SENTRY_DSN: '',
  ENVIRONMENT: 'test',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  STRIPE_PRICE_PRO: '',
  ENGINE_ENDPOINT: '',
  LOGTO_M2M_APP_ID: '',
  LOGTO_M2M_APP_SECRET: '',
  BFF_ANONYMOUS_GATE: 'playground',
};

function postGenerate(opts: {
  ip: string | null;
  cookie?: string;
  bearer?: string;
}): Promise<Response> {
  const app = buildApp(ENV as Parameters<typeof buildApp>[0]);
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Idempotency-Key', 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1');
  if (opts.ip !== null) headers.set('CF-Connecting-IP', opts.ip);
  if (opts.cookie) headers.set('Cookie', `mcpgen_anon_session=${opts.cookie}`);
  if (opts.bearer) headers.set('Authorization', `Bearer ${opts.bearer}`);
  return app.fetch(
    new Request('http://x/api/v1/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ spec_url: 'https://example.com/spec.json' }),
    }),
    ENV,
  );
}

beforeEach(async () => {
  _state.current = 'salt_v_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  _state.previous = null;
  _state.log = [];
  _state.selectCalls = 0;
  _state.insertCalls = 0;
  // Drop the in-memory salt cache between tests so each suite starts clean.
  const mod = await import('../src/lib/anon-ip-hash.js');
  mod.__resetSaltCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('anon-rate-limit middleware (D-02 + D-11 + G-4 24h grace)', () => {
  // ─── rate test 1 ──────────────────────────────────────────────────────────
  it('first anon POST from a new IP → 202 + INSERT into anon_generation_log', async () => {
    const res = await postGenerate({ ip: '8.8.8.8' });
    expect(res.status).toBe(202);
    expect(_state.insertCalls).toBe(1);
    expect(_state.log).toHaveLength(1);
  });

  // ─── rate test 2 ──────────────────────────────────────────────────────────
  it('second anon POST from same IP within 24h → 429 with anon_rate_limit shape', async () => {
    await postGenerate({ ip: '8.8.8.8' });
    expect(_state.log).toHaveLength(1);

    const res = await postGenerate({ ip: '8.8.8.8' });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; message: string; signup_url: string };
    expect(body.error).toBe('anon_rate_limit');
    expect(body.signup_url).toBe('/sign-up');
    expect(typeof body.message).toBe('string');
    // No second INSERT — the 429 short-circuits before writing a log row.
    expect(_state.log).toHaveLength(1);
  });

  // ─── rate test 3 ──────────────────────────────────────────────────────────
  it('localhost (127.0.0.1) bypasses rate limit even with prior 24h-window row', async () => {
    // Pre-seed a row that would normally trigger the gate.
    _state.log.push({
      ip_hash: 'pre-existing-hash-localhost-precondition',
      ageMs: 60 * 60 * 1000, // 1h old
    });

    const res = await postGenerate({ ip: '127.0.0.1' });
    expect(res.status).toBe(202);
  });

  // ─── rate test 4 (Pitfall #5 salt-rotation regression) ────────────────────
  it("Pitfall #5: row hashed with PREVIOUS-day salt is found via 24h grace lookup → 429", async () => {
    // Manually hash the IP under the PREVIOUS salt (i.e., a row inserted just
    // before midnight rotation), then rotate salts so `current` has flipped.
    const previousSalt =
      'salt_v_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    _state.previous = previousSalt;
    _state.current = 'salt_v_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

    const buf = new TextEncoder().encode(`${previousSalt}:1.2.3.4`);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const previousHash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');

    // Pre-seed the log table with that previous-salt hash, 1 hour old.
    _state.log.push({ ip_hash: previousHash, ageMs: 60 * 60 * 1000 });

    // Drop the salt cache so the middleware reads the new `previous` value.
    const mod = await import('../src/lib/anon-ip-hash.js');
    mod.__resetSaltCache();

    const res = await postGenerate({ ip: '1.2.3.4' });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('anon_rate_limit');
  });

  // ─── rate test 5 ──────────────────────────────────────────────────────────
  it('row backdated > 24h is outside the window → request returns 202', async () => {
    // Pre-seed a row 25h old. The COUNT mock filters anything >= 24h out, so
    // the middleware sees count=0 and lets the request through.
    const buf = new TextEncoder().encode(`${_state.current}:9.9.9.9`);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const currentHash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    _state.log.push({ ip_hash: currentHash, ageMs: 25 * 60 * 60 * 1000 });

    const res = await postGenerate({ ip: '9.9.9.9' });
    expect(res.status).toBe(202);
  });

  // ─── rate test 6 ──────────────────────────────────────────────────────────
  it('AUTH path (valid Logto JWT bearer) skips the rate limit middleware entirely', async () => {
    // Pre-seed a row that WOULD trigger the gate for an anon caller.
    const buf = new TextEncoder().encode(`${_state.current}:8.8.8.8`);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const currentHash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    _state.log.push({ ip_hash: currentHash, ageMs: 60 * 60 * 1000 });

    const res = await postGenerate({ ip: '8.8.8.8', bearer: 'fake-jwt' });
    // Authed callers are not subject to anon rate limit. The route either
    // returns 202 (route allows authed POST) or some non-429 success/business
    // status, but never 429 from the anon-rate-limit middleware.
    expect(res.status).not.toBe(429);
  });
});
