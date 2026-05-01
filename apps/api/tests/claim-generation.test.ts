// apps/api/tests/claim-generation.test.ts
//
// Phase 09.1 plan 09 Task 1 — TDD RED for the full claim_generation flow
// + Hono csrf middleware mounted on protectedApp (D-04, OQ-3, T-9.1-claim).
//
// Replaces the 501 stub introduced by plan 09.1-03. Verifies the atomic
// claim flow:
//   1. UPDATE anonymous_generations SET claimed_at, claimed_by_org_id
//      WHERE anon_session_id = cookie AND claimed_at IS NULL
//   2. SELECT deployments WHERE anon_session_id = cookie AND expires_at NOT NULL
//   3. retagScript(...) per deployment with ['anon=false', 'claimed_by_org=...']
//   4. UPDATE deployments SET expires_at=NULL, anon_session_id=NULL
//   5. clearAnonSession (Set-Cookie: ...; Max-Age=0)
//
// CSRF: Hono `csrf({ origin: fn })` middleware mounted on `protectedApp`
// before `authMiddleware`. The Hono implementation only triggers when the
// Content-Type is `text/plain | application/x-www-form-urlencoded |
// multipart/form-data` (per hono/middleware/csrf source) — JSON POSTs
// bypass it because they cannot be issued cross-origin without a CORS
// preflight. Tests therefore exercise CSRF using `text/plain` bodies.
//
// Race regression (T-9.1-08-06): the cleanup-cron query reads
// `expires_at IS NOT NULL AND anon_session_id IS NOT NULL`. The claim
// transaction clears BOTH simultaneously inside one atomic UPDATE, so the
// cleanup cron sees the row as either pre-claim (delete it) or post-claim
// (skip it) — never both.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-09-PLAN.md Task 1
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §9 (lines 1024-1180)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04, T-9.1-claim
//   - apps/api/src/lib/anon-session.ts (clearAnonSession + ANON_COOKIE_NAME)
//   - apps/api/src/lib/cf-platforms-deploy.ts (retagScript)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ulid } from 'ulid';

// ─── Mock state for db + retagScript ───────────────────────────────────────
// Pre-seed `anonGenRows` (one per anon session) and `deployRows` per test.
// `db.execute` parses the Drizzle queryChunks into a normalized SQL string +
// param list and dispatches to the correct in-memory mutator.

interface AnonGenRow {
  anon_session_id: string;
  generation_id: string;
  claimed_at: string | null;
  claimed_by_org_id: string | null;
}

interface DeploymentRow {
  id: string;
  cf_worker_name: string;
  anon_session_id: string | null;
  expires_at: string | null;
}

interface MockState {
  anonGenRows: AnonGenRow[];
  deployRows: DeploymentRow[];
  retagCalls: Array<{ scriptName: string; tags: string[] }>;
  cleanupQueryResults: DeploymentRow[];
}

const _state: MockState = {
  anonGenRows: [],
  deployRows: [],
  retagCalls: [],
  cleanupQueryResults: [],
};

// ─── jose mock so authMiddleware admits a fake bearer with a fixed payload ──
// Default: `organization_id = 'org_authed_123'`. Individual tests override
// the payload by mutating `_jwtPayload` before the request.

interface FakeJwtPayload {
  aud: string;
  sub: string;
  organization_id?: string;
}

const _jwtPayload: { current: FakeJwtPayload } = {
  current: {
    aud: 'http://localhost:3000',
    sub: 'user_test',
    organization_id: 'org_authed_123',
  },
};

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({ payload: _jwtPayload.current })),
}));

// ─── db.js mock — parse Drizzle queryChunks into SQL+params and dispatch ───

