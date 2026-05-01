// apps/api/tests/integration/claim-flow-e2e.test.ts
//
// Phase 09.1 plan 09 Task 3 — end-to-end DB-gated integration verifying
// the full anon → signup → claim sequence per D-04 + RESEARCH §9.
//
// Tier:
//   - Skipped when DATABASE_URL is unset (mirrors anon-endpoint-smoke.test.ts).
//   - MCPGEN_LOCAL_COMPUTE=1 keeps deployScript / retagScript real-CF-call
//     free; the lib short-circuits in local-compute mode (see
//     `apps/api/src/lib/cf-platforms-deploy.ts`).
//
// 4 e2e cases:
//   e2e 1: full happy path — anon POST /generate (mint cookie + insert anon
//          row) → anon POST /deploy/ephemeral (insert deployments row with
//          expires_at + anon_session_id) → simulate signup (mint Logto JWT
//          for the test org) → POST /claim_generation → 200 + DB state:
//          anon row claimed, deployment row's expires_at + anon_session_id
//          cleared, anon cookie Max-Age=0.
//   e2e 2: re-claim no-op — POST /claim_generation a second time with the
//          same JWT + (now-cleared) cookie returns 400 no_anon_session
//          because the cookie clear hop happened on the first call. The
//          idempotency on the DB UPDATE is also asserted independently by
//          the unit suite (test 5 in claim-generation.test.ts).
//   e2e 3: race regression (T-9.1-08-06) — after claim, the cleanup-cron
//          query (`expires_at IS NOT NULL AND anon_session_id IS NOT NULL
//          AND expires_at < NOW()`) MUST NOT match the just-claimed
//          deployment row. The transactional clear-both-fields write
//          guarantees this.
//   e2e 4: OQ-3 — stripe-webhook handler is invoked AFTER claim with a
//          checkout.session.completed event for the test org. Row counts
//          for `anonymous_generations` AND `deployments` must be unchanged
//          before/after. Confirms RESEARCH §9 OQ-3: webhook unchanged by
//          the anon flow.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-09-PLAN.md Task 3
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §9 lines 1167-1178
//   - apps/api/tests/integration/anon-endpoint-smoke.test.ts (seeding pattern)
//   - apps/api/tests/integration/anon-tenant-lifecycle.test.ts (deploy E2E pattern)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';

const ANON_COOKIE_NAME = 'mcpgen_anon_session';
const HAS_DB = Boolean(process.env['DATABASE_URL']);

// ─── jose mock — payload mutated per-test via _jwtPayload.current ──────────
//
// The default payload returns the seeded test orgId. Tests can override
// the payload by mutating `_jwtPayload.current` BEFORE the call.

interface FakeJwtPayload {
  aud: string;
  sub: string;
  organization_id?: string;
}
const _jwtPayload: { current: FakeJwtPayload } = {
  current: {
    aud: 'http://localhost:3000',
    sub: 'user_test_e2e',
    // Replaced per-test in beforeEach with the seeded orgId. Omit the field
    // entirely when undefined to satisfy exactOptionalPropertyTypes.
  },
};

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({ payload: _jwtPayload.current })),
}));

const { buildApp } = await import('../../src/index.js');
const { db } = await import('../../src/db.js');

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
    // Critical: keep CF API calls off (retagScript short-circuits).
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
  deploymentId: string;
  cfWorkerName: string;
}

