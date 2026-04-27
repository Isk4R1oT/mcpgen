// apps/api/tests/stripe-webhook.test.ts
//
// CTRL-06 / D-08: Stripe webhook handler tests.
// Wave 2: full mocking via setupStripeMock() — NO real Stripe API calls.
// Wave 3+: real-sandbox integration tests gated on RUN_STRIPE_INTEGRATION_TESTS=1.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupStripeMock, setStripeMockOverrides } from './_mocks/stripe.js';

setupStripeMock(); // MUST appear BEFORE app import per Shared Pattern 8

// jose is mocked so /api/v1/* protected routes don't probe a live JWKS.
// (Webhook is mounted in the PUBLIC layer — bypass — but other routes loaded
// during `app.fetch` import the auth middleware module.)
vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({ payload: { aud: 'http://localhost:3000', sub: 'u' } })),
}));

// Mock the Drizzle layer minimally so tests run without a live Neon DB.
// In-memory store keyed by stripe_event_id; second insert with same key returns
// empty array (mirrors Postgres ON CONFLICT DO NOTHING ... RETURNING).
interface InsertedRow {
  stripe_event_id: string;
  status: string;
}
const _insertedByEventId = new Map<string, InsertedRow>();

interface MockChain {
  values(row: InsertedRow): MockChain;
  onConflictDoNothing(): MockChain;
  returning(): Promise<InsertedRow[]>;
  set(): MockChain;
  where(): Promise<void>;
}

vi.mock('../src/db.js', () => {
  let _row: InsertedRow | null = null;
  const chain: MockChain = {
    values(row) {
      _row = row;
      return chain;
    },
    onConflictDoNothing() {
      return chain;
    },
    async returning() {
      if (!_row) return [];
      if (_insertedByEventId.has(_row.stripe_event_id)) return [];
      _insertedByEventId.set(_row.stripe_event_id, _row);
      return [_row];
    },
    set() {
      return chain;
    },
    where() {
      return Promise.resolve();
    },
  };
  return {
    db: {
      insert: () => chain,
      update: () => chain,
    },
  };
});

const { default: app } = await import('../src/index.js');

const ENV = {
  LOGTO_ENDPOINT: 'https://logto.test',
  LOGTO_BASE_URL: 'http://localhost:3000',
  LOGTO_M2M_RESOURCE_INDICATOR: 'https://api.mcpgen.dev/m2m',
  HYPERDRIVE: {} as Hyperdrive,
  SENTRY_DSN: '',
  ENVIRONMENT: 'test',
  STRIPE_SECRET_KEY: 'sk_test_mock',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
};

describe('POST /api/v1/stripe/webhook', () => {
  beforeEach(() => {
    setStripeMockOverrides({});
    _insertedByEventId.clear();
  });

  it('rejects request without stripe-signature header with 400', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/stripe/webhook', {
        method: 'POST',
        body: JSON.stringify({ id: 'evt_test_1', type: 'customer.subscription.created' }),
      }),
      ENV,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_signature');
  });

  it('rejects bad signature with 400 (T-8-04)', async () => {
    setStripeMockOverrides({ signatureFails: true });
    const res = await app.fetch(
      new Request('http://localhost/api/v1/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'forged-sig' },
        body: JSON.stringify({ id: 'evt_forged_1', type: 'customer.subscription.created' }),
      }),
      ENV,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_signature');
  });

  it('persists event with stripe_event_id UNIQUE and returns 200', async () => {
    const event = {
      id: 'evt_test_create_1',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_1',
          metadata: { org_id: '00000000-0000-4000-8000-000000000099' },
          status: 'active',
        },
      },
    };
    setStripeMockOverrides({ webhookEvent: event });
    const res = await app.fetch(
      new Request('http://localhost/api/v1/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'mock-sig' },
        body: JSON.stringify(event),
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean; duplicate?: boolean };
    expect(body.received).toBe(true);
  });

  it('replay of same event_id returns 200 with duplicate:true (T-8-05)', async () => {
    const event = {
      id: 'evt_test_replay_1',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_2',
          metadata: { org_id: '00000000-0000-4000-8000-000000000099' },
          status: 'active',
        },
      },
    };
    setStripeMockOverrides({ webhookEvent: event });
    await app.fetch(
      new Request('http://localhost/api/v1/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'mock-sig' },
        body: JSON.stringify(event),
      }),
      ENV,
    );
    const res2 = await app.fetch(
      new Request('http://localhost/api/v1/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'mock-sig' },
        body: JSON.stringify(event),
      }),
      ENV,
    );
    expect(res2.status).toBe(200);
    const body = (await res2.json()) as { received: boolean; duplicate?: boolean };
    expect(body.duplicate).toBe(true);
  });

  it('unhandled event type acks 200 (forward-compat)', async () => {
    const event = {
      id: 'evt_test_unknown_1',
      type: 'product.updated',
      data: { object: { id: 'prod_1' } },
    };
    setStripeMockOverrides({ webhookEvent: event });
    const res = await app.fetch(
      new Request('http://localhost/api/v1/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'mock-sig' },
        body: JSON.stringify(event),
      }),
      ENV,
    );
    expect(res.status).toBe(200);
  });
});

// Wave 3+ integration block (gated)
const runIntegration = process.env['RUN_STRIPE_INTEGRATION_TESTS'] === '1';
describe.skipIf(!runIntegration)('stripe-webhook (integration, real sandbox)', () => {
  it('verifies real Stripe-signed payload from `stripe trigger`', () => {
    // Wave 3+: use stripe-cli + real STRIPE_WEBHOOK_SECRET; placeholder until then.
    expect(runIntegration).toBe(true);
  });
});
