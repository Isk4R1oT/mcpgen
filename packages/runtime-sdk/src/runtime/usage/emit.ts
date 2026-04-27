// packages/runtime-sdk/src/runtime/usage/emit.ts
//
// Phase 6 Wave 4 (per RUN-06 / D-12) — fire-and-forget usage event emit.
// tenant Worker -> waitUntil(fetch(INNGEST_DEV_URL, ...)) -> Inngest dev
// -> usage-events-ingest-v1 -> TimescaleDB. On send failure -> fallback bucket.
//
// Phase-10 swap: replace `fetch(INNGEST_DEV_URL, ...)` with
// `env.USAGE_QUEUE.send(event)` against the real CF Queue binding. Inngest
// functions stay (vendor-portable).
//
// Source: 06-RESEARCH Example 7.

import { type UsageEvent, UsageEvent as UsageEventSchema } from '@mcpgen/contracts';

import { waitUntil } from '../wait_until.js';
import { writeFallback } from './fallback.js';

const INNGEST_DEV_URL =
  process.env.INNGEST_DEV_URL ?? 'http://localhost:8288/e/mcpgen-dev';

export async function emitUsageEvent(event: UsageEvent): Promise<void> {
  // Single-source-of-truth validation per FND-04 — throws if drift.
  UsageEventSchema.parse(event);

  const send = fetch(INNGEST_DEV_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'usage/event.recorded', data: event }),
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`inngest_dev_${r.status}`);
    })
    .catch((e) => {
      // Backpressure / dev unavailable -> fallback bucket. Never throw out of emit.
      try {
        writeFallback(event);
      } catch (_inner) {
        // fallback failure is observable via console
      }
      console.warn('[usage] fallback write:', (e as Error).message);
    });

  waitUntil(send);
}

export const _INNGEST_DEV_URL_FOR_TEST = INNGEST_DEV_URL;
