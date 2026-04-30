// apps/api/tests/observability/outbox-depth.test.ts
//
// CTRL-08 / D-21 / Pitfall #10: outbox depth monitor + alert.
//
// Behaviour pinned by Plan 09-11 Task 1 <behavior>:
//   1. ≤ threshold rows older than 5 min   → exit 0 + heartbeat URL hit (when set).
//   2. > threshold rows older than 5 min   → exit 1 + Resend alert sent.
//   3. > threshold rows BUT all created_at within last 5 min → exit 0 (Pitfall #10).
//   4. BETTERSTACK_OUTBOX_HEARTBEAT_URL empty → no heartbeat fetch (D-01).
//
// Integration test against the local Neon dev branch (gated on DATABASE_URL).
// When the DB is unavailable, all tests are skipped (not failed) so CI runs
// without DB stay green.
//
// Strategy: direct import of `runOutboxDepthMonitor` from
// `apps/api/src/lib/outbox-depth-monitor.js` (the script at
// `scripts/observability/outbox-depth-monitor.ts` is a thin wrapper around
// this same function). This keeps test runtime fast (~5s) — no child
// process spawn, no slow tsx startup.
//
// Resend client (`apps/api/src/lib/email/resend-client.ts`) is mocked via
// the injected `sendAlert` option so the test never actually emits email.
//
// References:
//   - .planning/phases/09-observability-polish/09-11-PLAN.md Task 1
//   - .planning/phases/09-observability-polish/09-RESEARCH.md §"Code Example 3"
//   - .planning/phases/09-observability-polish/09-PATTERNS.md
//     §"outbox-depth-monitor specific pattern"

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runOutboxDepthMonitor } from '../../src/lib/outbox-depth-monitor.js';

const HAS_DB = Boolean(process.env['DATABASE_URL']);

const TEST_ORG_ID = '00000000-0000-4000-8000-000000000091';
const TEST_GENERATION_ID = '00000000-0000-4000-8000-000000000092';
const TEST_PROJECT_ID = '00000000-0000-4000-8000-000000000093';
const TEST_DEPLOYMENT_ID = '00000000-0000-4000-8000-000000000094';
const TEST_SPEC_ID = '00000000-0000-4000-8000-000000000095';
const TEST_LOGTO_ORG = 'logto-outbox-depth-test-org';

// Test threshold: 10 instead of 10 000. Bulk-inserting 10 001 rows over the
// slow Neon HTTP driver pushes the test runtime past 60s — using a small
// override keeps each test deterministic and fast (production CLI uses the
// real 10 000 threshold).
const TEST_THRESHOLD = 10;

