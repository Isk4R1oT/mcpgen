// apps/api/tests/inngest/anon-tenant-cleanup.test.ts
//
// Phase 09.1 plan 10 (D-06 / ANON-03 / Pitfall #3): static-source assertions
// for the 15-minute cleanup cron that deletes expired CFWP anon scripts +
// deployments rows. Mirrors the analog quota-period-rollover.test.ts +
// drift-watcher.test.ts shape (the function cannot be invoked in a pure unit
// test without a live Inngest dev server + real CF API; static-source
// assertions pin the contract Wave 7 integration cannot bypass).
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-06
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §3 (cleanup
//     cron + Pitfall #3 cost-runaway alert mandate)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-08-SUMMARY.md
//     (deleteScript 404=success invariant)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anonTenantCleanup } from '../../src/inngest/functions/anon-tenant-cleanup.js';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_SRC_PATH = resolve(
  HERE,
  '../../src/inngest/functions/anon-tenant-cleanup.ts',
);
const FN_SRC = readFileSync(FN_SRC_PATH, 'utf-8');

describe('anon-tenant-cleanup-v1', () => {
  it('uses the stable function ID from the register', () => {
    const id =
      (anonTenantCleanup as unknown as { opts?: { id: string } }).opts?.id ??
      (anonTenantCleanup as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.ANON_TENANT_CLEANUP);
    expect(id).toBe('anon-tenant-cleanup-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(FN_SRC).toContain('INNGEST_FUNCTION_IDS.ANON_TENANT_CLEANUP');
  });

  it('cron schedule fires every 15 minutes (*/15 * * * *)', () => {
    expect(FN_SRC).toContain("cron: '*/15 * * * *'");
  });

  it('SELECT pulls expired anon deployments only (expires_at < NOW() AND anon_session_id IS NOT NULL)', () => {
    expect(FN_SRC).toContain('expires_at IS NOT NULL');
    expect(FN_SRC).toContain('expires_at < NOW()');
    expect(FN_SRC).toContain('anon_session_id IS NOT NULL');
  });

  it('LIMIT 500 caps each run to fit the Inngest step time budget (T-9.1-10-06 mitigation)', () => {
    expect(FN_SRC).toContain('LIMIT 500');
  });

  it('imports deleteScript from cf-platforms-deploy (single CFWP wrapper invariant)', () => {
    expect(FN_SRC).toContain(
      "from '../../lib/cf-platforms-deploy.js'",
    );
    expect(FN_SRC).toContain('deleteScript');
  });

  it('deletes the deployments row in its own step.run (per-row idempotency)', () => {
    expect(FN_SRC).toContain('DELETE FROM deployments WHERE id =');
  });

  it('sends BetterStack heartbeat at end of every run (Pitfall #3 mandate)', () => {
    // Heartbeat fires whether 0 deletes or many — silent failure is the
    // dangerous mode (cost runaway). Both branches must ping.
    expect(FN_SRC).toContain('sendBetterStackHeartbeat');
  });

  it('heartbeat helper is a no-op when BETTERSTACK_ANON_CLEANUP_HEARTBEAT_URL is unset (D-01 graceful pattern)', () => {
    expect(FN_SRC).toContain('BETTERSTACK_ANON_CLEANUP_HEARTBEAT_URL');
    // Pattern: `if (heartbeatUrl)` guards the fetch, mirroring
    // outbox-depth-monitor.ts (D-01 BetterStack DSN-absent graceful path).
    expect(FN_SRC).toMatch(/if\s*\(\s*heartbeatUrl\s*\)/);
  });

  it('treats CF DELETE 404 as success — relies on cf-platforms-deploy.deleteScript invariant', () => {
    // The invariant is enforced by the wrapper itself; this test pins that
    // the cron does NOT swallow other errors. We assert the cron does NOT
    // wrap deleteScript in a generic try/catch that hides 5xx failures.
    expect(FN_SRC).not.toMatch(/try\s*\{\s*await\s+deleteScript\([^)]*\)\s*;\s*\}\s*catch/);
  });

  it('honors MCPGEN_LOCAL_COMPUTE=1 short-circuit transparently via cf-platforms-deploy', () => {
    // The cron does NOT itself check MCPGEN_LOCAL_COMPUTE — that lives in
    // cf-platforms-deploy.ts (single source of truth). Pin the cron does
    // not duplicate the gate.
    expect(FN_SRC).not.toContain('MCPGEN_LOCAL_COMPUTE');
  });

  it('return shape exposes deleted count for observability', () => {
    expect(FN_SRC).toMatch(/return\s*\{\s*deleted/);
  });

  it('passes CfPlatformsEnv shape to deleteScript (CF_API_TOKEN + CF_ACCOUNT_ID)', () => {
    expect(FN_SRC).toContain('CF_API_TOKEN');
    expect(FN_SRC).toContain('CF_ACCOUNT_ID');
  });
});
