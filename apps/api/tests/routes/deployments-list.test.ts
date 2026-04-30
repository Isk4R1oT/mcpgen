// apps/api/tests/routes/deployments-list.test.ts
//
// Plan 09-03 Task 3 (Phase 9 D-18): integration tests for
// GET /api/v1/deployments. Mirrors apps/api/tests/routes/drift.test.ts
// shape — jose mock with __authMode toggle, vi.mock('../../src/db.js') with
// an in-memory store that simulates the 4-table JOIN authz check.
//
// Coverage (per <behavior> in 09-03-PLAN.md Task 3):
//   - 401 unauthenticated
//   - 403 m2m_cannot_list_deployments (T-9-bff-auth-03)
//   - 200 returns only the authenticated org's deployments (T-9-bff-auth-05)
//   - foreign-org deployment never appears in the response (cross-org
//     isolation regression test)

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

// Per-call db.execute mock that simulates the 4-table JOIN by inspecting the
// SQL fragment + params chain (same walking logic as drift.test.ts).
interface DeploymentSeed {
  deployment_id: string;
  generation_id: string;
  server_name: string;
  server_url: string;
  auth_mode: string;
  deployed_at: string;
  quality_report: unknown;
  public_badge: boolean;
  org_id: string;
}

const seedDeployments: DeploymentSeed[] = [
  {
    deployment_id: OWNED_DEPLOYMENT_ID,
    generation_id: '11111111-1111-4111-8111-111111111101',
    server_name: 'owned-stripe-mcp',
    server_url: 'https://owned-stripe-mcp.mcpgen.dev',
    auth_mode: 'passthrough',
    deployed_at: '2026-04-15T12:00:00.000Z',
    quality_report: null,
    public_badge: false,
    org_id: TEST_ORG_ID,
  },
  {
    deployment_id: FOREIGN_DEPLOYMENT_ID,
    generation_id: '22222222-2222-4222-8222-222222222202',
    server_name: 'foreign-github-mcp',
    server_url: 'https://foreign-github-mcp.mcpgen.dev',
    auth_mode: 'passthrough',
    deployed_at: '2026-04-20T08:30:00.000Z',
    quality_report: null,
    public_badge: true,
    org_id: FOREIGN_ORG_ID,
  },
];

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
    // GET /deployments — list query: WHERE p.org_id = $1 ORDER BY ...
    if (
      sqlText.includes('FROM deployments d') &&
      sqlText.includes('WHERE p.org_id =') &&
      sqlText.includes('ORDER BY')
    ) {
      const orgId = params[0] as string | undefined;
      const matched = seedDeployments
        .filter((d) => d.org_id === orgId)
        .map(({ org_id: _drop, ...wire }) => wire);
      return Promise.resolve({ rows: matched });
    }
    return Promise.resolve({ rows: [] });
  }

  return { db: { execute } };
});

const { default: app } = await import('../../src/index.js');

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

describe('GET /api/v1/deployments', () => {
  beforeEach(() => {
    setAuthMode('user');
  });

  it('rejects without Authorization with 401', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/deployments'),
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it('rejects M2M token with 403 m2m_cannot_list_deployments (T-9-bff-auth-03)', async () => {
    setAuthMode('m2m');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/deployments', {
        headers: { Authorization: 'Bearer m2m-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('m2m_cannot_list_deployments');
  });

  it('returns 400 no_org_context when JWT has no organization_id', async () => {
    setAuthMode('no_org');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/deployments', {
        headers: { Authorization: 'Bearer user-jwt-no-org' },
      }),
      ENV,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_org_context');
  });

  it('returns only the authenticated org\'s deployments (T-9-bff-auth-05 cross-org isolation)', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/deployments', {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      deployments: Array<{ deployment_id: string; server_name: string }>;
    };
    expect(body.deployments).toHaveLength(1);
    expect(body.deployments[0]?.deployment_id).toBe(OWNED_DEPLOYMENT_ID);
    expect(body.deployments[0]?.server_name).toBe('owned-stripe-mcp');
    // Foreign-org deployment must NOT appear in the response.
    expect(body.deployments.some((d) => d.deployment_id === FOREIGN_DEPLOYMENT_ID)).toBe(false);
  });
});
