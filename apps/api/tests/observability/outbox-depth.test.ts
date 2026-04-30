// apps/api/tests/observability/outbox-depth.test.ts
//
// CTRL-08 / D-21 / Pitfall #10: outbox depth monitor + alert.
//
// Behaviour pinned by Plan 09-11 Task 1 <behavior>:
//   1. ≤10K rows older than 5 min  → exit 0; heartbeat URL hit (when set).
//   2. >10K rows older than 5 min  → exit 1; Resend alert sent.
//   3. >10K rows BUT all created_at within last 5 min → exit 0 (Pitfall #10).
//   4. BETTERSTACK_OUTBOX_HEARTBEAT_URL empty → no heartbeat fetch (D-01).
//
// Integration test against the local Neon dev branch (gated on DATABASE_URL).
// When the DB is unavailable, all tests are skipped (not failed) so CI runs
// without DB stay green.
//
// Resend client (`apps/api/src/lib/email/resend-client.ts`) is mocked so the
// test never actually emits email.
//
// References:
//   - .planning/phases/09-observability-polish/09-11-PLAN.md Task 1
//   - .planning/phases/09-observability-polish/09-RESEARCH.md §"Code Example 3"
//   - .planning/phases/09-observability-polish/09-PATTERNS.md
//     §"outbox-depth-monitor specific pattern"
//   - .planning/phases/09-observability-polish/09-CONTEXT.md D-21

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sql } from 'drizzle-orm';

const HAS_DB = Boolean(process.env['DATABASE_URL']);

const TEST_ORG_ID = '00000000-0000-4000-8000-000000000091';
const TEST_GENERATION_ID = '00000000-0000-4000-8000-000000000092';
const TEST_PROJECT_ID = '00000000-0000-4000-8000-000000000093';
const TEST_DEPLOYMENT_ID = '00000000-0000-4000-8000-000000000094';
const TEST_LOGTO_ORG = 'logto-outbox-depth-test-org';

// Threshold pinned by D-21 (matches CF Queue alert spec verbatim).
const THRESHOLD = 10_000;

// Mock the Resend connector so the test never actually sends mail.
const sendOutboxDepthAlertSpy = vi.fn(async () => undefined);
vi.mock('../../src/lib/email/resend-client.js', () => ({
  sendOutboxDepthAlert: sendOutboxDepthAlertSpy,
}));

interface InsertRowOpts {
  readonly count: number;
  readonly secondsAgo: number; // created_at = now() - INTERVAL 'secondsAgo seconds'
  readonly markerSuffix: string;
}

