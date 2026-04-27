// apps/api/tests/routes/drift.test.ts
//
// CTRL-03 / D-19 / T-8-14: Drift management endpoints.
// 3 endpoints under protectedApp:
//   GET  /api/v1/deployments/:id/drift-events
//   POST /api/v1/drift-events/:id/regenerate
//   PATCH /api/v1/deployments/:id (DeploymentDriftPatchRequest body)
//
// All 3:
//   - reject M2M tokens with 403 (m2m_cannot_*)
//   - verify deployment ownership via 4-table JOIN; mismatch returns 404
//     (defense-in-depth — never confirm existence of foreign-org resources)
//
// Pattern mirrors apps/api/tests/billing/checkout.test.ts (Plan 03):
//   - jose mock with __authMode toggle (user / m2m JWTs)
//   - vi.mock('../../src/db.js') with a minimal in-memory store

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupStripeMock } from '../_mocks/stripe.js';

setupStripeMock(); // satisfies stripe import chain in apps/api/src/index.ts

const TEST_ORG_ID = '00000000-0000-4000-8000-000000000099';
const FOREIGN_ORG_ID = '00000000-0000-4000-8000-000000000099-foreign';
const OWNED_DEPLOYMENT_ID = 'dep-owned-1';
const FOREIGN_DEPLOYMENT_ID = 'dep-foreign-1';
const DRIFT_EVENT_ID = '01HZ-DRIFT-001';
const FOREIGN_DRIFT_EVENT_ID = '01HZ-DRIFT-FOREIGN';

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

// In-memory db mock that simulates the SQL JOIN authz checks the route uses.
// db.execute returns ownership rows derived from path-param id.
// db.select / db.insert / db.update return promise-like chained-builder objects.
const driftEventsStore = new Map<string, {
  id: string;
  deployment_id: string;
  status: string;
  resolved_by_generation_id: string | null;
}>();
const deploymentsStore = new Map<string, { id: string; auto_regenerate_on_drift: boolean }>();
const generationsCreated: Array<Record<string, unknown>> = [];

function resetStores(): void {
  driftEventsStore.clear();
  deploymentsStore.clear();
  generationsCreated.length = 0;
  driftEventsStore.set(DRIFT_EVENT_ID, {
    id: DRIFT_EVENT_ID,
    deployment_id: OWNED_DEPLOYMENT_ID,
    status: 'pending',
    resolved_by_generation_id: null,
  });
  driftEventsStore.set(FOREIGN_DRIFT_EVENT_ID, {
    id: FOREIGN_DRIFT_EVENT_ID,
    deployment_id: FOREIGN_DEPLOYMENT_ID,
    status: 'pending',
    resolved_by_generation_id: null,
  });
  deploymentsStore.set(OWNED_DEPLOYMENT_ID, {
    id: OWNED_DEPLOYMENT_ID,
    auto_regenerate_on_drift: false,
  });
  deploymentsStore.set(FOREIGN_DEPLOYMENT_ID, {
    id: FOREIGN_DEPLOYMENT_ID,
    auto_regenerate_on_drift: false,
  });
}

