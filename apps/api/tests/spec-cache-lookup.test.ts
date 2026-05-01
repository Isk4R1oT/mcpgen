// apps/api/tests/spec-cache-lookup.test.ts
//
// Phase 09.1 plan 06 Task 1 — TDD RED for spec-cache lookup + child INSERT.
//
// DB-gated tests (skipIf !DATABASE_URL) covering both functions in
// `apps/api/src/lib/spec-cache-lookup.ts` (created in Task 2):
//   - `lookupCachedGeneration(specHash)` — picks the highest-quality cache
//     source row for a spec_hash that satisfies all criteria below.
//   - `createCacheHitChild(cached, anonSessionId, ipHash)` — atomically
//     inserts a child generations row + anonymous_generations row.
//
// Locked criteria:
//   1. quality_score >= 4.0  (D-05 verified+ floor)
//   2. is_publishable = true (Phase 9 plan 02 explicit publish flag)
//   3. created_at >= NOW() - INTERVAL '7 days'  (D-05 freshness)
//   4. cached_from_generation_id IS NULL  (Pitfall #6 — never chain)
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §6 lines 803-816
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md "Pitfall #6"
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-05
//   - apps/api/tests/migrations/anon-flow-migration.test.ts (skipIf precedent)
//   - apps/api/tests/integration/anon-endpoint-smoke.test.ts (FK seed pattern)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';

import { db } from '../src/db.js';
import {
  lookupCachedGeneration,
  createCacheHitChild,
  type CachedGenLookupResult,
} from '../src/lib/spec-cache-lookup.js';

const HAS_DB = Boolean(process.env['DATABASE_URL']);

interface SeededFixture {
  orgId: string;
  projectId: string;
  specId: string;
  // Set of generation IDs to clean up; teardown drops the org which CASCADEs.
  cleanupOrgIds: string[];
}

interface SeedGenOptions {
  qualityScore: number;
  isPublishable: boolean;
  createdAt: Date;
  cachedFromId: string | null;
  finalTools: Record<string, unknown>;
  qualityReport: Record<string, unknown>;
}

async function seedFixture(specHashSuffix: string): Promise<SeededFixture> {
  const orgId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const specId = crypto.randomUUID();

  await db.execute(sql`
    INSERT INTO organizations (id, logto_org_id, name)
    VALUES (${orgId}, ${`cache-${orgId.slice(-12)}`}, ${`cache-${orgId.slice(-12)}`})
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO projects (id, org_id, name)
    VALUES (${projectId}, ${orgId}, 'cache-test')
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO specs (id, project_id, content_hash, format, endpoint_count)
    VALUES (${specId}, ${projectId}, ${specHashSuffix}, 'openapi3', 0)
    ON CONFLICT DO NOTHING
  `);

  return { orgId, projectId, specId, cleanupOrgIds: [orgId] };
}

