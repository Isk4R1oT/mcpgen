# Phase 09 — Deferred Items

Items discovered during plan execution that are out of scope for the current plan.

## Discovered during plan 09-10 (Wave 3)

### Pre-existing untracked files (not authored by 09-10)

The following files were already present untracked in the working tree at the
start of plan 09-10 execution. They appear to belong to other Wave 1/2/3 plans
(Wave 3 sibling plans 09-08 / 09-09 / 09-11 / 09-12 specifically). They are
NOT in scope for plan 09-10 and were left untouched:

- `apps/api/tests/observability/outbox-depth.test.ts` — fails typecheck
  (insert payload missing `dispatch_namespace` column, tuple index error).
  Likely belongs to plan 09-12 (Outbox depth alert / D-21).
- `apps/dispatch/tests/cross-tenant-id-block.test.ts` — likely plan 09-09
  (Cross-tenant smart-ID fuzz / D-08 D-09).
- `apps/generation-engine/tests/integration/test_multi_protocol_client.py` —
  likely plan 09-11 (Multi-protocol client mock / D-10).
- `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py`
  (was staged at start of 09-10) — same as cross-tenant-id-block above.
- `apps/api/src/lib/email/resend-client.ts` — modified, not by 09-10.

### Why deferred

Per the executor SCOPE BOUNDARY rule:

> Only auto-fix issues DIRECTLY caused by the current task's changes.
> Pre-existing warnings, linting errors, or failures in unrelated files are
> out of scope.

The 09-10 plan's verification (`pnpm --filter @mcpgen/api test -- --run
tests/lib/sentry-events-mock.test.ts tests/observability/leak-audit.test.ts`)
exits 0. The full-package typecheck error in `outbox-depth.test.ts` is the
owning plan's responsibility.
