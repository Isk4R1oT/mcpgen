// apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/route.ts
//
// Plan 07-05 — PATCH /api/v1/deployments/:deploymentId/badge-public. Toggles
// the public-badge opt-in (CONTEXT D-22; default unchecked per RULES.md
// §2.6). Body: `{ public_badge: boolean }`.
//
// - Live mode: forwards Cookie + body to BFF.
// - Fixtures mode: 200 OK echo so the dashboard's optimistic-update path
//   can exercise refetch logic without a TimescaleDB / Postgres instance.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-05-PRECONDITIONS.md §3 (BFF
//     route AND db migration adding deployments.public_badge column are
//     carry-forwards)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-22

import { NextResponse, type NextRequest } from 'next/server';

import { IDEMPOTENCY_KEY_HEADER, validateIdempotencyKey } from '@mcpgen/contracts';

import { getBffUrl, getFrontendMode } from '@/lib/fixture-mode';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ deploymentId: string }> },
): Promise<Response> {
  const { deploymentId } = await ctx.params;
  const mode = await getFrontendMode(req);

  let bodyText = '';
  try {
    bodyText = await req.text();
  } catch {
    // Empty body — handled below as 400.
  }

  if (bodyText.length === 0) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body must include `public_badge: boolean`.' },
      { status: 400 },
    );
  }

  let parsed: { public_badge?: unknown };
  try {
    parsed = JSON.parse(bodyText) as { public_badge?: unknown };
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Request body is not valid JSON.' },
      { status: 400 },
    );
  }

  if (typeof parsed.public_badge !== 'boolean') {
    return NextResponse.json(
      { error: 'invalid_body', message: '`public_badge` must be a boolean.' },
      { status: 400 },
    );
  }

  if (mode === 'fixtures') {
    return NextResponse.json({ deployment_id: deploymentId, public_badge: parsed.public_badge });
  }

  // Live mode — proxy to BFF.
  // CR-01 fix: PATCH /badge-public is a write op (D-14) — require an
  // Idempotency-Key header so the BFF can dedupe rapid toggles. The
  // dashboard client (lib/api/dashboard-client.ts setBadgePublic) generates
  // a `gen_${ULID}` key via getOrCreateIdempotencyKey before each call.
  const idempotencyKey = req.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (idempotencyKey === null || !validateIdempotencyKey(idempotencyKey)) {
    return NextResponse.json(
      {
        error: 'invalid_idempotency_key',
        requested_idempotency_key: idempotencyKey,
      },
      { status: 400 },
    );
  }

  const upstreamUrl = `${getBffUrl()}/deployments/${encodeURIComponent(deploymentId)}/badge-public`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
  };
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader !== null) headers.Cookie = cookieHeader;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: 'PATCH',
      headers,
      body: bodyText,
    });
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
