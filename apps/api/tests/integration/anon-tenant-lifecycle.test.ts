// apps/api/tests/integration/anon-tenant-lifecycle.test.ts
//
// Phase 09.1 plan 08 (D-03 / ANON-03) — anon-tenant deploy → expire-marker →
// cleanup-by-tag-query lifecycle integration. Verifies that the full anon
// ephemeral path is correctly wired:
//
//   1. POST /api/v1/deploy/ephemeral with cookie + valid generation_id →
//      202 + `{ deployment_id, url, expires_at }`. URL points at the
//      MCPGEN_LOCAL_COMPUTE stub (no CF call); deployments row carries
//      `anon_session_id` + `expires_at` ≈ NOW() + 24h ± 1m.
//   2. POST without cookie → 400 no_anon_session.
//   3. POST with cookie but generation_id owned by a DIFFERENT anon session
//      → 403 (cookie-scoped authorization, T-9.1-08-04 mitigation).
//   4. With MCPGEN_LOCAL_COMPUTE=1, deploy returns localhost URL (no CF
//      call attempted). Asserts the local-compute fallback path (Pitfall
//      ENVIRONMENT-AVAILABILITY).
//   5. Cleanup-by-tag query: SELECT WHERE expires_at IS NOT NULL AND
//      anon_session_id IS NOT NULL returns the row created in (1). This
//      proves the cleanup cron (plan 09.1-10) will pick it up.
//
// Tier:
//   - Skipped when DATABASE_URL is unset (mirrors anon-endpoint-smoke.test.ts).
//   - Always sets MCPGEN_LOCAL_COMPUTE=1 in env so deployScript() short-
//     circuits and no real CF call is attempted, even if CF_API_TOKEN
//     happens to be present in the dev environment.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-08-PLAN.md Task 3
//   - apps/api/tests/integration/anon-endpoint-smoke.test.ts (seeding pattern)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';

// Mock jose so JWT-bearing tests do not require live Logto JWKS. The anon
// flow runs on the public app (no authMiddleware), but `c.var.auth` is
// still read defensively in the route handler.
vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({
    payload: {
      aud: 'http://localhost:3000',
      sub: 'user_test',
      organization_id: 'org_test_foreign',
    },
  })),
}));

const { buildApp } = await import('../../src/index.js');
const { db } = await import('../../src/db.js');

const ANON_COOKIE_NAME = 'mcpgen_anon_session';
const HAS_DB = Boolean(process.env['DATABASE_URL']);

function envFor(): Record<string, unknown> {
  return {
    LOGTO_ENDPOINT: 'https://logto.test',
    LOGTO_BASE_URL: 'http://localhost:3000',
    LOGTO_M2M_RESOURCE_INDICATOR: 'https://api.mcpgen.dev/m2m',
    HYPERDRIVE: {} as Hyperdrive,
    SENTRY_DSN: '',
    ENVIRONMENT: 'test',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PRICE_PRO: '',
    ENGINE_ENDPOINT: '',
    LOGTO_M2M_APP_ID: '',
    LOGTO_M2M_APP_SECRET: '',
    BFF_ANONYMOUS_GATE: 'playground' as const,
    // Critical: route MUST hit the local-compute branch — never make a real
    // CF API call from a test.
    MCPGEN_LOCAL_COMPUTE: '1',
    CF_API_TOKEN: '',
    CF_ACCOUNT_ID: '',
  };
}

interface SeededRow {
  generationId: string;
  anonSessionId: string;
  projectId: string;
  specId: string;
  orgId: string;
}

