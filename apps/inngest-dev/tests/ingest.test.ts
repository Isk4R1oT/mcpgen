// apps/inngest-dev/tests/ingest.test.ts
//
// Phase 6 Wave 4 — usage-events-ingest-v1 invokes db.execute with the
// expected INSERT (and 3-column ON CONFLICT clause per docs/decisions/005).

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';

// Track db.execute calls. mock.module REPLACES the resolved module before any
// dependent module imports it; must run before the function module is imported.
const executeCalls: Array<{ sql: string; values: unknown[] }> = [];

await mock.module('../src/db.js', () => ({
  db: {
    execute: async (queryObj: { sql?: string; queryChunks?: unknown[]; toSQL?: () => unknown }) => {
      // drizzle-orm sql`...` returns a SQL object; introspect via toSQL or
      // serialize the chunks to a single string for assertion.
      const serialized = JSON.stringify(queryObj);
      executeCalls.push({ sql: serialized, values: [] });
      return { rows: [] };
    },
  },
}));

const { usageEventsIngest } = await import('../src/functions/usage-events-ingest.js');

const TEST_DEPLOYMENT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const validEvent = {
  idempotency_key: `${TEST_DEPLOYMENT_ID}_2026-04-28T12:00_charges_create`,
  time: '2026-04-28T12:00:00.000Z',
  deployment_id: TEST_DEPLOYMENT_ID,
  tool_name: 'charges_create',
  tokens_in: 10,
  tokens_out: 20,
  upstream_latency_ms: 100,
  worker_cpu_ms: 5,
  status: 'ok' as const,
  client_type: 'claude_desktop' as const,
  error_class: null,
};

describe('Phase 6 Wave 4 — usage-events-ingest-v1', () => {
  beforeAll(() => {
    executeCalls.length = 0;
  });
  afterAll(() => {
    executeCalls.length = 0;
  });

  it('invokes db.execute exactly once with INSERT INTO usage_events + 3-col ON CONFLICT', async () => {
    // Pull the handler off the function. Inngest stores it under a non-public
    // field; reach into `.fn` (TFn = handler in InngestFunction).
    const handler = (
      usageEventsIngest as unknown as { fn: (args: unknown) => Promise<void> }
    ).fn;

    await handler({
      event: { name: 'usage/event.recorded', data: validEvent },
      step: {
        run: async (_name: string, fn: () => Promise<unknown>) => fn(),
      },
    });

    expect(executeCalls).toHaveLength(1);
    const recorded = executeCalls[0]!;
    expect(recorded.sql).toContain('INSERT INTO usage_events');
    // 3-column ON CONFLICT clause per docs/decisions/005 §Consequences.
    expect(recorded.sql).toContain('ON CONFLICT (deployment_id, idempotency_key, time) DO NOTHING');
  });

  it('rejects events that fail UsageEvent.parse() before touching db.execute', async () => {
    executeCalls.length = 0;
    const handler = (
      usageEventsIngest as unknown as { fn: (args: unknown) => Promise<void> }
    ).fn;

    const bad = { ...validEvent, deployment_id: 'not-a-uuid' };
    await expect(
      handler({
        event: { name: 'usage/event.recorded', data: bad },
        step: { run: async (_n: string, f: () => Promise<unknown>) => f() },
      }),
    ).rejects.toThrow();
    expect(executeCalls).toHaveLength(0);
  });
});
