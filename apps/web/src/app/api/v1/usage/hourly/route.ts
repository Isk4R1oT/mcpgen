// apps/web/src/app/api/v1/usage/hourly/route.ts
//
// Plan 07-05 — GET /api/v1/usage/hourly. Reads architecture §7.2 TimescaleDB
// continuous aggregate `usage_hourly` (rolled up from `usage_events`
// hypertable). Query params: `deployment_id?`, `from`, `to` (ISO datetimes).
//
// - Live mode: forwards Cookie + fetches `${MCPGEN_BFF_URL}/usage/hourly?...`.
// - Fixtures mode: synthesizes the last 24 hours of hourly buckets with a
//   deterministic per-deployment seed so the dashboard renders something
//   plausible (Friday demos) without a TimescaleDB instance.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-05-PRECONDITIONS.md §3
//   - packages/contracts/src/usage-event.ts (UsageEvent shape — what aggregates
//     into usage_hourly)
//   - docs/mcpgen-architecture.md §7.2

import { NextResponse, type NextRequest } from 'next/server';

import { getBffUrl, getFrontendMode } from '@/lib/fixture-mode';

export const runtime = 'nodejs';

interface FixtureRow {
  deployment_id: string;
  hour_bucket: string;
  call_count: number;
  total_latency_ms: number;
  total_cost_usd: number | null;
  error_count: number;
}

// Deterministic synthesizer for the last 24 hourly buckets. Uses the first
// char of deployment_id to vary call_count + latency so multiple deployments
// look distinct in the dashboard. Pure function — no Date.now() randomness.
const synthesizeHourlyRows = (
  deploymentId: string,
  fromIso: string,
  toIso: string,
): FixtureRow[] => {
  const fromTs = new Date(fromIso).getTime();
  const toTs = new Date(toIso).getTime();
  if (Number.isNaN(fromTs) || Number.isNaN(toTs) || toTs <= fromTs) return [];

  const HOUR = 60 * 60 * 1000;
  const seedChar = deploymentId.charCodeAt(0);
  const seedFactor = (seedChar % 16) + 1; // 1..16

  const rows: FixtureRow[] = [];
  // Align both bounds to the hour boundary; iterate the inclusive range.
  const startHour = Math.floor(fromTs / HOUR) * HOUR;
  for (let t = startHour; t <= toTs; t += HOUR) {
    if (t < fromTs) continue;
    const hourOffset = (t - startHour) / HOUR;
    const callCount = 50 + ((hourOffset * seedFactor) % 200);
    rows.push({
      deployment_id: deploymentId,
      hour_bucket: new Date(t).toISOString(),
      call_count: callCount,
      total_latency_ms: callCount * (200 + (seedFactor % 50)),
      // Phase-6 substitute runtime: total_cost_usd is null until Stripe Meters
      // wires (Phase 8 Wave 4 / Phase 10 — see RUN-06 Phase-10 carry-forward).
      total_cost_usd: null,
      error_count: hourOffset % 7 === 0 ? 1 : 0,
    });
  }
  return rows;
};

const FIXTURE_DEPLOYMENT_IDS = [
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
];

export async function GET(req: NextRequest): Promise<Response> {
  const mode = await getFrontendMode(req);
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const deploymentId = url.searchParams.get('deployment_id');

  if (from === null || to === null) {
    return NextResponse.json(
      { error: 'invalid_params', message: '`from` and `to` query params are required (ISO datetime).' },
      { status: 400 },
    );
  }

  if (mode === 'fixtures') {
    const ids = deploymentId !== null ? [deploymentId] : FIXTURE_DEPLOYMENT_IDS;
    const rows = ids.flatMap((id) => synthesizeHourlyRows(id, from, to));
    return NextResponse.json({ rows });
  }

  // Live mode — proxy to BFF.
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (deploymentId !== null) params.set('deployment_id', deploymentId);
  const upstreamUrl = `${getBffUrl()}/usage/hourly?${params.toString()}`;

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
