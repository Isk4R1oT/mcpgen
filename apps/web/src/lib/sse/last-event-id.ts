// apps/web/src/lib/sse/last-event-id.ts
//
// Plan 07-03 — small helper that re-exports `LAST_EVENT_ID_HEADER` from
// `@mcpgen/contracts` and builds the SSE `fetch()` headers map. Consumers
// import from one place so a future header-name change ripples cleanly.

import { LAST_EVENT_ID_HEADER } from '@mcpgen/contracts';

export { LAST_EVENT_ID_HEADER };

export const buildSseHeaders = (
  lastEventId: string | null | undefined,
): Record<string, string> => {
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (typeof lastEventId === 'string' && lastEventId.length > 0) {
    headers[LAST_EVENT_ID_HEADER] = lastEventId;
  }
  return headers;
};
