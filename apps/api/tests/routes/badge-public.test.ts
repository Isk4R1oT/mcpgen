// apps/api/tests/routes/badge-public.test.ts
//
// Plan 09-03 Task 3 (Phase 9 D-18): integration tests for
// PATCH /api/v1/deployments/:id/badge-public. Mirrors drift.test.ts shape.
//
// Coverage (per <behavior> in 09-03-PLAN.md Task 3):
//   - 403 m2m_cannot_toggle_badge (T-9-bff-auth-03)
//   - 404 foreign-org deployment (T-9-bff-auth-02 — defense in depth, never
//     confirms existence; PATTERNS.md key finding #2)
//   - 200 owned deployment toggles public_badge column + returns updated state
//   - 400 zValidator rejects non-boolean public_badge

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
    const mode = (globalThis as unknown as { __authMode?: 'user' | 'm2m' }).__authMode ?? 'user';
    if (mode === 'm2m') {
      return {
        payload: {
          aud: opts.audience?.[1] ?? 'https://api.mcpgen.dev/m2m',
          sub: 'm2m_client',
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

const deploymentsStore = new Map<string, { id: string; org_id: string; public_badge: boolean }>();

function resetStore(): void {
  deploymentsStore.clear();
  deploymentsStore.set(OWNED_DEPLOYMENT_ID, {
    id: OWNED_DEPLOYMENT_ID,
    org_id: TEST_ORG_ID,
    public_badge: false,
  });
  deploymentsStore.set(FOREIGN_DEPLOYMENT_ID, {
    id: FOREIGN_DEPLOYMENT_ID,
    org_id: FOREIGN_ORG_ID,
    public_badge: false,
  });
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
    // deploymentBelongsToOrg lookup: SELECT p.org_id ... FROM deployments d
    // JOIN ... WHERE d.id = $1 LIMIT 1
    if (sqlText.includes('FROM deployments d') && sqlText.includes('LIMIT 1')) {
      const deploymentId = params[0] as string | undefined;
      const dep = deploymentId !== undefined ? deploymentsStore.get(deploymentId) : undefined;
      if (dep) {
        return Promise.resolve({ rows: [{ org_id: dep.org_id }] });
      }
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  }

  function update(_table: { _: { name: string } }): {
    set: (s: Record<string, unknown>) => {
      where: (_w: unknown) => Promise<void>;
    };
  } {
    return {
      set: (s) => ({
        where: () => {
          if ('public_badge' in s) {
            // For the test we only mutate the OWNED deployment because the
            // route's authz check never reaches this code path for foreign
            // deployments (404 short-circuits).
            const dep = deploymentsStore.get(OWNED_DEPLOYMENT_ID);
            if (dep) dep.public_badge = Boolean(s['public_badge']);
          }
          return Promise.resolve();
        },
      }),
    };
  }

  return { db: { execute, update } };
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

function setAuthMode(mode: 'user' | 'm2m'): void {
  (globalThis as unknown as { __authMode?: 'user' | 'm2m' }).__authMode = mode;
}

describe('PATCH /api/v1/deployments/:id/badge-public', () => {
  beforeEach(() => {
    resetStore();
    setAuthMode('user');
  });

  it('rejects M2M token with 403 m2m_cannot_toggle_badge (T-9-bff-auth-03)', async () => {
    setAuthMode('m2m');
    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}/badge-public`,
        {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer m2m-jwt',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ public_badge: true }),
        },
      ),
      ENV,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('m2m_cannot_toggle_badge');
  });

  it('returns 404 for foreign-org deployment (defense in depth, never 403)', async () => {
    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/deployments/${FOREIGN_DEPLOYMENT_ID}/badge-public`,
        {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer user-jwt',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ public_badge: true }),
        },
      ),
      ENV,
    );
    // Critical: 404 not 403 — never confirms existence to a foreign org.
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    // Foreign deployment row must NOT have been mutated.
    expect(deploymentsStore.get(FOREIGN_DEPLOYMENT_ID)?.public_badge).toBe(false);
  });

  it('returns 400 on non-boolean public_badge (zValidator rejects)', async () => {
    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}/badge-public`,
        {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer user-jwt',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ public_badge: 'not-a-bool' }),
        },
      ),
      ENV,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing public_badge field', async () => {
    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}/badge-public`,
        {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer user-jwt',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      ),
      ENV,
    );
    expect(res.status).toBe(400);
  });

  it('toggles public_badge to true for owned deployment + returns updated state', async () => {
    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}/badge-public`,
        {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer user-jwt',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ public_badge: true }),
        },
      ),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      deployment_id: string;
      public_badge: boolean;
      updated_at: string;
    };
    expect(body.deployment_id).toBe(OWNED_DEPLOYMENT_ID);
    expect(body.public_badge).toBe(true);
    expect(typeof body.updated_at).toBe('string');
    // Verify column was actually mutated.
    expect(deploymentsStore.get(OWNED_DEPLOYMENT_ID)?.public_badge).toBe(true);
  });

  it('toggles public_badge back to false (off) for owned deployment', async () => {
    // Pre-flip to true so the off case is non-vacuous.
    const dep = deploymentsStore.get(OWNED_DEPLOYMENT_ID);
    if (dep) dep.public_badge = true;
    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}/badge-public`,
        {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer user-jwt',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ public_badge: false }),
        },
      ),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { public_badge: boolean };
    expect(body.public_badge).toBe(false);
    expect(deploymentsStore.get(OWNED_DEPLOYMENT_ID)?.public_badge).toBe(false);
  });
});
