// apps/cli/src/init/sse_consumer.ts
//
// Hand-rolled SSE consumer using `eventsource-parser` (already pinned in
// apps/cli/package.json). Yields typed `GenerationSseEvent` objects parsed
// against the FROZEN Phase-1 Zod schema; malformed events are logged and
// skipped (so a rogue event id can't crash the CLI).
//
// Phase 2 reads-only — the engine is the SSE source of truth. Last-Event-ID
// resume is delegated to the engine handler (`api/generate.py::stream`)
// which already honours the header per D-09.
//
// Phase 5 extends the consumer with a Stage F event router
// (`handleStageFEvent`) that prints F1/F2/F3 progress lines per CONTEXT
// D-38 and surfaces the final `quality_report` payload from
// `validation_complete:completed` per CONTEXT D-30 / D-31.
//
// References:
// - 02-PATTERNS.md `apps/cli/src/sse_consumer.ts` row
// - 05-CONTEXT.md D-30 (validation_complete payload) + D-31 (event sequence)
//   + D-38 (CLI progress format)
// - packages/contracts/src/generation-api.ts (FROZEN GenerationSseEvent)
// - eventsource-parser ^3.0.8 createParser API

import {
  createParser,
  type EventSourceMessage,
  type EventSourceParser,
} from 'eventsource-parser';
import pc from 'picocolors';

import type { GenerationSseEvent } from '@mcpgen/contracts';
import type { QualityReport } from '@mcpgen/ir';

export interface RawSseEvent {
  readonly data: string;
  readonly event: string | null;
  readonly id: string | null;
}

/**
 * Async-iterable that yields raw SSE messages parsed from the response body.
 * The caller is responsible for JSON-parsing and Zod-validating each
 * `data` payload via the frozen `GenerationSseEvent` schema.
 *
 * Throws on non-2xx HTTP responses. Returns when the stream closes.
 */
