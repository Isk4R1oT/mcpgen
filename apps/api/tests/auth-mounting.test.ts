// apps/api/tests/auth-mounting.test.ts
//
// Verifies the layered mounting in apps/api/src/index.ts after the
// Phase 09.1 plan 02 per-route refactor (D-07):
//   - /health and /health/launch-criteria bypass auth (public layer 1+2)
//   - /api/inngest bypasses auth (public layer 3)
//   - /api/v1/dashboard requires Authorization (protectedApp catch-all)
//   - /internal/v1/* requires Authorization (M2M sub-app)
//
// Anon-allowed /api/v1 routes (generate, jobs, deploy/ephemeral) and the
// gate-conditional preview/quality/playground are covered separately by
// auth-gate-position.test.ts.
//
// jose is mocked so the protected sub-app can be exercised without a live JWKS.

import { describe, it, expect, vi } from 'vitest';

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({ payload: { aud: 'http://localhost:3000', sub: 'u' } })),
}));

const app = (await import('../src/index.js')).default;

const ENV = {
  LOGTO_ENDPOINT: 'https://logto.test',
  LOGTO_BASE_URL: 'http://localhost:3000',
  LOGTO_M2M_RESOURCE_INDICATOR: 'https://api.mcpgen.dev/m2m',
  HYPERDRIVE: {} as Hyperdrive,
  SENTRY_DSN: '',
  ENVIRONMENT: 'test',
};

describe('layered mounting', () => {
  it('GET /health bypasses auth (no Authorization header)', async () => {
    const res = await app.fetch(new Request('http://x/health'), ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('GET /health/launch-criteria bypasses auth', async () => {
    const res = await app.fetch(new Request('http://x/health/launch-criteria'), ENV);
    expect(res.status).toBe(200);
  });

  it('GET /api/inngest is mounted (Inngest serve handles its own response)', async () => {
    const res = await app.fetch(new Request('http://x/api/inngest'), ENV);
    // Inngest serve responds — anything other than 401 (auth) is acceptable.
    expect(res.status).not.toBe(401);
  });

  it('GET /api/v1/dashboard returns 401 without Authorization (always-protected)', async () => {
    const res = await app.fetch(new Request('http://x/api/v1/dashboard'), ENV);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe('unauthorized');
    expect(body.reason).toBe('missing_bearer');
  });

  it('GET /api/v1/jobs/:id/stream is anon-allowed after Phase 09.1 plan 02 (D-07)', async () => {
    // Pre-09.1 this returned 401; the per-route refactor moves /jobs to the
    // public side so the anon hero flow can stream SSE without a Logto JWT.
    // The route-level cookie scoping (D-04) lands in plan 09.1-03; here we
    // only assert the auth boundary stops 401-ing.
    const res = await app.fetch(new Request('http://x/api/v1/jobs/abc/stream'), ENV);
    expect(res.status).not.toBe(401);
  });

  it('GET /internal/v1/anything returns 401 without Authorization', async () => {
    const res = await app.fetch(new Request('http://x/internal/v1/parse'), ENV);
    expect(res.status).toBe(401);
  });
});
