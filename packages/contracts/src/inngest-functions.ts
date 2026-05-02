// packages/contracts/src/inngest-functions.ts
//
// CTRL-09 / D-27: Stable Inngest function ID register.
// Phase 9 orphan audit walks every `inngest.createFunction({ id: ... })` in the
// repo and asserts the id is in this register.
//
// Bump rules (per D-27): any rename / schedule change / trigger change → version
// bump (-v2) + paired docs/decisions/<YYYY-MM-DD>-inngest-<name>-v2.md entry.
// Old id stays disabled until orphan audit (Phase 9).
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-27
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-27

export const INNGEST_FUNCTION_IDS = {
  DRIFT_WATCHER:           'drift-watcher-v1',
  DRIFT_WATCHER_CHECK:     'drift-watcher-check-v1',
  USAGE_RECONCILER:        'usage-reconciler-v1',
  STRIPE_METERS_EMIT:      'stripe-meters-emit-v1',
  QUOTA_PERIOD_ROLLOVER:   'quota-period-rollover-v1',
  LOGTO_MAU_WATCH:         'logto-mau-watch-v1',
  COST_CAP_ENFORCER:       'cost-cap-enforcer-v1',
  // ─── Phase 09.1 plan 10 (D-06 retention + D-11 daily salt) ───────────────
  ANON_TENANT_CLEANUP:     'anon-tenant-cleanup-v1',
  ANON_RATE_LIMIT_CLEANUP: 'anon-rate-limit-cleanup-v1',
  ANON_SALT_ROTATE:        'anon-salt-rotate-v1',
  // ─── Feature flags (docs/mcpgen-feature-flags-contract.md §5.4) ──────────
  // Weekly cron: scans _manifest/flags.yaml and opens a GitHub issue for every
  // _rollout / _exp flag whose expected_removal_at has passed.
  FLAG_DEBT_AUDIT:         'flag-debt-audit-v1',
} as const;

export type InngestFunctionId = (typeof INNGEST_FUNCTION_IDS)[keyof typeof INNGEST_FUNCTION_IDS];