vi.mock('../src/db.js', () => {
  function parseQueryChunks(query: { queryChunks?: unknown }): {
    sql: string;
    params: unknown[];
  } {
    const chunks = (query.queryChunks ?? []) as Array<unknown>;
    let sql = '';
    const params: unknown[] = [];
    for (const ch of chunks) {
      if (typeof ch === 'string' || typeof ch === 'number' || typeof ch === 'boolean') {
        params.push(ch);
        continue;
      }
      if (ch === null || typeof ch !== 'object') continue;
      const ctorName = (ch as { constructor?: { name?: string } }).constructor?.name;
      if (ctorName === 'StringChunk') {
        const v = (ch as { value?: string[] }).value;
        if (Array.isArray(v)) sql += v.join('');
        continue;
      }
      if (Array.isArray(ch)) {
        params.push(ch);
        continue;
      }
      if ('value' in (ch as object)) {
        params.push((ch as { value: unknown }).value);
      }
    }
    return { sql, params };
  }

  // The transactional handler used by claim.ts. Drizzle's neon-http
  // `db.transaction(fn)` runs `fn` with a tx that exposes the same
  // `.execute` shape. We can model both `db.execute` and `tx.execute`
  // with the same dispatcher.

  function execute(query: { queryChunks?: unknown }): Promise<{ rows: unknown[] }> {
    const { sql, params } = parseQueryChunks(query);
    const norm = sql.replace(/\s+/g, ' ').trim();

    // 1. UPDATE anonymous_generations SET claimed_at = NOW(), claimed_by_org_id = $orgId
    //    WHERE anon_session_id = $cookie AND claimed_at IS NULL RETURNING generation_id
    if (norm.includes('UPDATE anonymous_generations') && norm.includes('claimed_at')) {
      const orgId = params[0] as string;
      const cookie = params[1] as string;
      const matched = _state.anonGenRows.filter(
        (r) => r.anon_session_id === cookie && r.claimed_at === null,
      );
      const returnedIds: { generation_id: string }[] = [];
      for (const row of matched) {
        row.claimed_at = new Date().toISOString();
        row.claimed_by_org_id = orgId;
        returnedIds.push({ generation_id: row.generation_id });
      }
      return Promise.resolve({ rows: returnedIds });
    }

    // 2. SELECT id, cf_worker_name FROM deployments WHERE anon_session_id = $cookie
    //    AND expires_at IS NOT NULL
    if (
      norm.includes('SELECT') &&
      norm.includes('FROM deployments') &&
      norm.includes('anon_session_id =') &&
      norm.includes('expires_at IS NOT NULL') &&
      !norm.includes('UPDATE') &&
      !norm.includes('< NOW()')
    ) {
      const cookie = params[0] as string;
      const matched = _state.deployRows.filter(
        (d) => d.anon_session_id === cookie && d.expires_at !== null,
      );
      return Promise.resolve({
        rows: matched.map((d) => ({ id: d.id, cf_worker_name: d.cf_worker_name })),
      });
    }

    // 3. UPDATE deployments SET expires_at = NULL, anon_session_id = NULL
    //    WHERE anon_session_id = $cookie
    if (norm.includes('UPDATE deployments') && norm.includes('expires_at = NULL')) {
      const cookie = params[0] as string;
      for (const d of _state.deployRows) {
        if (d.anon_session_id === cookie) {
          d.expires_at = null;
          d.anon_session_id = null;
        }
      }
      return Promise.resolve({ rows: [] });
    }

    // 4. Cleanup-cron query (used by race-regression test). Matches the
    //    plan-08 cleanup query shape: WHERE expires_at IS NOT NULL AND
    //    anon_session_id IS NOT NULL AND expires_at < NOW().
    if (
      norm.includes('FROM deployments') &&
      norm.includes('expires_at IS NOT NULL') &&
      norm.includes('anon_session_id IS NOT NULL')
    ) {
      const matched = _state.deployRows.filter(
        (d) => d.expires_at !== null && d.anon_session_id !== null,
      );
      _state.cleanupQueryResults = matched.map((d) => ({ ...d }));
      return Promise.resolve({
        rows: matched.map((d) => ({
          id: d.id,
          cf_worker_name: d.cf_worker_name,
        })),
      });
    }

    return Promise.resolve({ rows: [] });
  }

  // db.transaction(fn) for neon-http accepts a tx-like object. We pass the
  // same `execute` shape so claim.ts can call `tx.execute(sql\`...\`)`
  // identically to `db.execute(...)` — atomicity is implicit in the mock
  // because all rows are in-memory and the test runs single-threaded.
  async function transaction<T>(
    fn: (tx: { execute: typeof execute }) => Promise<T>,
  ): Promise<T> {
    return await fn({ execute });
  }

  return { db: { execute, transaction } };
});

// ─── retagScript spy via vi.mock ───────────────────────────────────────────
// Replace the named export so claim.ts's `import { retagScript }` resolves
// to the spy. CF_DISPATCH_NAMESPACE is re-exported as the original constant.

vi.mock('../src/lib/cf-platforms-deploy.js', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../src/lib/cf-platforms-deploy.js');
  return {
    ...actual,
    retagScript: vi.fn(
      async (
        _env: { CF_API_TOKEN: string },
        scriptName: string,
        newTags: string[],
      ): Promise<void> => {
        _state.retagCalls.push({ scriptName, tags: newTags });
      },
    ),
  };
});

