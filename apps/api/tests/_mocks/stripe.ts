// apps/api/tests/_mocks/stripe.ts
//
// Shared vi.mock('stripe') helper for Wave 1–2 (full mocking, no real API calls).
// Wave 3+ replaces with real `STRIPE_SECRET_KEY` from .env.local; integration
// tests gated on `RUN_STRIPE_INTEGRATION_TESTS=1`.
//
// Usage in test files:
//   import { setupStripeMock } from './_mocks/stripe.js';
//   setupStripeMock();          // MUST appear BEFORE any app import
//   import { app } from '../src/index.js';
//
// Override per-test by re-mocking specific methods via setStripeMockOverrides:
//   setStripeMockOverrides({ webhookEvent: { id: 'evt_x', ... } });

import { vi } from 'vitest';

export interface StripeMockOverrides {
  webhookEvent?: unknown; // returned from constructEventAsync
  checkoutSessionUrl?: string;
  meterEventsCreate?: unknown;
  eventSummariesList?: { data: Array<{ aggregated_value: number }> };
  checkoutSessionsCreate?: unknown;
  billingPortalSessionsCreate?: unknown;
  signatureFails?: boolean;
}

let _overrides: StripeMockOverrides = {};

export function setStripeMockOverrides(overrides: StripeMockOverrides): void {
  _overrides = overrides;
}

export function setupStripeMock(): void {
  vi.mock('stripe', () => ({
    default: vi.fn().mockImplementation(() => ({
      webhooks: {
        constructEventAsync: vi.fn().mockImplementation(async (rawBody: string) => {
          if (_overrides.signatureFails) {
            const err = new Error('Invalid signature');
            (err as Error & { type?: string }).type = 'StripeSignatureVerificationError';
            throw err;
          }
          return _overrides.webhookEvent ?? JSON.parse(rawBody);
        }),
      },
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue(
            _overrides.checkoutSessionsCreate ?? {
              id: 'cs_test_1',
              url: _overrides.checkoutSessionUrl ?? 'https://checkout.stripe.com/test/abc',
            },
          ),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn().mockResolvedValue(
            _overrides.billingPortalSessionsCreate ?? { url: 'https://billing.stripe.com/portal/abc' },
          ),
        },
      },
      billing: {
        meterEvents: {
          create: vi
            .fn()
            .mockResolvedValue(_overrides.meterEventsCreate ?? { identifier: 'mock-id' }),
        },
        meters: {
          eventSummaries: {
            list: vi
              .fn()
              .mockResolvedValue(
                _overrides.eventSummariesList ?? { data: [{ aggregated_value: 5 }] },
              ),
          },
        },
      },
      products: {
        retrieve: vi.fn(),
        create: vi
          .fn()
          .mockImplementation(async ({ id }: { id: string }) => ({ id, object: 'product' })),
      },
      prices: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        create: vi
          .fn()
          .mockImplementation(async (p: { product: string }) => ({
            id: `price_${p.product}_test`,
            object: 'price',
          })),
      },
    })),
  }));
}