vi.mock('../../src/db.js', () => {
  function execute(_query: { queryChunks?: unknown }): Promise<{ rows: unknown[] }> {
    // Drizzle interleaves StringChunk objects (with `.value: string[]`) and
    // raw param primitives (typeof 'string'/'number') in queryChunks. Walk
    // the array, accumulating sqlText from StringChunks and params from
    // primitives. Verified by debug script against drizzle-orm@0.45.2.
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
    // deploymentBelongsToOrg / driftEventBelongsToOrg lookups resolve here.
    if (sqlText.includes('FROM deployments d') && sqlText.includes('LIMIT 1')) {
      const deploymentId = params[0] as string | undefined;
      if (deploymentId === OWNED_DEPLOYMENT_ID) {
        return Promise.resolve({ rows: [{ org_id: TEST_ORG_ID }] });
      }
      if (deploymentId === FOREIGN_DEPLOYMENT_ID) {
        return Promise.resolve({ rows: [{ org_id: FOREIGN_ORG_ID }] });
      }
      return Promise.resolve({ rows: [] });
    }
    if (sqlText.includes('FROM drift_events de') && sqlText.includes('LIMIT 1')) {
      const driftId = params[0] as string | undefined;
      if (driftId === DRIFT_EVENT_ID) {
        return Promise.resolve({
          rows: [
            {
              org_id: TEST_ORG_ID,
              spec_id: 'spec-owned-1',
              project_id: 'project-owned-1',
              deployment_id: OWNED_DEPLOYMENT_ID,
            },
          ],
        });
      }
      if (driftId === FOREIGN_DRIFT_EVENT_ID) {
        return Promise.resolve({
          rows: [
            {
              org_id: FOREIGN_ORG_ID,
              spec_id: 'spec-foreign-1',
              project_id: 'project-foreign-1',
              deployment_id: FOREIGN_DEPLOYMENT_ID,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  }

  function select(): {
    from: (_t: unknown) => { where: (_w: unknown) => Promise<unknown[]> };
  } {
    return {
      from: () => ({
        where: () =>
          Promise.resolve(
            Array.from(driftEventsStore.values()).filter(
              (de) => de.deployment_id === OWNED_DEPLOYMENT_ID,
            ),
          ),
      }),
    };
  }

  function insert(_table: { _: { name: string } }): {
    values: (v: Record<string, unknown>) => Promise<void>;
  } {
    return {
      values: (v) => {
        generationsCreated.push(v);
        return Promise.resolve();
      },
    };
  }

  function update(_table: { _: { name: string } }): {
    set: (s: Record<string, unknown>) => {
      where: (_w: unknown) => Promise<void>;
    };
  } {
    return {
      set: (s) => ({
        where: () => {
          // Apply to deploymentsStore for the PATCH assertion.
          if ('auto_regenerate_on_drift' in s) {
            const ds = deploymentsStore.get(OWNED_DEPLOYMENT_ID);
            if (ds) {
              ds.auto_regenerate_on_drift = Boolean(s['auto_regenerate_on_drift']);
            }
          }
          return Promise.resolve();
        },
      }),
    };
  }

  return {
    db: {
      execute,
      select,
      insert,
      update,
    },
  };
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

describe('GET /api/v1/deployments/:id/drift-events', () => {
  beforeEach(() => {
    resetStores();
    setAuthMode('user');
  });

  it('rejects without Authorization with 401', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}/drift-events`),
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it('rejects M2M token with 403 (T-8-14 mitigation)', async () => {
    setAuthMode('m2m');
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}/drift-events`, {
        headers: { Authorization: 'Bearer m2m-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('m2m_cannot_read_drift');
  });

  it('returns 404 for foreign-org deployment (defense-in-depth)', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/deployments/${FOREIGN_DEPLOYMENT_ID}/drift-events`, {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(404);
  });

  it('returns drift events for the owned deployment', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}/drift-events`, {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { drift_events: Array<{ id: string }> };
    expect(body.drift_events.length).toBeGreaterThanOrEqual(1);
    expect(body.drift_events.some((d) => d.id === DRIFT_EVENT_ID)).toBe(true);
  });
});

describe('POST /api/v1/drift-events/:id/regenerate', () => {
  beforeEach(() => {
    resetStores();
    setAuthMode('user');
  });

  it('rejects M2M token with 403', async () => {
    setAuthMode('m2m');
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/drift-events/${DRIFT_EVENT_ID}/regenerate`, {
        method: 'POST',
        headers: { Authorization: 'Bearer m2m-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('m2m_cannot_regenerate');
  });

  it('returns 404 for foreign-org drift event', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/drift-events/${FOREIGN_DRIFT_EVENT_ID}/regenerate`, {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(404);
  });

  it('creates a new generations row with triggered_by=drift_manual and returns sse_url', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/drift-events/${DRIFT_EVENT_ID}/regenerate`, {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { job_id: string; sse_url: string };
    expect(body.job_id).toBeTruthy();
    expect(body.sse_url).toBe(`/api/v1/jobs/${body.job_id}/stream`);
    const newGen = generationsCreated[0];
    expect(newGen).toBeDefined();
    expect(newGen?.['triggered_by']).toBe('drift_manual');
    expect(newGen?.['status']).toBe('queued');
    expect(newGen?.['spec_id']).toBe('spec-owned-1');
    expect(newGen?.['project_id']).toBe('project-owned-1');
  });
});

describe('PATCH /api/v1/deployments/:id', () => {
  beforeEach(() => {
    resetStores();
    setAuthMode('user');
  });

  it('rejects M2M token with 403', async () => {
    setAuthMode('m2m');
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer m2m-jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auto_regenerate_on_drift: true }),
      }),
      ENV,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('m2m_cannot_patch_deployment');
  });

  it('returns 400 on invalid body shape (zValidator rejects)', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer user-jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auto_regenerate_on_drift: 'not-a-bool' }),
      }),
      ENV,
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for foreign-org deployment', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/deployments/${FOREIGN_DEPLOYMENT_ID}`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer user-jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auto_regenerate_on_drift: true }),
      }),
      ENV,
    );
    expect(res.status).toBe(404);
  });

  it('updates deployments.auto_regenerate_on_drift for owned deployment', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/deployments/${OWNED_DEPLOYMENT_ID}`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer user-jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auto_regenerate_on_drift: true }),
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; auto_regenerate_on_drift: boolean };
    expect(body.ok).toBe(true);
    expect(body.auto_regenerate_on_drift).toBe(true);
    expect(deploymentsStore.get(OWNED_DEPLOYMENT_ID)?.auto_regenerate_on_drift).toBe(true);
  });
});