// Import AFTER vi.mock so the BFF picks up the mocked db + retagScript.
const { buildApp } = await import('../src/index.js');

const ANON_COOKIE_NAME = 'mcpgen_anon_session';
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function envFor(opts?: { nodeEnv?: string }): Record<string, unknown> {
  return {
    LOGTO_ENDPOINT: 'https://logto.test',
    LOGTO_BASE_URL: 'http://localhost:3000',
    LOGTO_M2M_RESOURCE_INDICATOR: 'https://api.mcpgen.dev/m2m',
    HYPERDRIVE: {} as Hyperdrive,
    SENTRY_DSN: '',
    ENVIRONMENT: opts?.nodeEnv === 'production' ? 'production' : 'test',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PRICE_PRO: '',
    ENGINE_ENDPOINT: '',
    LOGTO_M2M_APP_ID: '',
    LOGTO_M2M_APP_SECRET: '',
    BFF_ANONYMOUS_GATE: 'playground' as const,
    // Local-compute keeps deployScript/retagScript real-call free even if a
    // CF token leaks into env. The retagScript spy short-circuits anyway.
    MCPGEN_LOCAL_COMPUTE: '1',
    CF_API_TOKEN: '',
    CF_ACCOUNT_ID: '',
  };
}

interface ClaimResponse {
  claimed_count?: number;
  deployments_retagged?: number;
  error?: string;
  reason?: string;
}

async function postClaim(opts: {
  env?: Record<string, unknown>;
  cookie?: string;
  bearer?: string | null;
  origin?: string;
  contentType?: string;
  body?: string;
}): Promise<Response> {
  const env = opts.env ?? envFor();
  const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
  const headers = new Headers();
  // Default to JSON. Tests that exercise the csrf-eligible content types
  // override with `contentType: 'text/plain'` to actually trigger the
  // Hono csrf gate.
  headers.set('Content-Type', opts.contentType ?? 'application/json');
  if (opts.bearer !== null) {
    headers.set('Authorization', `Bearer ${opts.bearer ?? 'fake-jwt'}`);
  }
  if (opts.cookie) headers.set('Cookie', `${ANON_COOKIE_NAME}=${opts.cookie}`);
  if (opts.origin) headers.set('Origin', opts.origin);
  return await app.fetch(
    new Request('http://api/api/v1/claim_generation', {
      method: 'POST',
      headers,
      body: opts.body ?? '',
    }),
    env,
  );
}

function findAnonSetCookie(res: Response): { value: string; maxAge: number | null } | null {
  const headers = res.headers;
  const all =
    typeof (headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as { getSetCookie: () => string[] }).getSetCookie()
      : ([headers.get('Set-Cookie')].filter((v): v is string => v !== null));
  for (const h of all) {
    const parts = h.split(';').map((p) => p.trim());
    const first = parts[0];
    if (!first) continue;
    const eqIdx = first.indexOf('=');
    if (eqIdx < 0) continue;
    const name = first.slice(0, eqIdx);
    if (name !== ANON_COOKIE_NAME) continue;
    const value = first.slice(eqIdx + 1);
    const maxAgePart = parts.slice(1).find((p) => p.toLowerCase().startsWith('max-age='));
    const maxAge = maxAgePart ? Number(maxAgePart.split('=')[1]) : null;
    return { value, maxAge };
  }
  return null;
}

