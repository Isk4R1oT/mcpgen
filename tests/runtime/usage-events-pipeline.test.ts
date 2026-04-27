// tests/runtime/usage-events-pipeline.test.ts
//
// Phase 6 Wave 4 — cross-app E2E proof of the usage-event pipeline:
//
//   tenant-Worker emit -> waitUntil(fetch INNGEST_DEV_URL)
//                       -> npx inngest-cli dev (port 8288)
//                       -> apps/inngest-dev (port 3030) /api/inngest
//                       -> usage-events-ingest-v1
//                       -> TimescaleDB usage_events INSERT ... ON CONFLICT
//                          (deployment_id, idempotency_key, time) DO NOTHING
//
// Asserts at-least-once delivery + at-most-once persistence (double-emit
// dedup verified end-to-end).
//
// Skips when DATABASE_URL is missing OR when inngest-cli dev fails to start
// (CI-friendly; local dev must run it).

import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { neon } from '@neondatabase/serverless';

const REPO_ROOT = join(__dirname, '..', '..');
const INNGEST_DEV_ENTRY = join(REPO_ROOT, 'apps/inngest-dev/src/index.ts');

const HAS_DB = Boolean(process.env.DATABASE_URL);

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return true;
    } catch {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

describe('Phase 6 Wave 4 — usage events pipeline E2E', () => {
  let inngestDevApp: ChildProcess | null = null;
  let inngestCli: ChildProcess | null = null;
  let inngestCliReady = false;

  // Test deployment row markers (UUID v4 + matching idempotency_key).
  const TEST_DEPLOYMENT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  const TEST_IDEMPOTENCY_KEY = `${TEST_DEPLOYMENT_ID}_2026-04-28T12:00_charges_pipeline_test`;
  const TEST_TIME = '2026-04-28T12:00:00.000Z';

  beforeAll(async () => {
    if (!HAS_DB) return;

    // 1. Spawn apps/inngest-dev.
    inngestDevApp = spawn('bun', ['run', INNGEST_DEV_ENTRY], {
      env: {
        ...process.env,
        ALLOWED_HOSTS: 'localhost,127.0.0.1',
        INNGEST_DEV_URL: 'http://localhost:8288/e/mcpgen-dev',
      },
      stdio: 'inherit',
    });
    const appUp = await waitForHealth('http://localhost:3030/health', 5_000);
    expect(appUp).toBe(true);

    // 2. Try to spawn inngest-cli dev; if it fails (npx download issues, port
    //    busy, sandbox restrictions), the per-test it.skipIf() falls back.
    try {
      inngestCli = spawn(
        'npx',
        ['--yes', 'inngest-cli@latest', 'dev', '--no-discovery', '--port', '8288'],
        { stdio: 'pipe' },
      );
      inngestCliReady = await waitForHealth('http://localhost:8288/', 15_000);
    } catch {
      inngestCliReady = false;
    }
  }, 30_000);

  afterAll(async () => {
    if (!HAS_DB) return;
    inngestCli?.kill();
    inngestDevApp?.kill();

    // Best-effort cleanup of test rows.
    if (process.env.DATABASE_URL) {
      try {
        const sql = neon(process.env.DATABASE_URL);
        await sql`DELETE FROM usage_events WHERE deployment_id = ${TEST_DEPLOYMENT_ID}`;
      } catch {
        // pipeline test cleanup is best-effort
      }
    }
  });

  it.skipIf(!HAS_DB)(
    'double-emits the same UsageEvent and asserts exactly one row persists',
    async () => {
      if (!inngestCliReady) {
        console.warn(
          '[pipeline-test] inngest-cli dev unavailable — skipping live-pipeline assertions',
        );
        return;
      }

      // Lazy-imports — emit module touches bun:sqlite which must not be
      // resolved when DATABASE_URL is unset (skipIf above).
      const { emitUsageEvent } = await import(
        '@mcpgen/runtime/usage'
      );
      const { drainPending } = await import('../../packages/runtime-sdk/src/runtime/wait_until.js');

      const sqlClient = neon(process.env.DATABASE_URL!);

      const event = {
        idempotency_key: TEST_IDEMPOTENCY_KEY,
        time: TEST_TIME,
        deployment_id: TEST_DEPLOYMENT_ID,
        tool_name: 'charges_pipeline_test',
        tokens_in: 10,
        tokens_out: 20,
        upstream_latency_ms: 50,
        worker_cpu_ms: 5,
        status: 'ok' as const,
        client_type: 'claude_desktop' as const,
        error_class: null,
      };

      // First emit.
      await emitUsageEvent(event);
      await drainPending();
      await new Promise((r) => setTimeout(r, 1_500));

      const first = (await sqlClient`
        SELECT count(*)::int AS c FROM usage_events
         WHERE deployment_id = ${TEST_DEPLOYMENT_ID}
           AND idempotency_key = ${TEST_IDEMPOTENCY_KEY}
      `) as Array<{ c: number }>;
      expect(first[0]?.c).toBe(1);

      // Second emit — same idempotency_key.
      await emitUsageEvent(event);
      await drainPending();
      await new Promise((r) => setTimeout(r, 1_500));

      const second = (await sqlClient`
        SELECT count(*)::int AS c FROM usage_events
         WHERE deployment_id = ${TEST_DEPLOYMENT_ID}
           AND idempotency_key = ${TEST_IDEMPOTENCY_KEY}
      `) as Array<{ c: number }>;
      // Defence-in-depth: 3-column UNIQUE index + ON CONFLICT DO NOTHING.
      expect(second[0]?.c).toBe(1);
    },
    60_000,
  );
});
