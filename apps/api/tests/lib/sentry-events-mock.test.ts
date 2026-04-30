// apps/api/tests/lib/sentry-events-mock.test.ts
//
// CTRL-08 / D-13 — Phase 9 mock impl of SentryEventsAdapter for the leak-audit
// operator script. Phase 10 swaps in the real Sentry events API via env flag
// (SENTRY_EVENTS_ADAPTER=mock|real). Adapter pattern follows Phase 8 D-23
// `StorageAdapter` substitution model.
//
// Behaviour under test:
//   1. Empty by default — `query()` returns [] on a fresh mock.
//   2. After `mock.seed([...])`, `query()` returns the seeded events filtered
//      by serialized-JSON substring match against `query`.
//   3. Substring-search semantics: querying for "Bearer " matches events whose
//      serialized JSON contains "Bearer " anywhere (header / body / message).
//   4. `window_seconds` filters by `received_at` — events older than
//      `now - window_seconds` are excluded from results.

import { describe, it, expect, beforeEach } from 'vitest';

import { MockSentryEventsAdapter } from '../../src/lib/sentry-events-mock.js';
import type { SentryEvent } from '../../src/lib/sentry-events-adapter.js';

const PROJECT_SLUG = 'mcpgen';

function makeEvent(partial: Partial<SentryEvent> & { event_id: string }): SentryEvent {
  return {
    received_at: new Date().toISOString(),
    message: '',
    ...partial,
  };
}

describe('MockSentryEventsAdapter — empty default', () => {
  it('returns empty list when no events seeded', async () => {
    const mock = new MockSentryEventsAdapter();
    const out = await mock.query({
      query: 'Bearer ',
      window_seconds: 60,
      project_slug: PROJECT_SLUG,
    });
    expect(out).toEqual([]);
  });
});

describe('MockSentryEventsAdapter — seed + query', () => {
  let mock: MockSentryEventsAdapter;
  beforeEach(() => {
    mock = new MockSentryEventsAdapter();
  });

  it('returns seeded events filtered by serialized-JSON substring match', async () => {
    const e1 = makeEvent({
      event_id: 'evt-1',
      message: 'request had Bearer token leak',
    });
    const e2 = makeEvent({
      event_id: 'evt-2',
      message: 'unrelated startup log',
    });
    mock.seed([e1, e2]);

    const out = await mock.query({
      query: 'Bearer ',
      window_seconds: 60,
      project_slug: PROJECT_SLUG,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.event_id).toBe('evt-1');
  });

  it('substring search hits headers AND body AND message uniformly', async () => {
    const headerEvent = makeEvent({
      event_id: 'evt-h',
      request: { headers: { Authorization: 'Bearer secret-h' } },
      message: 'no payload',
    });
    const bodyEvent = makeEvent({
      event_id: 'evt-b',
      request: { data: { token: 'Bearer secret-b' } },
      message: 'no payload',
    });
    const messageEvent = makeEvent({
      event_id: 'evt-m',
      message: 'crash with Bearer secret-m',
    });
    const cleanEvent = makeEvent({
      event_id: 'evt-c',
      message: 'all clean here',
    });
    mock.seed([headerEvent, bodyEvent, messageEvent, cleanEvent]);

    const out = await mock.query({
      query: 'Bearer ',
      window_seconds: 60,
      project_slug: PROJECT_SLUG,
    });
    const ids = out.map((e) => e.event_id).sort();
    expect(ids).toEqual(['evt-b', 'evt-h', 'evt-m']);
  });
});

describe('MockSentryEventsAdapter — window_seconds filter', () => {
  it('excludes events received more than window_seconds ago', async () => {
    const now = Date.now();
    const recent = makeEvent({
      event_id: 'evt-recent',
      message: 'Bearer leak-recent',
      received_at: new Date(now - 10_000).toISOString(), // 10s ago
    });
    const old = makeEvent({
      event_id: 'evt-old',
      message: 'Bearer leak-old',
      received_at: new Date(now - 120_000).toISOString(), // 120s ago
    });

    const mock = new MockSentryEventsAdapter();
    mock.seed([recent, old]);

    const out = await mock.query({
      query: 'Bearer ',
      window_seconds: 60, // only events within last 60s
      project_slug: PROJECT_SLUG,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.event_id).toBe('evt-recent');
  });
});