beforeEach(() => {
  _state.anonGenRows = [];
  _state.deployRows = [];
  _state.retagCalls = [];
  _state.cleanupQueryResults = [];
  _jwtPayload.current = {
    aud: 'http://localhost:3000',
    sub: 'user_test',
    organization_id: 'org_authed_123',
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('claim_generation flow + CSRF (plan 09.1-09 / D-04 / T-9.1-claim)', () => {
  // ─── test 1: no JWT → 401 (gated by authMiddleware) ────────────────────
  it('test 1: POST without JWT → 401', async () => {
    const res = await postClaim({ bearer: null });
    expect(res.status).toBe(401);
  });

  // ─── test 2: JWT but no anon cookie → 400 no_anon_session ──────────────
  it('test 2: POST with JWT but no anon cookie → 400 no_anon_session', async () => {
    const res = await postClaim({});
    expect(res.status).toBe(400);
    const body = (await res.json()) as ClaimResponse;
    expect(body.error).toBe('no_anon_session');
  });

  // ─── test 3: JWT + valid cookie → 200 + claimed_at set + cookie cleared ─
  it('test 3: JWT + valid anon cookie pointing at unclaimed generation → 200 + cookie cleared', async () => {
    const cookie = ulid();
    const generationId = crypto.randomUUID();
    _state.anonGenRows.push({
      anon_session_id: cookie,
      generation_id: generationId,
      claimed_at: null,
      claimed_by_org_id: null,
    });
    expect(cookie).toMatch(ULID_REGEX);

    const res = await postClaim({ cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClaimResponse;
    expect(body.claimed_count).toBe(1);
    expect(body.deployments_retagged).toBe(0);

    // DB row got mutated.
    const row = _state.anonGenRows.find((r) => r.anon_session_id === cookie);
    expect(row).toBeDefined();
    expect(row?.claimed_at).not.toBeNull();
    expect(row?.claimed_by_org_id).toBe('org_authed_123');

    // Cookie cleared via Set-Cookie ... Max-Age=0.
    const cleared = findAnonSetCookie(res);
    expect(cleared).not.toBeNull();
    if (cleared) expect(cleared.maxAge).toBe(0);
  });

  // ─── test 4: JWT + cookie + ephemeral deployment → retag + clear ───────
  it('test 4: JWT + cookie + anon ephemeral deployment → retag called + DB cleared', async () => {
    const cookie = ulid();
    const generationId = crypto.randomUUID();
    _state.anonGenRows.push({
      anon_session_id: cookie,
      generation_id: generationId,
      claimed_at: null,
      claimed_by_org_id: null,
    });
    _state.deployRows.push({
      id: crypto.randomUUID(),
      cf_worker_name: 'anon-abc1234567',
      anon_session_id: cookie,
      expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    });

    const res = await postClaim({ cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClaimResponse;
    expect(body.claimed_count).toBe(1);
    expect(body.deployments_retagged).toBe(1);

    // retagScript spy received the right shape.
    expect(_state.retagCalls).toHaveLength(1);
    const call = _state.retagCalls[0];
    if (!call) throw new Error('retag call missing');
    expect(call.scriptName).toBe('anon-abc1234567');
    expect(call.tags).toEqual(['anon=false', 'claimed_by_org=org_authed_123']);

    // DB deployments row had expires_at and anon_session_id cleared.
    const dep = _state.deployRows[0];
    if (!dep) throw new Error('deployment row missing');
    expect(dep.expires_at).toBeNull();
    expect(dep.anon_session_id).toBeNull();
  });

  // ─── test 5: idempotency — second call returns 0 rows ──────────────────
  it('test 5: identical POST twice (idempotency) → second returns 0 newly-claimed', async () => {
    const cookie = ulid();
    _state.anonGenRows.push({
      anon_session_id: cookie,
      generation_id: crypto.randomUUID(),
      claimed_at: null,
      claimed_by_org_id: null,
    });

    const first = await postClaim({ cookie });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as ClaimResponse;
    expect(firstBody.claimed_count).toBe(1);

    // Second call with the same cookie hits the same WHERE clause; the row
    // already has `claimed_at` set so it does NOT match the `IS NULL`
    // predicate → 0 rows updated.
    const second = await postClaim({ cookie });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as ClaimResponse;
    expect(secondBody.claimed_count).toBe(0);
    expect(secondBody.deployments_retagged).toBe(0);
  });

  // ─── test 6: cookie pointing at OTHER session → 0 rows (safe no-op) ────
  it('test 6: JWT + cookie pointing at OTHER anon session → 200 claimed_count=0', async () => {
    const ownerCookie = ulid();
    const fooCookie = ulid();
    _state.anonGenRows.push({
      anon_session_id: ownerCookie,
      generation_id: crypto.randomUUID(),
      claimed_at: null,
      claimed_by_org_id: null,
    });

    const res = await postClaim({ cookie: fooCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClaimResponse;
    expect(body.claimed_count).toBe(0);
    // Owner's row remains unclaimed — cookie/foo did not collide.
    const ownerRow = _state.anonGenRows.find((r) => r.anon_session_id === ownerCookie);
    expect(ownerRow?.claimed_at).toBeNull();
  });

  // ─── test 7: CSRF — Origin: evil.com + text/plain body → 403 ───────────
  // Hono csrf() ONLY triggers when Content-Type is one of
  // `application/x-www-form-urlencoded | multipart/form-data | text/plain`
  // (it skips JSON because cross-origin JSON POSTs require CORS preflight).
  // To prove csrf is mounted we must use a content-type the middleware
  // actually inspects.
  it('test 7: CSRF — Origin: https://evil.com + text/plain → 403', async () => {
    const res = await postClaim({
      origin: 'https://evil.com',
      contentType: 'text/plain',
      body: 'irrelevant',
    });
    expect(res.status).toBe(403);
  });

  // ─── test 8: CSRF — Origin: https://mcpgen.app passes csrf ─────────────
  it('test 8: CSRF — Origin: https://mcpgen.app + text/plain passes csrf check', async () => {
    const res = await postClaim({
      origin: 'https://mcpgen.app',
      contentType: 'text/plain',
      body: 'irrelevant',
    });
    // 400 because no anon cookie was sent — the request flows past CSRF +
    // authMiddleware into the handler. The point is `not 403`.
    expect(res.status).not.toBe(403);
  });

  // ─── test 9: CSRF — Vercel preview origin passes ───────────────────────
  it('test 9: CSRF — Origin: https://mcpgen-pr-123.vercel.app + text/plain passes csrf', async () => {
    const res = await postClaim({
      origin: 'https://mcpgen-pr-123.vercel.app',
      contentType: 'text/plain',
      body: 'irrelevant',
    });
    expect(res.status).not.toBe(403);
  });

  // ─── test 10: CSRF — localhost in non-production passes ────────────────
  it('test 10: CSRF — Origin: http://localhost:3000 in non-prod passes csrf', async () => {
    const env = envFor({ nodeEnv: 'development' });
    const res = await postClaim({
      env,
      origin: 'http://localhost:3000',
      contentType: 'text/plain',
      body: 'irrelevant',
    });
    expect(res.status).not.toBe(403);
  });

  // ─── test 11: race regression (T-9.1-08-06) ────────────────────────────
  // After claim transaction completes, the cleanup-cron query (which reads
  // `expires_at IS NOT NULL AND anon_session_id IS NOT NULL`) MUST NOT
  // match the just-claimed row. Both fields are cleared atomically.
  it('test 11: T-9.1-08-06 race regression — cleanup query MUST NOT match post-claim row', async () => {
    const cookie = ulid();
    _state.anonGenRows.push({
      anon_session_id: cookie,
      generation_id: crypto.randomUUID(),
      claimed_at: null,
      claimed_by_org_id: null,
    });
    _state.deployRows.push({
      id: crypto.randomUUID(),
      cf_worker_name: 'anon-race1234',
      anon_session_id: cookie,
      // Intentionally past — would normally be picked up by cleanup cron.
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });

    const claimRes = await postClaim({ cookie });
    expect(claimRes.status).toBe(200);

    // Run the cleanup-cron query manually — it must return 0 rows.
    const { db } = await import('../src/db.js');
    // db is mocked; this returns the mock state at this moment.
    const { sql } = await import('drizzle-orm');
    const result = await db.execute(sql`
      SELECT id, cf_worker_name FROM deployments
      WHERE expires_at IS NOT NULL
        AND anon_session_id IS NOT NULL
        AND expires_at < NOW()
    `);
    expect((result.rows as unknown[]).length).toBe(0);
  });

  // ─── test 12: OQ-3 — stripe-webhook unchanged ──────────────────────────
  // The Stripe webhook handler must NOT touch anonymous_generations or
  // deployments tables for claim purposes. Snapshot the row counts before
  // and after invoking the webhook.
  it('test 12: OQ-3 — stripe-webhook handler does not touch anon tables post-claim', async () => {
    const cookie = ulid();
    _state.anonGenRows.push({
      anon_session_id: cookie,
      generation_id: crypto.randomUUID(),
      claimed_at: null,
      claimed_by_org_id: null,
    });

    // First, claim normally.
    await postClaim({ cookie });
    const anonGenSnapshot = JSON.stringify(_state.anonGenRows);
    const deploySnapshot = JSON.stringify(_state.deployRows);

    // Now hit stripe-webhook with a checkout.session.completed event for
    // the same org. We do NOT verify the actual webhook signature here —
    // the contract being tested is "the webhook handler does not interact
    // with anon tables". We assert via state-snapshot diff.
    const env = envFor();
    const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
    await app.fetch(
      new Request('http://api/api/v1/stripe/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'evt_test_123',
          type: 'checkout.session.completed',
          data: { object: { customer: 'cus_test', subscription: 'sub_test' } },
        }),
      }),
      env,
    );

    expect(JSON.stringify(_state.anonGenRows)).toBe(anonGenSnapshot);
    expect(JSON.stringify(_state.deployRows)).toBe(deploySnapshot);
  });
});
