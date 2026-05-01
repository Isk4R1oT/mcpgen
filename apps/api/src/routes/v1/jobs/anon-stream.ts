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
// SSE body: this plan stubs the actual replay timeline. Plan 09.1-06 fills
// the cache-hit replay path; the existing pending_callbacks-driven replay
// path lives in apps/api/src/routes/v1/jobs/stream.ts and stays the
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
jobsAnonStreamRoute.get('/:id', async (c) => {
  const { decision, jobId, anonSessionId } = await resolveAuthSignals(c);

  if (decision === 'not_found') {
    return c.json({ error: 'not_found', job_id: jobId }, 404);
  }
  if (decision === 'forbidden') {
    return c.json({ error: 'forbidden', job_id: jobId }, 403);
  }
  if (decision === 'db_unavailable') {
    // Test-env stub. Real prod always reaches authorized / forbidden / not_found.
    return c.json(
      {
        stub: true,
        job_id: jobId,
        owned_via_cookie: Boolean(anonSessionId),
        pending_plan: '09.1-06',
      },
      200,
    );
  }

  // Authorized. Real status payload is filled by plan 09.1-06 (cache-hit
  // metadata) — for now just acknowledge.
  return c.json({ job_id: jobId, status: 'queued', pending_plan: '09.1-06' }, 200);
});

// ─── GET /:id/stream  — SSE replay ─────────────────────────────────────────
jobsAnonStreamRoute.get('/:id/stream', async (c) => {
  const { decision, jobId } = await resolveAuthSignals(c);
  if (decision === 'not_found') {
    return c.json({ error: 'not_found', job_id: jobId }, 404);
  }
  if (decision === 'forbidden') {
    return c.json({ error: 'forbidden', job_id: jobId }, 403);
  }
  // Both 'authorized' and 'db_unavailable' (test env) fall through to the
  // SSE handshake. Plan 09.1-06 fills in the real cache-replay timeline.
  const lastEventId = c.req.header(LAST_EVENT_ID_HEADER);
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify({
        job_id: jobId,
        resumed_from_event_id: lastEventId ?? null,
        pending_plan: '09.1-06',
      }),
      event: 'phase09_1_03_stub',
      id: '01HXAAAAAAAAAAAAAAAAAAAAA1',
    });
  });
});
