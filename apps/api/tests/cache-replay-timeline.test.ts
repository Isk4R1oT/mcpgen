// apps/api/tests/cache-replay-timeline.test.ts
//
// Phase 09.1 plan 06 Task 1 — TDD RED for cache-replay timeline builder.
//
// Pure unit tests (no DB) covering `buildCacheReplayTimeline(jobId, cached)`
// from `apps/api/src/lib/cache-replay-timeline.ts` (created in Task 2).
//
// Locked invariants:
//   - 9-stage timeline matches GenerationStage enum order: A,B,C,D,E,F1,F2,F3,completed.
//   - First event carries `cache_hit:true` + `original_generation_id` + `original_quality`
//     + `served_from` ISO string in `partial_result` (CONTEXT D-05 step 6).
//   - Terminal `completed` event carries `final_tools` + `quality_report`.
//   - All event_ids are ULIDs and all distinct.
//   - Each event delayMs ∈ [40, 120] (RESEARCH §6 lines 649-715).
//   - Stage order is deterministic across calls.
//   - SUM of delayMs < 1000 ms (D-05 SLA: cache replay must complete <1s).
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-PLAN-06.md interfaces
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §6
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-05
//   - apps/web/src/lib/fixture-mode/sse-timeline.ts (analog)

import { describe, expect, it } from 'vitest';

import {
  buildCacheReplayTimeline,
  type CachedGen,
} from '../src/lib/cache-replay-timeline.js';

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function makeCached(overrides: Partial<CachedGen> = {}): CachedGen {
  return {
    generation_id: 'aaaaaaaa-1111-4222-8333-444444444444',
    quality_score: 4.5,
    created_at: new Date('2026-04-30T12:00:00.000Z'),
    final_tools: { tools: [{ name: 'search' }, { name: 'fetch' }] },
    quality_report: { overall_score: 4.5, badge: 'verified' },
    ...overrides,
  };
}

describe('buildCacheReplayTimeline (D-05 cache-hit replay)', () => {
  // ─── timeline test 1 ─────────────────────────────────────────────────────
  it('returns 9 events covering A,B,C,D,E,F1,F2,F3,completed', () => {
    const events = buildCacheReplayTimeline('gen_01HXAAAAAAAAAAAAAAAAAAAAA1', makeCached());
    expect(events).toHaveLength(9);
    expect(events.map((e) => e.stage)).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F1', 'F2', 'F3', 'completed',
    ]);
  });

  // ─── timeline test 2 ─────────────────────────────────────────────────────
  it('first event has partial_result.cache_hit=true with original_generation_id', () => {
    const cached = makeCached({
      generation_id: 'deadbeef-cafe-4abc-9def-012345678901',
      quality_score: 4.7,
      created_at: new Date('2026-04-29T03:14:15.000Z'),
    });
    const events = buildCacheReplayTimeline('gen_01HXBBBBBBBBBBBBBBBBBBBBB1', cached);
    const first = events[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.stage).toBe('A');
    expect(first.partial_result).toBeDefined();
    const partial = first.partial_result ?? {};
    expect(partial.cache_hit).toBe(true);
    expect(partial.original_generation_id).toBe('deadbeef-cafe-4abc-9def-012345678901');
    expect(partial.original_quality).toBe(4.7);
    expect(partial.served_from).toBe('2026-04-29T03:14:15.000Z');
  });

  // ─── timeline test 3 ─────────────────────────────────────────────────────
  it('last event (completed) carries final_tools and quality_report', () => {
    const cached = makeCached({
      final_tools: { tools: [{ name: 'list_objects' }] },
      quality_report: { overall_score: 4.2 },
    });
    const events = buildCacheReplayTimeline('gen_01HXCCCCCCCCCCCCCCCCCCCCC1', cached);
    const last = events[events.length - 1];
    expect(last).toBeDefined();
    if (!last) return;
    expect(last.stage).toBe('completed');
    expect(last.status).toBe('completed');
    const partial = last.partial_result ?? {};
    expect(partial.final_tools).toEqual({ tools: [{ name: 'list_objects' }] });
    expect(partial.quality_report).toEqual({ overall_score: 4.2 });
  });

  // ─── timeline test 4 ─────────────────────────────────────────────────────
  it('every event has a unique ULID event_id', () => {
    const events = buildCacheReplayTimeline('gen_01HXDDDDDDDDDDDDDDDDDDDDD1', makeCached());
    const ids = events.map((e) => e.event_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(events.length);
    for (const id of ids) {
      expect(id).toMatch(ULID_REGEX);
    }
  });

  // ─── timeline test 5 ─────────────────────────────────────────────────────
  it('every event delayMs ∈ [40, 120]', () => {
    const events = buildCacheReplayTimeline('gen_01HXEEEEEEEEEEEEEEEEEEEEE1', makeCached());
    for (const e of events) {
      expect(e.delayMs).toBeGreaterThanOrEqual(40);
      expect(e.delayMs).toBeLessThanOrEqual(120);
    }
  });

  // ─── timeline test 6 ─────────────────────────────────────────────────────
  it('stage order is deterministic across multiple builds', () => {
    const a = buildCacheReplayTimeline('gen_01HXFFFFFFFFFFFFFFFFFFFFF1', makeCached());
    const b = buildCacheReplayTimeline('gen_01HXFFFFFFFFFFFFFFFFFFFFF2', makeCached());
    expect(a.map((e) => e.stage)).toEqual(b.map((e) => e.stage));
  });

  // ─── timeline test 7 (D-05 SLA: <1s) ─────────────────────────────────────
  it('total delayMs sum < 1000 (cache replay D-05 SLA <1s)', () => {
    const events = buildCacheReplayTimeline('gen_01HXGGGGGGGGGGGGGGGGGGGGG1', makeCached());
    const total = events.reduce((acc, e) => acc + e.delayMs, 0);
    expect(total).toBeLessThan(1000);
  });
});
