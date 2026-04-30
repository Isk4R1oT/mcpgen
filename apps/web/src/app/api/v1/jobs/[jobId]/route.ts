// apps/web/src/app/api/v1/jobs/[jobId]/route.ts
//
// Plan 07-03 — GET /api/v1/jobs/:jobId — status bootstrap for SSE consumers.
// Returns `{ status, last_known_event_id, events }` per RESEARCH Pattern 2.
//
// - Fixture mode: returns `{ status: 'streaming', last_known_event_id: null,
//   events: [] }` for a fresh job so the client opens SSE on the stream route.
//   (Plan 07-03 keeps no in-memory state — the timeline is regenerated per SSE
//   request and Last-Event-ID resume is handled by the stream Route Handler.)
// - Live mode: proxies to `${BFF}/jobs/:jobId`.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-10
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Pattern 2"

import { NextResponse, type NextRequest } from 'next/server';

import { getBffUrl, getFrontendMode } from '@/lib/fixture-mode';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await ctx.params;
  const mode = getFrontendMode(req);

  if (mode === 'fixtures') {
    return NextResponse.json({
      job_id: jobId,
      status: 'streaming',
      last_known_event_id: null,
      events: [],
    });
  }

  // Live mode — forward the Logto session cookie so the Hono BFF authorizes
  // the request against the user's session (Phase 8 D-15).
  const upstreamUrl = `${getBffUrl()}/jobs/${encodeURIComponent(jobId)}`;
  const upstreamHeaders: Record<string, string> = {};
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader !== null) upstreamHeaders.Cookie = cookieHeader;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, { headers: upstreamHeaders });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: 'bff_unreachable',
        upstream_url: upstreamUrl,
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  const text = await upstreamRes.text();
  return new Response(text, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': upstreamRes.headers.get('Content-Type') ?? 'application/json',
    },
  });
}
