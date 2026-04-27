// packages/contracts/src/plan-tier.ts
//
// D-11 / D-12: Plan-tier quotas (free / pro / payg).
// Per-month limits enforced pre-enqueue by apps/api/src/middleware/quota.ts.

export const PLAN_TIERS = ['free', 'pro', 'payg'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const QUOTA_LIMITS = {
  free: { f3_eval: 1, generation: 3 },
  pro:  { f3_eval: 5, generation: 25 },
  payg: { f3_eval: Infinity, generation: Infinity },
} as const;
