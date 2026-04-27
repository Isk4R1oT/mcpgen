// apps/inngest-dev/tests/fallback-drain.test.ts
//
// Phase 6 Wave 4 — usage-fallback-drain-v1: reads bun:sqlite fallback bucket,
// re-emits each event to Inngest dev, and deletes successfully-resent rows.

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

// Force in-memory fallback DB before importing anything that touches it.
process.env.USAGE_FALLBACK_DB = ':memory:';
process.env.INNGEST_DEV_URL = 'http://localhost:8288/e/mcpgen-dev';

import {
  _clearFallbackForTest,
  readFallback,
  writeFallback,
} from '@mcpgen/runtime/usage';
import { usageFallbackDrain } from '../src/functions/usage-fallback-drain.js';
import type { UsageEvent } from '@mcpgen/contracts';

const TEST_DEPLOYMENT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function makeEvent(suffix: string): UsageEvent {
  return {
    idempotency_key: `${TEST_DEPLOYMENT_ID}_2026-04-28T12:00_charges_${suffix}`,
    time: '2026-04-28T12:00:00.000Z',
    deployment_id: TEST_DEPLOYMENT_ID,
    tool_name: `charges_${suffix}`,
    tokens_in: 1,
    tokens_out: 1,
    upstream_latency_ms: 1,
    worker_cpu_ms: 1,
    status: 'ok',
    client_type: 'claude_desktop',
    error_class: null,
  };
}

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  _clearFallbackForTest();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  _clearFallbackForTest();
});

describe('Phase 6 Wave 4 — usage-fallback-drain-v1', () => {
  it('drains 2 events from the bucket and POSTs each to Inngest dev', async () => {
    writeFallback(makeEvent('a'));
    writeFallback(makeEvent('b'));

    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(typeof input === 'string' ? input : input.toString());
      // Capture body for sanity but do not assert here.
      void init;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const handler = (
      usageFallbackDrain as unknown as { fn: (args: unknown) => Promise<void> }
    ).fn;
    await handler({
      step: { run: async (_n: string, f: () => Promise<unknown>) => f() },
    });

    expect(calls).toHaveLength(2);
    expect(readFallback(10)).toHaveLength(0);
  });

  it('leaves events in the bucket when Inngest dev returns non-2xx', async () => {
    writeFallback(makeEvent('a'));

    globalThis.fetch = (async () =>
      new Response(null, { status: 503 })) as unknown as typeof fetch;

    const handler = (
      usageFallbackDrain as unknown as { fn: (args: unknown) => Promise<void> }
    ).fn;
    await handler({
      step: { run: async (_n: string, f: () => Promise<unknown>) => f() },
    });

    expect(readFallback(10)).toHaveLength(1);
  });
});
