// Plan 07-03 — Vitest unit tests for fixture-mode SSE timeline.

import { describe, it, expect } from 'vitest';

import { buildTimeline, findFixture, streamTimeline } from '@/lib/fixture-mode/sse-timeline';

const TEST_JOB_ID = 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1';

describe('findFixture', () => {
  it('returns a fixture for any jobId (deterministic by hash)', () => {
    const a = findFixture(TEST_JOB_ID);
    const b = findFixture(TEST_JOB_ID);
    expect(a).toBe(b);
    expect(a.finalTools.length).toBeGreaterThan(0);
    expect(a.qualityReport).toBeDefined();
  });

  it('falls back to stripe for empty jobId', () => {
    const f = findFixture('');
    expect(f.finalTools.length).toBeGreaterThan(0);
  });
});

describe('buildTimeline', () => {
  it('emits 9 stages A → B → C → D → E → F1 → F2 → F3 → completed', () => {
    const fixture = findFixture(TEST_JOB_ID);
    const timeline = buildTimeline(TEST_JOB_ID, fixture, { stageDelayMsMin: 0, stageDelayMsMax: 0 });
    expect(timeline.map((e) => e.stage)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F1',
      'F2',
      'F3',
      'completed',
    ]);
  });

  it('terminal event carries final_tools + quality_report; non-terminal events do not', () => {
    const fixture = findFixture(TEST_JOB_ID);
    const timeline = buildTimeline(TEST_JOB_ID, fixture, { stageDelayMsMin: 0, stageDelayMsMax: 0 });
    const completed = timeline[timeline.length - 1];
    expect(completed?.status).toBe('completed');
    expect(completed?.partial_result).toBeDefined();
    expect(completed?.partial_result?.final_tools).toBe(fixture.finalTools);
    expect(completed?.partial_result?.quality_report).toBe(fixture.qualityReport);

    const a = timeline[0];
    expect(a?.partial_result).toBeUndefined();
  });

  it('event_ids are unique 26-char ULIDs', () => {
    const fixture = findFixture(TEST_JOB_ID);
    const timeline = buildTimeline(TEST_JOB_ID, fixture, { stageDelayMsMin: 0, stageDelayMsMax: 0 });
    const ids = new Set(timeline.map((e) => e.event_id));
    expect(ids.size).toBe(timeline.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    }
  });
});

describe('streamTimeline (Last-Event-ID resume)', () => {
  it('yields all 9 events when no Last-Event-ID', async () => {
    const fixture = findFixture(TEST_JOB_ID);
    const timeline = buildTimeline(TEST_JOB_ID, fixture, { stageDelayMsMin: 0, stageDelayMsMax: 0 });
    const out: string[] = [];
    for await (const sse of streamTimeline(timeline, null)) out.push(sse);
    expect(out.length).toBe(9);
    expect(out[0]).toMatch(/^id: [0-9A-HJKMNP-TV-Z]{26}\nevent: message\ndata: /);
  });

  it('skips past Last-Event-ID, yielding only events AFTER it', async () => {
    const fixture = findFixture(TEST_JOB_ID);
    const timeline = buildTimeline(TEST_JOB_ID, fixture, { stageDelayMsMin: 0, stageDelayMsMax: 0 });
    const fourthEventId = timeline[3]?.event_id ?? '';
    const out: string[] = [];
    for await (const sse of streamTimeline(timeline, fourthEventId)) out.push(sse);
    expect(out.length).toBe(timeline.length - 4);
  });

  it('falls back to full timeline when Last-Event-ID unknown', async () => {
    const fixture = findFixture(TEST_JOB_ID);
    const timeline = buildTimeline(TEST_JOB_ID, fixture, { stageDelayMsMin: 0, stageDelayMsMax: 0 });
    const out: string[] = [];
    for await (const sse of streamTimeline(timeline, '01HXZZZZZZZZZZZZZZZZZZZZZ0')) out.push(sse);
    expect(out.length).toBe(9);
  });
});
