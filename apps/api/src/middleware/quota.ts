// apps/api/src/middleware/quota.ts
//
// CTRL-07 / D-12: Pre-enqueue quota check middleware.
// Reads TimescaleDB hourly aggregate (real-time quota truth per Pitfall #16);
// returns 429 + {quota_used, quota_limit, reset_at} when used >= limit.
//
// MUST mount AFTER authMiddleware (consumes c.var.auth.organizationId set by
// the JWT verifier from the verified org_id claim — defense against IDOR
// per T-8-06 / T-8-08).
//
// References:
//   - .planning/phases/08-auth-billing/08-PATTERNS.md §A
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-12

import { createMiddleware } from 'hono/factory';
import { checkQuota } from '../lib/quota.js';
import type { AuthContext } from './auth.js';

export function quotaGate(eventType: 'f3_eval' | 'generation') {
  return createMiddleware<{ Variables: { auth: AuthContext } }>(async (c, next) => {
    const orgId = c.var.auth?.organizationId;
    if (!orgId) {
      return c.json({ error: 'no_org_context' }, 400);
    }
    const quota = await checkQuota(orgId, eventType);
    if (!quota.ok) {
      // Note: limit may be Infinity (PAYG) — but PAYG never reaches this
      // branch (checkQuota short-circuits with ok=true).
      return c.json(
        {
          error: 'quota_exceeded' as const,
          quota_used: quota.used,
          quota_limit: quota.limit,
          reset_at: quota.reset_at.toISOString(),
        },
        429,
      );
    }
    await next();
  });
}
