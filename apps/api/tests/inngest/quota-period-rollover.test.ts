// apps/api/tests/inngest/quota-period-rollover.test.ts
//
// CTRL-07 / D-14: Stable-ID + SQL-clause static assertions for the hourly
// anniversary-based quota period rollover Inngest function.
//
// Mirrors the Wave 2 stripe-meters-emit static-assertion shape (the function
// can't be invoked in a pure unit test without a live Inngest dev server +
// real Postgres; static-source asserts pin the contract Wave 3 integration
// cannot bypass).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quotaPeriodRollover } from '../../src/inngest/functions/quota-period-rollover.js';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_SRC_PATH = resolve(HERE, '../../src/inngest/functions/quota-period-rollover.ts');
const FN_SRC = readFileSync(FN_SRC_PATH, 'utf-8');

describe('quota-period-rollover-v1', () => {
  it('uses the stable function ID from the register', () => {
    const id =
      (quotaPeriodRollover as unknown as { opts?: { id: string } }).opts?.id ??
      (quotaPeriodRollover as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.QUOTA_PERIOD_ROLLOVER);
    expect(id).toBe('quota-period-rollover-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(FN_SRC).toContain('INNGEST_FUNCTION_IDS.QUOTA_PERIOD_ROLLOVER');
  });

  it('UPDATE statement uses INTERVAL 1 month + NOW() (anniversary-based, NOT calendar month)', () => {
    expect(FN_SRC).toContain("INTERVAL '1 month'");
    expect(FN_SRC).toContain('NOW()');
  });

  it('cron schedule is hourly (0 * * * *)', () => {
    expect(FN_SRC).toContain("'0 * * * *'");
  });
});
