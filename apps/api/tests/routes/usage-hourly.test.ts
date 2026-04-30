// apps/api/tests/routes/usage-hourly.test.ts
//
// Plan 09-04 Task 1 (Phase 9 D-18 — 3 of 4 BFF carry-forward endpoints):
// integration tests for GET /api/v1/usage/hourly. Mirrors
// apps/api/tests/routes/deployments-list.test.ts shape — jose mock with
// __authMode toggle, vi.mock('../../src/db.js') with an in-memory store
// that simulates the 4-table JOIN authz check (Pitfall #5 — `usage_hourly`
// matview does NOT carry org_id; cross-org leak guarded by
// `WHERE p.org_id = $1` ALWAYS-FIRST predicate).
//
// Coverage (per <behavior> in 09-04-PLAN.md Task 1):
//   - 401 unauthenticated
//   - 403 m2m_cannot_read_usage (T-9-bff-auth-03)
//   - 400 no_org_context when JWT has no organization_id
//   - 400 invalid_params when from/to missing
//   - 200 returns only the authenticated org's hourly buckets
//     (T-9-bff-auth-05 + Pitfall #5 — cross-org isolation regression)
//   - 200 from/to filtering narrows the time window
//   - 200 response shape validates via UsageHourlyResponseSchema

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupStripeMock } from '../_mocks/stripe.js';

setupStripeMock();

const TEST_ORG_ID = '00000000-0000-4000-8000-000000000099';
const FOREIGN_ORG_ID = '00000000-0000-4000-8000-000000000088';
const OWNED_DEPLOYMENT_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_DEPLOYMENT_ID = '22222222-2222-4222-8222-222222222222';

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async (_token: string, _jwks: unknown, opts: { audience?: string[] }) => {
    const mode = (globalThis as unknown as { __authMode?: 'user' | 'm2m' | 'no_org' }).__authMode ?? 'user';
    if (mode === 'm2m') {
      return {
        payload: {
          aud: opts.audience?.[1] ?? 'https://api.mcpgen.dev/m2m',
          sub: 'm2m_client',
        },
      };
    }
    if (mode === 'no_org') {
      return {
        payload: {
          aud: opts.audience?.[0] ?? 'http://localhost:3000',
          sub: 'user_logto_id_2',
          // no organization_id claim
        },
      };
    }
    return {
      payload: {
        aud: opts.audience?.[0] ?? 'http://localhost:3000',
        sub: 'user_logto_id_1',
        organization_id: TEST_ORG_ID,
      },
    };
  }),
}));

// Hourly usage_events seed: bucket-aligned timestamps + per-deployment counts.
// The mock simulates a 4-table JOIN by tagging each event row with org_id and
// filtering on (org_id, deployment_id, time-window) inside the execute() mock.
interface UsageEventSeed {
  time: string; // ISO 8601 — bucket-aligned for determinism
  deployment_id: string;
  upstream_latency_ms: number;
  status: 'ok' | 'error';
  org_id: string;
}

const HOUR_BUCKETS = [
  '2026-04-29T00:00:00.000Z',
  '2026-04-29T01:00:00.000Z',
  '2026-04-29T02:00:00.000Z',
];

function buildSeed(): UsageEventSeed[] {
  // 5 events per bucket per deployment for both orgs.
  const seed: UsageEventSeed[] = [];
  for (const bucket of HOUR_BUCKETS) {
    for (let i = 0; i < 5; i++) {
      seed.push({
        time: bucket,
        deployment_id: OWNED_DEPLOYMENT_ID,
        upstream_latency_ms: 100,
        status: 'ok',
        org_id: TEST_ORG_ID,
      });
      seed.push({
        time: bucket,
        deployment_id: FOREIGN_DEPLOYMENT_ID,
        upstream_latency_ms: 999,
        status: 'error',
        org_id: FOREIGN_ORG_ID,
      });
    }
  }
  return seed;
}

vi.mock('../../src/db.js', () => {
  function execute(_query: { queryChunks?: unknown }): Promise<{ rows: unknown[] }> {
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
      } else if (
        c !== null &&
        typeof c === 'object' &&
        'value' in (c as object)
      ) {
        params.push((c as { value: unknown }).value);
      }
    }
    // GET /usage/hourly aggregation query — recognized by the 4-table JOIN
    // FROM clause and the date_trunc('hour', ...) bucket expression.
    if (
      sqlText.includes('FROM usage_events') &&
      sqlText.includes('JOIN deployments d') &&
      sqlText.includes('JOIN generations g') &&
      sqlText.includes('JOIN projects p') &&
      sqlText.includes('WHERE p.org_id =')
    ) {
      const orgId = params[0] as string | undefined;
      const fromIso = params[1] as string | undefined;
      const toIso = params[2] as string | undefined;
      const fromTs = fromIso !== undefined ? new Date(fromIso).getTime() : Number.NEGATIVE_INFINITY;
      const toTs = toIso !== undefined ? new Date(toIso).getTime() : Number.POSITIVE_INFINITY;

      const seed = buildSeed();
      const filtered = seed.filter(
        (e) =>
          e.org_id === orgId &&
          new Date(e.time).getTime() >= fromTs &&
          new Date(e.time).getTime() < toTs,
      );
      // Aggregate by (hour_bucket, deployment_id).
      const groups = new Map<
        string,
        {
          hour_bucket: string;
          deployment_id: string;
          call_count: number;
          total_latency_ms: number;
          error_count: number;
        }
      >();
      for (const e of filtered) {
        const key = `${e.time}|${e.deployment_id}`;
        const g = groups.get(key);
        if (g === undefined) {
          groups.set(key, {
            hour_bucket: e.time,
            deployment_id: e.deployment_id,
            call_count: 1,
            total_latency_ms: e.upstream_latency_ms,
            error_count: e.status === 'error' ? 1 : 0,
          });
        } else {
          g.call_count += 1;
          g.total_latency_ms += e.upstream_latency_ms;
          if (e.status === 'error') g.error_count += 1;
        }
      }
      const rows = [...groups.values()].map((g) => ({
        ...g,
        total_cost_usd: null,
      }));
      // Order by hour_bucket DESC for determinism.
      rows.sort((a, b) => (a.hour_bucket < b.hour_bucket ? 1 : a.hour_bucket > b.hour_bucket ? -1 : 0));
      return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
  }

  return { db: { execute } };
});

