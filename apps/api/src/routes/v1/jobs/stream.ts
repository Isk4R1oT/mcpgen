// apps/api/src/routes/v1/jobs/stream.ts
//
// CTRL-01 SSE callback channel. Phase 1: streamSSE stub honoring Last-Event-ID
// header (D-09 resume semantics). Phase 8 wires this to the pending_callbacks
// table replay logic.
//
// References:
//   - docs/mcpgen-architecture.md §5.8 (SSE callback shape)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-09 (Postgres source of truth + Last-Event-ID resume)

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { LAST_EVENT_ID_HEADER } from '@mcpgen/contracts';

export const jobsStreamRoute = new Hono();

jobsStreamRoute.get('/:id/stream', (c) =>
  streamSSE(c, async (stream) => {
    // D-09: Postgres `generations.status` is the source of truth.
    // Last-Event-ID resume — engine writes events to pending_callbacks; this stream
    // replays from `Last-Event-ID` header onward. Phase 8 implements full body.
    const lastEventId = c.req.header(LAST_EVENT_ID_HEADER);
    await stream.writeSSE({
      data: JSON.stringify({
        error: 'not_implemented_phase_8',
        job_id: c.req.param('id'),
        resumed_from_event_id: lastEventId,
      }),
      event: 'phase1_stub',
      id: '01HXAAAAAAAAAAAAAAAAAAAAA1',
    });
  }),
);
