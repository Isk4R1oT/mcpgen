// packages/runtime-sdk/tests/usage-emit.test.ts
//
// Phase 6 Wave 4 — emitUsageEvent unit test (RUN-06).
// Stubs globalThis.fetch (no Inngest dev required).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// In-memory fallback db so test runs are isolated.
process.env.USAGE_FALLBACK_DB = ':memory:';

import { emitUsageEvent } from '../src/runtime/usage/emit.js';
import {
  _clearFallbackForTest,
  readFallback,
} from '../src/runtime/usage/fallback.js';
import { drainPending } from '../src/runtime/wait_until.js';
import type { UsageEvent } from '@mcpgen/contracts';

// Valid UUID v4 (variant bits + version bits set correctly).
const TEST_DEPLOYMENT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function validEvent(): UsageEvent {
  return {
    idempotency_key: `${TEST_DEPLOYMENT_ID}_2026-04-28T12:00_charges_create`,
    time: '2026-04-28T12:00:00.000Z',
    deployment_id: TEST_DEPLOYMENT_ID,
    tool_name: 'charges_create',
    tokens_in: 10,
    tokens_out: 20,
    upstream_latency_ms: 100,
    worker_cpu_ms: 5,
    status: 'ok',
    client_type: 'claude_desktop',
    error_class: null,
  };
}

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  _clearFallbackForTest();
});

beforeEach(() => {
  _clearFallbackForTest();
});

describe('Phase 6 Wave 4 — emitUsageEvent', () => {
  it('POSTs to INNGEST_DEV_URL with the wrapped event payload', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: typeof input === 'string' ? input : input.toString(),
        body: JSON.parse(String(init?.body ?? '{}')),
      });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await emitUsageEvent(validEvent());
    await drainPending();

    expect(calls).toHaveLength(1);
    const first = calls[0];
    expect(first).toBeDefined();
    expect(first!.url).toContain('/e/');
    expect(first!.body).toMatchObject({
      name: 'usage/event.recorded',
      data: { tool_name: 'charges_create' },
    });
  });

  it('throws via UsageEvent.parse() BEFORE fetch when the event is invalid', async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const bad = { ...validEvent() } as Partial<UsageEvent>;
    delete bad.idempotency_key;

    await expect(emitUsageEvent(bad as UsageEvent)).rejects.toThrow();
    expect(fetchCalled).toBe(false);
  });

  it('writes event to fallback bucket when Inngest dev send rejects', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    const ev = validEvent();
    await emitUsageEvent(ev);
    // emit returns immediately; await pending waitUntil promises so the
    // fallback write completes before we assert.
    await drainPending();

    const got = readFallback(10);
    expect(got).toHaveLength(1);
    expect(got[0]?.idempotency_key).toBe(ev.idempotency_key);
  });

  it('writes event to fallback bucket when Inngest dev returns non-2xx', async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 503 })) as unknown as typeof fetch;

    const ev = { ...validEvent(), tool_name: 'charges_capture' };
    await emitUsageEvent(ev);
    await drainPending();

    const got = readFallback(10);
    expect(got).toHaveLength(1);
    expect(got[0]?.tool_name).toBe('charges_capture');
  });
});
