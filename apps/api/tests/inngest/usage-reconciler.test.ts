// apps/api/tests/inngest/usage-reconciler.test.ts
//
// CTRL-07 / D-15 / Pitfall #16 / T-8-12: usage-reconciler-v1 contract tests
// (static-source assertions; same pattern as Plan 02 stripe-meters-emit and
// Plan 03 cost-cap-enforcer).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usageReconciler } from '../../src/inngest/functions/usage-reconciler.js';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_SRC = readFileSync(
  resolve(HERE, '../../src/inngest/functions/usage-reconciler.ts'),
  'utf-8',
);

describe('usage-reconciler-v1', () => {
  it('uses the stable function ID from the register', () => {
    const id =
      (usageReconciler as unknown as { opts?: { id: string } }).opts?.id ??
      (usageReconciler as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.USAGE_RECONCILER);
    expect(id).toBe('usage-reconciler-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(FN_SRC).toContain('INNGEST_FUNCTION_IDS.USAGE_RECONCILER');
  });

  it('configured with daily 02:00 UTC cron trigger', () => {
    expect(FN_SRC).toContain("cron: '0 2 * * *'");
  });

  it('threshold constant RECONCILIATION_DRIFT_THRESHOLD_PCT is 2.0 (Pitfall #16)', () => {
    expect(FN_SRC).toContain('RECONCILIATION_DRIFT_THRESHOLD_PCT = 2.0');
    expect(FN_SRC).toContain('driftPct > RECONCILIATION_DRIFT_THRESHOLD_PCT');
  });

  it('reads Stripe meter event summaries via listEventSummaries(meterId, params) (T-8-13)', () => {
    // stripe@22.1.0 surface: `meters.listEventSummaries(id, params)`; the
    // older `meters.eventSummaries.list` method does NOT exist in this SDK.
    expect(FN_SRC).toContain('stripe.billing.meters.listEventSummaries(meterId,');
  });

  it('groups yesterday usage_events by (tenant, event_type) via JOIN (RESEARCH §11)', () => {
    expect(FN_SRC).toContain('FROM usage_events ue');
    expect(FN_SRC).toContain('JOIN deployments d');
    expect(FN_SRC).toContain('JOIN generations g');
    expect(FN_SRC).toContain('JOIN projects    p');
    expect(FN_SRC).toContain('GROUP BY p.org_id, ue.tool_name');
  });

  it('persists reconciliation_log row keyed on (date, event_type, tenant_id) UNIQUE (T-8-12 idempotent re-run)', () => {
    expect(FN_SRC).toContain('reconciliation_log');
    // 23505 = Postgres UNIQUE-violation; second-run idempotent
    expect(FN_SRC).toContain("'23505'");
    expect(FN_SRC).toContain("status: 'already_reconciled'");
  });

  it('METER_ID_BY_EVENT mapping is INSIDE handler (NOT module-top — checker W3 typed env)', () => {
    // Module-top capture would freeze STRIPE_METER_*_ID at boot time. The
    // mapping must live inside the handler so process.env reads happen at
    // execution time.
    const handlerStart = FN_SRC.indexOf('async ({ step }) =>');
    expect(handlerStart).toBeGreaterThan(0);
    const meterMappingPos = FN_SRC.indexOf('METER_ID_BY_EVENT');
    expect(meterMappingPos).toBeGreaterThan(handlerStart);
  });

  it('emits ops alert via sendReconciliationAlert when drift > threshold', () => {
    expect(FN_SRC).toContain('sendReconciliationAlert');
    expect(FN_SRC).toContain("from '../../lib/email/resend-client.js'");
  });

  it('uses ULID for reconciliation_log row id (audit trail stable PK)', () => {
    expect(FN_SRC).toContain("import { ulid } from 'ulid'");
    expect(FN_SRC).toContain('ulid()');
  });
});
