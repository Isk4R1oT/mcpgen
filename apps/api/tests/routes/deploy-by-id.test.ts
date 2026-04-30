// apps/api/tests/routes/deploy-by-id.test.ts
//
// Plan 09-04 Task 2 (Phase 9 D-18 — 4 of 4 BFF carry-forward endpoints):
// integration tests for POST /api/v1/deploy/:generationId. Mirrors
// apps/api/tests/routes/deployments-list.test.ts shape — jose mock with
// __authMode toggle, vi.mock('../../src/db.js') with an in-memory store
// that simulates `generationBelongsToOrg` 4-table JOIN authz check.
//
// HTTP-method note: the route is POST (not GET as the plan body sketches)
// because the frontend Route Handler proxy at
// apps/web/src/app/api/v1/deploy/[generationId]/route.ts wires POST and
// the dashboard-client deploy() function performs POST with optional
// `{ override_name }` body and Idempotency-Key header. Following Plan
// 09-03's deviation pattern — frontend proxy wins over plan body.
//
// Coverage (per <behavior> in 09-04-PLAN.md Task 2):
//   - 401 unauthenticated
//   - 403 m2m_cannot_deploy (T-9-bff-auth-03)
//   - 400 no_org_context when JWT has no organization_id
//   - 404 foreign-org generationId (T-9-bff-auth-07 — defense in depth,
//     never confirms existence; PATTERNS.md key finding #2)
//   - 404 nonexistent generationId
//   - 200/202 happy path returns DeployResponseSchema-shaped body
//   - claude_desktop_config snippet shape per auth_mode

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupStripeMock } from '../_mocks/stripe.js';

setupStripeMock();

const TEST_ORG_ID = '00000000-0000-4000-8000-000000000099';
const FOREIGN_ORG_ID = '00000000-0000-4000-8000-000000000088';

const OWNED_GENERATION_PASSTHROUGH = '11111111-1111-4111-8111-111111111101';
const OWNED_GENERATION_OAUTH = '11111111-1111-4111-8111-111111111102';
const FOREIGN_GENERATION_ID = '22222222-2222-4222-8222-222222222201';
const NONEXISTENT_GENERATION_ID = '33333333-3333-4333-8333-333333333301';

const OWNED_DEPLOYMENT_PASSTHROUGH = '11111111-1111-4111-8111-111111111201';
const OWNED_DEPLOYMENT_OAUTH = '11111111-1111-4111-8111-111111111202';

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

interface DeploymentSeed {
  deployment_id: string;
  generation_id: string;
  server_name: string;
  server_url: string;
  auth_mode: 'passthrough' | 'stored' | 'oauth';
  org_id: string;
}

