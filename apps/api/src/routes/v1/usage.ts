// apps/api/src/routes/v1/usage.ts
//
// Plan 09-04 Task 1 (Phase 9 D-18 — 3 of 4 BFF carry-forward endpoints):
// GET /usage/hourly returns hourly aggregates of `usage_events` for the
// authenticated org. The `usage_hourly` materialized view (Phase 8 migration
// 20260428000002) carries `bucket / deployment_id / event_count / error_count`
// but lacks `total_latency_ms` and `total_cost_usd` — both required by the
// frontend's `UsageHourlyRowSchema` contract. Rather than JOIN-and-enrich
// (two queries), this route aggregates `usage_events` directly with
// `date_trunc('hour', time)` so a single statement produces every wire-shape
// field. The 4-table JOIN org-scope guard (Pitfall #5 — `WHERE p.org_id = ?`
// FIRST predicate) is preserved verbatim.
//
// Authentication: protectedApp (authMiddleware). Rejects M2M tokens with 403.
// Authorization: every row passes through the JOIN; no caller can observe
// usage from a deployment owned by a different org.
//
// References:
//   - .planning/phases/09-observability-polish/09-04-PLAN.md Task 1
//   - .planning/phases/09-observability-polish/09-RESEARCH.md §"Pitfall 5"
//     (lines 556-562) — materialized view does not carry org_id
//   - apps/api/src/routes/v1/deployments.ts (in-phase analog)
//   - apps/api/src/routes/v1/drift.ts (4-table JOIN pattern origin)
//   - apps/web/src/app/api/v1/usage/hourly/route.ts (frontend proxy contract)
//   - packages/contracts/src/dashboard-api.ts (UsageHourlyResponseSchema)
//   - infrastructure/neon/migrations/20260428000002_phase8_billing_drift.sql
//     lines 115-137 (matview definition; insufficient for wire-shape — see
//     deviation note above)

import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { UsageHourlyResponseSchema } from '@mcpgen/contracts/dashboard-api';

import { db } from '../../db.js';
import type { AuthContext } from '../../middleware/auth.js';

interface UsageRouteBindings {
  LOGTO_BASE_URL: string;
}

export const usageRoute = new Hono<{
  Bindings: UsageRouteBindings;
  Variables: { auth: AuthContext };
}>();

// ─── DB row shape returned by GET /usage/hourly aggregation ────────────────
//
// Column aliases match the wire schema in
// packages/contracts/src/dashboard-api.ts (UsageHourlyRowSchema). Keeping the
// query column names in sync with wire field names lets the BFF return rows
// directly without a separate mapping pass.

interface UsageHourlyAggregateRow {
  hour_bucket: string;
  deployment_id: string;
  call_count: number;
  total_latency_ms: number;
  total_cost_usd: number | null;
  error_count: number;
}

// ─── GET /usage/hourly ─────────────────────────────────────────────────────
//
// Query params (per frontend Route Handler at apps/web/src/app/api/v1/
// usage/hourly/route.ts):
//   - from: ISO datetime (required)
//   - to:   ISO datetime (required)
//   - deployment_id: optional UUID — narrows the aggregation to one deployment
//
// The 4-table JOIN org-scope (Pitfall #5) is the authz boundary
// (T-9-bff-auth-05): no caller can observe usage events outside their org
// because the WHERE clause is parameterized on `auth.organizationId` FIRST.
// `from` / `to` only narrow within that org's data (T-9-bff-auth-10).
usageRoute.get('/usage/hourly', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json(
      { error: 'forbidden', reason: 'm2m_cannot_read_usage' },
      403,
    );
  }
  if (!auth.organizationId) {
    return c.json({ error: 'no_org_context' }, 400);
  }
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (from === undefined || to === undefined) {
    return c.json(
      {
        error: 'invalid_params',
        message: '`from` and `to` query params are required (ISO datetime).',
      },
      400,
    );
  }
  const deploymentId = c.req.query('deployment_id');

  // 4-table JOIN org-scope guard (Pitfall #5). NOTE: `WHERE p.org_id` is
  // FIRST in the predicate chain so the planner narrows by org before
  // applying the time window — denies cross-tenant reads structurally.
  // Aggregate from raw `usage_events` (not `usage_hourly` matview) because
  // the matview lacks `upstream_latency_ms` / cost which the wire schema
  // requires; documented deviation in 09-04-SUMMARY.md.
  const r = deploymentId !== undefined
    ? await db.execute(sql`
        SELECT
          date_trunc('hour', e.time)::timestamptz       AS hour_bucket,
          e.deployment_id                               AS deployment_id,
          count(*)::int                                 AS call_count,
          COALESCE(sum(e.upstream_latency_ms), 0)::int  AS total_latency_ms,
          NULL::numeric                                 AS total_cost_usd,
          sum(case when e.status = 'error' then 1 else 0 end)::int AS error_count
        FROM usage_events e
        JOIN deployments d ON d.id = e.deployment_id
        JOIN generations g ON g.id = d.generation_id
        JOIN projects    p ON p.id = g.project_id
        WHERE p.org_id        = ${auth.organizationId}
          AND e.time          >= ${from}
          AND e.time          <  ${to}
          AND e.deployment_id = ${deploymentId}
        GROUP BY hour_bucket, e.deployment_id
        ORDER BY hour_bucket DESC
      `)
    : await db.execute(sql`
        SELECT
          date_trunc('hour', e.time)::timestamptz       AS hour_bucket,
          e.deployment_id                               AS deployment_id,
          count(*)::int                                 AS call_count,
          COALESCE(sum(e.upstream_latency_ms), 0)::int  AS total_latency_ms,
          NULL::numeric                                 AS total_cost_usd,
          sum(case when e.status = 'error' then 1 else 0 end)::int AS error_count
        FROM usage_events e
        JOIN deployments d ON d.id = e.deployment_id
        JOIN generations g ON g.id = d.generation_id
        JOIN projects    p ON p.id = g.project_id
        WHERE p.org_id = ${auth.organizationId}
          AND e.time   >= ${from}
          AND e.time   <  ${to}
        GROUP BY hour_bucket, e.deployment_id
        ORDER BY hour_bucket DESC
      `);

  const rows = (r.rows as unknown as UsageHourlyAggregateRow[]).map((row) => ({
    deployment_id: row.deployment_id,
    hour_bucket:
      typeof row.hour_bucket === 'string'
        ? row.hour_bucket
        : new Date(row.hour_bucket).toISOString(),
    call_count: Number(row.call_count),
    total_latency_ms: Number(row.total_latency_ms),
    total_cost_usd:
      row.total_cost_usd === null ? null : Number(row.total_cost_usd),
    error_count: Number(row.error_count),
  }));
  // Validate response shape against the contract (catches schema drift in
  // dev — Zod throws here rather than letting an invalid payload reach the
  // dashboard).
  const body = UsageHourlyResponseSchema.parse({ rows });
  return c.json(body);
});
