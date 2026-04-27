// apps/api/tests/auth-mounting.test.ts
//
// Verifies the 5-layer mounting in apps/api/src/index.ts:
//   - /health and /health/launch-criteria bypass auth (public layer 1+2)
//   - /api/inngest bypasses auth (public layer 3)
//   - /api/v1/* requires Authorization (protected layer 5)
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

describe('5-layer mounting', () => {
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

  it('GET /api/v1/anything returns 401 without Authorization', async () => {
    const res = await app.fetch(new Request('http://x/api/v1/jobs/abc/stream'), ENV);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe('unauthorized');
    expect(body.reason).toBe('missing_bearer');
  });

  it('GET /internal/v1/anything returns 401 without Authorization', async () => {
    const res = await app.fetch(new Request('http://x/internal/v1/parse'), ENV);
    expect(res.status).toBe(401);
  });
});
