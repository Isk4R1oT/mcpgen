// apps/web/src/lib/fixture-mode/sse-timeline.ts
//
// Plan 07-03 — Synthetic SSE timeline generator for fixture-mode generation.
// Replays a 9-stage timeline (A → B → C → D → E → F1 → F2 → F3 → completed)
// against one of the 5 hand-crafted fixtures from `@mcpgen/engine-fixtures`,
// honoring `Last-Event-ID` for resume per RESEARCH "Pattern 5".
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Pattern 5" (verbatim)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-14
//   - packages/contracts/src/generation-api.ts (GenerationStage enum)
//   - packages/engine-fixtures/src/index.ts (5 fixture exports)

import { ALL_FIXTURES, type EngineFixture, type FixtureName } from '@mcpgen/engine-fixtures';
import { ulid } from 'ulid';

import type { GenerationStage } from '@mcpgen/contracts';

// 9-stage timeline matching the GenerationStage enum order.
const STAGES: ReadonlyArray<GenerationStage> = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F1',
  'F2',
  'F3',
  'completed',
];

const FIXTURE_ORDER: ReadonlyArray<FixtureName> = ['stripe', 'github', 'notion', 'linear', 'slack'];

const DEFAULT_STAGE_DELAY_MIN_MS = 1500;
const DEFAULT_STAGE_DELAY_MAX_MS = 3000;

interface TimelineOptions {
  readonly stageDelayMsMin?: number;
  readonly stageDelayMsMax?: number;
}

export interface TimelineEvent {
  readonly job_id: string;
  readonly event_id: string;
  readonly stage: GenerationStage;
  readonly status: 'started' | 'completed';
  readonly partial_result?: Record<string, unknown>;
  readonly delayMs: number;
}

/**
 * Deterministic fixture selection: hash `jobId` to a stable index in
 * FIXTURE_ORDER. Same jobId always yields the same fixture so SSE replay on
 * page reload returns consistent data. Default is `stripe`.
 */
export const findFixture = (jobId: string): EngineFixture => {
  if (jobId.length === 0) return ALL_FIXTURES.stripe;
  let hash = 0;
  for (let i = 0; i < jobId.length; i += 1) {
    hash = (hash * 31 + jobId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % FIXTURE_ORDER.length;
  const name = FIXTURE_ORDER[idx] ?? 'stripe';
  return ALL_FIXTURES[name];
};

/**
 * Build a 9-stage SSE timeline for a given jobId + fixture. Each event has a
 * fresh ULID `event_id` (monotonic by virtue of ulid()'s timestamp prefix).
 * The terminal `completed` event carries the fixture's full `final_tools` +
 * `quality_report` as `partial_result` so the preview / quality screens can
 * render directly from it.
 */
export const buildTimeline = (
  jobId: string,
  fixture: EngineFixture,
  opts: TimelineOptions = {},
): ReadonlyArray<TimelineEvent> => {
  const min = opts.stageDelayMsMin ?? DEFAULT_STAGE_DELAY_MIN_MS;
  const max = opts.stageDelayMsMax ?? DEFAULT_STAGE_DELAY_MAX_MS;
  const range = Math.max(0, max - min);

  return STAGES.map((stage) => {
    const isTerminal = stage === 'completed';
    const event: TimelineEvent = {
      job_id: jobId,
      event_id: ulid(),
      stage,
      status: isTerminal ? 'completed' : 'started',
      delayMs: min + Math.random() * range,
      ...(isTerminal
        ? {
            partial_result: {
              final_tools: fixture.finalTools,
              quality_report: fixture.qualityReport,
            } as Record<string, unknown>,
          }
        : {}),
    };
    return event;
  });
};

/**
 * Async generator that yields SSE-framed strings (`id:\nevent: message\ndata:\n\n`).
 * Awaits each event's `delayMs` before yielding so the consumer receives a
 * realistic stage-by-stage timeline. Honors `Last-Event-ID` per Pitfall #20:
 * when present, skips past matched event_id (resume from the next event).
 */
export async function* streamTimeline(
  timeline: ReadonlyArray<TimelineEvent>,
  lastEventId: string | null,
): AsyncGenerator<string> {
  let resumeIdx = 0;
  if (lastEventId !== null && lastEventId.length > 0) {
    const matched = timeline.findIndex((e) => e.event_id === lastEventId);
    if (matched >= 0) resumeIdx = matched + 1;
  }

  for (let i = resumeIdx; i < timeline.length; i += 1) {
    const e = timeline[i];
    if (e === undefined) continue;
    if (e.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, e.delayMs));
    }
    const payload: Record<string, unknown> = {
      job_id: e.job_id,
      event_id: e.event_id,
      stage: e.stage,
      status: e.status,
    };
    if (e.partial_result !== undefined) payload.partial_result = e.partial_result;
    yield `id: ${e.event_id}\nevent: message\ndata: ${JSON.stringify(payload)}\n\n`;
  }
}
