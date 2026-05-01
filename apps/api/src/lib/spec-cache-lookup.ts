// apps/api/src/lib/spec-cache-lookup.ts
//
// Phase 09.1 plan 06 — D-05 + OQ-2 cache-hit lookup + child-row insertion.
//
// Two functions:
//   - `lookupCachedGeneration(specHash)` — the L1 cache lookup query. Returns
//     the highest-quality recent verified+ generation for a given spec_hash,
//     or null if no row satisfies all four criteria (D-05 + Pitfall #6).
//   - `createCacheHitChild(cached, anonSessionId, ipHash)` — atomically
//     inserts a child `generations` row with the FK back to the source +
//     binds the anon session to it via `anonymous_generations`.
//
// Design constraints (RESEARCH §6 + CONTEXT D-05 + Pitfall #6):
//   1. quality_score ≥ 4.0  (verified or premium badge — F2/F3 enforced)
//   2. is_publishable = true (Phase 9 plan 02 explicit publish flag)
//   3. created_at ≥ NOW() - 7 days  (freshness window)
//   4. cached_from_generation_id IS NULL  (NEVER use a cache pointer as
//      source — closes the recursion cycle — Pitfall #6 regression test 5)
//
// The child row carries:
//   - cached_from_generation_id = source row's id  (OQ-2 attribution)
//   - llm_cost_usd = 0  (cache hit was free; analytics distinguishes from
//     fresh gens)
//   - is_publishable = false  (only ORIGINAL premium gens are reusable as
//     cache sources — never propagate "publishable" to the child)
//   - quality_score / quality_report / ir mirror the source so the agent
//     gets identical content
//
// Atomicity: the two INSERTs run inside `db.transaction()` so a failure on
// the second (e.g. anon_session_id PK collision) rolls the first back.
// Without the transaction, an orphan generations row would persist with
// `cached_from_generation_id` set but no anonymous_generations binding.
// Test 9 in spec-cache-lookup.test.ts is the regression for this.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §6 lines 803-816
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md "Pitfall #6"
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-05 + OQ-2
//   - packages/contracts/src/db-schema.ts (generations.cached_from_generation_id)

import { sql } from 'drizzle-orm';

import { db } from '../db.js';

/**
 * Cache-source row returned from the lookup. Captures everything the cache-hit
 * child INSERT needs (source id + spec_id + content/quality fields) without
 * coupling the consumer to the full generations row shape.
 */
export interface CachedGenLookupResult {
  readonly generation_id: string;
  readonly project_id: string;
  readonly spec_id: string;
  readonly quality_score: number;
  readonly quality_report: unknown;
  readonly final_tools: unknown;
  readonly created_at: Date;
}

/**
 * Look up the best cache-source generation for the supplied spec_hash.
 *
 * Returns the row with highest `quality_score`, breaking ties by most recent
 * `created_at`. Returns `null` when no row satisfies all four cache-source
 * criteria (D-05 + Pitfall #6).
 *
 * Failures (DB outage, query timeout) propagate — the caller should wrap in
 * a try/catch and fall through to the fresh-generation path on error to
 * avoid cache-lookup hiccups blocking the entire anon flow (parallels the
 * fail-open pattern in plan 09.1-05's anon-rate-limit middleware).
 */
export async function lookupCachedGeneration(
  specHash: string,
): Promise<CachedGenLookupResult | null> {
  const r = await db.execute(sql`
    SELECT
      g.id                  AS generation_id,
      g.project_id          AS project_id,
      g.spec_id             AS spec_id,
      g.quality_score       AS quality_score,
      g.quality_report      AS quality_report,
      g.ir                  AS ir,
      g.created_at          AS created_at
    FROM generations g
    JOIN specs s ON s.id = g.spec_id
    WHERE s.content_hash = ${specHash}
      AND g.quality_score >= 4.0
      AND g.is_publishable = true
      AND g.created_at >= NOW() - INTERVAL '7 days'
      AND g.cached_from_generation_id IS NULL
    ORDER BY g.quality_score DESC, g.created_at DESC
    LIMIT 1
  `);
  const row = r.rows[0] as
    | {
        generation_id: string;
        project_id: string;
        spec_id: string;
        quality_score: string | number | null;
        quality_report: unknown;
        ir: unknown;
        created_at: string | Date;
      }
    | undefined;
  if (!row) return null;

  // Postgres `numeric` round-trips as a string in the neon-http driver. Cast
  // to number eagerly so consumers don't need to remember.
  const qs = typeof row.quality_score === 'string'
    ? Number(row.quality_score)
    : row.quality_score ?? 0;

  // The cache-hit replay needs `final_tools` exposed under that name; Phase 8
  // stores it inside the `ir` blob (`{ final_tools: [...] }`) rather than a
  // dedicated column. Extract it if present, fall back to the whole ir blob.
  const ir = row.ir as { final_tools?: unknown } | null;
  const finalTools = ir && typeof ir === 'object' && 'final_tools' in ir
    ? ir.final_tools
    : (ir ?? null);

  return {
    generation_id: row.generation_id,
    project_id: row.project_id,
    spec_id: row.spec_id,
    quality_score: qs,
    quality_report: row.quality_report,
    final_tools: finalTools,
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

/**
 * Insert the child cache-hit `generations` row + the binding
 * `anonymous_generations` row in a single transaction.
 *
 * Returns the new generation's UUID. The caller uses it as both:
 *   - the `job_id` returned in the POST /generate response
 *   - the row key for the SSE replay handler in /jobs/:id/stream
 *
 * Throws when either INSERT fails. Per the atomicity test 9, when the second
 * INSERT fails (e.g. PK collision on anon_session_id), the first INSERT is
 * rolled back so no orphan child rows persist.
 */
export async function createCacheHitChild(
  cached: CachedGenLookupResult,
  anonSessionId: string,
  ipHash: string,
): Promise<{ new_generation_id: string }> {
  const newGenerationId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO generations (
        id, project_id, spec_id, status, options,
        quality_score, quality_report, ir,
        cached_from_generation_id, llm_cost_usd, is_publishable,
        created_at, updated_at
      ) VALUES (
        ${newGenerationId}, ${cached.project_id}, ${cached.spec_id},
        'completed', '{}'::jsonb,
        ${cached.quality_score},
        ${sql.raw(`'${JSON.stringify(cached.quality_report).replace(/'/g, "''")}'::jsonb`)},
        ${sql.raw(`'${JSON.stringify({ final_tools: cached.final_tools }).replace(/'/g, "''")}'::jsonb`)},
        ${cached.generation_id},
        0, false,
        NOW(), NOW()
      )
    `);

    await tx.execute(sql`
      INSERT INTO anonymous_generations (anon_session_id, generation_id, ip_hash)
      VALUES (${anonSessionId}, ${newGenerationId}, ${ipHash})
    `);
  });

  return { new_generation_id: newGenerationId };
}