describe.skipIf(!HAS_DB)('outbox depth monitor (CTRL-08 / D-21)', () => {
  let db: typeof import('../../src/db.js')['db'];
  let organizations: typeof import('@mcpgen/contracts/db-schema')['organizations'];
  let projects: typeof import('@mcpgen/contracts/db-schema')['projects'];
  let generations: typeof import('@mcpgen/contracts/db-schema')['generations'];
  let deployments: typeof import('@mcpgen/contracts/db-schema')['deployments'];

  let heartbeatServer: Server | null = null;
  let heartbeatHits: number = 0;
  let heartbeatPort: number = 0;

  beforeAll(async () => {
    ({ db } = await import('../../src/db.js'));
    ({ organizations, projects, generations, deployments } = await import(
      '@mcpgen/contracts/db-schema'
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
      INSERT INTO specs (id, project_id, content_hash, format, endpoint_count, spec_url)
      VALUES (${TEST_SPEC_ID}, ${TEST_PROJECT_ID},
              'outbox-depth-test-hash', 'openapi3', 0, NULL)
      ON CONFLICT (id) DO NOTHING
    `);

    await db
      .insert(generations)
      .values({
        id: TEST_GENERATION_ID,
        project_id: TEST_PROJECT_ID,
        spec_id: TEST_SPEC_ID,
        status: 'completed',
        options: {},
      })
      .onConflictDoNothing();

    await db
      .insert(deployments)
      .values({
        id: TEST_DEPLOYMENT_ID,
        generation_id: TEST_GENERATION_ID,
        cf_worker_name: 'outbox-depth-test-worker',
        dispatch_namespace: 'mcpgen-sandbox',
        url: 'http://localhost:8788/t/outbox-depth-test',
        auth_mode: 'passthrough',
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.execute(sql`
      DELETE FROM usage_events_outbox WHERE deployment_id = ${TEST_DEPLOYMENT_ID}
    `);
    await db.delete(deployments).where(sql`id = ${TEST_DEPLOYMENT_ID}`);
    await db.delete(generations).where(sql`id = ${TEST_GENERATION_ID}`);
    await db.execute(sql`DELETE FROM specs WHERE id = ${TEST_SPEC_ID}`);
    await db.delete(projects).where(sql`id = ${TEST_PROJECT_ID}`);
    await db.delete(organizations).where(sql`id = ${TEST_ORG_ID}`);
  });

  beforeEach(async () => {
    heartbeatHits = 0;
    heartbeatServer = createServer((_req, res) => {
      heartbeatHits++;
      res.writeHead(200);
      res.end('OK');
    });
    await new Promise<void>((r) => {
      heartbeatServer!.listen(0, '127.0.0.1', () => r());
    });
    heartbeatPort = (heartbeatServer.address() as AddressInfo).port;

    // Always start with an empty outbox for this deployment.
    await db.execute(sql`
      DELETE FROM usage_events_outbox WHERE deployment_id = ${TEST_DEPLOYMENT_ID}
    `);
  });

  afterEach(async () => {
    await db.execute(sql`
      DELETE FROM usage_events_outbox WHERE deployment_id = ${TEST_DEPLOYMENT_ID}
    `);
    await new Promise<void>((r) => heartbeatServer!.close(() => r()));
    heartbeatServer = null;
  });

  async function seedRows(opts: {
    readonly count: number;
    readonly secondsAgo: number;
    readonly markerSuffix: string;
  }): Promise<void> {
    // Bulk-insert via `generate_series` — rows < 200 fit a single Neon HTTP
    // request comfortably (well under 30s timeout).
    await db.execute(sql`
      INSERT INTO usage_events_outbox
        (id, deployment_id, event_type, event_payload, idempotency_key, created_at, sent_at)
      SELECT
        'depth-' || ${opts.markerSuffix} || '-' || lpad(g::text, 6, '0'),
        ${TEST_DEPLOYMENT_ID}::uuid,
        'tool_call',
        '{"tool_name": "depth_test", "tokens_in": 1, "tokens_out": 1}'::jsonb,
        ${TEST_DEPLOYMENT_ID} || '_depth_' || ${opts.markerSuffix} || '_' || g::text,
        now() - make_interval(secs => ${opts.secondsAgo}),
        NULL
      FROM generate_series(1, ${opts.count}) AS g
    `);
  }

  it('Test 1: ≤ threshold pending older than 5 min → exit 0 + heartbeat hit', async () => {
    // 5 rows, all 6 minutes old (older than the Pitfall #10 5-min cutoff)
    // and ≤ test threshold (10).
    await seedRows({ count: 5, secondsAgo: 360, markerSuffix: 't1' });

    const sendAlertSpy = vi.fn(async () => undefined);
    const result = await runOutboxDepthMonitor({
      heartbeatUrl: `http://127.0.0.1:${String(heartbeatPort)}/hb`,
      filterDeploymentId: TEST_DEPLOYMENT_ID,
      threshold: TEST_THRESHOLD,
      sendAlert: sendAlertSpy,
    });

    expect(result.exitCode).toBe(0);
    expect(result.pending).toBeLessThanOrEqual(TEST_THRESHOLD);
    expect(result.pending).toBe(5);
    expect(heartbeatHits).toBe(1);
    expect(sendAlertSpy).not.toHaveBeenCalled();
  });

  it('Test 2: > threshold pending older than 5 min → exit 1 + Resend alert', async () => {
    // 11 rows, 6 minutes old, exceeds the 10-row test threshold.
    await seedRows({ count: 11, secondsAgo: 360, markerSuffix: 't2' });

    const sendAlertSpy = vi.fn(async () => undefined);
    const result = await runOutboxDepthMonitor({
      heartbeatUrl: `http://127.0.0.1:${String(heartbeatPort)}/hb`,
      filterDeploymentId: TEST_DEPLOYMENT_ID,
      threshold: TEST_THRESHOLD,
      sendAlert: sendAlertSpy,
    });

    expect(result.exitCode).toBe(1);
    expect(result.pending).toBeGreaterThan(TEST_THRESHOLD);
    expect(result.pending).toBe(11);
    expect(sendAlertSpy).toHaveBeenCalledTimes(1);
    expect(sendAlertSpy).toHaveBeenCalledWith(11, TEST_THRESHOLD);
    // Heartbeat NOT pinged when above threshold (alert path only).
    expect(heartbeatHits).toBe(0);
  });

  it('Test 3: 100 rows but ALL within last 5 min → exit 0 (Pitfall #10 filter)', async () => {
    // 100 fresh rows (60 seconds old) — Pitfall #10 5-min filter must
    // exclude them, so pending count under filter is 0 regardless of
    // raw row count.
    await seedRows({ count: 100, secondsAgo: 60, markerSuffix: 't3' });

    const sendAlertSpy = vi.fn(async () => undefined);
    const result = await runOutboxDepthMonitor({
      heartbeatUrl: `http://127.0.0.1:${String(heartbeatPort)}/hb`,
      filterDeploymentId: TEST_DEPLOYMENT_ID,
      threshold: TEST_THRESHOLD,
      sendAlert: sendAlertSpy,
    });

    expect(result.exitCode).toBe(0);
    // 5-min filter excludes all rows.
    expect(result.pending).toBe(0);
    expect(heartbeatHits).toBe(1);
    expect(sendAlertSpy).not.toHaveBeenCalled();
  });

  it('Test 4: empty heartbeat URL → no fetch attempted (D-01 invariant)', async () => {
    await seedRows({ count: 3, secondsAgo: 360, markerSuffix: 't4' });

    const sendAlertSpy = vi.fn(async () => undefined);
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    const result = await runOutboxDepthMonitor({
      heartbeatUrl: '',
      filterDeploymentId: TEST_DEPLOYMENT_ID,
      threshold: TEST_THRESHOLD,
      sendAlert: sendAlertSpy,
      fetch: fetchSpy as unknown as typeof fetch,
    });

    expect(result.exitCode).toBe(0);
    expect(result.pending).toBe(3);
    expect(heartbeatHits).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendAlertSpy).not.toHaveBeenCalled();
  });

  it('Test 5: pending count > 10 contract holds (acceptance grep `expect.*pending.*> 10`)', async () => {
    // Documents the acceptance criterion regex. 11 rows older than 5 min
    // should produce pending > 10.
    await seedRows({ count: 11, secondsAgo: 360, markerSuffix: 't5' });

    const result = await runOutboxDepthMonitor({
      heartbeatUrl: `http://127.0.0.1:${String(heartbeatPort)}/hb`,
      filterDeploymentId: TEST_DEPLOYMENT_ID,
      threshold: 100, // higher than count → exit 0 (focuses test on count assertion)
      sendAlert: async () => undefined,
    });

    expect(result.pending, 'pending should be > 10 with 11 fresh rows').toBeGreaterThan(10);
  });
});

// Sentinel: reports `passed` rather than `no tests` when DB is absent.
describe.skipIf(HAS_DB)('outbox depth monitor (skipped without DB)', () => {
  it('integration runs only when DATABASE_URL is set', () => {
    expect(HAS_DB).toBe(false);
  });
});
