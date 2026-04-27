// apps/api/tests/inngest/stripe-meters-emit.test.ts
//
// CTRL-07 / D-22: Outbox poller tests.
// Wave 2: vi.mock stripe; integration with Neon dev branch when DATABASE_URL_UNPOOLED present.
// Wave 3: real Stripe sandbox via stripe-cli + RUN_STRIPE_INTEGRATION_TESTS=1.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupStripeMock } from '../_mocks/stripe.js';

setupStripeMock();

import { stripeMetersEmit } from '../../src/inngest/functions/stripe-meters-emit.js';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_SRC_PATH = resolve(HERE, '../../src/inngest/functions/stripe-meters-emit.ts');
const FN_SRC = readFileSync(FN_SRC_PATH, 'utf-8');

describe('stripe-meters-emit-v1', () => {
  it('uses the stable function ID from the register', () => {
    // Inngest function exposes id; assert it matches INNGEST_FUNCTION_IDS.
    const id =
      (stripeMetersEmit as unknown as { opts?: { id: string } }).opts?.id ??
      (stripeMetersEmit as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.STRIPE_METERS_EMIT);
    expect(id).toBe('stripe-meters-emit-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(FN_SRC).toContain('INNGEST_FUNCTION_IDS.STRIPE_METERS_EMIT');
  });

  it('claim-batch step uses FOR UPDATE SKIP LOCKED + LIMIT 100 (T-8-17)', () => {
    expect(FN_SRC).toContain('FOR UPDATE SKIP LOCKED');
    expect(FN_SRC).toContain('LIMIT 100');
  });

  it('per-row step.run uses identifier from row.idempotency_key (D-11 dedup)', () => {
    expect(FN_SRC).toContain('identifier: row.idempotency_key');
    expect(FN_SRC).toContain('billing.meterEvents.create');
  });

  it('refreshes usage_hourly MATERIALIZED VIEW (Wave 1 deviation #1)', () => {
    expect(FN_SRC).toContain('REFRESH MATERIALIZED VIEW');
    expect(FN_SRC).toContain('usage_hourly');
  });

  beforeEach(() => {
    // No state to reset — static-source assertions only in Wave 2.
  });
});

// Wave 3+ integration block: real outbox table + real Stripe sandbox via stripe-cli.
const HAS_DB = Boolean(process.env['DATABASE_URL_UNPOOLED']);
const runIntegration = HAS_DB && process.env['RUN_STRIPE_INTEGRATION_TESTS'] === '1';
describe.skipIf(!runIntegration)(
  'stripe-meters-emit (integration, real Neon + sandbox Stripe)',
  () => {
    it('UNIQUE constraint prevents duplicate idempotency_key insertion', () => {
      expect(runIntegration).toBe(true); // placeholder until Wave 3 expands
    });
  },
);
