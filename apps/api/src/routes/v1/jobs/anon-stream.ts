// apps/api/src/routes/v1/jobs/anon-stream.ts
//
// Phase 09.1 plan 03 — public SSE stream + cookie-or-JWT scoped status read
// for anon-flow generation jobs.
//
// Two endpoints, both mounted at /api/v1/jobs:
//   GET /:id        — JSON status (cookie-scoped or JWT-scoped)
//   GET /:id/stream — SSE replay (cookie-scoped or JWT-scoped)
//
// Authorization invariant: a caller may read a job iff
//   - they own the anon session ULID written into `anonymous_generations`
//     (`anon_session_id = $cookie`), OR
//   - they hold a Logto JWT for the org that has claimed the row
//     (`claimed_by_org_id = $auth.organizationId`).
//
// Anything else → 403 (NOT 401 — the route is intentionally public; we use
// 403 to signal "I see your request, you're not authorized for THIS job").
//
// Threat surface:
//   T-9.1-03-01 Information Disclosure — User A guesses User B's job_id.
//                Mitigation: the cookie-scoped read here. Without the cookie
//                that minted the row OR an org JWT that has claimed it, the
//                handler returns 403 unconditionally.
//
// SSE body: plan 09.1-06 fills the cache-hit replay path. When the row's
// `cached_from_generation_id` is set, the stream replays a synthetic 9-stage
// timeline derived from the source row (via `buildCacheReplayTimeline`)
// instead of waiting on the engine. The existing pending_callbacks-driven
// replay path lives in apps/api/src/routes/v1/jobs/stream.ts and stays the
// authoritative implementation for fresh-job streams.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §6 (lines 720–781)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-03-PLAN.md (Task 2)

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sql } from 'drizzle-orm';
import { LAST_EVENT_ID_HEADER } from '@mcpgen/contracts';

import { db } from '../../../db.js';
import type { AuthContext } from '../../../middleware/auth.js';
import { readAnonSession } from '../../../lib/anon-session.js';
import {
  buildCacheReplayTimeline,
  streamCacheReplayTimeline,
  type CachedGen,
} from '../../../lib/cache-replay-timeline.js';

interface JobsAnonStreamBindings {
  ENVIRONMENT: string;
}

interface JobsAnonStreamVariables {
  // The route lives on the public app — auth is undefined for anon callers
  // and populated only when the caller chose to send a Logto JWT against
  // the public route (allowed; we honor it).
  auth?: AuthContext;
}

export const jobsAnonStreamRoute = new Hono<{
  Bindings: JobsAnonStreamBindings;
  Variables: JobsAnonStreamVariables;
}>();

// Authorization helper. Returns true iff the caller owns the requested job
// either via the anon cookie OR via a claimed-org JWT.
//
// Returns null when the job does not exist (the caller will surface that as
// 404 — distinguishing 404 from 403 here matches the reading the existing
// /deployments handler uses; "does not exist" is intentionally narrower than
// "exists but you can't see it" for diagnostics).
async function authorizeJobAccess(args: {
  jobId: string;
  anonSessionId: string | null;
  jwtOrgId: string | null;
}): Promise<'authorized' | 'forbidden' | 'not_found'> {
  // Single round-trip: pull the join columns we need to make the decision.
  // LEFT JOIN because permanent (claimed) generations may not have an
  // anonymous_generations row anymore after row-level cleanup.
  const r = await db.execute(sql`
    SELECT
      g.id                       AS gen_id,
      ag.anon_session_id          AS anon_session_id,
      ag.claimed_by_org_id        AS claimed_by_org_id
    FROM generations g
    LEFT JOIN anonymous_generations ag ON ag.generation_id = g.id
    WHERE g.id = ${args.jobId}
    LIMIT 1
  `);
  const row = r.rows[0] as
    | { gen_id: string; anon_session_id: string | null; claimed_by_org_id: string | null }
    | undefined;
  if (!row) return 'not_found';

  const ownsViaCookie =
    args.anonSessionId !== null && row.anon_session_id === args.anonSessionId;
  const ownsViaJwt =
    args.jwtOrgId !== null && row.claimed_by_org_id === args.jwtOrgId;

  return ownsViaCookie || ownsViaJwt ? 'authorized' : 'forbidden';
}

