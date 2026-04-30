// apps/web/src/app/api/v1/deployments/route.ts
//
// Plan 07-05 — GET /api/v1/deployments. Lists the authenticated user's
// deployed servers (architecture §7.1 deployments table).
//
// - Live mode: forwards Cookie + fetches `${MCPGEN_BFF_URL}/deployments`.
//   On BFF unreachable / 404 / 501 returns a structured 502 with
//   `bff_unreachable` so the dev console makes the carry-forward gap visible
//   (Phase-7 Plan 07-04 precedent — same pattern as /generate, /jobs/:id).
// - Fixtures mode: synthesizes 2 deployments derived from
//   `@mcpgen/engine-fixtures` (stripe + github) for Friday demos.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-05-PRECONDITIONS.md §3 (BFF
//     carry-forward — endpoint not yet implemented)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-15 (Cookie
//     forwarding for Logto session — T-7-15 cross-tenant data isolation)

import { NextResponse, type NextRequest } from 'next/server';

import { ALL_FIXTURES } from '@mcpgen/engine-fixtures';

import { getBffUrl, getFrontendMode } from '@/lib/fixture-mode';

export const runtime = 'nodejs';

// Deterministic UUIDs for fixture-mode deployments. Repeating-A pattern from
// Phase-1 commit ee60dee — avoids gitleaks generic-API-key false positives
// while keeping the fixture stable across reloads.
const FIXTURE_DEPLOYMENTS = [
  {
    deployment_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
    generation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
    server_name: 'fixture-stripe-mcp',
    server_url: 'https://fixture-stripe-mcp.mcpgen.dev',
    auth_mode: 'passthrough' as const,
    deployed_at: '2026-04-15T12:00:00.000Z',
    quality_report: ALL_FIXTURES.stripe.qualityReport,
    public_badge: false,
  },
  {
    deployment_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
    generation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04',
    server_name: 'fixture-github-mcp',
    server_url: 'https://fixture-github-mcp.mcpgen.dev',
    auth_mode: 'passthrough' as const,
    deployed_at: '2026-04-20T08:30:00.000Z',
    quality_report: ALL_FIXTURES.github.qualityReport,
    public_badge: true,
  },
];

export async function GET(req: NextRequest): Promise<Response> {
  const mode = getFrontendMode(req);

  if (mode === 'fixtures') {
    return NextResponse.json({ deployments: FIXTURE_DEPLOYMENTS });
  }

  // Live mode — proxy to BFF with Logto session cookie forwarded.
  const upstreamUrl = `${getBffUrl()}/deployments`;
  const headers: Record<string, string> = {};
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader !== null) headers.Cookie = cookieHeader;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, { headers });
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
