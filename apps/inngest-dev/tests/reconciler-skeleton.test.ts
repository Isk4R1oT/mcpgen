// apps/inngest-dev/tests/reconciler-skeleton.test.ts
//
// Phase 6 Wave 4 — usage-reconciler-v1 SKELETON. Reads aggregates from
// usage_events and logs the would_be_stripe_payload (Phase 8 wires real
// Stripe submission).

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';

const executeCalls: Array<{ sql: string }> = [];

await mock.module('../src/db.js', () => ({
  db: {
    execute: async (queryObj: unknown) => {
      executeCalls.push({ sql: JSON.stringify(queryObj) });
      return {
        rows: [
          {
            deployment_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            tool_name: 'charges_create',
            tool_calls: 5,
            tokens_in: 100,
            tokens_out: 200,
          },
        ],
      };
    },
  },
}));

const { usageReconciler } = await import('../src/functions/usage-reconciler.js');

describe('Phase 6 Wave 4 — usage-reconciler-v1 (SKELETON)', () => {
  const originalLog = console.log;
  const logs: string[] = [];

  beforeAll(() => {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(' '));
    };
  });
  afterAll(() => {
    console.log = originalLog;
  });

  it('logs the would_be_stripe_payload after computing aggregates', async () => {
    logs.length = 0;
    const handler = (
      usageReconciler as unknown as { fn: (args: unknown) => Promise<void> }
    ).fn;
    await handler({
      step: { run: async (_n: string, f: () => Promise<unknown>) => f() },
    });

    expect(executeCalls.length).toBeGreaterThanOrEqual(1);
    const matched = logs.filter((l) => l.includes('would_be_stripe_payload'));
    expect(matched.length).toBeGreaterThanOrEqual(1);
  });
});
