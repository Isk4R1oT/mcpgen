// apps/api/tests/integration/cache-replay.test.ts
//
// Phase 09.1 plan 06 Task 3 — DB-backed integration smoke for the cache-hit
// flow on POST /api/v1/generate + GET /api/v1/jobs/:id/stream.
//
// Tier:
//   - Skipped when DATABASE_URL is unset (mirrors the badge-public.test.ts
//     and anon-flow-migration.test.ts empty-env no-op pattern).
//   - When the env var is set, the suite seeds a real verified+ generations
//     row pre-bound to a known content_hash, exercises a fresh anon POST
//     against the same spec_url (which hashes to the same content_hash via
//     `computeSpecHash` in generate.ts), and verifies the cache-hit child
//     row + SSE replay timeline are produced.
//
// 6 cases verified:
//   integration 1: anon POST /generate with NEW spec → 202 + fresh path
//                  (no cached_from FK on the resulting row)
//   integration 2: SEED a verified gen for spec X (1d ago, quality 4.5);
//                  anon POST /generate from a NEW IP with spec X → 202 +
//                  cache-hit child row created with cached_from FK set
//   integration 3 (continued from #2): GET /:id/stream replays the 9-stage
//                  SSE timeline in <1.5s wall-clock; first event has
//                  cache_hit=true; last event has final_tools+quality_report
//   integration 4: SEED a STANDARD gen (quality 3.5) for spec Y; anon POST
//                  /generate spec Y → fresh path (cache rejected by 4.0 floor)
//   integration 5: SEED a verified gen for spec Z but cached_from IS NOT
//                  NULL → fresh path (Pitfall #6 — pointer not used as source)
//   integration 6: rate-limit log row INSERTED on cache HIT (D-05 step 5)
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-PLAN-06.md Task 3
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §6 lines 720-781
//   - apps/api/tests/integration/anon-endpoint-smoke.test.ts (FK seed pattern)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({
    payload: { aud: 'http://localhost:3000', sub: 'user_test', organization_id: 'org_test' },
  })),
}));

const { buildApp } = await import('../../src/index.js');
const { db } = await import('../../src/db.js');

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

