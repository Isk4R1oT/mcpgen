// apps/api/src/lib/quota-queries.ts
//
// CTRL-07 / D-12: TimescaleDB hourly-aggregate quota query.
// Joins usage_hourly MATERIALIZED VIEW (Plan 01 deviation #1: Neon TimescaleDB
// Apache cannot run continuous-aggregate refresh policies; the view is
// REFRESHed by stripe-meters-emit-v1 cron each tick) → deployments →
// generations → projects → organizations.
//
// 4-table join is fine — small per-org cardinality (typical org has < 100
// deployments * 24 hours/day * 30 days = ~70K rows max in usage_hourly).
//
// References:
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §11
//   - .planning/phases/08-auth-billing/08-01-SUMMARY.md (Wave 1 deviation #1)
//   - infrastructure/neon/migrations/20260428000000_phase8_billing_drift.sql

import { sql } from 'drizzle-orm';
import { db } from '../db.js';

interface QuotaUsageRow {
  used: number;
}

export async function getQuotaUsage(
  orgId: string,
  eventType: 'f3_eval' | 'generation',
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(uh.call_count), 0)::int AS used
    FROM usage_hourly uh
    JOIN deployments d ON d.id = uh.deployment_id
    JOIN generations g ON g.id = d.generation_id
    JOIN projects p ON p.id = g.project_id
    WHERE p.org_id = ${orgId}
      AND uh.event_type = ${eventType}
      AND uh.bucket >= ${periodStart}
      AND uh.bucket < ${periodEnd}
  `);
  const rows = result.rows as unknown as QuotaUsageRow[];
  return rows[0]?.used ?? 0;
}
