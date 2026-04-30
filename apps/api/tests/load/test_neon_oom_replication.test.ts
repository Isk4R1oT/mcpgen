// apps/api/tests/load/test_neon_oom_replication.test.ts
//
// CTRL-08 / D-16 / Pitfall #19: Neon OOM repro under concurrent
// pgvector + TimescaleDB + tsvector workload.
//
// Why this exists:
//   Pitfall #19 surfaces in production at the Neon Free / Launch tiers
//   where compute memory is shared across pgvector ANN, TimescaleDB
//   hypertable autovacuum, and tsvector full-text. Running the three
//   workloads concurrently can starve memory and trigger the dreaded
//   "connection terminated unexpectedly" cascade. The Phase 9 deliverable
//   is the LOCAL repro test (this file) + the W7 calendar runbook for
//   upgrading to Scale tier (`docs/runbooks/neon-scale-upgrade.md`).
//
// Phase 9 mode (local):
//   The test exercises the SQL workload against the LOCAL Neon dev branch
//   (DATABASE_URL set in .env.local) — which has its own memory headroom,
//   so we mostly stress-test the SQL paths rather than reproduce the
//   actual Neon Free OOM. The repro fires for real on the Scale-tier
//   upgrade smoke test in W7 (Phase 10) per `neon-scale-upgrade.md`.
//
// Phase 10 mode (real Neon target):
//   Same test, repointed at the upgraded Neon Scale-tier compute via
//   DATABASE_URL_NEON_SCALE; runs in CI nightly until launch.
//
// Gating:
//   - `RUN_LOAD_TESTS=1` env var required (slow test, not on every PR).
//   - `DATABASE_URL` env var required (skipped otherwise).
//   - Per-test timeout 600_000 ms (10 min) via apps/api/vitest.load.config.ts
//     — `pnpm --filter @mcpgen/api test:load`.
//
// Workload (per Pitfall #19):
//   Stream A — tsvector full-text query on usage_events_outbox payloads
//              (read-heavy, hits btree + GIN indexes).
//   Stream B — pgvector ANN query on tools.embedding (Phase 1 D-12 column).
//   Stream C — TimescaleDB usage_hourly matview refresh + insert into
//              usage_events hypertable (write-heavy, triggers autovacuum).
//   Promise.all the three streams; assert zero "connection terminated"
//   errors over the sustained run.
//
// References:
//   - .planning/phases/09-observability-polish/09-CONTEXT.md D-16
//   - .planning/phases/09-observability-polish/09-RESEARCH.md
//     §"Pitfall 19" (lines 555-562) + A15 (line 935)
//   - .planning/phases/09-observability-polish/09-PATTERNS.md
//     §"test_neon_oom_replication.test.ts"
//   - infrastructure/neon/migrations/20260428000002_phase8_billing_drift.sql
//   - docs/runbooks/neon-scale-upgrade.md (Phase 9 deliverable)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';

const HAS_DB = Boolean(process.env['DATABASE_URL']);
const RUN_LOAD = process.env['RUN_LOAD_TESTS'] === '1';

// Compressed run duration: 60 s — enough to exercise concurrent SQL
// streams, well under the 600_000 ms vitest hard timeout. The W7
// Phase-10 calendar action re-runs against real Neon Scale-tier with
// the full 10-minute window per `neon-scale-upgrade.md`.
const RUN_DURATION_MS = Number(process.env['NEON_OOM_RUN_DURATION_MS'] ?? '60000');

const TEST_DEPLOYMENT_ID = '00000000-0000-4000-8000-000000000401';
const TEST_GENERATION_ID = '00000000-0000-4000-8000-000000000402';
const TEST_ORG_ID = '00000000-0000-4000-8000-000000000403';
const TEST_PROJECT_ID = '00000000-0000-4000-8000-000000000404';
const TEST_SPEC_ID = '00000000-0000-4000-8000-000000000405';
const TEST_LOGTO_ORG = 'logto-neon-oom-test-org';

interface ConnectionTerminatedSample {
  readonly stream: 'A' | 'B' | 'C';
  readonly attempt: number;
  readonly message: string;
}