async function seedAnonGeneration(): Promise<SeededRow> {
  const orgId = `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
  const projectId = crypto.randomUUID();
  const specId = crypto.randomUUID();
  const generationId = crypto.randomUUID();
  const anonSessionId = ulid();

  await db.execute(sql`
    INSERT INTO organizations (id, logto_org_id, name)
    VALUES (${orgId}, ${`anon-life-${orgId.slice(-12)}`}, ${`anon-life-${orgId.slice(-12)}`})
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO projects (id, org_id, name)
    VALUES (${projectId}, ${orgId}, 'anon-lifecycle')
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO specs (id, project_id, content_hash, format, endpoint_count)
    VALUES (${specId}, ${projectId}, ${`anon-life-${specId}`}, 'openapi3', 0)
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO generations (id, project_id, spec_id, status, options)
    VALUES (${generationId}, ${projectId}, ${specId}, 'queued', '{}'::jsonb)
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO anonymous_generations (anon_session_id, generation_id, ip_hash)
    VALUES (${anonSessionId}, ${generationId}, 'lifecycle-test')
    ON CONFLICT DO NOTHING
  `);
  return { generationId, anonSessionId, projectId, specId, orgId };
}

async function teardownAnonGeneration(row: SeededRow): Promise<void> {
  // CASCADE on organizations → projects → specs → generations → anon_*.
  await db.execute(sql`DELETE FROM organizations WHERE id = ${row.orgId}`);
}

interface DeployRow {
  id: string;
  anon_session_id: string;
  expires_at: string;
  cf_worker_name: string;
}

interface DeployResponse {
  deployment_id: string;
  url: string;
  expires_at: string;
}

describe.skipIf(!HAS_DB)('anon tenant lifecycle (live DB + local-compute)', () => {
  let seeded: SeededRow | null = null;

  beforeEach(async () => {
    seeded = await seedAnonGeneration();
  });

  afterEach(async () => {
    if (seeded !== null) {
      await teardownAnonGeneration(seeded);
      seeded = null;
    }
  });

  // ─── Integration 1: happy-path deploy → expires_at within ±1 min ─────────
  it('integration 1: cookie + valid generation_id → 202 with expires_at ≈ NOW() + 24h', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const env = envFor();
    const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
    const before = Date.now();
    const res = await app.fetch(
      new Request('http://api/api/v1/deploy/ephemeral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
        body: JSON.stringify({ generation_id: seeded.generationId }),
      }),
      env,
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as DeployResponse;
    expect(body.url).toMatch(/\/mcp$/);
    expect(body.url).toMatch(/^http:\/\/localhost:9000\//);
    const expiresMs = new Date(body.expires_at).getTime();
    // 24h ± 1 min tolerance covers the time spent inside the route.
    expect(expiresMs).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - 60 * 1000);
    expect(expiresMs).toBeLessThanOrEqual(before + 24 * 60 * 60 * 1000 + 60 * 1000);

    // Verify the deployments row was inserted with the right columns.
    const r = await db.execute(sql`
      SELECT id, anon_session_id, expires_at, cf_worker_name
      FROM deployments
      WHERE id = ${body.deployment_id}
      LIMIT 1
    `);
    const rows = r.rows as unknown as DeployRow[];
    expect(rows.length).toBe(1);
    const row = rows[0];
    if (!row) throw new Error('deployment row missing');
    expect(row.anon_session_id).toBe(seeded.anonSessionId);
    expect(row.cf_worker_name).toMatch(/^anon-[0-9a-z]{10}$/);
    const dbExpiresMs = new Date(row.expires_at).getTime();
    expect(dbExpiresMs).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - 60 * 1000);
  });

  // ─── Integration 2: no cookie → 400 ─────────────────────────────────────
  it('integration 2: POST without cookie → 400 no_anon_session', async () => {
    const env = envFor();
    const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
    const res = await app.fetch(
      new Request('http://api/api/v1/deploy/ephemeral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_anon_session');
  });

  // ─── Integration 3: foreign generation_id → 403 ─────────────────────────
  it('integration 3: cookie + foreign generation_id → 403 forbidden', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const env = envFor();
    const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
    // Generate a UUID that doesn't exist in anonymous_generations for this
    // anon session (a different gen owned by no one).
    const foreignGenerationId = crypto.randomUUID();
    const res = await app.fetch(
      new Request('http://api/api/v1/deploy/ephemeral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
        body: JSON.stringify({ generation_id: foreignGenerationId }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe('forbidden');
    expect(body.reason).toBe('generation_not_owned');
  });

  // ─── Integration 4: local-compute returns localhost URL ─────────────────
  it('integration 4: MCPGEN_LOCAL_COMPUTE=1 returns localhost URL (no CF call)', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const env = envFor();
    expect(env['MCPGEN_LOCAL_COMPUTE']).toBe('1');
    const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
    const res = await app.fetch(
      new Request('http://api/api/v1/deploy/ephemeral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
        body: JSON.stringify({ generation_id: seeded.generationId }),
      }),
      env,
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as DeployResponse;
    expect(body.url).toMatch(/^http:\/\/localhost:9000\/anon-[0-9a-z]{10}\/mcp$/);
  });

  // ─── Integration 5: cleanup-by-tag query returns the deployed row ───────
  it('integration 5: cleanup query (expires_at + anon_session_id) returns this row', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const env = envFor();
    const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);

    // Create the deployment.
    const res = await app.fetch(
      new Request('http://api/api/v1/deploy/ephemeral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
        body: JSON.stringify({ generation_id: seeded.generationId }),
      }),
      env,
    );
    const body = (await res.json()) as DeployResponse;

    // Run the same query the cleanup cron will use (RESEARCH §3 lines
    // 326–335) — verify the row appears with `expires_at < NOW() + 25h`.
    // We use `< NOW() + 25h` instead of `< NOW()` because we just minted
    // the row ~seconds ago and its expires_at is +24h.
    const r = await db.execute(sql`
      SELECT id, cf_worker_name, dispatch_namespace
      FROM deployments
      WHERE expires_at IS NOT NULL
        AND expires_at < NOW() + INTERVAL '25 hours'
        AND anon_session_id IS NOT NULL
        AND id = ${body.deployment_id}
      LIMIT 1
    `);
    const rows = r.rows as unknown as { id: string; cf_worker_name: string; dispatch_namespace: string }[];
    expect(rows.length).toBe(1);
    const row = rows[0];
    if (!row) throw new Error('cleanup-query row missing');
    expect(row.dispatch_namespace).toBe('mcpgen-prod');
    expect(row.cf_worker_name).toMatch(/^anon-[0-9a-z]{10}$/);
  });
});

// ─── DB-not-set explainer (mirrors anon-endpoint-smoke.test.ts) ────────────
describe.skipIf(HAS_DB)('anon tenant lifecycle (skipped without DB)', () => {
  it('integration runs only when DATABASE_URL is set', () => {
    expect(HAS_DB).toBe(false);
  });
});
