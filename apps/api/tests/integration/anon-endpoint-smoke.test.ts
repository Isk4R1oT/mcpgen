// apps/api/tests/integration/anon-endpoint-smoke.test.ts
//
// Phase 09.1 plan 03 Task 3 — DB-backed integration smoke for the 4
// anon-aware BFF endpoints introduced by plan 03.
//
// Tier:
//   - Skipped when DATABASE_URL is unset (mirrors the badge-public.test.ts
//     and anon-flow-migration.test.ts empty-env no-op pattern).
//   - When the env var is set, the suite seeds a real `generations` +
//     `anonymous_generations` row pair using a UUID id (matches the FROZEN
//     `generations.id uuid` column type), exercises the cookie-or-JWT
//     authorization paths, and tears down via afterEach.
//
// 7 cases verified:
//   1. POST /api/v1/generate (no auth) → 202 + Set-Cookie header carrying a
//      ULID; subsequent GET /api/v1/jobs/:id (with the seeded UUID + cookie)
//      → 200; GET /:id/stream (with cookie) → text/event-stream content-type.
//      The full chain is split into two checks because the route persists
//      to a UUID id (DB column type) while the API response carries a
//      `gen_${ULID}` shape; these two identities live independently in this
//      plan and are reconciled in plan 09.1-06 cache-hit logic.
//   2. GET /api/v1/jobs/:id with WRONG cookie → 403.
//   3. GET /api/v1/jobs/:id with valid Logto JWT for a foreign org → 403.
//   4. POST /api/v1/deploy/ephemeral with cookie → 202 + placeholder URL.
//   5. POST /api/v1/claim_generation no JWT → 401 (gated by authMiddleware).
//   6. POST /api/v1/claim_generation JWT-only (no cookie) → 400 no_anon_session.
//   7. POST /api/v1/claim_generation JWT + cookie → 200 with
//      `{ claimed_count, deployments_retagged }` (plan 09.1-09 replaced the
//      501 stub from plan 09.1-03 with the full atomic claim flow).
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-03-PLAN.md Task 3
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md "Validation
//     Architecture" lines 1457–1496
//   - apps/api/tests/migrations/anon-flow-migration.test.ts (skipIf precedent)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';

