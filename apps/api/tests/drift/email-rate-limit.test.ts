// apps/api/tests/drift/email-rate-limit.test.ts
//
// CTRL-03 / D-18 / T-8-11: drift_email_log composite-PK UNIQUE prevents
// 2nd email same week per tenant. Integration test against real Neon dev
// branch — gated on DATABASE_URL_UNPOOLED.
//
// When DATABASE_URL_UNPOOLED is unset, all tests in this file are skipped
// (not failed) so unit-only test runs stay green.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { isoWeekStart } from '../../src/lib/iso-week.js';

const HAS_DB = Boolean(process.env['DATABASE_URL_UNPOOLED']);

const TEST_ORG_ID = '00000000-0000-4000-8000-000000000044';
const TEST_LOGTO_ORG_ID = 'logto-rate-limit-test-org';

describe.skipIf(!HAS_DB)('drift_email_log rate-limit (T-8-11)', () => {
  let db: typeof import('../../src/db.js')['db'];
  let drift_email_log: typeof import('@mcpgen/contracts/db-schema')['drift_email_log'];
  let organizations: typeof import('@mcpgen/contracts/db-schema')['organizations'];

  beforeAll(async () => {
    process.env['DATABASE_URL'] = process.env['DATABASE_URL_UNPOOLED'];
    ({ db } = await import('../../src/db.js'));
    ({ drift_email_log, organizations } = await import('@mcpgen/contracts/db-schema'));
    await db
      .insert(organizations)
      .values({
        id: TEST_ORG_ID,
        logto_org_id: TEST_LOGTO_ORG_ID,
        name: 'rate-limit-test-org',
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    if (HAS_DB) {
      await db.delete(organizations).where(eq(organizations.id, TEST_ORG_ID));
    }
  });

  afterEach(async () => {
    await db
      .delete(drift_email_log)
      .where(eq(drift_email_log.tenant_id, TEST_ORG_ID));
  });

  it('first INSERT for (tenant_id, week_start) succeeds', async () => {
    const week = isoWeekStart(new Date()).toISOString().split('T')[0];
    if (!week) throw new Error('isoWeekStart produced empty ISO');
    await db.insert(drift_email_log).values({ tenant_id: TEST_ORG_ID, week_start: week });
    // No exception = success.
    expect(true).toBe(true);
  });

  it('second INSERT same (tenant_id, week_start) raises UNIQUE 23505', async () => {
    const week = isoWeekStart(new Date()).toISOString().split('T')[0];
    if (!week) throw new Error('isoWeekStart produced empty ISO');
    await db.insert(drift_email_log).values({ tenant_id: TEST_ORG_ID, week_start: week });
    let caught: { code?: string; message?: string } | null = null;
    try {
      await db.insert(drift_email_log).values({ tenant_id: TEST_ORG_ID, week_start: week });
    } catch (err) {
      caught = err as { code?: string; message?: string };
    }
    expect(caught).not.toBeNull();
    const code = caught?.code;
    const message = caught?.message ?? '';
    const isUnique = code === '23505' || message.includes('duplicate key value');
    expect(isUnique).toBe(true);
  });
});

// When DB is unavailable the suite is skipped — provide a sentinel test so
// vitest reports "test passed" not "no tests".
describe.skipIf(HAS_DB)('drift_email_log rate-limit (skipped without DB)', () => {
  it('integration runs only when DATABASE_URL_UNPOOLED is set', () => {
    expect(HAS_DB).toBe(false);
  });
});
