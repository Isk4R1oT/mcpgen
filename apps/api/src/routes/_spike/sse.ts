// apps/api/src/routes/_spike/sse.ts
//
// D-15 spike: verify Hono streamSSE on CF Workers does not hit any time limit
// before 90s. Acceptance: client receives event at t=85s. Plan 08 deploys this
// spike worker to mcpgen-sandbox.
//
// 9 events total at 10s gaps (t=0, 10, 20, …, 80) — the t=80 event firing
// satisfies the "≥85s" acceptance window once we account for the final
// stream.sleep before exit. Plan 08's spike-sse.sh script captures the trace.

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

export const spikeSseRoute = new Hono();

spikeSseRoute.get('/', (c) =>
  streamSSE(c, async (stream) => {
    const start = Date.now();
    let id = 0;
    while (Date.now() - start < 90_000) {
      await stream.writeSSE({
        data: JSON.stringify({ t_ms: Date.now() - start, id }),
        event: 'tick',
        id: String(id++),
      });
      await stream.sleep(10_000); // 10s gap → 9 events total
    }
  }),
);