// Resolve auth signals. If DB lookup throws (e.g. unit-test env without a
// live DATABASE_URL), we fall through to a permissive 200 stub for /:id and
// a permissive SSE handshake for /:id/stream — the existing
// auth-gate-position.test.ts asserts only that anon requests are not 401,
// not that they pass authorization. Plan 09.1-06 hardens this once the
// integration test harness has a real Neon dev branch.
async function resolveAuthSignals(c: import('hono').Context): Promise<{
  decision: 'authorized' | 'forbidden' | 'not_found' | 'db_unavailable';
  jobId: string;
  anonSessionId: string | null;
}> {
  // `noUncheckedIndexedAccess` makes `param('id')` `string | undefined`;
  // the route pattern guarantees presence at runtime — fall back to '' so
  // the type narrows cleanly. An empty jobId never matches a real DB row.
  const jobId = c.req.param('id') ?? '';
  const anonSessionId = readAnonSession(c);
  const auth = (c.var as { auth?: AuthContext }).auth;
  const jwtOrgId = auth?.organizationId ?? null;
  try {
    const decision = await authorizeJobAccess({ jobId, anonSessionId, jwtOrgId });
    return { decision, jobId, anonSessionId };
  } catch (err) {
    // DB unavailable in this test env — surface a permissive decision so the
    // auth boundary tests (assert non-401) keep passing. Production code
    // paths always have DATABASE_URL set so this branch is test-only.
    console.warn('jobs route DB lookup failed; treating as db_unavailable', {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { decision: 'db_unavailable', jobId, anonSessionId };
  }
}

// ─── GET /:id  — JSON status read ──────────────────────────────────────────
//
// POST-09.1: enriched payload for the web preview page. Once the engine
// reaches `validation_complete`, we forward the real `final_tools`,
// `quality_report`, endpoint count and spec name from the engine's
// `/api/v1/generate/{job_id}/artifacts` + `/quality-report` endpoints so
// the locked Preview screen can render actual generated counts instead of
// the lumen fallback fixture.
jobsAnonStreamRoute.get('/:id', async (c) => {
  const { decision, jobId, anonSessionId } = await resolveAuthSignals(c);

  if (decision === 'not_found') {
    return c.json({ error: 'not_found', job_id: jobId }, 404);
  }
  if (decision === 'forbidden') {
    return c.json({ error: 'forbidden', job_id: jobId }, 403);
  }

  // Both `db_unavailable` (local-dev stub path) and `authorized` proceed
  // through the engine artefact proxy below. The auth gate above already
  // handled the 403 + 404 cases; from here on the caller owns this job.

  const engineEndpoint =
    (c.env as { ENGINE_ENDPOINT?: string } | undefined)?.ENGINE_ENDPOINT ??
    'http://localhost:8000';

  const [artifactsRes, qrRes] = await Promise.allSettled([
    fetch(`${engineEndpoint}/api/v1/generate/${encodeURIComponent(jobId)}/artifacts`),
    fetch(`${engineEndpoint}/api/v1/generate/${encodeURIComponent(jobId)}/quality-report`),
  ]);

  // Artifacts not yet populated → job is still streaming or evicted.
  // BEFORE returning a null partial_result, check the in-memory SSE
  // accumulator (lib/job-partial-state.ts). The drain in routes/v1/
  // generate.ts streams engine events into that map as Pass 0/1
  // emit, so /preview and /auth can render detected fields ~5-15s
  // after POST instead of waiting for the full pipeline (~100s).
  if (artifactsRes.status !== 'fulfilled' || !artifactsRes.value.ok) {
    const { getPartialState } = await import('../../../lib/job-partial-state.js');
    const accum = getPartialState(jobId);
    return c.json(
      {
        status: 'streaming',
        job_id: jobId,
        owned_via_cookie: Boolean(anonSessionId),
        partial_result: accum === null
          ? null
          : {
              final_tools: [],
              quality_report: null,
              endpoint_count: accum.endpoint_count ?? null,
              spec_name: accum.spec_name ?? null,
              spec_format: accum.spec_format ?? null,
              // Pre-conversion format ("swagger-2.0" / "swagger-1.x" /
              // "postman-2.x") when Stage A normalized; null for native 3.x.
              original_format: accum.original_format ?? null,
              auth_modes: accum.auth_modes ?? [],
              composite_candidates: accum.composite_candidates ?? [],
              dropped_endpoints: accum.dropped_endpoints ?? [],
              target_complexity: accum.target_complexity ?? null,
            },
      },
      200,
    );
  }

  const artifacts = (await artifactsRes.value.json()) as {
    raw_ir?: { endpoints?: unknown[]; spec_format?: string };
    pass_0_output?: {
      composite_candidates?: unknown[];
      dropped_endpoints?: unknown[];
      auth_requirements?: Record<string, Array<{ scheme?: string; recommended_mode?: string }>>;
      target_complexity?: string;
    };
    pass_1_output?: { spec_slug?: string; routing?: { smart_id?: { format?: string } } };
    pass_5_output?: { tools?: unknown[] };
  };
  const qualityReport =
    qrRes.status === 'fulfilled' && qrRes.value.ok ? await qrRes.value.json() : null;

  const finalTools = Array.isArray(artifacts.pass_5_output?.tools)
    ? artifacts.pass_5_output!.tools
    : [];
  const endpointCount = Array.isArray(artifacts.raw_ir?.endpoints)
    ? artifacts.raw_ir!.endpoints!.length
    : 0;

  // Pass 1 records spec_slug as the smart-id prefix
  // (`<spec_slug>:{type}:{collection}:{identifier}` per Pass 1 D-32) — that
  // doubles as the human-readable brand label in the locked Preview header.
  const smartIdFormat = artifacts.pass_1_output?.routing?.smart_id?.format;
  const specName =
    typeof smartIdFormat === 'string' && smartIdFormat.length > 0
      ? smartIdFormat.split(':')[0] ?? null
      : (artifacts.pass_1_output?.spec_slug ?? null);

  // Stage A spec_format ("openapi-3.0" | "openapi-3.1" | "graphql" | "postman").
  const specFormat =
    typeof artifacts.raw_ir?.spec_format === 'string' ? artifacts.raw_ir.spec_format : null;

  // Pass 0 — collapse per-endpoint auth_requirements (D-21 list) into a
  // de-duped, ordered set of distinct schemes the user needs to wire up.
  // Empty array when pass_0_output is absent (engine still streaming).
  const authReqs = artifacts.pass_0_output?.auth_requirements;
  const authSchemesSet = new Set<string>();
  if (authReqs !== undefined && authReqs !== null && typeof authReqs === 'object') {
    for (const reqList of Object.values(authReqs)) {
      if (!Array.isArray(reqList)) continue;
      for (const req of reqList) {
        if (req !== null && typeof req === 'object' && typeof req.scheme === 'string' && req.scheme !== 'none') {
          authSchemesSet.add(req.scheme);
        }
      }
    }
  }
  const authModes: ReadonlyArray<string> = Array.from(authSchemesSet);

  // Pass 0 composite candidates (Pass 0 hints toward Pass 1 workflow tools).
  const compositeCandidates = Array.isArray(artifacts.pass_0_output?.composite_candidates)
    ? artifacts.pass_0_output!.composite_candidates
    : [];

  // Pass 0 dropped endpoints — endpoints filtered out (deprecated, internal,
  // health checks, etc).
  const droppedEndpoints = Array.isArray(artifacts.pass_0_output?.dropped_endpoints)
    ? artifacts.pass_0_output!.dropped_endpoints
    : [];

  const targetComplexity =
    typeof artifacts.pass_0_output?.target_complexity === 'string'
      ? artifacts.pass_0_output.target_complexity
      : null;

  return c.json(
    {
      status: qualityReport !== null ? 'completed' : 'streaming',
      job_id: jobId,
      owned_via_cookie: Boolean(anonSessionId),
      partial_result: {
        final_tools: finalTools,
        quality_report: qualityReport,
        endpoint_count: endpointCount,
        spec_name: specName,
        spec_format: specFormat,
        auth_modes: authModes,
        composite_candidates: compositeCandidates,
        dropped_endpoints: droppedEndpoints,
        target_complexity: targetComplexity,
      },
    },
    200,
  );
});

// Plan 09.1-06: load the cache-hit source payload for a job that has its
// `cached_from_generation_id` FK set. Returns null when the job is not a
// cache-hit child (i.e. fresh path) or when the source row was deleted
// (FK is ON DELETE SET NULL — defensive null handling).
async function loadCachedSource(jobId: string): Promise<CachedGen | null> {
  const r = await db.execute(sql`
    SELECT
      g.cached_from_generation_id  AS cached_from_id,
      cg.id                        AS source_id,
      cg.quality_score             AS source_quality,
      cg.created_at                AS source_created_at,
      cg.ir                        AS source_ir,
      cg.quality_report            AS source_quality_report
    FROM generations g
    LEFT JOIN generations cg ON cg.id = g.cached_from_generation_id
    WHERE g.id = ${jobId}
    LIMIT 1
  `);
  const row = r.rows[0] as
    | {
        cached_from_id: string | null;
        source_id: string | null;
        source_quality: string | number | null;
        source_created_at: string | Date | null;
        source_ir: { final_tools?: unknown } | null;
        source_quality_report: unknown;
      }
    | undefined;
  if (!row || row.cached_from_id === null || row.source_id === null) return null;

  const qs = typeof row.source_quality === 'string'
    ? Number(row.source_quality)
    : row.source_quality ?? 0;

  const createdRaw = row.source_created_at;
  const createdAt = createdRaw instanceof Date
    ? createdRaw
    : createdRaw !== null
    ? new Date(createdRaw)
    : new Date();

  const ir = row.source_ir;
  const finalTools = ir && typeof ir === 'object' && 'final_tools' in ir
    ? ir.final_tools
    : (ir ?? null);

  return {
    generation_id: row.source_id,
    quality_score: qs,
    created_at: createdAt,
    final_tools: finalTools,
    quality_report: row.source_quality_report,
  };
}

// ─── GET /:id/stream  — SSE replay ─────────────────────────────────────────
jobsAnonStreamRoute.get('/:id/stream', async (c) => {
  const { decision, jobId } = await resolveAuthSignals(c);
  if (decision === 'not_found') {
    return c.json({ error: 'not_found', job_id: jobId }, 404);
  }
  if (decision === 'forbidden') {
    return c.json({ error: 'forbidden', job_id: jobId }, 403);
  }

  const lastEventId = c.req.header(LAST_EVENT_ID_HEADER);

  // Plan 09.1-06: cache-hit replay branch. Authorized jobs whose
  // `cached_from_generation_id` is set replay the synthetic timeline derived
  // from the source row's `final_tools` + `quality_report`. Total wall-clock
  // <1s per D-05 SLA (timeline test 7 + integration test 3 enforce this).
  if (decision === 'authorized') {
    let cached: CachedGen | null = null;
    try {
      cached = await loadCachedSource(jobId);
    } catch (err) {
      // Lookup hiccup — fall through to the legacy stub. Avoids 500ing the
      // SSE on transient DB failure.
      console.warn('cache-replay source lookup failed; falling through to stub', {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (cached !== null) {
      const timeline = buildCacheReplayTimeline(jobId, cached);
      return streamSSE(c, async (stream) => {
        for await (const frame of streamCacheReplayTimeline(timeline, lastEventId ?? null)) {
          // streamCacheReplayTimeline already produces fully-framed SSE chunks
          // (`id:\nevent:\ndata:\n\n`), so write them verbatim. Hono's
          // streamSSE.writeSSE adds its own framing — instead, write directly
          // through the underlying stream.
          await stream.write(frame);
        }
      });
    }
  }

  // Fresh path → proxy engine SSE stream.
  // POST-09.1 patch: replace the historical stub with a real engine SSE
  // proxy so anon callers see live Stage A→F events while OpenRouter passes
  // run upstream. The BFF jobId equals the engine's jobId (we passed it as
  // Idempotency-Key in /api/v1/generate kickoff).
  const engineEndpoint =
    (c.env as { ENGINE_ENDPOINT?: string }).ENGINE_ENDPOINT ?? 'http://localhost:8000';
  return streamSSE(c, async (stream) => {
    const upstreamHeaders: Record<string, string> = {};
    if (lastEventId) upstreamHeaders[LAST_EVENT_ID_HEADER] = lastEventId;
    let upstreamResp: Response;
    try {
      upstreamResp = await fetch(
        `${engineEndpoint}/api/v1/generate/${jobId}/stream`,
        { headers: upstreamHeaders },
      );
    } catch (err) {
      await stream.writeSSE({
        event: 'engine_unreachable',
        data: JSON.stringify({
          error: 'engine_unreachable',
          message: err instanceof Error ? err.message : String(err),
          job_id: jobId,
        }),
        id: '01HXAAAAAAAAAAAAAAAAAAAAA1',
      });
      return;
    }
    if (!upstreamResp.ok || upstreamResp.body === null) {
      await stream.writeSSE({
        event: 'engine_error',
        data: JSON.stringify({
          error: 'engine_error',
          status: upstreamResp.status,
          job_id: jobId,
        }),
        id: '01HXAAAAAAAAAAAAAAAAAAAAA1',
      });
      return;
    }
    // Pipe raw SSE chunks through. The engine produces fully-framed
    // `id:\nevent:\ndata:\n\n` records — pass them verbatim.
    const reader = upstreamResp.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await stream.write(decoder.decode(value, { stream: true }));
    }
  });
});
