// apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts
//
// Plan 07-03 — GET /api/v1/jobs/:jobId/stream SSE Route Handler.
//
// - Fixture mode: replays a deterministic 9-stage timeline from
//   `@mcpgen/engine-fixtures` via `streamTimeline()`. Honors `Last-Event-ID`
//   for resume (Pitfall #20).
// - Live mode: proxies the request to the Hono BFF preserving the
//   `Last-Event-ID` header; pipes `res.body` straight back as a stream.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Pattern 5"
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-09, D-11
//   - packages/contracts/src/idempotency.ts (LAST_EVENT_ID_HEADER)

import type { NextRequest } from 'next/server';

import { LAST_EVENT_ID_HEADER } from '@mcpgen/contracts';

import { getBffUrl, getFrontendMode } from '@/lib/fixture-mode';
import { buildTimeline, findFixture, streamTimeline } from '@/lib/fixture-mode/sse-timeline';

export const runtime = 'nodejs';

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await ctx.params;
  const lastEventId = req.headers.get(LAST_EVENT_ID_HEADER);
  const mode = await getFrontendMode(req);

  if (mode === 'fixtures') {
    const fixture = findFixture(jobId);
    const timeline = buildTimeline(jobId, fixture);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const sse of streamTimeline(timeline, lastEventId)) {
            controller.enqueue(encoder.encode(sse));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  }

  // Live mode — proxy fetch to Hono BFF with Last-Event-ID forwarded
  // AND Logto session cookie attached so the BFF authorizes per-request
  // (T-7-11 mitigation: cross-user replay prevented by per-request auth check).
  // The upstream ReadableStream is piped through unchanged — no buffering, so
  // Vercel keeps the connection open as long as upstream stays open
  // (T-7-14 mitigation alongside Pitfall #20 resume).
  const upstreamUrl = `${getBffUrl()}/jobs/${encodeURIComponent(jobId)}/stream`;
  const upstreamHeaders: Record<string, string> = {
    Accept: 'text/event-stream',
  };
  // WR-05 fix: write the header in its wire-canonical lowercase form
  // (`last-event-id`, RFC 6855 / WHATWG fetch). The contracts constant
  // `LAST_EVENT_ID_HEADER` is the canonical Title-Case form for code
  // readability and request-side parsing (which is case-insensitive),
  // but the BFF — Hono on CF Workers — may read raw bindings without
  // case normalization. Normalizing at the proxy-write boundary is
  // belt-and-suspenders; the contract value (Title-Case) stays unchanged.
  void LAST_EVENT_ID_HEADER;
  if (lastEventId !== null) upstreamHeaders['last-event-id'] = lastEventId;
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader !== null) upstreamHeaders.Cookie = cookieHeader;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, { headers: upstreamHeaders });
  } catch (e: unknown) {
    // WR-04 fix: emit one terminal SSE error event then close so the
    // client's useGenerationSSE hook routes through its `failed` path
    // instead of hanging.
    //
    // The status MUST be 200, NOT 502 — EventSource (and the fetch+parser
    // path useGenerationSSE actually uses, which throws on `!res.ok` at
    // the boundary) treats any non-200 from a `text/event-stream` response
    // as a hard error and never reads the body, so the error event we
    // wrote would be silently dropped. Returning 200 with the error event
    // in the body lets the parser deliver it to the hook.
    //
    // The error message includes the upstream URL for dev-console
    // debugging (server-controlled, not user-supplied).
    const message = e instanceof Error ? e.message : String(e);
    const errorEvent =
      `event: error\n` +
      `data: ${JSON.stringify({ error: 'bff_unreachable', upstream_url: upstreamUrl, message })}\n\n`;
    return new Response(errorEvent, {
      status: 200,
      headers: SSE_HEADERS,
    });
  }

  if (upstreamRes.body === null) {
    return new Response('upstream returned empty body', { status: 502 });
  }
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: SSE_HEADERS,
  });
}
