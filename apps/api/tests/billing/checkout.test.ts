// apps/api/tests/billing/checkout.test.ts
//
// CTRL-06 / D-06: Stripe Checkout Session route tests.
// Wave 3 ships static-shape mocking; Wave 5 E2E hits the real Stripe sandbox
// via stripe-cli + a live Logto JWT in apps/web.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupStripeMock, setStripeMockOverrides } from '../_mocks/stripe.js';

setupStripeMock(); // MUST appear BEFORE app import per Shared Pattern 8

// jose is mocked so the protected sub-app can be exercised without a live JWKS.
// Synthetic JWT payloads only — tests never hit the real Logto JWKS.
vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async (_token: string, _jwks: unknown, opts: { audience?: string[] }) => {
    // Return a payload whose `aud` matches whichever audience the auth middleware
    // expects — the test sets the jose mock per-test via the userJwt vs m2mJwt
    // helper below by toggling globalThis.__authMode.
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
        organization_id: '00000000-0000-4000-8000-000000000099',
      },
    };
  }),
}));

// Mock the Drizzle DB layer with a minimal in-memory store so tests run without
// DATABASE_URL. The lookups read users.logto_user_id and organizations.id.
vi.mock('../../src/db.js', () => ({
  db: {
    query: {
      organizations: {
        findFirst: vi.fn(async () => ({
          id: '00000000-0000-4000-8000-000000000099',
          stripe_customer_id: null,
          plan_tier: 'free',
        })),
      },
      users: {
        findFirst: vi.fn(async () => ({
          id: '00000000-0000-4000-8000-000000000098',
          email: 'user@example.com',
          logto_user_id: 'user_logto_id_1',
        })),
      },
    },
  },
}));

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

describe('POST /api/v1/billing/checkout', () => {
  beforeEach(() => {
    setStripeMockOverrides({});
    setAuthMode('user');
  });

  it('rejects without Authorization with 401', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/billing/checkout', { method: 'POST' }),
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it('rejects M2M token with 403 (T-8-06 mitigation against IDOR)', async () => {
    setAuthMode('m2m');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/billing/checkout', {
        method: 'POST',
        headers: { Authorization: 'Bearer m2m-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe('forbidden');
    expect(body.reason).toBe('m2m_cannot_checkout');
  });

  it('returns {url} from mocked Stripe Checkout for an authenticated user', async () => {
    setAuthMode('user');
    setStripeMockOverrides({
      checkoutSessionUrl: 'https://checkout.stripe.com/test/abc-cs-1',
    });
    const res = await app.fetch(
      new Request('http://localhost/api/v1/billing/checkout', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toContain('https://checkout.stripe.com/');
  });
});