export async function* consumeSse(url: string): AsyncIterable<RawSseEvent> {
  const resp = await fetch(url, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!resp.ok) {
    throw new Error(`SSE stream returned ${resp.status} ${resp.statusText}`);
  }
  if (resp.body === null) {
    throw new Error('SSE response has no body');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const queue: RawSseEvent[] = [];

  const parser: EventSourceParser = createParser({
    onEvent: (msg: EventSourceMessage): void => {
      queue.push({
        data: msg.data,
        event: msg.event ?? null,
        id: msg.id ?? null,
      });
    },
  });

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      while (queue.length > 0) {
        const ev = queue.shift();
        if (ev !== undefined) yield ev;
      }
      return;
    }
    parser.feed(decoder.decode(value, { stream: true }));
    while (queue.length > 0) {
      const ev = queue.shift();
      if (ev !== undefined) yield ev;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Plan 05-09 Task 2 — Stage F event router
// ─────────────────────────────────────────────────────────────────────────

/**
 * Per-job state carried across Stage F events: start timestamps for
 * elapsed-time formatting in the completed lines (D-38).
 */
export interface StageFRendererState {
  f1StartedAt: number | null;
  f2StartedAt: number | null;
  f3StartedAt: number | null;
}

export interface StageFValidationComplete {
  readonly kind: 'validation_complete';
  readonly qualityReport: QualityReport;
}

/**
 * Result returned by `handleStageFEvent`:
 *   - `null` for non-Stage-F events (caller should ignore)
 *   - `{ kind: 'validation_complete', qualityReport }` for the terminal
 *     event (caller renders the QualityReport via `renderQualityReport`)
 */
export type StageFEventResult = StageFValidationComplete | null;

interface F1Payload {
  passed: boolean;
  checks_run?: number;
  subprocess_checks_pending?: boolean;
  first_failure?: {
    check_name: string;
    error: string;
    retry_target: string;
  };
}

interface F2Payload {
  passed: boolean;
  overall_score: number;
  sigma: number;
  low_confidence_run: boolean;
  tool_count: number;
}

interface F3Payload {
  passed: boolean;
  pass_rate: number;
  results_count: number;
  mock_clients_passed: boolean;
}

function formatDuration(startedAt: number | null): string {
  if (startedAt === null) return '';
  const elapsed = (Date.now() - startedAt) / 1000;
  return ` (${elapsed.toFixed(1)}s)`;
}

function isF1Payload(p: unknown): p is F1Payload {
  return (
    typeof p === 'object' && p !== null && 'passed' in p
    && typeof (p as { passed: unknown }).passed === 'boolean'
  );
}

function isF2Payload(p: unknown): p is F2Payload {
  return (
    typeof p === 'object' && p !== null && 'overall_score' in p && 'sigma' in p
  );
}

function isF3Payload(p: unknown): p is F3Payload {
  return (
    typeof p === 'object' && p !== null && 'pass_rate' in p
  );
}

/**
 * Route a single SSE event through the Stage F renderer. Returns
 * `validation_complete` when the embedded `quality_report` payload is
 * present so the caller can drive `renderQualityReport`.
 *
 * Pure side effect: `console.log` per D-38 lines. Mutates the supplied
 * `state` for elapsed-time tracking. Returns null for any non-Stage-F
 * event (caller's existing `renderProgress` handles those).
 */
export function handleStageFEvent(
  event: GenerationSseEvent,
  state: StageFRendererState,
): StageFEventResult {
  // ─── F1 ─────────────────────────────────────────────────────────────
  if (event.stage === 'F1' && event.status === 'started') {
    state.f1StartedAt = Date.now();
    console.log(pc.dim('⏺ F1 — running 11 checks...'));
    return null;
  }
  if (event.stage === 'F1' && event.status === 'completed') {
    const payload = event.partial_result?.f1_result;
    if (!isF1Payload(payload)) {
      console.log(`F1 completed${formatDuration(state.f1StartedAt)}`);
      return null;
    }
    const total = typeof payload.checks_run === 'number'
      ? payload.checks_run
      : 11;
    const passes = payload.passed ? total : Math.max(total - 1, 0);
    if (payload.passed) {
      console.log(
        pc.green('✓')
          + ` F1 — ${passes}/${total} passed${formatDuration(state.f1StartedAt)}`,
      );
    } else {
      const failureNote = payload.first_failure
        ? ` (first failure: ${payload.first_failure.check_name})`
        : '';
      console.log(
        pc.red('✗')
          + ` F1 — fail${failureNote}${formatDuration(state.f1StartedAt)}`,
      );
    }
    return null;
  }

  // ─── F2 ─────────────────────────────────────────────────────────────
  if (event.stage === 'F2' && event.status === 'started') {
    state.f2StartedAt = Date.now();
    console.log(pc.dim('⏺ F2 — running smell scan...'));
    return null;
  }
  if (event.stage === 'F2' && event.status === 'completed') {
    const payload = event.partial_result?.f2_result;
    if (!isF2Payload(payload)) {
      console.log(`F2 completed${formatDuration(state.f2StartedAt)}`);
      return null;
    }
    const lowConf = payload.low_confidence_run
      ? pc.yellow(' (low_confidence — sigma below threshold)')
      : '';
    const mark = payload.passed ? pc.green('✓') : pc.red('✗');
    console.log(
      `${mark} F2 — ${payload.overall_score.toFixed(2)} / 5.00 (overall) — σ = ${payload.sigma.toFixed(2)}${lowConf}${formatDuration(state.f2StartedAt)}`,
    );
    return null;
  }
  // F2 retry_planned — engine emits status=error with retry metadata.
  if (
    event.stage === 'F2' && event.status === 'error'
    && event.partial_result?.retry_planned === true
  ) {
    const round = event.partial_result.round;
    const target = String(event.partial_result.retry_target ?? '');
    const reason = String(event.partial_result.reason ?? '');
    console.log(
      pc.yellow(
        `↻ Retry round ${String(round)} — ${target}${reason ? ` (${reason})` : ''}`,
      ),
    );
    return null;
  }

  // ─── F3 ─────────────────────────────────────────────────────────────
  if (event.stage === 'F3' && event.status === 'started') {
    state.f3StartedAt = Date.now();
    console.log(pc.dim('⏺ F3 — running golden tasks (Sonnet 4.7)...'));
    return null;
  }
  if (event.stage === 'F3' && event.status === 'completed') {
    const payload = event.partial_result?.f3_result;
    if (!isF3Payload(payload)) {
      console.log(`F3 completed${formatDuration(state.f3StartedAt)}`);
      return null;
    }
    const passes = Math.round(payload.pass_rate * payload.results_count);
    const mark = payload.passed ? pc.green('✓') : pc.red('✗');
    console.log(
      `${mark} F3 — ${passes}/${payload.results_count} tasks passed (rate ${payload.pass_rate.toFixed(2)})${formatDuration(state.f3StartedAt)}`,
    );
    return null;
  }
  if (
    event.stage === 'F3' && event.status === 'error'
    && event.partial_result?.retry_planned === true
  ) {
    const round = event.partial_result.round;
    const target = String(event.partial_result.retry_target ?? '');
    const reason = String(event.partial_result.reason ?? '');
    console.log(
      pc.yellow(
        `↻ Retry round ${String(round)} — ${target}${reason ? ` (${reason})` : ''}`,
      ),
    );
    return null;
  }

  // ─── validation_complete (terminal) ────────────────────────────────
  if (event.stage === 'validation_complete' && event.status === 'completed') {
    const qr = event.partial_result?.quality_report;
    if (qr === undefined || qr === null) {
      return null;
    }
    return {
      kind: 'validation_complete',
      qualityReport: qr as QualityReport,
    };
  }

  return null;
}