const seeds: DeploymentSeed[] = [
  {
    deployment_id: OWNED_DEPLOYMENT_PASSTHROUGH,
    generation_id: OWNED_GENERATION_PASSTHROUGH,
    server_name: 'owned-stripe-mcp',
    server_url: 'https://owned-stripe-mcp.mcpgen.dev',
    auth_mode: 'passthrough',
    org_id: TEST_ORG_ID,
  },
  {
    deployment_id: OWNED_DEPLOYMENT_OAUTH,
    generation_id: OWNED_GENERATION_OAUTH,
    server_name: 'owned-github-mcp',
    server_url: 'https://owned-github-mcp.mcpgen.dev',
    auth_mode: 'oauth',
    org_id: TEST_ORG_ID,
  },
  {
    deployment_id: '22222222-2222-4222-8222-222222222301',
    generation_id: FOREIGN_GENERATION_ID,
    server_name: 'foreign-mcp',
    server_url: 'https://foreign-mcp.mcpgen.dev',
    auth_mode: 'passthrough',
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
    // generationBelongsToOrg lookup: SELECT p.org_id FROM generations g
    // JOIN projects p ON p.id = g.project_id WHERE g.id = $1 LIMIT 1
    if (
      sqlText.includes('FROM generations g') &&
      sqlText.includes('JOIN projects') &&
      sqlText.includes('WHERE g.id') &&
      sqlText.includes('LIMIT 1') &&
      !sqlText.includes('JOIN deployments')
    ) {
      const generationId = params[0] as string | undefined;
      const seed = seeds.find((s) => s.generation_id === generationId);
      if (seed) {
        return Promise.resolve({ rows: [{ org_id: seed.org_id }] });
      }
      return Promise.resolve({ rows: [] });
    }
    // Deploy fetch SELECT joining deployments + generations (route Task 2):
    // SELECT d.id, d.cf_worker_name AS server_name, d.url AS server_url,
    // d.auth_mode FROM deployments d JOIN generations g ON g.id = d.generation_id
    // WHERE g.id = $1 LIMIT 1
    if (
      sqlText.includes('FROM deployments d') &&
      sqlText.includes('JOIN generations g') &&
      sqlText.includes('WHERE g.id') &&
      sqlText.includes('LIMIT 1')
    ) {
      const generationId = params[0] as string | undefined;
      const seed = seeds.find((s) => s.generation_id === generationId);
      if (seed) {
        return Promise.resolve({
          rows: [
            {
              deployment_id: seed.deployment_id,
              server_name: seed.server_name,
              server_url: seed.server_url,
              auth_mode: seed.auth_mode,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  }

  return { db: { execute } };
});

const { default: app } = await import('../../src/index.js');
const { DeployResponseSchema } = await import('@mcpgen/contracts/dashboard-api');

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

function postDeploy(generationId: string, headers?: Record<string, string>) {
  return app.fetch(
    new Request(`http://localhost/api/v1/deploy/${generationId}`, {
      method: 'POST',
      headers: headers ?? { Authorization: 'Bearer user-jwt' },
    }),
    ENV,
  );
}

describe('POST /api/v1/deploy/:generationId', () => {
  beforeEach(() => {
    setAuthMode('user');
  });

  it('rejects without Authorization with 401', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/deploy/${OWNED_GENERATION_PASSTHROUGH}`, {
        method: 'POST',
      }),
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it('rejects M2M token with 403 m2m_cannot_deploy (T-9-bff-auth-03)', async () => {
    setAuthMode('m2m');
    const res = await postDeploy(OWNED_GENERATION_PASSTHROUGH, {
      Authorization: 'Bearer m2m-jwt',
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('m2m_cannot_deploy');
  });

  it('returns 400 no_org_context when JWT has no organization_id', async () => {
    setAuthMode('no_org');
    const res = await postDeploy(OWNED_GENERATION_PASSTHROUGH, {
      Authorization: 'Bearer user-jwt-no-org',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_org_context');
  });

  it('returns 404 for foreign-org generationId (defense in depth, NOT 403)', async () => {
    const res = await postDeploy(FOREIGN_GENERATION_ID);
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    // Body must NOT leak the foreign deployment shape.
    const text = await res.text();
    expect(text.includes('foreign-mcp')).toBe(false);
  });

  it('returns 404 for nonexistent generationId', async () => {
    const res = await postDeploy(NONEXISTENT_GENERATION_ID);
    expect(res.status).toBe(404);
  });

  it('returns 200/202 for org-owned generation with DeployResponseSchema-shaped body', async () => {
    const res = await postDeploy(OWNED_GENERATION_PASSTHROUGH);
    expect([200, 202]).toContain(res.status);
    const json: unknown = await res.json();
    const parsed = DeployResponseSchema.parse(json);
    expect(parsed.deployment_id).toBe(OWNED_DEPLOYMENT_PASSTHROUGH);
    expect(parsed.server_name).toBe('owned-stripe-mcp');
    expect(parsed.server_url).toBe('https://owned-stripe-mcp.mcpgen.dev');
    expect(parsed.claude_desktop_config).toBeDefined();
    expect(parsed.claude_desktop_config?.mcpServers).toBeDefined();
  });

  it('builds claude_desktop_config with X-Upstream-Auth placeholder for auth_mode=passthrough', async () => {
    const res = await postDeploy(OWNED_GENERATION_PASSTHROUGH);
    const json = (await res.json()) as {
      claude_desktop_config: {
        mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
      };
    };
    const entry = json.claude_desktop_config.mcpServers['owned-stripe-mcp'];
    expect(entry).toBeDefined();
    expect(entry?.url).toBe('https://owned-stripe-mcp.mcpgen.dev');
    expect(entry?.headers).toBeDefined();
    expect(entry?.headers?.['X-Upstream-Auth']).toBe('<paste-your-API-key-here>');
  });

  it('builds claude_desktop_config WITHOUT X-Upstream-Auth for auth_mode=oauth', async () => {
    const res = await postDeploy(OWNED_GENERATION_OAUTH);
    const json = (await res.json()) as {
      claude_desktop_config: {
        mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
      };
    };
    const entry = json.claude_desktop_config.mcpServers['owned-github-mcp'];
    expect(entry).toBeDefined();
    expect(entry?.url).toBe('https://owned-github-mcp.mcpgen.dev');
    // OAuth mode → no X-Upstream-Auth header (browser-based flow handles it).
    expect(entry?.headers).toBeUndefined();
  });
});
