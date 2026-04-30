// apps/web/src/app/api/v1/generate/route.ts
//
// Plan 07-03 — POST /api/v1/generate Route Handler.
//
// - Fixture mode: returns 202 + `{ job_id, sse_url }` immediately, using the
//   incoming Idempotency-Key as the job_id (it is already a `gen_${ULID}`).
// - Live mode: forwards the request to the Hono BFF on CF Workers, preserving
//   the Idempotency-Key header and the request body.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-14, D-15
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Pattern 5"
//   - packages/contracts/src/idempotency.ts (validateIdempotencyKey)
//   - packages/contracts/src/generation-api.ts (GenerationApiRequest)

import { NextResponse, type NextRequest } from 'next/server';

import {
  GenerationApiRequest,
  IDEMPOTENCY_KEY_HEADER,
  validateIdempotencyKey,
} from '@mcpgen/contracts';

import { getBffUrl, getFrontendMode } from '@/lib/fixture-mode';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<Response> {
  const idempotencyKey = req.headers.get(IDEMPOTENCY_KEY_HEADER);

  if (idempotencyKey === null || !validateIdempotencyKey(idempotencyKey)) {
    return NextResponse.json(
      {
        error: 'invalid_idempotency_key',
        requested_idempotency_key: idempotencyKey,
        contract_version: '1.0.0',
      },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_spec', issues: [{ message: 'Request body is not valid JSON' }] },
      { status: 400 },
    );
  }

  const parsed = GenerationApiRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_spec', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const mode = getFrontendMode(req);

  if (mode === 'fixtures') {
    // GenerationApiResponse Zod schema requires sse_url to be an absolute URL
    // (z.string().url()). Build it from the request origin so the client-side
    // GenerationApiResponse.safeParse() succeeds.
    const reqUrl = new URL(req.url);
    const sseUrl = `${reqUrl.origin}/api/v1/jobs/${idempotencyKey}/stream`;
    return NextResponse.json(
      {
        job_id: idempotencyKey,
        sse_url: sseUrl,
        requested_idempotency_key: idempotencyKey,
        contract_version: '1.0.0',
      },
      { status: 202 },
    );
  }

  // Live mode — proxy to the Hono BFF preserving the Idempotency-Key header
  // AND forwarding the Logto session cookie (D-15 + Pitfall #12: cookie stays
  // same-origin via the proxy; never enters the browser-side code path).
  const upstreamUrl = `${getBffUrl()}/generate`;
  const upstreamHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
  };
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader !== null) upstreamHeaders.Cookie = cookieHeader;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(parsed.data),
    });
  } catch (e: unknown) {
    // Network-level failure (BFF unreachable, DNS error, refused connection).
    // Surface a 502 with the upstream URL so the dev console makes the gap obvious
    // without leaking it to the end user (the URL is server-controlled).
    return NextResponse.json(
      {
        error: 'bff_unreachable',
        upstream_url: upstreamUrl,
        message: e instanceof Error ? e.message : String(e),
        contract_version: '1.0.0',
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
