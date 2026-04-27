// apps/api/tests/auth.test.ts
//
// CTRL-02 / D-01 / D-02: Logto JWT auth middleware behavior tests.
// T-8-01 (algorithm-confusion / invalid sig) + T-8-02 (audience confusion) coverage.
//
// jose is mocked (hoisted) so tests don't need a live Logto JWKS — synthetic
// payloads only.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// ─── Mock jose (hoisted) ──────────────────────────────────────────────────
type MockJoseState = {
  nextPayload: Record<string, unknown> | null;
  nextError: { code?: string; message: string } | null;
};
const mockJose: MockJoseState = { nextPayload: null, nextError: null };

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => {
    if (mockJose.nextError) {
      const err = new Error(mockJose.nextError.message);
      if (mockJose.nextError.code !== undefined) {
        (err as Error & { code?: string }).code = mockJose.nextError.code;
      }
      throw err;
    }
    return { payload: mockJose.nextPayload ?? {} };
  }),
}));

// Import AFTER vi.mock so the middleware sees the mocked module.
const { authMiddleware, requireM2M, _resetJwksCacheForTesting } = await import('../src/middleware/auth.js');
import type { AuthContext } from '../src/middleware/auth.js';

const ENV = {
  LOGTO_ENDPOINT: 'https://logto.test',
  LOGTO_BASE_URL: 'http://localhost:3000',
  LOGTO_M2M_RESOURCE_INDICATOR: 'https://api.mcpgen.dev/m2m',
};

type AppEnv = { Bindings: typeof ENV; Variables: { auth: AuthContext } };

function makeApp() {
  const app = new Hono<AppEnv>();
  app.use('/api/v1/*', authMiddleware);
  app.use('/internal/v1/*', authMiddleware);
  app.use('/internal/v1/*', requireM2M);
  app.get('/api/v1/echo', (c) => c.json({ auth: c.var.auth }));
  app.get('/internal/v1/ping', (c) => c.json({ auth: c.var.auth }));
  return app;
}

async function callEnv(app: ReturnType<typeof makeApp>, req: Request) {
  return app.fetch(req, ENV);
}

beforeEach(() => {
  mockJose.nextPayload = null;
  mockJose.nextError = null;
  _resetJwksCacheForTesting();
});

describe('authMiddleware', () => {
  it('rejects missing Authorization header (401, missing_bearer)', async () => {
    const res = await callEnv(makeApp(), new Request('http://x/api/v1/echo'));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe('unauthorized');
    expect(body.reason).toBe('missing_bearer');
  });

  it('rejects non-Bearer scheme (401, missing_bearer)', async () => {
    const res = await callEnv(
      makeApp(),
      new Request('http://x/api/v1/echo', { headers: { Authorization: 'Basic abc==' } }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('missing_bearer');
  });

  it('rejects invalid signature (401, propagates jose error code)', async () => {
    mockJose.nextError = { code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED', message: 'bad sig' };
    const res = await callEnv(
      makeApp(),
      new Request('http://x/api/v1/echo', { headers: { Authorization: 'Bearer abc' } }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('ERR_JWS_SIGNATURE_VERIFICATION_FAILED');
  });

  it('rejects expired token (401, ERR_JWT_EXPIRED)', async () => {
    mockJose.nextError = { code: 'ERR_JWT_EXPIRED', message: 'expired' };
    const res = await callEnv(
      makeApp(),
      new Request('http://x/api/v1/echo', { headers: { Authorization: 'Bearer abc' } }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('ERR_JWT_EXPIRED');
  });

  it('accepts user JWT (aud=LOGTO_BASE_URL) → isM2M=false, organizationId set', async () => {
    mockJose.nextPayload = {
      aud: ENV.LOGTO_BASE_URL,
      sub: 'user_abc',
      organization_id: 'org_xyz',
      scope: 'read write',
    };
    const res = await callEnv(
      makeApp(),
      new Request('http://x/api/v1/echo', { headers: { Authorization: 'Bearer abc' } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { auth: { isM2M: boolean; organizationId: string; subject: string; scopes: string[] } };
    expect(body.auth.isM2M).toBe(false);
    expect(body.auth.organizationId).toBe('org_xyz');
    expect(body.auth.subject).toBe('user_abc');
    expect(body.auth.scopes).toEqual(['read', 'write']);
  });

  it('accepts M2M JWT (aud=LOGTO_M2M_RESOURCE_INDICATOR) → isM2M=true', async () => {
    mockJose.nextPayload = {
      aud: ENV.LOGTO_M2M_RESOURCE_INDICATOR,
      sub: 'engine_m2m',
    };
    const res = await callEnv(
      makeApp(),
      new Request('http://x/internal/v1/ping', { headers: { Authorization: 'Bearer abc' } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { auth: { isM2M: boolean } };
    expect(body.auth.isM2M).toBe(true);
  });
});

describe('requireM2M', () => {
  it('rejects user JWT against requireM2M (403, m2m_required)', async () => {
    mockJose.nextPayload = {
      aud: ENV.LOGTO_BASE_URL,
      sub: 'user_abc',
    };
    const res = await callEnv(
      makeApp(),
      new Request('http://x/internal/v1/ping', { headers: { Authorization: 'Bearer abc' } }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe('forbidden');
    expect(body.reason).toBe('m2m_required');
  });

  it('allows M2M JWT through requireM2M', async () => {
    mockJose.nextPayload = {
      aud: ENV.LOGTO_M2M_RESOURCE_INDICATOR,
      sub: 'engine_m2m',
    };
    const res = await callEnv(
      makeApp(),
      new Request('http://x/internal/v1/ping', { headers: { Authorization: 'Bearer abc' } }),
    );
    expect(res.status).toBe(200);
  });
});
