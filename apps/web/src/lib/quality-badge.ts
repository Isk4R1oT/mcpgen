// apps/web/src/lib/quality-badge.ts
//
// Plan 07-03 — QualityReport → badge tier mapper. Imports thresholds from
// `@mcpgen/contracts/launch-criteria` (NEVER hardcode 4.0 / 0.7) so any future
// threshold change auto-flows to the UI without a manual rebump.
//
// Threshold source: docs/mcpgen-stage-f-design.md
//   - premium:      F1 pass + F2 ≥ 4.5 + F3 ≥ 0.85
//   - verified:     F1 pass + F2 ≥ LAUNCH_CRITERIA.F2_SMELL_MIN (4.0) +
//                   (F3 null OR F3 ≥ LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN)
//   - standard:     F2 ≥ 3.0
//   - needs_review: F1 fail OR F2 < 3.0
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Pattern 4" (verbatim)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-20, D-21
//   - packages/contracts/src/launch-criteria.ts (thresholds — single source)

import { LAUNCH_CRITERIA } from '@mcpgen/contracts';
import type { QualityReport } from '@mcpgen/ir';

export type BadgeTier = 'premium' | 'verified' | 'standard' | 'needs_review';

// Premium thresholds are stricter than launch-criteria minimums; documented in
// docs/mcpgen-stage-f-design.md. F2_PREMIUM and F3_PREMIUM are derived
// constants — if launch-criteria itself changes, these stay aligned with the
// "premium = stricter than verified" relationship.
const F2_PREMIUM = 4.5;
const F3_PREMIUM = 0.85;
const F2_STANDARD_MIN = 3.0;

export const badgeTier = (qr: QualityReport): BadgeTier => {
  if (qr.f1_static.passed === false) return 'needs_review';

  const f2 = qr.f2_smell.overall_average;
  const f3 = qr.f3_agent_eval !== null ? qr.f3_agent_eval.pass_rate : null;

  if (f2 >= F2_PREMIUM && f3 !== null && f3 >= F3_PREMIUM) return 'premium';
  if (
    f2 >= LAUNCH_CRITERIA.F2_SMELL_MIN &&
    (f3 === null || f3 >= LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN)
  ) {
    return 'verified';
  }
  if (f2 >= F2_STANDARD_MIN) return 'standard';
  return 'needs_review';
};

/**
 * Free-tier UX (D-21): when F3 not run, render badge as "verified (F2-only)"
 * with a tooltip "F3 agent eval not run on free tier — upgrade to Pro".
 */
export const badgeLabel = (qr: QualityReport): string => {
  const tier = badgeTier(qr);
  if (tier === 'verified' && qr.f3_agent_eval === null) return 'verified (F2-only)';
  return tier;
};