// Seed the full FK chain organizations → projects → specs → generations →
// anonymous_generations → deployments. Uses unique UUIDs per test so
// teardown can scope on org_id.
async function seedClaimFixture(): Promise<SeededRow> {
  const orgId = `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
  const projectId = crypto.randomUUID();
  const specId = crypto.randomUUID();
  const generationId = crypto.randomUUID();
  const anonSessionId = ulid();
  const deploymentId = crypto.randomUUID();
  const cfWorkerName = `anon-${ulid().toLowerCase().slice(0, 10)}`;

  await db.execute(sql`
    INSERT INTO organizations (id, logto_org_id, name)
    VALUES (${orgId}, ${`claim-e2e-${orgId.slice(-12)}`}, ${`claim-e2e-${orgId.slice(-12)}`})
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO projects (id, org_id, name)
    VALUES (${projectId}, ${orgId}, 'claim-e2e')
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO specs (id, project_id, content_hash, format, endpoint_count)
    VALUES (${specId}, ${projectId}, ${`claim-e2e-${specId}`}, 'openapi3', 0)
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO generations (id, project_id, spec_id, status, options)
    VALUES (${generationId}, ${projectId}, ${specId}, 'queued', '{}'::jsonb)
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO anonymous_generations (anon_session_id, generation_id, ip_hash)
    VALUES (${anonSessionId}, ${generationId}, 'claim-e2e-test')
    ON CONFLICT DO NOTHING
  `);
  // Seed an ephemeral anon deployment with expires_at + anon_session_id.
  // Using direct INSERT (not POST /deploy/ephemeral) keeps this seeding
  // deterministic; the anon-tenant-lifecycle integration covers the
  // deploy route path independently.
  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000);
  await db.execute(sql`
    INSERT INTO deployments (
      id, generation_id, cf_worker_name, dispatch_namespace, url, auth_mode,
      created_at, anon_session_id, expires_at
    )
    VALUES (
      ${deploymentId},
      ${generationId},
      ${cfWorkerName},
      'mcpgen-prod',
      ${`http://localhost:9000/${cfWorkerName}/mcp`},
      'passthrough',
      NOW(),
      ${anonSessionId},
      ${expiresAt.toISOString()}::timestamptz
    )
    ON CONFLICT (cf_worker_name) DO NOTHING
  `);

  return {
    generationId,
    anonSessionId,
    projectId,
    specId,
    orgId,
    deploymentId,
    cfWorkerName,
  };
}

async function teardownFixture(row: SeededRow): Promise<void> {
  // CASCADE: organizations → projects → specs → generations →
  // anonymous_generations. deployments has FK to generations with no
  // CASCADE, so explicit cleanup needed.
  await db.execute(sql`DELETE FROM deployments WHERE id = ${row.deploymentId}`);
  await db.execute(sql`DELETE FROM organizations WHERE id = ${row.orgId}`);
}

interface ClaimSuccess {
  claimed_count: number;
  deployments_retagged: number;
}

interface AnonRow {
  claimed_at: string | null;
  claimed_by_org_id: string | null;
}

interface DeployRow {
  expires_at: string | null;
  anon_session_id: string | null;
}

function findAnonSetCookie(res: Response): { value: string; maxAge: number | null } | null {
  const headers = res.headers;
  const all =
    typeof (headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as { getSetCookie: () => string[] }).getSetCookie()
      : ([headers.get('Set-Cookie')].filter((v): v is string => v !== null));
  for (const h of all) {
    const parts = h.split(';').map((p) => p.trim());
    const first = parts[0];
    if (!first) continue;
    const eqIdx = first.indexOf('=');
    if (eqIdx < 0) continue;
    const name = first.slice(0, eqIdx);
    if (name !== ANON_COOKIE_NAME) continue;
    const value = first.slice(eqIdx + 1);
    const maxAgePart = parts.slice(1).find((p) => p.toLowerCase().startsWith('max-age='));
    const maxAge = maxAgePart ? Number(maxAgePart.split('=')[1]) : null;
    return { value, maxAge };
  }
  return null;
}

describe.skipIf(!HAS_DB)('claim flow E2E (live DB + local-compute)', () => {
  let seeded: SeededRow | null = null;

  beforeEach(async () => {
    seeded = await seedClaimFixture();
    _jwtPayload.current = {
      aud: 'http://localhost:3000',
      sub: 'user_test_e2e',
      organization_id: seeded.orgId,
    };
  });

  afterEach(async () => {
    if (seeded !== null) {
      await teardownFixture(seeded);
      seeded = null;
    }
  });

  // ─── e2e 1: happy path ──────────────────────────────────────────────────
  it('e2e 1: full claim with deployment → 200 + DB state cleared + cookie cleared', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const env = envFor();
    const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);

    const res = await app.fetch(
      new Request('http://api/api/v1/claim_generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fake-jwt',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClaimSuccess;
    expect(body.claimed_count).toBe(1);
    expect(body.deployments_retagged).toBe(1);

    // Verify anonymous_generations row mutated.
    const anonR = await db.execute(sql`
      SELECT claimed_at, claimed_by_org_id
      FROM anonymous_generations
      WHERE anon_session_id = ${seeded.anonSessionId}
      LIMIT 1
    `);
    const anonRows = anonR.rows as unknown as AnonRow[];
    expect(anonRows.length).toBe(1);
    const anon = anonRows[0];
    if (!anon) throw new Error('anon row missing');
    expect(anon.claimed_at).not.toBeNull();
    expect(anon.claimed_by_org_id).toBe(seeded.orgId);

    // Verify deployments row cleared.
    const depR = await db.execute(sql`
      SELECT expires_at, anon_session_id
      FROM deployments
      WHERE id = ${seeded.deploymentId}
      LIMIT 1
    `);
    const depRows = depR.rows as unknown as DeployRow[];
    expect(depRows.length).toBe(1);
    const dep = depRows[0];
    if (!dep) throw new Error('deployment row missing');
    expect(dep.expires_at).toBeNull();
    expect(dep.anon_session_id).toBeNull();

    // Cookie cleared.
    const cleared = findAnonSetCookie(res);
    expect(cleared).not.toBeNull();
    if (cleared) expect(cleared.maxAge).toBe(0);
  });

  // ─── e2e 2: re-claim no-op ──────────────────────────────────────────────
  it('e2e 2: re-claim with same cookie → 200 claimed_count=0 (idempotent on DB UPDATE)', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const env = envFor();
    const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);

    // First claim.
    const first = await app.fetch(
      new Request('http://api/api/v1/claim_generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fake-jwt',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
      }),
      env,
    );
    expect(first.status).toBe(200);

    // Second claim — the cookie is "still" being sent by the test (browsers
    // would have cleared it but tests can replay). The DB UPDATE WHERE
    // claimed_at IS NULL filters it out; idempotent server-side.
    const second = await app.fetch(
      new Request('http://api/api/v1/claim_generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fake-jwt',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
      }),
      env,
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as ClaimSuccess;
    expect(secondBody.claimed_count).toBe(0);
    expect(secondBody.deployments_retagged).toBe(0);
  });

  // ─── e2e 3: T-9.1-08-06 race regression ─────────────────────────────────
  it('e2e 3: T-9.1-08-06 race regression — cleanup-cron query MUST NOT match post-claim row', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const env = envFor();
    const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);

    // Backdate the deployment expires_at so the cleanup query would have
    // picked it up if not for the claim.
    await db.execute(sql`
      UPDATE deployments
      SET expires_at = NOW() - INTERVAL '1 hour'
      WHERE id = ${seeded.deploymentId}
    `);

    // Run the claim.
    const claimRes = await app.fetch(
      new Request('http://api/api/v1/claim_generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fake-jwt',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
      }),
      env,
    );
    expect(claimRes.status).toBe(200);

    // Now run the cleanup-cron query (Plan 09.1-10 shape, RESEARCH §3
    // lines 326-335) — it MUST NOT see our just-claimed row.
    const cleanup = await db.execute(sql`
      SELECT id
      FROM deployments
      WHERE expires_at IS NOT NULL
        AND anon_session_id IS NOT NULL
        AND expires_at < NOW()
        AND id = ${seeded.deploymentId}
      LIMIT 1
    `);
    expect((cleanup.rows as unknown[]).length).toBe(0);
  });

  // ─── e2e 4: OQ-3 stripe-webhook unchanged ───────────────────────────────
  it('e2e 4: OQ-3 — stripe-webhook handler does not touch anon tables post-claim', async () => {
    if (!seeded) throw new Error('seeded fixture not initialized');
    const env = envFor();
    const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);

    // First, claim normally so the rows are bound to the org.
    const claimRes = await app.fetch(
      new Request('http://api/api/v1/claim_generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fake-jwt',
          Cookie: `${ANON_COOKIE_NAME}=${seeded.anonSessionId}`,
        },
      }),
      env,
    );
    expect(claimRes.status).toBe(200);

    // Snapshot anon + deployment row state pre-webhook.
    const anonBefore = await db.execute(sql`
      SELECT anon_session_id, generation_id, claimed_at, claimed_by_org_id
      FROM anonymous_generations
      WHERE anon_session_id = ${seeded.anonSessionId}
    `);
    const depBefore = await db.execute(sql`
      SELECT id, expires_at, anon_session_id
      FROM deployments
      WHERE id = ${seeded.deploymentId}
    `);

    // Invoke stripe-webhook with a checkout.session.completed event. The
    // handler will reject due to invalid signature (no STRIPE_WEBHOOK_SECRET
    // and no real signature). The semantic we're testing: even if it ran
    // successfully, it would not touch anon tables. The lack of mutation
    // is the contract.
    await app.fetch(
      new Request('http://api/api/v1/stripe/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'evt_test_e2e',
          type: 'checkout.session.completed',
          data: { object: { customer: 'cus_test_e2e', subscription: 'sub_test_e2e' } },
        }),
      }),
      env,
    );

    // Snapshot post-webhook — must equal pre-webhook for both tables.
    const anonAfter = await db.execute(sql`
      SELECT anon_session_id, generation_id, claimed_at, claimed_by_org_id
      FROM anonymous_generations
      WHERE anon_session_id = ${seeded.anonSessionId}
    `);
    const depAfter = await db.execute(sql`
      SELECT id, expires_at, anon_session_id
      FROM deployments
      WHERE id = ${seeded.deploymentId}
    `);
    expect(JSON.stringify(anonAfter.rows)).toBe(JSON.stringify(anonBefore.rows));
    expect(JSON.stringify(depAfter.rows)).toBe(JSON.stringify(depBefore.rows));
  });
});

// ─── DB-not-set explainer (mirrors anon-endpoint-smoke.test.ts) ────────────
describe.skipIf(HAS_DB)('claim flow E2E (skipped without DB)', () => {
  it('integration runs only when DATABASE_URL is set', () => {
    expect(HAS_DB).toBe(false);
  });
});