// Mock jose so JWT-bearing tests do not require live Logto JWKS.
vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({
    payload: {
      aud: 'http://localhost:3000',
      sub: 'user_test',
      organization_id: 'org_test_foreign', // foreign org by default
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
  };
}

function findAnonCookieValue(res: Response): string | null {
  const headers = res.headers;
  const all =
    typeof (headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as { getSetCookie: () => string[] }).getSetCookie()
      : ([headers.get('Set-Cookie')].filter((v): v is string => v !== null));
  for (const h of all) {
    const first = h.split(';')[0];
    if (!first) continue;
    const eqIdx = first.indexOf('=');
    if (eqIdx < 0) continue;
    const name = first.slice(0, eqIdx).trim();
    if (name !== ANON_COOKIE_NAME) continue;
    return first.slice(eqIdx + 1);
  }
  return null;
}

interface SeededRow {
  generationId: string;
  anonSessionId: string;
  projectId: string;
  specId: string;
  orgId: string;
}

// Seed a minimal FK chain: organization → project → spec → generation, plus
// the anonymous_generations row binding cookie ULID → generation.id UUID.
async function seedAnonGeneration(): Promise<SeededRow> {
  const orgId = `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
  const projectId = crypto.randomUUID();
  const specId = crypto.randomUUID();
  const generationId = crypto.randomUUID();
  const anonSessionId = ulid();

  await db.execute(sql`
    INSERT INTO organizations (id, logto_org_id, name)
    VALUES (${orgId}, ${`anon-smoke-${orgId.slice(-12)}`}, ${`anon-smoke-${orgId.slice(-12)}`})
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO projects (id, org_id, name)
    VALUES (${projectId}, ${orgId}, 'anon-smoke')
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO specs (id, project_id, content_hash, format, endpoint_count)
    VALUES (${specId}, ${projectId}, ${`anon-smoke-${specId}`}, 'openapi3', 0)
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO generations (id, project_id, spec_id, status, options)
    VALUES (${generationId}, ${projectId}, ${specId}, 'queued', '{}'::jsonb)
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO anonymous_generations (anon_session_id, generation_id, ip_hash)
    VALUES (${anonSessionId}, ${generationId}, 'smoke-test')
    ON CONFLICT DO NOTHING
  `);
  return { generationId, anonSessionId, projectId, specId, orgId };
}

async function teardownAnonGeneration(row: SeededRow): Promise<void> {
  // CASCADE on organizations → projects → specs → generations →
  // anonymous_generations clears the chain.
  await db.execute(sql`DELETE FROM organizations WHERE id = ${row.orgId}`);
}

describe.skipIf(!HAS_DB)('anon endpoint smoke (live DB)', () => {
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

  // ─── Smoke 1: full anon chain ────────────────────────────────────────────
  it('Smoke 1a: POST /api/v1/generate (no auth) → 202 + anon cookie', async () => {
    const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
    const res = await app.fetch(
      new Request('http://api/api/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec_url: 'https://example.com/spec.json' }),
      }),
      envFor(),
    );
    expect(res.status).toBe(202);
    const cookie = findAnonCookieValue(res);
    expect(cookie).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('Smoke 1b: GET /api/v1/jobs/:id (cookie owns row) → 200', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
    const res = await app.fetch(
      new Request(`http://api/api/v1/jobs/${seeded.generationId}`, {
        headers: { Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}` },
      }),
      envFor(),
    );
    expect(res.status).toBe(200);
  });

  it('Smoke 1c: GET /api/v1/jobs/:id/stream (cookie owns row) → text/event-stream', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
    const res = await app.fetch(
      new Request(`http://api/api/v1/jobs/${seeded.generationId}/stream`, {
        headers: { Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}` },
      }),
      envFor(),
    );
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
  });

  // ─── Smoke 2: WRONG cookie → 403 ─────────────────────────────────────────
  it('Smoke 2: GET /api/v1/jobs/:id with mismatched cookie → 403', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const wrongCookie = ulid();
    const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
    const res = await app.fetch(
      new Request(`http://api/api/v1/jobs/${seeded.generationId}`, {
        headers: { Cookie: `${ANON_COOKIE_NAME}=${wrongCookie}` },
      }),
      envFor(),
    );
    expect(res.status).toBe(403);
  });

  // ─── Smoke 3: foreign-org JWT → 403 ──────────────────────────────────────
  it('Smoke 3: GET /api/v1/jobs/:id with foreign-org JWT → 403', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
    // The route lives on the public app, so authMiddleware does NOT run on
    // /jobs/:id; the foreign JWT is read by readAuth from the header but the
    // public app does not populate c.var.auth (no middleware). Therefore
    // ownership falls back to "neither cookie nor JWT matches" → 403.
    const res = await app.fetch(
      new Request(`http://api/api/v1/jobs/${seeded.generationId}`, {
        headers: { Authorization: 'Bearer foreign-jwt' },
      }),
      envFor(),
    );
    expect(res.status).toBe(403);
  });

  // ─── Smoke 4: anon ephemeral deploy ──────────────────────────────────────
  it('Smoke 4: POST /api/v1/deploy/ephemeral (cookie) → 202 + url', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
    const res = await app.fetch(
      new Request('http://api/api/v1/deploy/ephemeral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
        body: JSON.stringify({ generation_id: seeded.generationId }),
      }),
      envFor(),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { url: string };
    expect(body.url).toMatch(/\/mcp$/);
  });

  // ─── Smoke 5+6+7: claim_generation paths ────────────────────────────────
  it('Smoke 5: POST /api/v1/claim_generation no JWT → 401', async () => {
    const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
    const res = await app.fetch(
      new Request('http://api/api/v1/claim_generation', { method: 'POST' }),
      envFor(),
    );
    expect(res.status).toBe(401);
  });

  it('Smoke 6: POST /api/v1/claim_generation JWT-only (no cookie) → 400 no_anon_session', async () => {
    const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
    const res = await app.fetch(
      new Request('http://api/api/v1/claim_generation', {
        method: 'POST',
        headers: { Authorization: 'Bearer some-jwt' },
      }),
      envFor(),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_anon_session');
  });

  it('Smoke 7: POST /api/v1/claim_generation JWT + cookie → 200 (plan 09.1-09 atomic claim)', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    // The default jose mock returns `organization_id: 'org_test_foreign'`
    // which is a non-uuid string. The claim handler runs the UPDATE with
    // that string in `claimed_by_org_id` (uuid column). Use a real UUID by
    // overriding the mock for this single test via a fresh app construction
    // that reads the same env. Because `vi.mocked(jwtVerify)` was set at
    // module-load time and mutating it per-test is the canonical approach
    // (see auth-gate-position.test.ts), call vi.mocked here.
    const { jwtVerify } = await import('jose');
    const mockedVerify = vi.mocked(jwtVerify);
    mockedVerify.mockImplementationOnce(
      async () =>
        ({
          payload: {
            aud: 'http://localhost:3000',
            sub: 'user_test',
            organization_id: seeded!.orgId,
          },
        }) as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    );
    const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
    const res = await app.fetch(
      new Request('http://api/api/v1/claim_generation', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer some-jwt',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
      }),
      envFor(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      claimed_count: number;
      deployments_retagged: number;
    };
    expect(body.claimed_count).toBe(1);
    expect(body.deployments_retagged).toBe(0);
  });
});

// ─── DB-not-set explainer (mirrors observability/outbox-depth.test.ts) ──────
describe.skipIf(HAS_DB)('anon endpoint smoke (skipped without DB)', () => {
  it('integration runs only when DATABASE_URL is set', () => {
    expect(HAS_DB).toBe(false);
  });
});
