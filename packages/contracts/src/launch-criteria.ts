// packages/contracts/src/launch-criteria.ts
//
// Frozen contract #4: IMMUTABLE runtime constants for launch / publishability gates.
//
// !! DO NOT change values without a paired docs/decisions/<YYYY-MM-DD>-<slug>.md entry !!
//
// Three-layer defense (T-1-03 / D-13 / Pitfall #29 — "AI-fix-by-lowering-threshold"):
//   1. Pre-commit hook .pre-commit-hooks/launch-criteria-paired-decision.sh
//      requires the same commit to also stage docs/decisions/<YYYY-MM-DD>-<slug>.md.
//   2. CI job `launch-criteria-assertion` in .github/workflows/main-ci.yml uses
//      `grep -qF` (fixed-string) to assert each constant matches the documented
//      threshold in docs/mcpgen-implementation-plan.md §11.7.
//   3. This file: values are exported as `as const` so TS infers literal types
//      (no widening to `number`). Importers cannot accidentally mutate them.
//
// Documented thresholds (docs/mcpgen-implementation-plan.md §11.7):
//   - F2 smell scan: average ≥ 4.0 on each of 6 components on golden specs
//   - F3 agent eval: success rate ≥ 70% on golden tasks for popular APIs
//   - Bundle size: PASS ≤ 800 KB; WARN ≤ 950 KB; FAIL > 950 KB (CF Workers margin)
//   - Coverage: 100% (Pass 1 must not lose endpoints)
//   - Cost cap: $0.50 free / $2.00 pro per generation (docs/mcpgen-architecture.md §10;
//     CLAUDE.md "Cost cap: $0.50 free / $2.00 pro per generation. Превышение → hard
//     fail с partial result + bill"). Phase 8 D-13.
//
// References:
//   - docs/mcpgen-implementation-plan.md §11.7 (launch criteria spec)
//   - docs/mcpgen-architecture.md §10 (billing + cost cap canonical source)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-13 (runtime constants)
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-13 (Phase 8 cost-cap)
//   - .planning/phases/01-foundation/01-PATTERNS.md "launch-criteria.ts"
//   - .pre-commit-hooks/launch-criteria-paired-decision.sh (paired-decision guard)
//   - docs/decisions/2026-04-26-cost-cap-thresholds.md (Phase 8 D-13 paired entry)

export const LAUNCH_CRITERIA = {
  F2_SMELL_MIN: 4.0,
  F3_AGENT_PASS_RATE_MIN: 0.7,
  BUNDLE_SIZE: {
    PASS_KB: 800,
    WARN_KB: 950,
    FAIL_KB_EXCLUSIVE: 950,
  },
  COVERAGE_PCT_MIN: 100,
  // Phase 8 D-13 — paired with docs/decisions/2026-04-26-cost-cap-thresholds.md
  COST_CAP_FREE_USD: 0.50,
  COST_CAP_PRO_USD: 2.00,
} as const;

export type LaunchCriteria = typeof LAUNCH_CRITERIA;
