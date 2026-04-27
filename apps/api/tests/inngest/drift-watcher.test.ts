// apps/api/tests/inngest/drift-watcher.test.ts
//
// CTRL-03 / D-16 / Pitfall #21 / Pitfall #34: drift-watcher-v1 + drift-watcher-check-v1
// contract tests via static-source assertions (same pattern as Plan 02
// stripe-meters-emit.test.ts and Plan 03 cost-cap-enforcer.test.ts).
//
// Pins the contract Wave 5 E2E cannot bypass:
//   - Stable function IDs from INNGEST_FUNCTION_IDS register
//   - Cron schedule (03:00 UTC daily)
//   - Q1 graceful fallback (engine 502/503/timeout → engine_unavailable)
//   - 4-table tenant lookup
//   - drift_email_log composite-PK rate limit (23505 silent swallow)
//   - getM2mTokenForEngine called with full env shape (not destructured)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { driftWatcher } from '../../src/inngest/functions/drift-watcher.js';
import { driftWatcherCheck } from '../../src/inngest/functions/drift-watcher-check.js';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const WATCHER_SRC = readFileSync(
  resolve(HERE, '../../src/inngest/functions/drift-watcher.ts'),
  'utf-8',
);
const CHECK_SRC = readFileSync(
  resolve(HERE, '../../src/inngest/functions/drift-watcher-check.ts'),
  'utf-8',
);

describe('drift-watcher-v1 (cron fan-out)', () => {
  it('uses the stable function ID from the register', () => {
    const id =
      (driftWatcher as unknown as { opts?: { id: string } }).opts?.id ??
      (driftWatcher as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.DRIFT_WATCHER);
    expect(id).toBe('drift-watcher-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(WATCHER_SRC).toContain('INNGEST_FUNCTION_IDS.DRIFT_WATCHER');
  });

  it('configured with daily 03:00 UTC cron trigger', () => {
    expect(WATCHER_SRC).toContain("cron: '0 3 * * *'");
  });

  it('lists deployments via JOIN filtered to spec_url IS NOT NULL (D-16)', () => {
    expect(WATCHER_SRC).toContain('JOIN generations g');
    expect(WATCHER_SRC).toContain('JOIN specs s');
    expect(WATCHER_SRC).toContain('s.spec_url IS NOT NULL');
  });

  it('fans out via step.sendEvent with drift/check.requested per deployment (T-8-10)', () => {
    expect(WATCHER_SRC).toContain('step.sendEvent');
    expect(WATCHER_SRC).toContain("name: 'drift/check.requested'");
    expect(WATCHER_SRC).toContain('deploymentId: d.deployment_id');
    expect(WATCHER_SRC).toContain('specUrl: d.spec_url');
  });
});

describe('drift-watcher-check-v1 (per-deployment check)', () => {
  it('uses the stable function ID from the register', () => {
    const id =
      (driftWatcherCheck as unknown as { opts?: { id: string } }).opts?.id ??
      (driftWatcherCheck as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.DRIFT_WATCHER_CHECK);
    expect(id).toBe('drift-watcher-check-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(CHECK_SRC).toContain('INNGEST_FUNCTION_IDS.DRIFT_WATCHER_CHECK');
  });

  it("triggers on the 'drift/check.requested' event with retries: 3", () => {
    expect(CHECK_SRC).toContain("event: 'drift/check.requested'");
    expect(CHECK_SRC).toContain('retries: 3');
  });

  it('Q1 graceful fallback: engine 502/503 returns engine_unavailable without retry', () => {
    expect(CHECK_SRC).toContain('resp.status === 502');
    expect(CHECK_SRC).toContain('resp.status === 503');
    expect(CHECK_SRC).toContain("reason: 'engine_unavailable'");
  });

  it('Q1 graceful fallback: AbortSignal.timeout(10_000) catches engine slowness', () => {
    expect(CHECK_SRC).toContain('AbortSignal.timeout(10_000)');
    expect(CHECK_SRC).toContain("name === 'TimeoutError'");
  });

  it('calls getM2mTokenForEngine(e) with the full M2mEnv shape (B4 — NOT destructured)', () => {
    // Plan-text checker B4: pass typed env directly; do not destructure into
    // camelCase {endpoint, appId, appSecret, resource} which breaks Plan 01's
    // M2mEnv interface declaration.
    expect(CHECK_SRC).toContain('getM2mTokenForEngine(e)');
    expect(CHECK_SRC).not.toMatch(/getM2mTokenForEngine\(\{\s*endpoint/);
    expect(CHECK_SRC).not.toMatch(/getM2mTokenForEngine\(\{\s*appId/);
  });

  it('calls engine /internal/v1/parse with M2M Bearer (Q1 contract pin)', () => {
    expect(CHECK_SRC).toContain('/internal/v1/parse');
    expect(CHECK_SRC).toContain('Authorization: `Bearer ${m2m}`');
  });

  it('validates engine response with ParseResponse Zod schema (engine-internal-api.ts contract)', () => {
    expect(CHECK_SRC).toContain('ParseResponse.parse');
    expect(CHECK_SRC).toMatch(/import\s*\{[^}]*ParseResponse[^}]*\}\s*from\s*'@mcpgen\/contracts'/);
  });

  it('uses computeIrDiff (cosmetic-strip) for change detection (T-8-09 / Pitfall #34)', () => {
    expect(CHECK_SRC).toContain("from '../../lib/drift/ir-diff.js'");
    expect(CHECK_SRC).toContain('computeIrDiff(');
  });

  it('persists drift_event row with ULID id and status: pending', () => {
    expect(CHECK_SRC).toContain('drift_events');
    expect(CHECK_SRC).toContain("status: 'pending'");
    expect(CHECK_SRC).toContain('ulid()');
  });

  it('seeds baseline on first-ever check (one-time, no diff yet)', () => {
    expect(CHECK_SRC).toContain('seed-baseline');
    expect(CHECK_SRC).toContain('parsed_ir_jsonb');
    expect(CHECK_SRC).toContain("baseline: 'seeded'");
  });

  it('looks up tenant + recipient via 4-table JOIN (deployments → generations → projects → organizations → users)', () => {
    expect(CHECK_SRC).toContain('JOIN generations g');
    expect(CHECK_SRC).toContain('JOIN projects p');
    expect(CHECK_SRC).toContain('JOIN organizations o');
    expect(CHECK_SRC).toMatch(/JOIN users u|LEFT JOIN users u/);
  });

  it('enforces D-18 rate-limit via drift_email_log + isoWeekStart + 23505 silent swallow (T-8-11)', () => {
    expect(CHECK_SRC).toContain('drift_email_log');
    expect(CHECK_SRC).toContain('isoWeekStart');
    expect(CHECK_SRC).toContain('isUniqueViolation');
    expect(CHECK_SRC).toContain("'23505'");
  });

  it('imports sendDriftEmail from the Resend client (T-8-11 enforced upstream of email send)', () => {
    expect(CHECK_SRC).toContain("from '../../lib/email/resend-client.js'");
    expect(CHECK_SRC).toContain('sendDriftEmail(');
  });
});