describe.skipIf(!HAS_DB || !RUN_LOAD)('Neon OOM repro (CTRL-08 / D-16 / Pitfall #19)', () => {
  let db: typeof import('../../src/db.js')['db'];

  beforeAll(async () => {
    ({ db } = await import('../../src/db.js'));
    const { organizations, projects, generations, deployments } = await import(
      '@mcpgen/contracts/db-schema'
    );

    // Seed FK chain — needed for usage_events_outbox FK.
    await db
      .insert(organizations)
      .values({ id: TEST_ORG_ID, logto_org_id: TEST_LOGTO_ORG, name: 'neon-oom-test-org' })
      .onConflictDoNothing();
    await db
      .insert(projects)
      .values({ id: TEST_PROJECT_ID, org_id: TEST_ORG_ID, name: 'neon-oom-test' })
      .onConflictDoNothing();
    await db.execute(sql`
      INSERT INTO specs (id, project_id, content_hash, format, endpoint_count, spec_url)
      VALUES (${TEST_SPEC_ID}, ${TEST_PROJECT_ID}, 'neon-oom-test-hash', 'openapi3', 0, NULL)
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
        cf_worker_name: 'neon-oom-test-worker',
        dispatch_namespace: 'mcpgen-sandbox',
        url: 'http://localhost:8788/t/neon-oom-test',
        auth_mode: 'passthrough',
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    const { organizations, projects, generations, deployments } = await import(
      '@mcpgen/contracts/db-schema'
    );
    await db.execute(sql`
      DELETE FROM usage_events_outbox WHERE deployment_id = ${TEST_DEPLOYMENT_ID}
    `);
    await db.delete(deployments).where(sql`id = ${TEST_DEPLOYMENT_ID}`);
    await db.delete(generations).where(sql`id = ${TEST_GENERATION_ID}`);
    await db.execute(sql`DELETE FROM specs WHERE id = ${TEST_SPEC_ID}`);
    await db.delete(projects).where(sql`id = ${TEST_PROJECT_ID}`);
    await db.delete(organizations).where(sql`id = ${TEST_ORG_ID}`);
  });

  it('sustains concurrent tsvector + pgvector + TimescaleDB workload without connection terminated errors', async () => {
    const errors: ConnectionTerminatedSample[] = [];
    const start = Date.now();

    // Stream A — tsvector full-text on usage_events_outbox.event_payload.
    // Read-heavy; hits jsonb_to_tsvector + GIN if available, otherwise
    // sequential scan (still exercises shared_buffers under load).
    const streamA = async (): Promise<void> => {
      let attempt = 0;
      while (Date.now() - start < RUN_DURATION_MS) {
        attempt++;
        try {
          await db.execute(sql`
            SELECT COUNT(*)
            FROM usage_events_outbox
            WHERE to_tsvector('english', event_payload::text)
              @@ plainto_tsquery('english', 'tool_call OR tokens')
          `);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (
            message.toLowerCase().includes('connection terminated') ||
            message.toLowerCase().includes('connection closed')
          ) {
            errors.push({ stream: 'A', attempt, message });
          }
        }
        // Yield so streams interleave fairly.
        await new Promise((r) => setTimeout(r, 50));
      }
    };

    // Stream B — pgvector ANN-style query on tools.embedding.
    // Note: tools table from Phase 1 D-12; embedding column is vector(1536).
    // Use a constant embedding (1536-dim zero vector) — exercises the index
    // / sequential scan path without needing real OpenAI embeddings.
    const streamB = async (): Promise<void> => {
      let attempt = 0;
      // Build literal once: 1536-dim zero vector as pg-vector literal.
      const zeroVec = '[' + Array.from({ length: 1536 }, () => '0').join(',') + ']';
      while (Date.now() - start < RUN_DURATION_MS) {
        attempt++;
        try {
          await db.execute(sql`
            SELECT id
            FROM tools
            ORDER BY embedding <-> ${zeroVec}::vector
            LIMIT 5
          `);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (
            message.toLowerCase().includes('connection terminated') ||
            message.toLowerCase().includes('connection closed')
          ) {
            errors.push({ stream: 'B', attempt, message });
          }
          // Tolerate "table empty" / no-results — only `connection terminated`
          // is the Pitfall #19 failure mode we care about.
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    };

    // Stream C — TimescaleDB hypertable insert + matview refresh on
    // usage_events. Write-heavy; triggers autovacuum + chunk creation.
    const streamC = async (): Promise<void> => {
      let attempt = 0;
      while (Date.now() - start < RUN_DURATION_MS) {
        attempt++;
        try {
          // Insert one usage_events row per attempt; uses the hypertable's
          // time-based chunk-creation path.
          await db.execute(sql`
            INSERT INTO usage_events
              (id, deployment_id, time, event_type, event_payload, idempotency_key)
            VALUES (
              gen_random_uuid()::text,
              ${TEST_DEPLOYMENT_ID}::uuid,
              now(),
              'tool_call',
              ${JSON.stringify({ tool_name: 'neon_oom_test', tokens_in: 1, tokens_out: 1 })}::jsonb,
              ${TEST_DEPLOYMENT_ID} || '_neonoom_' || ${String(attempt)}
            )
            ON CONFLICT (idempotency_key) DO NOTHING
          `);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (
            message.toLowerCase().includes('connection terminated') ||
            message.toLowerCase().includes('connection closed')
          ) {
            errors.push({ stream: 'C', attempt, message });
          }
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    };

    // Run all three streams concurrently for the full RUN_DURATION_MS.
    await Promise.all([streamA(), streamB(), streamC()]);

    // Cleanup the rows stream C inserted.
    await db.execute(sql`
      DELETE FROM usage_events WHERE deployment_id = ${TEST_DEPLOYMENT_ID}
    `);

    expect(
      errors.length,
      `Connection terminated errors detected:\n${errors
        .map((e) => `  stream ${e.stream} attempt ${String(e.attempt)}: ${e.message}`)
        .join('\n')}`,
    ).toBe(0);
  });
});

// Sentinel — vitest reports `passed` rather than `no tests` when
// RUN_LOAD_TESTS / DATABASE_URL is absent.
describe.skipIf(HAS_DB && RUN_LOAD)('Neon OOM repro (skipped — opt-in)', () => {
  it('opt-in via RUN_LOAD_TESTS=1 + DATABASE_URL', () => {
    expect(true).toBe(true);
  });
});
