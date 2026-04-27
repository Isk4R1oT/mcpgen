// apps/api/src/lib/quota.ts
//
// CTRL-07 / D-12: Pre-enqueue quota check.
// Reads TimescaleDB usage_hourly MATERIALIZED VIEW (real-time quota truth per
// Pitfall #16 — Stripe Meters has eventual-consistency lag); returns
// 429-shaped result when used >= limit; PAYG plan never blocks.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-12, D-14
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-12, §11

import { eq } from 'drizzle-orm';
import { organizations } from '@mcpgen/contracts/db-schema';
import { QUOTA_LIMITS, type PlanTier } from '@mcpgen/contracts';
import { db } from '../db.js';
import { getQuotaUsage } from './quota-queries.js';

export type QuotaResult =
  | { ok: true; used: number; limit: number; reset_at: Date }
  | { ok: false; reason: 'quota_exceeded'; used: number; limit: number; reset_at: Date };

export async function checkQuota(
  orgId: string,
  eventType: 'f3_eval' | 'generation',
): Promise<QuotaResult> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org) throw new Error(`org_not_found: ${orgId}`);

  const tier = org.plan_tier as PlanTier;

  // PAYG plan never blocks (every overage bills).
  if (tier === 'payg') {
    return { ok: true, used: 0, limit: Infinity, reset_at: new Date() };
  }

  const limits = QUOTA_LIMITS[tier];
  if (!limits) throw new Error(`unknown_plan_tier: ${String(tier)}`);
  const limit = limits[eventType];

  // Anniversary-based period (D-14), NOT calendar month.
  const periodStart = new Date(org.quota_period_start);
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const used = await getQuotaUsage(orgId, eventType, periodStart, periodEnd);

  if (used >= limit) {
    return { ok: false, reason: 'quota_exceeded', used, limit, reset_at: periodEnd };
  }
  return { ok: true, used, limit, reset_at: periodEnd };
}
