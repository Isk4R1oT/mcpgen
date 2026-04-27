// apps/api/tests/inngest/cost-cap-enforcer.test.ts
//
// CTRL-06 / D-13: Cost-cap-enforcer contract tests.
// Static-source assertions pin the contract Wave 5 E2E cannot bypass:
//   - Stable function ID
//   - Concurrency-key serialization (T-8-19 mitigation)
//   - LAUNCH_CRITERIA threshold wiring
//   - PAYG early-return
//   - Cancel-engine call shape (M2M Bearer + reason='cost_cap_exceeded')
//   - SYNTHETIC_DEPLOYMENT_ID single-source-of-truth (B2)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { costCapEnforcer } from '../../src/inngest/functions/cost-cap-enforcer.js';
import { INNGEST_FUNCTION_IDS, LAUNCH_CRITERIA } from '@mcpgen/contracts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_SRC_PATH = resolve(HERE, '../../src/inngest/functions/cost-cap-enforcer.ts');
const FN_SRC = readFileSync(FN_SRC_PATH, 'utf-8');

describe('cost-cap-enforcer-v1', () => {
  it('uses the stable function ID from the register', () => {
    const id =
      (costCapEnforcer as unknown as { opts?: { id: string } }).opts?.id ??
      (costCapEnforcer as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.COST_CAP_ENFORCER);
    expect(id).toBe('cost-cap-enforcer-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(FN_SRC).toContain('INNGEST_FUNCTION_IDS.COST_CAP_ENFORCER');
  });

  it('configures concurrency limit 1 keyed on event.data.jobId (T-8-19 mitigation)', () => {
    expect(FN_SRC).toContain("key: 'event.data.jobId'");
    expect(FN_SRC).toContain('limit: 1');
  });

  it("triggers on the 'generation/cost.updated' event (from sse-callback)", () => {
    expect(FN_SRC).toContain("event: 'generation/cost.updated'");
  });

  it('reads cap thresholds from LAUNCH_CRITERIA constants (D-13)', () => {
    expect(FN_SRC).toContain('LAUNCH_CRITERIA.COST_CAP_FREE_USD');
    expect(FN_SRC).toContain('LAUNCH_CRITERIA.COST_CAP_PRO_USD');
    expect(LAUNCH_CRITERIA.COST_CAP_FREE_USD).toBe(0.5);
    expect(LAUNCH_CRITERIA.COST_CAP_PRO_USD).toBe(2.0);
  });

  it('PAYG plan never caps (early return on planTier === payg)', () => {
    expect(FN_SRC).toContain("planTier === 'payg'");
  });

  it('cancel-engine step calls ENGINE_ENDPOINT/internal/v1/cancel-generation with M2M Bearer', () => {
    expect(FN_SRC).toContain('/internal/v1/cancel-generation');
    expect(FN_SRC).toContain("'Authorization': `Bearer ${m2mToken}`");
    expect(FN_SRC).toContain("reason: 'cost_cap_exceeded'");
  });

  it('imports SYNTHETIC_DEPLOYMENT_ID from billing-types (B2 single source of truth)', () => {
    expect(FN_SRC).toContain(
      "import { SYNTHETIC_DEPLOYMENT_ID } from '@mcpgen/contracts/billing-types'",
    );
    expect(FN_SRC).toContain('deployment_id: SYNTHETIC_DEPLOYMENT_ID');
    // Ensure the inline literal UUID is NOT present (regression protection).
    expect(FN_SRC).not.toContain("'00000000-0000-4000-8000-000000000001'");
  });

  it('emits a billable usage_events_outbox row keyed on idempotency_key (replay-safe)', () => {
    expect(FN_SRC).toContain('usage_events_outbox');
    expect(FN_SRC).toContain('onConflictDoNothing');
    expect(FN_SRC).toContain('generation_cost_capped');
  });
});