const { default: app } = await import('../../src/index.js');
const { UsageHourlyResponseSchema } = await import('@mcpgen/contracts/dashboard-api');

const ENV = {
  LOGTO_ENDPOINT: 'https://logto.test',
  LOGTO_BASE_URL: 'http://localhost:3000',
  LOGTO_M2M_RESOURCE_INDICATOR: 'https://api.mcpgen.dev/m2m',
  HYPERDRIVE: {} as Hyperdrive,
  SENTRY_DSN: '',
  ENVIRONMENT: 'test',
  STRIPE_SECRET_KEY: 'sk_test_mock',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
  STRIPE_PRICE_PRO: 'price_test_pro',
  ENGINE_ENDPOINT: 'http://localhost:8000',
  LOGTO_M2M_APP_ID: '',
  LOGTO_M2M_APP_SECRET: '',
};

function setAuthMode(mode: 'user' | 'm2m' | 'no_org'): void {
  (globalThis as unknown as { __authMode?: 'user' | 'm2m' | 'no_org' }).__authMode = mode;
}

const FROM = '2026-04-29T00:00:00.000Z';
const TO = '2026-04-30T00:00:00.000Z';

describe('GET /api/v1/usage/hourly', () => {
  beforeEach(() => {
    setAuthMode('user');
  });

  it('rejects without Authorization with 401', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/usage/hourly?from=${FROM}&to=${TO}`),
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it('rejects M2M token with 403 m2m_cannot_read_usage (T-9-bff-auth-03)', async () => {
    setAuthMode('m2m');
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/usage/hourly?from=${FROM}&to=${TO}`, {
        headers: { Authorization: 'Bearer m2m-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('m2m_cannot_read_usage');
  });

  it('returns 400 no_org_context when JWT has no organization_id', async () => {
    setAuthMode('no_org');
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/usage/hourly?from=${FROM}&to=${TO}`, {
        headers: { Authorization: 'Bearer user-jwt-no-org' },
      }),
      ENV,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_org_context');
  });

  it('returns 400 invalid_params when from is missing', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/usage/hourly?to=${TO}`, {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_params when to is missing', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/usage/hourly?from=${FROM}`, {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(400);
  });

  it("returns only authenticated org's buckets (Pitfall #5 cross-org isolation)", async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/usage/hourly?from=${FROM}&to=${TO}`, {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ deployment_id: string }> };
    // Owned deployment appears.
    expect(body.rows.some((r) => r.deployment_id === OWNED_DEPLOYMENT_ID)).toBe(true);
    // Foreign deployment NEVER appears (Pitfall #5 — JOIN guard).
    expect(body.rows.some((r) => r.deployment_id === FOREIGN_DEPLOYMENT_ID)).toBe(false);
    // Stricter assertion: serialized response must not even mention the
    // foreign deployment ID.
    expect(JSON.stringify(body).includes(FOREIGN_DEPLOYMENT_ID)).toBe(false);
  });

  it('aggregates 5 events per bucket into call_count = 5', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/usage/hourly?from=${FROM}&to=${TO}`, {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: Array<{ deployment_id: string; call_count: number; total_latency_ms: number }>;
    };
    expect(body.rows).toHaveLength(3); // 3 hourly buckets, 1 deployment
    for (const row of body.rows) {
      expect(row.deployment_id).toBe(OWNED_DEPLOYMENT_ID);
      expect(row.call_count).toBe(5);
      expect(row.total_latency_ms).toBe(500); // 5 × 100ms
    }
  });

  it('narrows the time window via from/to filtering', async () => {
    const narrowFrom = '2026-04-29T01:00:00.000Z';
    const narrowTo = '2026-04-29T02:00:00.000Z';
    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/usage/hourly?from=${narrowFrom}&to=${narrowTo}`,
        { headers: { Authorization: 'Bearer user-jwt' } },
      ),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: Array<{ hour_bucket: string }>;
    };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.hour_bucket).toBe('2026-04-29T01:00:00.000Z');
  });

  it('response shape validates via UsageHourlyResponseSchema', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/usage/hourly?from=${FROM}&to=${TO}`, {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    // Throws if shape is wrong — caller catches & test fails verbatim.
    const parsed = UsageHourlyResponseSchema.parse(json);
    expect(parsed.rows.length).toBeGreaterThan(0);
  });
});
