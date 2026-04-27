// apps/api/scripts/seed-synthetic-usage.ts
//
// D-25 mitigation: seeds usage_events_outbox from packages/engine-fixtures
// so Wave 2 outbox poller can be tested without Phase 6 lands.
//
// Two callers:
//   - CLI: `bun run apps/api/scripts/seed-synthetic-usage.ts` (IIFE at bottom)
//   - Test import: `import { seedSyntheticOutbox } from '../scripts/seed-synthetic-usage.js'`
//     (Plan 05 Task 1 E2E test imports this for the PHASE_6_AVAILABLE=0 path)
//
// What this script does:
//   1. Reads DATABASE_URL from env (for Drizzle connection).
//   2. Reads fixture FinalTool sets from @mcpgen/engine-fixtures (5 APIs).
//   3. INSERT one usage_events_outbox row per fixture tool with:
//      - event_type='tool_call'
//      - event_payload={ tool_name, tokens_in: 100, tokens_out: 200, ... }
//      - idempotency_key matching STRIPE_METERS_KEY_REGEX
//   4. Skips on UNIQUE conflict (re-runs are idempotent).
//
// B2 / B3: imports SYNTHETIC_DEPLOYMENT_ID from @mcpgen/contracts/billing-types
// (Plan 01 Wave-1 seed); Plan 03 Task 3 cost-cap-enforcer ALSO imports the same
// constant so the FK chain resolves consistently.

import { ulid } from 'ulid';
import { db } from '../src/db.js';
import { usage_events_outbox } from '@mcpgen/contracts/db-schema';
import { SYNTHETIC_DEPLOYMENT_ID } from '@mcpgen/contracts/billing-types';
import { ALL_FIXTURES } from '@mcpgen/engine-fixtures';

// Synthetic test-org id used when the IIFE runs the seeder directly (CLI mode).
// E2E callers (Plan 05 Task 1) pass their own tenantOrgId via opts.tenantOrgId.
const SYNTHETIC_ORG_ID = '00000000-0000-4000-8000-000000000002';

function makeIdempotencyKey(deploymentId: string, when: Date, toolName: string): string {
  // STRIPE_METERS_KEY_REGEX shape: ^[uuid]_YYYY-MM-DDTHH:MM_[a-z][a-z0-9_]{0,63}$
  // (deployment_id + minute_bucket + tool_name) per packages/contracts/src/idempotency.ts
  const minute = when.toISOString().slice(0, 16); // "2026-04-26T14:30"
  return `${deploymentId}_${minute}_${toolName}`;
}

interface SeedOpts {
  readonly deploymentId: string;
  readonly count: number;
  readonly tenantOrgId: string;
}

/**
 * Named export consumed by Plan 05 Task 1 E2E test.
 * Pass deploymentId from caller (E2E uses SYNTHETIC_DEPLOYMENT_ID; CLI uses default).
 */
export async function seedSyntheticOutbox(opts: SeedOpts): Promise<void> {
  const fixtureNames = ['stripe', 'github', 'notion', 'linear', 'slack'] as const;

  let inserted = 0;
  const now = new Date();
  outer: for (const apiName of fixtureNames) {
    const set = ALL_FIXTURES[apiName];
    for (const tool of set.finalTools) {
      if (inserted >= opts.count) break outer;
      const key = makeIdempotencyKey(opts.deploymentId, now, tool.name);
      try {
        await db.insert(usage_events_outbox).values({
          id: ulid(),
          deployment_id: opts.deploymentId,
          event_type: 'tool_call',
          event_payload: {
            tool_name: tool.name,
            api: apiName,
            tokens_in: 100,
            tokens_out: 200,
            stripe_customer_id: 'cus_synthetic_test',
            tenant_org_id: opts.tenantOrgId,
            value: 1,
          },
          idempotency_key: key,
        });
        inserted++;
      } catch (err) {
        // UNIQUE conflict on idempotency_key — re-runs are no-ops.
        if (!String(err).toLowerCase().includes('unique')) throw err;
      }
    }
  }
  console.log(
    `Inserted ${String(inserted)} synthetic outbox rows for deployment_id=${opts.deploymentId}.`,
  );
}

// CLI entry — preserves direct-execution behavior, mirrors infrastructure/logto/scaffold.ts IIFE.
// Detects whether the module was loaded directly (Bun / tsx / node entry-point).
// When imported by tests or downstream modules, the IIFE is suppressed.
function _isDirectExecution(): boolean {
  const entry = process.argv[1] ?? '';
  return entry.endsWith('seed-synthetic-usage.ts') || entry.endsWith('seed-synthetic-usage.js');
}

if (_isDirectExecution()) {
  void seedSyntheticOutbox({
    deploymentId: SYNTHETIC_DEPLOYMENT_ID,
    count: 100,
    tenantOrgId: SYNTHETIC_ORG_ID,
  }).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
