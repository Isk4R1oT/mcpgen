// apps/web/src/app/api/v1/deploy/[generationId]/route.ts
//
// Plan 07-05 — POST /api/v1/deploy/:generationId. Submits a deploy request
// for a completed generation; the BFF either returns 202 with the deployment
// metadata + Claude Desktop config block (CONTEXT D-23), or 409 with
// `server_name_collision` + `suggested_name` per Pitfall #30 / D-24.
//
// - Live mode: forwards Cookie + body to BFF.
// - Fixtures mode: returns 202 by default; query string `?force_collision=true`
//   triggers a deterministic 409 so the rename-modal e2e test
//   (deploy-collision.spec.ts) can exercise the flow without flakiness.
//   The 409 fixture's `suggested_name` is built via buildSuggestedName so it
//   matches the parser used by DeployWrapper.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-05-PRECONDITIONS.md §3
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-23, D-24
//   - apps/web/src/lib/claude-desktop/collision.ts (buildSuggestedName)
//   - apps/web/src/lib/claude-desktop/config.ts (buildConfig — fixture-mode
//     synthesizes claude_desktop_config locally so the deploy result has
//     something to render)

import { NextResponse, type NextRequest } from 'next/server';

import { IDEMPOTENCY_KEY_HEADER, validateIdempotencyKey } from '@mcpgen/contracts';

import { buildSuggestedName } from '@/lib/claude-desktop/collision';
import { buildConfig } from '@/lib/claude-desktop/config';
import { getBffUrl, getFrontendMode } from '@/lib/fixture-mode';

export const runtime = 'nodejs';

interface FixtureRequestBody {
  override_name?: string;
}

const FIXTURE_EXISTING_NAMES = ['fixture-stripe-mcp', 'fixture-github-mcp'];

const buildFixtureDeployResponse = (
  serverName: string,
): {
  deployment_id: string;
  server_name: string;
  server_url: string;
  claude_desktop_config: ReturnType<typeof buildConfig>;
} => {
  const serverUrl = `https://${serverName}.mcpgen.dev`;
  return {
    // Repeating-A pattern UUIDs for fixtures (Phase-1 ee60dee).
    deployment_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05',
    server_name: serverName,
    server_url: serverUrl,
    claude_desktop_config: buildConfig({ serverName, serverUrl }),
  };
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ generationId: string }> },
): Promise<Response> {
  const { generationId } = await ctx.params;
  const mode = getFrontendMode(req);

  if (mode === 'fixtures') {
    const url = new URL(req.url);
    const forceCollision = url.searchParams.get('force_collision') === 'true';

    let body: FixtureRequestBody = {};
    try {
      const text = await req.text();
      if (text.length > 0) body = JSON.parse(text) as FixtureRequestBody;
    } catch {
      // Empty / non-JSON body is fine for fixtures.
    }

    if (forceCollision && body.override_name === undefined) {
      // First click triggers the collision; the rename modal then resubmits
      // with override_name and we return 202.
      const existingName = 'fixture-stripe-mcp';
      const suggestedName = buildSuggestedName(existingName, FIXTURE_EXISTING_NAMES);
      return NextResponse.json(
        {
          error: 'server_name_collision',
          existing_name: existingName,
          suggested_name: suggestedName,
        },
        { status: 409 },
      );
    }

    // 202 — successful fixture deploy. If user supplied override_name from the
    // rename modal we honor it; otherwise default to a deterministic name.
    const serverName = body.override_name ?? `fixture-${generationId.slice(0, 8)}-mcp`;
    return NextResponse.json(buildFixtureDeployResponse(serverName), {
      status: 202,
    });
  }

  // Live mode — proxy to BFF (POST /deploy/:generationId).
  // CR-01 fix: deploy is a write operation (D-14) — require an
  // Idempotency-Key header so the BFF can dedupe double-clicks, network
  // retries and rename-modal resubmits. Reject the request at the proxy if
  // the client did not send a valid `gen_${ULID}` key (the dashboard client
  // generates one via getOrCreateIdempotencyKey before every call).
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

  const upstreamUrl = `${getBffUrl()}/deploy/${encodeURIComponent(generationId)}`;
  const headers: Record<string, string> = {
    [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
  };
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader !== null) headers.Cookie = cookieHeader;
  const contentType = req.headers.get('content-type');
  if (contentType !== null) headers['Content-Type'] = contentType;

  let bodyText = '';
  try {
    bodyText = await req.text();
  } catch {
    // Empty body is acceptable.
  }

  const init: RequestInit =
    bodyText.length > 0
      ? { method: 'POST', headers, body: bodyText }
      : { method: 'POST', headers };

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, init);
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

  // Pipe the upstream response verbatim — including 409 server_name_collision
  // body shape. The frontend dashboard-client.deploy() parses the 409 body
  // via parseCollisionResponse to surface the rename modal.
  const text = await upstreamRes.text();
  return new Response(text, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': upstreamRes.headers.get('Content-Type') ?? 'application/json',
    },
  });
}