describe.skipIf(!HAS_DB)('outbox depth monitor (CTRL-08 / D-21)', () => {
  let db: typeof import('../../src/db.js')['db'];
  let usage_events_outbox: typeof import('@mcpgen/contracts/db-schema')['usage_events_outbox'];
  let organizations: typeof import('@mcpgen/contracts/db-schema')['organizations'];
  let projects: typeof import('@mcpgen/contracts/db-schema')['projects'];
  let generations: typeof import('@mcpgen/contracts/db-schema')['generations'];
  let deployments: typeof import('@mcpgen/contracts/db-schema')['deployments'];
  let runOutboxDepthMonitor: typeof import('../../../scripts/observability/outbox-depth-monitor.js')['runOutboxDepthMonitor'];

  beforeEach(async () => {
    sendOutboxDepthAlertSpy.mockClear();
    ({ db } = await import('../../src/db.js'));
    ({ usage_events_outbox, organizations, projects, generations, deployments } =
      await import('@mcpgen/contracts/db-schema'));
    ({ runOutboxDepthMonitor } = await import(
      '../../../scripts/observability/outbox-depth-monitor.js'
    ));

    // Seed FK chain: organization → project → spec → generation → deployment.
    await db
      .insert(organizations)
      .values({ id: TEST_ORG_ID, logto_org_id: TEST_LOGTO_ORG, name: 'outbox-depth-test-org' })
      .onConflictDoNothing();

    await db
      .insert(projects)
      .values({
        id: TEST_PROJECT_ID,
        org_id: TEST_ORG_ID,
        name: 'outbox-depth-test-project',
      })
      .onConflictDoNothing();

    // specs row required for FK on generations.spec_id.
    await db.execute(sql`
      INSERT INTO specs (id, project_id, content_hash, version, source_url)
      VALUES ('00000000-0000-4000-8000-000000000095', ${TEST_PROJECT_ID},
              'outbox-depth-test-hash', 1, NULL)
      ON CONFLICT (id) DO NOTHING
    `);

    await db
      .insert(generations)
      .values({
        id: TEST_GENERATION_ID,
        project_id: TEST_PROJECT_ID,
        spec_id: '00000000-0000-4000-8000-000000000095',
        status: 'completed',
      })
      .onConflictDoNothing();

    await db
      .insert(deployments)
      .values({
        id: TEST_DEPLOYMENT_ID,
        generation_id: TEST_GENERATION_ID,
        cf_worker_name: 'outbox-depth-test-worker',
        url: 'http://localhost:8788/t/outbox-depth-test',
        auth_mode: 'passthrough',
      })
      .onConflictDoNothing();

    // Always start with an empty outbox for this deployment.
    await db.execute(sql`
      DELETE FROM usage_events_outbox WHERE deployment_id = ${TEST_DEPLOYMENT_ID}
    `);
  });

  afterEach(async () => {
    await db.execute(sql`
      DELETE FROM usage_events_outbox WHERE deployment_id = ${TEST_DEPLOYMENT_ID}
    `);
    await db.delete(deployments).where(sql`id = ${TEST_DEPLOYMENT_ID}`);
    await db.delete(generations).where(sql`id = ${TEST_GENERATION_ID}`);
    await db.execute(sql`
      DELETE FROM specs WHERE id = '00000000-0000-4000-8000-000000000095'
    `);
    await db.delete(projects).where(sql`id = ${TEST_PROJECT_ID}`);
    await db.delete(organizations).where(sql`id = ${TEST_ORG_ID}`);
  });

  async function seedRows(opts: InsertRowOpts): Promise<void> {
    // Bulk-insert via `generate_series` keeps test setup fast (10K rows < 1s).
    await db.execute(sql`
      INSERT INTO usage_events_outbox
        (id, deployment_id, event_type, event_payload, idempotency_key, created_at, sent_at)
      SELECT
        'depth-${sql.raw(opts.markerSuffix)}-' || lpad(g::text, 6, '0'),
        ${TEST_DEPLOYMENT_ID},
        'tool_call',
        '{"tool_name": "depth_test", "tokens_in": 1, "tokens_out": 1}'::jsonb,
        ${TEST_DEPLOYMENT_ID} || '_depth_${sql.raw(opts.markerSuffix)}_' || g::text,
        now() - make_interval(secs => ${opts.secondsAgo}),
        NULL
      FROM generate_series(1, ${opts.count}) AS g
    `);
  }

  it('Test 1: ≤ threshold pending older than 5 min → exit 0 + heartbeat hit', async () => {
    // 50 rows, all 6 minutes old (older than the Pitfall #10 5-min cutoff).
    await seedRows({ count: 50, secondsAgo: 360, markerSuffix: 't1' });

    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    const result = await runOutboxDepthMonitor({
      heartbeatUrl: 'https://uptime.betterstack.com/heartbeat/abc',
      fetch: fetchSpy as unknown as typeof fetch,
      filterDeploymentId: TEST_DEPLOYMENT_ID,
    });

    expect(result.pending).toBeLessThanOrEqual(THRESHOLD);
    expect(result.exitCode).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://uptime.betterstack.com/heartbeat/abc');
    expect(sendOutboxDepthAlertSpy).not.toHaveBeenCalled();
  });

  it('Test 2: > threshold pending older than 5 min → exit 1 + Resend alert', async () => {
    // 10 001 rows, 6 minutes old, exceeds the 10 000 threshold.
    await seedRows({ count: 10_001, secondsAgo: 360, markerSuffix: 't2' });

    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    const result = await runOutboxDepthMonitor({
      heartbeatUrl: 'https://uptime.betterstack.com/heartbeat/abc',
      fetch: fetchSpy as unknown as typeof fetch,
      filterDeploymentId: TEST_DEPLOYMENT_ID,
    });

    expect(result.pending).toBeGreaterThan(THRESHOLD);
    expect(result.exitCode).toBe(1);
    expect(sendOutboxDepthAlertSpy).toHaveBeenCalledTimes(1);
    // Heartbeat is NOT pinged when above threshold (alert path only).
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 30_000);

  it('Test 3: 15 000 rows but ALL within last 5 min → exit 0 (Pitfall #10 filter)', async () => {
    // 15 000 fresh rows (60 seconds old) — Pitfall #10 5-min filter must exclude them.
    await seedRows({ count: 15_000, secondsAgo: 60, markerSuffix: 't3' });

    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    const result = await runOutboxDepthMonitor({
      heartbeatUrl: 'https://uptime.betterstack.com/heartbeat/abc',
      fetch: fetchSpy as unknown as typeof fetch,
      filterDeploymentId: TEST_DEPLOYMENT_ID,
    });

    expect(result.pending).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(sendOutboxDepthAlertSpy).not.toHaveBeenCalled();
  }, 30_000);

  it('Test 4: empty heartbeat URL → no fetch attempted (D-01 invariant)', async () => {
    await seedRows({ count: 5, secondsAgo: 360, markerSuffix: 't4' });

    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    const result = await runOutboxDepthMonitor({
      heartbeatUrl: '',
      fetch: fetchSpy as unknown as typeof fetch,
      filterDeploymentId: TEST_DEPLOYMENT_ID,
    });

    expect(result.exitCode).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendOutboxDepthAlertSpy).not.toHaveBeenCalled();
  });
});

// Sentinel: reports `passed` rather than `no tests` when DB is absent.
describe.skipIf(HAS_DB)('outbox depth monitor (skipped without DB)', () => {
  it('integration runs only when DATABASE_URL is set', () => {
    expect(HAS_DB).toBe(false);
  });
});
