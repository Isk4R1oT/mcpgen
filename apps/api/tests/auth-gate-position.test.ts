// apps/api/tests/auth-gate-position.test.ts
//
// Phase 09.1 plan 02 — D-07 + D-01 flex requirement: per-route auth refactor
// driven by `BFF_ANONYMOUS_GATE` env var.
//
// Replaces blanket `app.use('/api/v1/*', authMiddleware)` with mounted sub-app
// pattern (publicApp + protectedApp). The boundary is decided at registration
// time from `env.BFF_ANONYMOUS_GATE`. The Logto JWT verification logic itself
// (auth.ts) stays unchanged — only the boundary moves.
//
// Test matrix (8 cases, plus a CTRL-02-amend sanity case):
//   1. default `playground`       → /playground gated, /preview + /quality gated
//   2. `BFF_ANONYMOUS_GATE=preview`   → only /preview public
//   3. `BFF_ANONYMOUS_GATE=quality`   → /preview + /quality public, /playground gated
//   4. `BFF_ANONYMOUS_GATE=deploy`    → all three public
//   5. ALL gates                       → /dashboard always 401 anon
//   6. ALL gates                       → POST /generate is non-401 anon (the
//                                        original Phase 8 bug we are fixing)
//   7. ALL gates                       → GET /jobs/:id/stream is non-401 anon
//   8. With valid Logto JWT bearer    → /dashboard returns non-401 (auth.ts
//                                        logic still works)
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-01, D-07
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §2 (lines 144-246)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-02-PLAN.md
//
// jose is mocked (hoisted) so tests don't need a live Logto JWKS.

import { describe, it, expect, vi } from 'vitest';

// ─── Mock jose so a Bearer token is admitted with a synthetic payload ──────
vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({
    payload: { aud: 'http://localhost:3000', sub: 'user_test', organization_id: 'org_test' },
  })),
}));

// Import AFTER vi.mock so middleware sees the mocked module.
const { buildApp } = await import('../src/index.js');

type GatePosition = 'playground' | 'preview' | 'quality' | 'deploy';

function envFor(gate: GatePosition | undefined): Record<string, unknown> {
  return {
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
    BFF_ANONYMOUS_GATE: gate,
  };
}

async function fetchAnon(env: Record<string, unknown>, url: string, init?: RequestInit): Promise<Response> {
  const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
  return app.fetch(new Request(url, init), env);
}

async function fetchWithJwt(env: Record<string, unknown>, url: string, init?: RequestInit): Promise<Response> {
  const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', 'Bearer fake-jwt');
  return app.fetch(new Request(url, { ...init, headers }), env);
}

const ALL_GATES: ReadonlyArray<GatePosition> = ['playground', 'preview', 'quality', 'deploy'];

