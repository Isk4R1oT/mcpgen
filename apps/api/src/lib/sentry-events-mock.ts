// apps/api/src/lib/sentry-events-mock.ts
//
// CTRL-08 / D-13 — Phase 9 mock impl of SentryEventsAdapter.
//
// Used by:
//   - `apps/api/tests/lib/sentry-events-mock.test.ts` (unit tests)
//   - `scripts/observability/leak-audit.ts` (operator script — Phase 9 default
//     mode invoked as `pnpm leak-audit` or `tsx scripts/observability/leak-audit.ts`)
//   - `apps/api/tests/observability/leak-audit.test.ts` (integration tests
//     for the operator script — seeds events via env-fixture path)
//
// Phase 10: this module stays as-is for tests; the operator script's
// `--mode real` path will swap in `RealSentryEventsAdapter` from a separate
// file (see sentry-events-adapter.ts header).
//
// Substring match semantics: query string is matched against
// `JSON.stringify(event)` — the same string covers headers, body, message,
// extras uniformly. This is intentionally simpler than Sentry's real query
// syntax — sufficient for sentinel-string detection (D-13's only purpose).

import type {
  SentryEvent,
  SentryEventsAdapter,
} from './sentry-events-adapter.js';

export class MockSentryEventsAdapter implements SentryEventsAdapter {
  private events: SentryEvent[];

  constructor(initial?: ReadonlyArray<SentryEvent>) {
    this.events = initial ? [...initial] : [];
  }

  /**
   * Append events to the mock. Re-seeding does NOT clear prior events —
   * call sites that need a clean slate should construct a new instance.
   */
  seed(events: ReadonlyArray<SentryEvent>): void {
    this.events.push(...events);
  }

  async query(params: {
    readonly query: string;
    readonly window_seconds: number;
    readonly project_slug: string;
  }): Promise<SentryEvent[]> {
    const now = Date.now();
    const cutoff = now - params.window_seconds * 1000;
    const out: SentryEvent[] = [];
    for (const event of this.events) {
      // Window filter: drop events received before now - window_seconds.
      const receivedMs = Date.parse(event.received_at);
      if (Number.isNaN(receivedMs) || receivedMs < cutoff) {
        continue;
      }
      // Substring match against the serialized event.
      const serialized = JSON.stringify(event);
      if (serialized.includes(params.query)) {
        out.push(event);
      }
    }
    // `project_slug` is part of the contract for parity with the Phase 10
    // real adapter; the mock has no per-project storage and ignores it.
    void params.project_slug;
    return out;
  }
}