async function seedGen(
  fx: SeededFixture,
  opts: SeedGenOptions,
): Promise<string> {
  const generationId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO generations (
      id, project_id, spec_id, status, options,
      quality_score, is_publishable,
      quality_report, ir,
      cached_from_generation_id,
      created_at, updated_at
    ) VALUES (
      ${generationId}, ${fx.projectId}, ${fx.specId}, 'completed', '{}'::jsonb,
      ${opts.qualityScore}, ${opts.isPublishable},
      ${sql.raw(`'${JSON.stringify(opts.qualityReport).replace(/'/g, "''")}'::jsonb`)},
      ${sql.raw(`'${JSON.stringify({ final_tools: opts.finalTools }).replace(/'/g, "''")}'::jsonb`)},
      ${opts.cachedFromId},
      ${opts.createdAt.toISOString()}::timestamptz, NOW()
    )
  `);
  return generationId;
}

async function teardown(fx: SeededFixture | null): Promise<void> {
  if (!fx) return;
  for (const orgId of fx.cleanupOrgIds) {
    // CASCADE: organizations → projects → specs → generations → anonymous_generations.
    await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
  }
}

describe.skipIf(!HAS_DB)('spec-cache lookup (live DB)', () => {
  let fx: SeededFixture | null = null;

  beforeEach(async () => {
    fx = null;
  });

  afterEach(async () => {
    await teardown(fx);
    fx = null;
  });

  // ─── lookup test 1 ───────────────────────────────────────────────────────
  it('verified gen (4.5) created 1 day ago → returns that row', async () => {
    const specHash = `cache-test-1-${ulid()}`;
    fx = await seedFixture(specHash);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const genId = await seedGen(fx, {
      qualityScore: 4.5,
      isPublishable: true,
      createdAt: oneDayAgo,
      cachedFromId: null,
      finalTools: { tools: [{ name: 'search' }] },
      qualityReport: { overall_score: 4.5 },
    });
    const result = await lookupCachedGeneration(specHash);
    expect(result).not.toBeNull();
    expect(result?.generation_id).toBe(genId);
    expect(Number(result?.quality_score)).toBe(4.5);
  });

  // ─── lookup test 2 ───────────────────────────────────────────────────────
  it('standard gen (3.5) → returns null (quality floor 4.0)', async () => {
    const specHash = `cache-test-2-${ulid()}`;
    fx = await seedFixture(specHash);
    await seedGen(fx, {
      qualityScore: 3.5,
      isPublishable: true,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      cachedFromId: null,
      finalTools: {},
      qualityReport: {},
    });
    const result = await lookupCachedGeneration(specHash);
    expect(result).toBeNull();
  });

  // ─── lookup test 3 ───────────────────────────────────────────────────────
  it('verified gen created 8 days ago → returns null (freshness window)', async () => {
    const specHash = `cache-test-3-${ulid()}`;
    fx = await seedFixture(specHash);
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await seedGen(fx, {
      qualityScore: 4.5,
      isPublishable: true,
      createdAt: eightDaysAgo,
      cachedFromId: null,
      finalTools: {},
      qualityReport: {},
    });
    const result = await lookupCachedGeneration(specHash);
    expect(result).toBeNull();
  });

  // ─── lookup test 4 ───────────────────────────────────────────────────────
  it('verified gen with is_publishable=false → returns null', async () => {
    const specHash = `cache-test-4-${ulid()}`;
    fx = await seedFixture(specHash);
    await seedGen(fx, {
      qualityScore: 4.5,
      isPublishable: false,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      cachedFromId: null,
      finalTools: {},
      qualityReport: {},
    });
    const result = await lookupCachedGeneration(specHash);
    expect(result).toBeNull();
  });

  // ─── lookup test 5 (Pitfall #6 regression — chained source rejected) ─────
  it("Pitfall #6: verified gen having cached_from_generation_id IS NOT NULL → returns null", async () => {
    const specHash = `cache-test-5-${ulid()}`;
    fx = await seedFixture(specHash);
    // Seed an original first so we have a UUID to point cachedFromId at.
    const original = await seedGen(fx, {
      qualityScore: 4.5,
      isPublishable: true,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      cachedFromId: null,
      finalTools: { tools: [] },
      qualityReport: {},
    });
    // Mark the original as is_publishable=false so the lookup MUST fall to the
    // chained candidate (which has is_publishable=true). The chained candidate
    // must STILL be rejected by Pitfall #6 even though it satisfies all other
    // criteria.
    await db.execute(sql`
      UPDATE generations SET is_publishable = false WHERE id = ${original}
    `);
    await seedGen(fx, {
      qualityScore: 4.6,
      isPublishable: true,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      cachedFromId: original,
      finalTools: {},
      qualityReport: {},
    });
    const result = await lookupCachedGeneration(specHash);
    expect(result).toBeNull();
  });

  // ─── lookup test 6 ───────────────────────────────────────────────────────
  it('unknown spec_hash → returns null', async () => {
    const result = await lookupCachedGeneration(`nonexistent-${ulid()}`);
    expect(result).toBeNull();
  });

  // ─── lookup test 7 ───────────────────────────────────────────────────────
  it('multiple verified gens → returns the highest quality_score', async () => {
    const specHash = `cache-test-7-${ulid()}`;
    fx = await seedFixture(specHash);
    await seedGen(fx, {
      qualityScore: 4.1,
      isPublishable: true,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      cachedFromId: null,
      finalTools: {},
      qualityReport: {},
    });
    const winner = await seedGen(fx, {
      qualityScore: 4.8,
      isPublishable: true,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      cachedFromId: null,
      finalTools: {},
      qualityReport: {},
    });
    await seedGen(fx, {
      qualityScore: 4.3,
      isPublishable: true,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      cachedFromId: null,
      finalTools: {},
      qualityReport: {},
    });
    const result = await lookupCachedGeneration(specHash);
    expect(result).not.toBeNull();
    expect(result?.generation_id).toBe(winner);
    expect(Number(result?.quality_score)).toBeCloseTo(4.8, 2);
  });

  // ─── create test 8 ───────────────────────────────────────────────────────
  it('createCacheHitChild inserts child gen + anonymous_generations row', async () => {
    const specHash = `cache-test-8-${ulid()}`;
    fx = await seedFixture(specHash);
    const sourceId = await seedGen(fx, {
      qualityScore: 4.5,
      isPublishable: true,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      cachedFromId: null,
      finalTools: { tools: [{ name: 'search' }] },
      qualityReport: { overall_score: 4.5 },
    });
    const cached: CachedGenLookupResult = {
      generation_id: sourceId,
      project_id: fx.projectId,
      spec_id: fx.specId,
      quality_score: 4.5,
      quality_report: { overall_score: 4.5 },
      final_tools: { tools: [{ name: 'search' }] },
      created_at: new Date(),
    };
    const anonSessionId = ulid();
    const { new_generation_id } = await createCacheHitChild(cached, anonSessionId, 'ip-hash-test-8');

    // Child row exists with FK back to source + llm_cost_usd = 0.
    const child = await db.execute(sql`
      SELECT id, cached_from_generation_id, llm_cost_usd, is_publishable, status
      FROM generations WHERE id = ${new_generation_id}
    `);
    const childRow = child.rows[0] as
      | {
          id: string;
          cached_from_generation_id: string | null;
          llm_cost_usd: string | null;
          is_publishable: boolean | null;
          status: string;
        }
      | undefined;
    expect(childRow).toBeDefined();
    expect(childRow?.cached_from_generation_id).toBe(sourceId);
    expect(Number(childRow?.llm_cost_usd ?? 0)).toBe(0);
    expect(childRow?.is_publishable).toBe(false);
    expect(childRow?.status).toBe('completed');

    // anonymous_generations row binds the cookie ULID → child gen.
    const ag = await db.execute(sql`
      SELECT generation_id, ip_hash FROM anonymous_generations
      WHERE anon_session_id = ${anonSessionId}
    `);
    const agRow = ag.rows[0] as { generation_id: string; ip_hash: string } | undefined;
    expect(agRow).toBeDefined();
    expect(agRow?.generation_id).toBe(new_generation_id);
    expect(agRow?.ip_hash).toBe('ip-hash-test-8');
  });

  // ─── create test 9 (atomicity regression) ────────────────────────────────
  it('createCacheHitChild rolls back generations row when anonymous_generations insert fails', async () => {
    const specHash = `cache-test-9-${ulid()}`;
    fx = await seedFixture(specHash);
    const sourceId = await seedGen(fx, {
      qualityScore: 4.5,
      isPublishable: true,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      cachedFromId: null,
      finalTools: {},
      qualityReport: {},
    });
    const cached: CachedGenLookupResult = {
      generation_id: sourceId,
      project_id: fx.projectId,
      spec_id: fx.specId,
      quality_score: 4.5,
      quality_report: {},
      final_tools: {},
      created_at: new Date(),
    };
    // Pre-occupy the anon_session_id PK so the second INSERT fails on conflict.
    const anonSessionId = ulid();
    // Need a real generation row to satisfy FK on anonymous_generations.generation_id.
    const decoyId = await seedGen(fx, {
      qualityScore: 4.0,
      isPublishable: true,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      cachedFromId: null,
      finalTools: {},
      qualityReport: {},
    });
    await db.execute(sql`
      INSERT INTO anonymous_generations (anon_session_id, generation_id, ip_hash)
      VALUES (${anonSessionId}, ${decoyId}, 'pre-existing')
    `);

    let threw = false;
    try {
      await createCacheHitChild(cached, anonSessionId, 'ip-hash-test-9');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Verify NO new generations row with cached_from_generation_id = sourceId
    // was created (transaction rolled back).
    const orphans = await db.execute(sql`
      SELECT count(*)::int AS c FROM generations
      WHERE cached_from_generation_id = ${sourceId}
    `);
    const count = (orphans.rows[0] as { c: number } | undefined)?.c ?? -1;
    expect(count).toBe(0);
  });
});
