// apps/api/src/lib/stripe-client.ts
//
// CTRL-06 / D-06: Lazy Stripe SDK client.
// Wave 1–2: vi.mock('stripe', ...) replaces this module's import in tests.
// Wave 3+: reads STRIPE_SECRET_KEY from .env.local at first use.
// Never log the API key.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-06, D-08
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-08

import Stripe from 'stripe';

let cached: Stripe | null = null;

export function getStripe(env: { STRIPE_SECRET_KEY: string }): Stripe {
  if (!cached) {
    cached = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return cached;
}

export function _resetStripeCacheForTesting(): void {
  cached = null;
}
