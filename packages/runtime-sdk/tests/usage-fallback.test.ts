// packages/runtime-sdk/tests/usage-fallback.test.ts
//
// Phase 6 Wave 4 — bun:sqlite fallback bucket round-trip.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Force in-memory db before importing the module so the singleton picks it up.
process.env.USAGE_FALLBACK_DB = ':memory:';

import {
  _clearFallbackForTest,
  deleteFallback,
  readFallback,
  writeFallback,
} from '../src/runtime/usage/fallback.js';
import type { UsageEvent } from '@mcpgen/contracts';

const TEST_DEPLOYMENT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function makeEvent(suffix: string): UsageEvent {
  return {
    idempotency_key: `${TEST_DEPLOYMENT_ID}_2026-04-28T12:00_charges_${suffix}`,
    time: '2026-04-28T12:00:00.000Z',
    deployment_id: TEST_DEPLOYMENT_ID,
    tool_name: `charges_${suffix}`,
    tokens_in: 10,
    tokens_out: 20,
    upstream_latency_ms: 100,
    worker_cpu_ms: 5,
    status: 'ok',
    client_type: 'claude_desktop',
    error_class: null,
  };
}

beforeEach(() => {
  _clearFallbackForTest();
});

afterEach(() => {
  _clearFallbackForTest();
});

describe('Phase 6 Wave 4 — usage fallback bucket', () => {
  it('writes and reads back 3 events', () => {
    writeFallback(makeEvent('a'));
    writeFallback(makeEvent('b'));
    writeFallback(makeEvent('c'));
    const got = readFallback(10);
    expect(got).toHaveLength(3);
    const names = got.map((e) => e.tool_name).sort();
    expect(names).toEqual(['charges_a', 'charges_b', 'charges_c']);
  });

  it('drains (deletes) entries by idempotency_key, leaving bucket empty', () => {
    const a = makeEvent('a');
    const b = makeEvent('b');
    writeFallback(a);
    writeFallback(b);
    deleteFallback(a.idempotency_key);
    deleteFallback(b.idempotency_key);
    expect(readFallback(10)).toHaveLength(0);
  });

  it('LIMIT clamps the result set', () => {
    writeFallback(makeEvent('a'));
    writeFallback(makeEvent('b'));
    writeFallback(makeEvent('c'));
    expect(readFallback(2)).toHaveLength(2);
  });
});