describe('BFF_ANONYMOUS_GATE per-route auth (D-07 + D-01)', () => {
  // ─── Test 1: default `playground` ──────────────────────────────────────
  describe("gate='playground' (default)", () => {
    it('anon GET /api/v1/playground/x returns 401', async () => {
      const res = await fetchAnon(envFor('playground'), 'http://x/api/v1/playground/abc');
      expect(res.status).toBe(401);
    });

    it('anon GET /api/v1/preview/x returns 401', async () => {
      const res = await fetchAnon(envFor('playground'), 'http://x/api/v1/preview/abc');
      expect(res.status).toBe(401);
    });

    it('anon GET /api/v1/quality/x returns 401', async () => {
      const res = await fetchAnon(envFor('playground'), 'http://x/api/v1/quality/abc');
      expect(res.status).toBe(401);
    });

    it('treats undefined env var as "playground" (default)', async () => {
      const res = await fetchAnon(envFor(undefined), 'http://x/api/v1/playground/abc');
      expect(res.status).toBe(401);
    });
  });

  // ─── Test 2: gate='preview' ─────────────────────────────────────────────
  describe("gate='preview'", () => {
    it('anon GET /api/v1/preview/x returns 200 (NOT 401)', async () => {
      const res = await fetchAnon(envFor('preview'), 'http://x/api/v1/preview/abc');
      expect(res.status).not.toBe(401);
      expect(res.status).toBeLessThan(500);
    });

    it('anon GET /api/v1/quality/x returns 401', async () => {
      const res = await fetchAnon(envFor('preview'), 'http://x/api/v1/quality/abc');
      expect(res.status).toBe(401);
    });

    it('anon GET /api/v1/playground/x returns 401', async () => {
      const res = await fetchAnon(envFor('preview'), 'http://x/api/v1/playground/abc');
      expect(res.status).toBe(401);
    });
  });

  // ─── Test 3: gate='quality' ─────────────────────────────────────────────
  describe("gate='quality'", () => {
    it('anon GET /api/v1/preview/x returns non-401', async () => {
      const res = await fetchAnon(envFor('quality'), 'http://x/api/v1/preview/abc');
      expect(res.status).not.toBe(401);
      expect(res.status).toBeLessThan(500);
    });

    it('anon GET /api/v1/quality/x returns non-401', async () => {
      const res = await fetchAnon(envFor('quality'), 'http://x/api/v1/quality/abc');
      expect(res.status).not.toBe(401);
      expect(res.status).toBeLessThan(500);
    });

    it('anon GET /api/v1/playground/x returns 401', async () => {
      const res = await fetchAnon(envFor('quality'), 'http://x/api/v1/playground/abc');
      expect(res.status).toBe(401);
    });
  });

  // ─── Test 4: gate='deploy' ──────────────────────────────────────────────
  describe("gate='deploy'", () => {
    it('anon GET /api/v1/preview/x returns non-401', async () => {
      const res = await fetchAnon(envFor('deploy'), 'http://x/api/v1/preview/abc');
      expect(res.status).not.toBe(401);
      expect(res.status).toBeLessThan(500);
    });

    it('anon GET /api/v1/quality/x returns non-401', async () => {
      const res = await fetchAnon(envFor('deploy'), 'http://x/api/v1/quality/abc');
      expect(res.status).not.toBe(401);
      expect(res.status).toBeLessThan(500);
    });

    it('anon GET /api/v1/playground/x returns non-401', async () => {
      const res = await fetchAnon(envFor('deploy'), 'http://x/api/v1/playground/abc');
      expect(res.status).not.toBe(401);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ─── Test 5: ALL gates → /dashboard always gated ────────────────────────
  describe('always-protected: /dashboard', () => {
    for (const gate of ALL_GATES) {
      it(`anon GET /api/v1/dashboard returns 401 under gate='${gate}'`, async () => {
        const res = await fetchAnon(envFor(gate), 'http://x/api/v1/dashboard');
        expect(res.status).toBe(401);
      });
    }
  });

  // ─── Test 6: ALL gates → POST /generate is non-401 anon ─────────────────
  describe('always-public: POST /api/v1/generate (the Phase 8 bug we fix)', () => {
    for (const gate of ALL_GATES) {
      it(`anon POST /api/v1/generate is non-401 under gate='${gate}'`, async () => {
        const res = await fetchAnon(envFor(gate), 'http://x/api/v1/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': '01HXAAAAAAAAAAAAAAAAAAAAA1',
          },
          body: JSON.stringify({ spec_url: 'https://example.com/spec.json' }),
        });
        expect(res.status).not.toBe(401);
      });
    }
  });

  // ─── Test 7: ALL gates → GET /jobs/:id/stream is non-401 anon ───────────
  describe('always-public: GET /api/v1/jobs/:id/stream', () => {
    for (const gate of ALL_GATES) {
      it(`anon GET /api/v1/jobs/abc/stream is non-401 under gate='${gate}'`, async () => {
        const res = await fetchAnon(envFor(gate), 'http://x/api/v1/jobs/abc/stream');
        expect(res.status).not.toBe(401);
      });
    }
  });

  // ─── Test 8: valid Logto JWT → /dashboard non-401 (auth.ts unchanged) ──
  describe('with valid Logto JWT bearer', () => {
    it('GET /api/v1/dashboard returns non-401 when Authorization is a valid bearer', async () => {
      const res = await fetchWithJwt(envFor('playground'), 'http://x/api/v1/dashboard');
      expect(res.status).not.toBe(401);
      // Stub returns 200; actual implementation in plan 09.1-03+. The point
      // here is auth.ts admits the JWT — middleware pass-through works.
    });
  });
});
