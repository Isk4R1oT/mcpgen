// apps/api/src/lib/cache-replay-timeline.ts
//
// Phase 09.1 plan 06 — D-05 cache-hit replay timeline builder.
//
// When the BFF detects a cache HIT for an incoming spec_hash, it inserts a
// fresh `generations` row with `cached_from_generation_id` pointing at the
// source row, then surfaces the cached payload to the client via SSE. This
// module produces the SYNTHETIC 9-stage event sequence that mimics a fresh
// generation's stage timeline (A → B → C → D → E → F1 → F2 → F3 → completed)
// but with delays calibrated so the entire stream completes in <1s (D-05 SLA).
//
// The CACHE-HIT signal lives in the FIRST event's `partial_result`:
//   { cache_hit: true, original_generation_id, original_quality, served_from }
// The frontend reads it from event 0 and renders the cache-hit badge in the
// quality report screen (plan 09.1-07 — frontend wire-up).
//
// The TERMINAL `completed` event carries the cached `final_tools` +
// `quality_report` so the preview screen can render directly from it without
// a follow-up DB read.
//
// Design constraint: `delayMs` per event ∈ [40, 120]. With 9 events the upper
// bound is 9 × 120 = 1080 ms, but realistic random draws average ~80 ms × 9 =
// 720 ms — well under the 1s SLA. Test 7 in cache-replay-timeline.test.ts
// asserts the sum-of-delays < 1000.
//
// Last-Event-ID resume is preserved by the consumer (apps/api/src/routes/v1/
// jobs/anon-stream.ts): each event has a fresh ULID `event_id` matching the
// FROZEN `GenerationSseEvent.event_id` shape, and the consumer matches against
// it before yielding the next event.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §6 lines 649-715
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-05
//   - apps/web/src/lib/fixture-mode/sse-timeline.ts (analog from Phase 7)
//   - packages/contracts/src/generation-api.ts (GenerationStage enum)

import type { GenerationStage } from '@mcpgen/contracts';
import { ulid } from 'ulid';

// 9-stage timeline matching the FROZEN GenerationStage enum order.
// Skips `validation_complete` and `failed` — cache hits never traverse those.
const STAGES: ReadonlyArray<GenerationStage> = [
  'A', 'B', 'C', 'D', 'E', 'F1', 'F2', 'F3', 'completed',
];

const CACHE_REPLAY_DELAY_MIN_MS = 40;
const CACHE_REPLAY_DELAY_MAX_MS = 120;

/**
 * Subset of the source `generations` row needed to author the cache-hit
 * replay. Stays JSON-serializable so it can flow through the SSE write path
 * without further DB reads.
 */
export interface CachedGen {
  readonly generation_id: string;
  readonly quality_score: number;
  readonly created_at: Date;
  readonly final_tools: unknown;
  readonly quality_report: unknown;
}

/**
 * One synthesized SSE event in the cache-replay timeline. Maps directly onto
 * the FROZEN `GenerationSseEvent` envelope on the wire (plus an internal
 * `delayMs` that the SSE writer honors before yielding).
 */
export interface CacheReplayEvent {
  readonly job_id: string;
  readonly event_id: string;
  readonly stage: GenerationStage;
  readonly status: 'started' | 'completed';
  readonly partial_result?: Record<string, unknown>;
  readonly delayMs: number;
}

/**
 * Build the 9-stage cache-replay timeline.
 *
 * - Event 0 (`A` started): carries `cache_hit: true` metadata so the frontend
 *   can surface the cache badge as soon as the first event arrives.
 * - Events 1..7 (`B`..`F3` started): no `partial_result` — synthetic markers
 *   so the progress UI animates through the stage timeline naturally.
 * - Event 8 (`completed`): carries `final_tools` + `quality_report` so the
 *   preview / quality screens can render without a follow-up DB read.
 *
 * Each event has a fresh ULID `event_id` (monotonic within the timeline by
 * virtue of `ulid()`'s timestamp prefix).
 */
export function buildCacheReplayTimeline(
  jobId: string,
  cached: CachedGen,
): ReadonlyArray<CacheReplayEvent> {
  const range = CACHE_REPLAY_DELAY_MAX_MS - CACHE_REPLAY_DELAY_MIN_MS;
  return STAGES.map((stage, idx) => {
    const isFirst = idx === 0;
    const isTerminal = stage === 'completed';

    const partial: Record<string, unknown> = {};

    if (isFirst) {
      partial.cache_hit = true;
      partial.original_quality = cached.quality_score;
      partial.original_generation_id = cached.generation_id;
      partial.served_from = cached.created_at.toISOString();
    }

    if (isTerminal) {
      partial.final_tools = cached.final_tools;
      partial.quality_report = cached.quality_report;
    }

    const event: CacheReplayEvent = {
      job_id: jobId,
      event_id: ulid(),
      stage,
      status: isTerminal ? 'completed' : 'started',
      delayMs: CACHE_REPLAY_DELAY_MIN_MS + Math.random() * range,
      ...(Object.keys(partial).length > 0 ? { partial_result: partial } : {}),
    };
    return event;
  });
}

/**
 * Async generator that yields SSE-framed strings for a cache-replay timeline.
 * Awaits each event's `delayMs` before yielding so the consumer receives a
 * realistic stage-by-stage sequence. Honors `Last-Event-ID` per Pitfall #20:
 * when present and matching a known event_id, skips past matched event
 * (resume from the next event).
 *
 * Mirrors the shape of `apps/web/src/lib/fixture-mode/sse-timeline.ts`'s
 * `streamTimeline` so the SSE handler can plug in either implementation.
 */
export async function* streamCacheReplayTimeline(
  timeline: ReadonlyArray<CacheReplayEvent>,
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
