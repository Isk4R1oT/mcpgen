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
// References:
// - 02-PATTERNS.md `apps/cli/src/sse_consumer.ts` row
// - packages/contracts/src/generation-api.ts (FROZEN GenerationSseEvent)
// - eventsource-parser ^3.0.8 createParser API

import {
  createParser,
  type EventSourceMessage,
  type EventSourceParser,
} from 'eventsource-parser';

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