// Mirror computeSpecHash from generate.ts so seeded specs row gets the
// same content_hash that the BFF will derive from the POST body.
async function computeSpecHashForUrl(specUrl: string): Promise<string> {
  const buf = new TextEncoder().encode(specUrl);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

interface SeedHandle {
  orgId: string;
  projectId: string;
  specId: string;
  specHash: string;
  sourceGenerationId: string | null;
}

async function seedSpec(specUrl: string): Promise<SeedHandle> {
  const orgId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const specId = crypto.randomUUID();
  const specHash = await computeSpecHashForUrl(specUrl);

  await db.execute(sql`
    INSERT INTO organizations (id, logto_org_id, name)
    VALUES (${orgId}, ${`cache-int-${orgId.slice(-12)}`}, ${`cache-int-${orgId.slice(-12)}`})
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO projects (id, org_id, name)
    VALUES (${projectId}, ${orgId}, 'cache-int')
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO specs (id, project_id, content_hash, format, endpoint_count)
    VALUES (${specId}, ${projectId}, ${specHash}, 'openapi3', 0)
    ON CONFLICT DO NOTHING
  `);
  return { orgId, projectId, specId, specHash, sourceGenerationId: null };
}

async function seedVerifiedGen(
  fx: SeedHandle,
  args: {
    qualityScore: number;
    isPublishable: boolean;
    daysAgo: number;
    cachedFromId: string | null;
  },
): Promise<string> {
  const generationId = crypto.randomUUID();
  const created = new Date(Date.now() - args.daysAgo * 24 * 60 * 60 * 1000);
  await db.execute(sql`
    INSERT INTO generations (
      id, project_id, spec_id, status, options,
      quality_score, is_publishable,
      quality_report, ir,
      cached_from_generation_id,
      created_at, updated_at
    ) VALUES (
      ${generationId}, ${fx.projectId}, ${fx.specId}, 'completed', '{}'::jsonb,
      ${args.qualityScore}, ${args.isPublishable},
      ${sql.raw(`'${JSON.stringify({ overall_score: args.qualityScore, badge: 'verified' })}'::jsonb`)},
      ${sql.raw(`'${JSON.stringify({ final_tools: [{ name: 'search' }, { name: 'fetch' }] })}'::jsonb`)},
      ${args.cachedFromId},
      ${created.toISOString()}::timestamptz, NOW()
    )
  `);
  return generationId;
}

async function teardown(fx: SeedHandle | null): Promise<void> {
  if (!fx) return;
  await db.execute(sql`DELETE FROM organizations WHERE id = ${fx.orgId}`);
}

interface PostResult {
  status: number;
  body: { job_id?: string };
}

async function postGenerate(args: { ip: string; specUrl: string }): Promise<PostResult> {
  const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
  const res = await app.fetch(
    new Request('http://api/api/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': args.ip,
      },
      body: JSON.stringify({ spec_url: args.specUrl }),
    }),
    envFor(),
  );
  let body: { job_id?: string } = {};
  try {
    body = (await res.json()) as { job_id?: string };
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

describe.skipIf(!HAS_DB)('cache-replay integration (live DB)', () => {
  let fx: SeedHandle | null = null;

  beforeEach(async () => {
    fx = null;
    // Reset salt cache + clear any prior anon_generation_log rows from a stray
    // rerun (best-effort — DB is shared with other suites).
    const mod = await import('../../src/lib/anon-ip-hash.js');
    mod.__resetSaltCache();
  });

  afterEach(async () => {
    await teardown(fx);
    fx = null;
  });

  // ─── integration 1 ─────────────────────────────────────────────────────
  it('integration 1: anon POST /generate with NEW spec → fresh path (no cached_from FK)', async () => {
    const specUrl = `https://example.com/spec-${ulid()}.json`;
    const res = await postGenerate({ ip: `1.0.0.${Math.floor(Math.random() * 254) + 1}`, specUrl });
    expect(res.status).toBe(202);
    expect(typeof res.body.job_id).toBe('string');
    // Note: with no seed, content_hash for this URL doesn't match any row,
    // so the cache lookup MUST miss and the request goes through the fresh
    // path. We verify by querying for any generations row with cached_from
    // FK set against the random URL's hash — should be 0.
    const specHash = await computeSpecHashForUrl(specUrl);
    const r = await db.execute(sql`
      SELECT count(*)::int AS c FROM generations g
      JOIN specs s ON s.id = g.spec_id
      WHERE s.content_hash = ${specHash}
        AND g.cached_from_generation_id IS NOT NULL
    `);
    const count = (r.rows[0] as { c: number } | undefined)?.c ?? -1;
    expect(count).toBe(0);
  });

  // ─── integration 2 ─────────────────────────────────────────────────────
  it('integration 2: cache-hit child row created with cached_from FK on hit', async () => {
    const specUrl = `https://example.com/spec-${ulid()}.json`;
    fx = await seedSpec(specUrl);
    fx.sourceGenerationId = await seedVerifiedGen(fx, {
      qualityScore: 4.5,
      isPublishable: true,
      daysAgo: 1,
      cachedFromId: null,
    });

    const res = await postGenerate({ ip: `2.0.0.${Math.floor(Math.random() * 254) + 1}`, specUrl });
    expect(res.status).toBe(202);
    expect(typeof res.body.job_id).toBe('string');

    // Verify a child row exists with cached_from = source.
    const r = await db.execute(sql`
      SELECT id, cached_from_generation_id, status, llm_cost_usd, is_publishable
      FROM generations
      WHERE cached_from_generation_id = ${fx.sourceGenerationId}
    `);
    const rows = r.rows as Array<{
      id: string;
      cached_from_generation_id: string;
      status: string;
      llm_cost_usd: string | null;
      is_publishable: boolean;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const childRow = rows[0];
    expect(childRow).toBeDefined();
    if (!childRow) return;
    expect(childRow.cached_from_generation_id).toBe(fx.sourceGenerationId);
    expect(childRow.status).toBe('completed');
    expect(Number(childRow.llm_cost_usd ?? 0)).toBe(0);
    expect(childRow.is_publishable).toBe(false);
  });

  // ─── integration 3 (continued from #2) ─────────────────────────────────
  it('integration 3: cache-hit /jobs/:id/stream replays 9 SSE events <1.5s with cache_hit metadata', async () => {
    const specUrl = `https://example.com/spec-${ulid()}.json`;
    fx = await seedSpec(specUrl);
    fx.sourceGenerationId = await seedVerifiedGen(fx, {
      qualityScore: 4.7,
      isPublishable: true,
      daysAgo: 1,
      cachedFromId: null,
    });

    const post = await postGenerate({ ip: `3.0.0.${Math.floor(Math.random() * 254) + 1}`, specUrl });
    expect(post.status).toBe(202);
    const jobId = post.body.job_id;
    expect(typeof jobId).toBe('string');
    if (typeof jobId !== 'string') return;

    // Find the anon cookie that the POST set (we need it to authorize the
    // stream read).
    // The POST response in the test env doesn't expose the cookie via
    // body; we re-derive ownership by querying the anonymous_generations
    // row directly and using that anon_session_id as the cookie.
    const ag = await db.execute(sql`
      SELECT anon_session_id FROM anonymous_generations
      WHERE generation_id = ${jobId}
      LIMIT 1
    `);
    const cookieRow = ag.rows[0] as { anon_session_id: string } | undefined;
    expect(cookieRow).toBeDefined();
    if (!cookieRow) return;

    const app = buildApp(envFor() as unknown as Parameters<typeof buildApp>[0]);
    const start = Date.now();
    const streamRes = await app.fetch(
      new Request(`http://api/api/v1/jobs/${jobId}/stream`, {
        headers: { Cookie: `mcpgen_anon_session=${cookieRow.anon_session_id}` },
      }),
      envFor(),
    );
    expect(streamRes.headers.get('content-type')).toMatch(/text\/event-stream/);
    const text = await streamRes.text();
    const elapsed = Date.now() - start;
    // D-05 SLA: full replay <1.5s wall clock (1s timeline budget + jitter).
    expect(elapsed).toBeLessThan(1500);

    // 9 SSE events expected (A,B,C,D,E,F1,F2,F3,completed) — count the
    // event_id frames.
    const idLines = text.split('\n').filter((l) => l.startsWith('id: '));
    expect(idLines.length).toBe(9);

    // Parse the data: lines and assert event 0 has cache_hit metadata,
    // event 8 has final_tools/quality_report.
    const dataPayloads = text
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
    expect(dataPayloads.length).toBe(9);

    const first = dataPayloads[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.stage).toBe('A');
    const partial0 = first.partial_result as Record<string, unknown> | undefined;
    expect(partial0?.cache_hit).toBe(true);
    expect(partial0?.original_generation_id).toBe(fx.sourceGenerationId);

    const last = dataPayloads[dataPayloads.length - 1];
    expect(last).toBeDefined();
    if (!last) return;
    expect(last.stage).toBe('completed');
    const partialLast = last.partial_result as Record<string, unknown> | undefined;
    expect(partialLast?.final_tools).toBeDefined();
    expect(partialLast?.quality_report).toBeDefined();
  });

  // ─── integration 4 ─────────────────────────────────────────────────────
  it('integration 4: standard gen (quality 3.5) → cache rejected, fresh path', async () => {
    const specUrl = `https://example.com/spec-${ulid()}.json`;
    fx = await seedSpec(specUrl);
    fx.sourceGenerationId = await seedVerifiedGen(fx, {
      qualityScore: 3.5,
      isPublishable: true,
      daysAgo: 1,
      cachedFromId: null,
    });

    const res = await postGenerate({ ip: `4.0.0.${Math.floor(Math.random() * 254) + 1}`, specUrl });
    expect(res.status).toBe(202);

    // No cache-hit child should exist (fresh path).
    const r = await db.execute(sql`
      SELECT count(*)::int AS c FROM generations
      WHERE cached_from_generation_id = ${fx.sourceGenerationId}
    `);
    const count = (r.rows[0] as { c: number } | undefined)?.c ?? -1;
    expect(count).toBe(0);
  });

  // ─── integration 5 (Pitfall #6 regression) ─────────────────────────────
  it('integration 5: Pitfall #6 — gen with cached_from IS NOT NULL is not used as source', async () => {
    const specUrl = `https://example.com/spec-${ulid()}.json`;
    fx = await seedSpec(specUrl);
    // Original (publishable=false so it cannot serve as source either).
    const original = await seedVerifiedGen(fx, {
      qualityScore: 4.5,
      isPublishable: false,
      daysAgo: 5,
      cachedFromId: null,
    });
    fx.sourceGenerationId = original;
    // Chained candidate (cached_from set, otherwise satisfies criteria).
    const chained = await seedVerifiedGen(fx, {
      qualityScore: 4.6,
      isPublishable: true,
      daysAgo: 1,
      cachedFromId: original,
    });

    const res = await postGenerate({ ip: `5.0.0.${Math.floor(Math.random() * 254) + 1}`, specUrl });
    expect(res.status).toBe(202);

    // No NEW cache-hit child row points at `chained` — Pitfall #6 mitigated.
    const r = await db.execute(sql`
      SELECT count(*)::int AS c FROM generations
      WHERE cached_from_generation_id = ${chained}
    `);
    const count = (r.rows[0] as { c: number } | undefined)?.c ?? -1;
    expect(count).toBe(0);
  });

  // ─── integration 6 (rate-limit log on cache hit) ───────────────────────
  it('integration 6: anon_generation_log row inserted on cache HIT (D-05 step 5)', async () => {
    const specUrl = `https://example.com/spec-${ulid()}.json`;
    fx = await seedSpec(specUrl);
    fx.sourceGenerationId = await seedVerifiedGen(fx, {
      qualityScore: 4.5,
      isPublishable: true,
      daysAgo: 1,
      cachedFromId: null,
    });

    const ip = `6.0.0.${Math.floor(Math.random() * 254) + 1}`;
    const before = await db.execute(sql`SELECT count(*)::int AS c FROM anon_generation_log`);
    const beforeCount = (before.rows[0] as { c: number } | undefined)?.c ?? 0;

    const res = await postGenerate({ ip, specUrl });
    expect(res.status).toBe(202);

    const after = await db.execute(sql`SELECT count(*)::int AS c FROM anon_generation_log`);
    const afterCount = (after.rows[0] as { c: number } | undefined)?.c ?? 0;
    // The middleware always logs (regardless of cache HIT/MISS) — D-05 explicit.
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount + 1);
  });
});
