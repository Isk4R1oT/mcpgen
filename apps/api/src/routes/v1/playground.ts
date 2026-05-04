// apps/api/src/routes/v1/playground.ts
//
// Phase 11 — playground execution BFF.
//
// Replaces the Phase 09.1 stub (`{ stub: true, pending_plan: '09.1-03' }`)
// with the real BFF surface for the live playground:
//
//   POST   /api/v1/playground/sessions/:generationId        → ensure sandbox
//   POST   /api/v1/playground/:generationId/invoke          → SSE proxy +
//                                                             persist run
//   GET    /api/v1/playground/:generationId/runs            → history rail
//   DELETE /api/v1/playground/sessions/:generationId        → teardown
//
// All endpoints sit behind the user-JWT auth gate (mounted via
// `protectedApp.route('/playground', ...)` in `apps/api/src/index.ts`) so
// `c.var.auth.organizationId` is non-null and the per-request
// `generationBelongsToOrg` check refuses cross-org access.
//
// SSE proxy strategy (mirrors the existing `anon-stream.ts` pattern):
// - Engine emits hand-rolled SSE frames (`id:\nevent:\ndata:\n\n`).
// - We pipe the bytes through verbatim while side-streaming a parallel
//   tail-buffer of frame text. When the buffer contains a `done` event, we
//   parse its JSON payload and write a single row into `playground_runs`.
//   The DB write happens AFTER we forward `done` to the client so the UI
//   never blocks on the DB round-trip.

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sql } from 'drizzle-orm';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { playground_runs, playground_tests } from '@mcpgen/contracts/db-schema';

import { db } from '../../db.js';
import { readAnonSession } from '../../lib/anon-session.js';
import type { AuthContext } from '../../middleware/auth.js';

interface PlaygroundBindings {
  ENGINE_ENDPOINT?: string;
}

export const playgroundRoute = new Hono<{
  Bindings: PlaygroundBindings;
  Variables: { auth?: AuthContext };
}>();

// ─── Auth ──────────────────────────────────────────────────────────────────
//
// Playground is mounted on the PUBLIC anon-allowed path
// (`app.route('/api/v1/playground', ...)`) so the anonymous hero flow —
// generate → playground without sign-in — actually works. Per-handler
// authorization mirrors the `/jobs/:id` pattern: a generation is owned by
// its anon-cookie session OR (post-claim) by a user's org via the JWT.
// `org_id` is only available for JWT callers; anon callers operate against
// the engine but don't persist runs / tests (the playground_runs table
// requires NOT NULL org_id — anon history is intentionally session-only).
interface PgAuthAuthorized {
  ok: true;
  // Set when caller carries a Logto JWT with an org_id; null when caller
  // is anon-cookie-only — handlers that need persistence MUST short-circuit
  // when `orgId === null`.
  orgId: string | null;
}
interface PgAuthRefused {
  ok: false;
  status: 403 | 404;
  body: { error: string; reason?: string };
}

async function authorizePlaygroundAccess(
  c: import('hono').Context<{
    Bindings: PlaygroundBindings;
    Variables: { auth?: AuthContext };
  }>,
  generationId: string,
): Promise<PgAuthAuthorized | PgAuthRefused> {
  const auth = (c.var as { auth?: AuthContext }).auth;
  const jwtOrgId = auth?.organizationId ?? null;
  const anonSessionId = readAnonSession(c);

  // Single round-trip — pull the join columns we need to make the decision.
  // LEFT JOIN because permanent (claimed) generations may not have an
  // anonymous_generations row anymore after row-level cleanup.
  const r = await db.execute(sql`
    SELECT
      g.id                       AS gen_id,
      ag.anon_session_id          AS anon_session_id,
      ag.claimed_by_org_id        AS claimed_by_org_id
    FROM generations g
    LEFT JOIN anonymous_generations ag ON ag.generation_id = g.id
    WHERE g.id = ${generationId}
    LIMIT 1
  `);
  const row = r.rows[0] as
    | { gen_id: string; anon_session_id: string | null; claimed_by_org_id: string | null }
    | undefined;
  if (!row) return { ok: false, status: 404, body: { error: 'not_found' } };

  const ownsViaCookie =
    anonSessionId !== null && row.anon_session_id === anonSessionId;
  const ownsViaJwt =
    jwtOrgId !== null && row.claimed_by_org_id === jwtOrgId;

  if (!ownsViaCookie && !ownsViaJwt) {
    // 404 (not 403) per T-9-bff-auth-07 — never confirm existence of a
    // foreign-org generation to the caller.
    return { ok: false, status: 404, body: { error: 'not_found' } };
  }

  return { ok: true, orgId: ownsViaJwt ? jwtOrgId : null };
}

function getEngineEndpoint(c: { env: PlaygroundBindings }): string {
  return c.env.ENGINE_ENDPOINT ?? 'http://localhost:8000';
}

interface PersistRunInput {
  generationId: string;
  orgId: string;
  prompt: string;
  pinnedTool: string | null;
  donePayload: unknown;
}

interface DonePayloadShape {
  status?: unknown;
  failure_reason?: unknown;
  total_in_tk?: unknown;
  total_out_tk?: unknown;
  total_lat_ms?: unknown;
  agent_reply?: unknown;
  traces?: unknown;
}

function coerceInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v));
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

async function persistRun(input: PersistRunInput): Promise<void> {
  const payload = (input.donePayload ?? {}) as DonePayloadShape;
  const status = typeof payload.status === 'string' ? payload.status : 'failed';
  const failureReason =
    typeof payload.failure_reason === 'string' && payload.failure_reason.length > 0
      ? payload.failure_reason
      : null;
  const traces = Array.isArray(payload.traces) ? payload.traces : [];
  const agentReply = typeof payload.agent_reply === 'string' ? payload.agent_reply : null;
  try {
    await db.insert(playground_runs).values({
      id: crypto.randomUUID(),
      generation_id: input.generationId,
      org_id: input.orgId,
      prompt: input.prompt,
      pinned_tool: input.pinnedTool,
      agent_reply: agentReply,
      trace: traces,
      total_in_tk: coerceInt(payload.total_in_tk),
      total_out_tk: coerceInt(payload.total_out_tk),
      total_lat_ms: coerceInt(payload.total_lat_ms),
      status,
      failure_reason: failureReason,
    });
  } catch (err) {
    // Don't fail the user-facing SSE on DB hiccups — UI already received
    // the `done` event with the live trace; persistence is best-effort
    // for the history rail. Surface the error in BFF logs.
    // eslint-disable-next-line no-console
    console.warn('[playground] persistRun failed', {
      generationId: input.generationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Parse hand-rolled SSE frames out of a rolling text buffer. Returns
// the LAST `done` payload seen (frontend may not need any earlier
// frames — engine's `done` is terminal) and the trailing partial frame
// that still needs more bytes.
interface ParsedFrame {
  event: string;
  data: string;
}

function splitFrames(buffer: string): { frames: ParsedFrame[]; trailing: string } {
  const out: ParsedFrame[] = [];
  let cursor = 0;
  while (true) {
    const sep = buffer.indexOf('\n\n', cursor);
    if (sep === -1) break;
    const block = buffer.slice(cursor, sep);
    cursor = sep + 2;
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data += line.slice(6);
    }
    out.push({ event, data });
  }
  return { frames: out, trailing: buffer.slice(cursor) };
}

// ─── Validators ────────────────────────────────────────────────────────────

const InvokeBodySchema = z.object({
  prompt: z.string().trim().min(1).max(8192),
  pinned_tool: z.string().trim().min(1).max(128).optional(),
});
type InvokeBody = z.infer<typeof InvokeBodySchema>;

// ─── POST /sessions/:generationId — ensure sandbox ─────────────────────────

playgroundRoute.post('/sessions/:generationId', async (c) => {
  const generationId = c.req.param('generationId');
  const auth = await authorizePlaygroundAccess(c, generationId);
  if (!auth.ok) return c.json(auth.body, auth.status);

  const engineUrl = getEngineEndpoint(c);
  let upstream: Response;
  try {
    upstream = await fetch(`${engineUrl}/api/v1/playground/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: generationId }),
    });
  } catch (err) {
    return c.json(
      {
        error: 'engine_unreachable',
        message: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }
  const text = await upstream.text();
  if (!upstream.ok) {
    return c.json(
      { error: 'engine_error', status: upstream.status, body: text },
      upstream.status === 404 ? 404 : 502,
    );
  }
  return c.body(text, 200, { 'Content-Type': 'application/json' });
});

// ─── POST /:generationId/invoke — SSE proxy + persist ──────────────────────

playgroundRoute.post(
  '/:generationId/invoke',
  zValidator('json', InvokeBodySchema),
  async (c) => {
    const generationId = c.req.param('generationId');
    const auth = await authorizePlaygroundAccess(c, generationId);
    if (!auth.ok) return c.json(auth.body, auth.status);

    const body: InvokeBody = c.req.valid('json');
    const pinnedTool = body.pinned_tool ?? null;
    const engineUrl = getEngineEndpoint(c);

    return streamSSE(c, async (stream) => {
      let upstream: Response;
      try {
        upstream = await fetch(
          `${engineUrl}/api/v1/playground/sessions/${encodeURIComponent(generationId)}/invoke`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: body.prompt,
              ...(pinnedTool !== null ? { pinned_tool: pinnedTool } : {}),
            }),
          },
        );
      } catch (err) {
        await stream.writeSSE({
          event: 'engine_unreachable',
          data: JSON.stringify({
            error: 'engine_unreachable',
            message: err instanceof Error ? err.message : String(err),
          }),
        });
        return;
      }
      if (!upstream.ok || upstream.body === null) {
        const errBody = await upstream.text().catch(() => '');
        await stream.writeSSE({
          event: 'engine_error',
          data: JSON.stringify({ status: upstream.status, body: errBody }),
        });
        return;
      }

      // Pipe upstream SSE bytes verbatim. Tap the stream into a parallel
      // text buffer so we can intercept the `done` frame for DB persistence.
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let donePayload: unknown = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        textBuffer += chunk;
        await stream.write(chunk);
        const { frames, trailing } = splitFrames(textBuffer);
        textBuffer = trailing;
        for (const frame of frames) {
          if (frame.event === 'done') {
            try {
              donePayload = JSON.parse(frame.data);
            } catch {
              donePayload = null;
            }
          }
        }
      }

      // Best-effort persistence — never fail the SSE response on DB error.
      // Anonymous callers (no org_id) skip persistence; their playground
      // history is session-only by design (playground_runs.org_id is NOT
      // NULL — anon flow can still test the agent loop, just without a
      // persistent history rail across page reloads).
      if (donePayload !== null && auth.orgId !== null) {
        await persistRun({
          generationId,
          orgId: auth.orgId,
          prompt: body.prompt,
          pinnedTool,
          donePayload,
        });
      }
    });
  },
);

// ─── GET /:generationId/runs — history rail ────────────────────────────────

playgroundRoute.get('/:generationId/runs', async (c) => {
  const generationId = c.req.param('generationId');
  const auth = await authorizePlaygroundAccess(c, generationId);
  if (!auth.ok) return c.json(auth.body, auth.status);
  // Anonymous callers don't persist runs (org_id required) — return an
  // empty list rather than 401 so the UI degrades gracefully.
  if (auth.orgId === null) return c.json({ runs: [] });

  const rows = await db
    .select({
      id: playground_runs.id,
      prompt: playground_runs.prompt,
      pinned_tool: playground_runs.pinned_tool,
      agent_reply: playground_runs.agent_reply,
      trace: playground_runs.trace,
      total_in_tk: playground_runs.total_in_tk,
      total_out_tk: playground_runs.total_out_tk,
      total_lat_ms: playground_runs.total_lat_ms,
      status: playground_runs.status,
      failure_reason: playground_runs.failure_reason,
      created_at: playground_runs.created_at,
    })
    .from(playground_runs)
    .where(
      and(
        eq(playground_runs.generation_id, generationId),
        eq(playground_runs.org_id, auth.orgId),
      ),
    )
    .orderBy(desc(playground_runs.created_at))
    .limit(50);

  // Attach saved-as-test flag by joining playground_tests on source_run_id.
  // Keep it simple — one extra SELECT IN clause; 50-row cap means tiny.
  const ids = rows.map((r) => r.id);
  let savedRunIds = new Set<string>();
  if (ids.length > 0) {
    const savedRows = await db.execute(sql`
      SELECT source_run_id
      FROM playground_tests
      WHERE org_id = ${auth.orgId}
        AND source_run_id = ANY(${ids})
    `);
    savedRunIds = new Set(
      (savedRows.rows as Array<{ source_run_id: string | null }>)
        .map((r) => r.source_run_id)
        .filter((x): x is string => typeof x === 'string'),
    );
  }

  return c.json({
    runs: rows.map((r) => ({
      ...r,
      saved_as_test: savedRunIds.has(r.id),
    })),
  });
});

// ─── DELETE /sessions/:generationId — teardown ─────────────────────────────

playgroundRoute.delete('/sessions/:generationId', async (c) => {
  const generationId = c.req.param('generationId');
  const auth = await authorizePlaygroundAccess(c, generationId);
  if (!auth.ok) return c.json(auth.body, auth.status);

  const engineUrl = getEngineEndpoint(c);
  try {
    const r = await fetch(
      `${engineUrl}/api/v1/playground/sessions/${encodeURIComponent(generationId)}`,
      { method: 'DELETE' },
    );
    const text = await r.text();
    return c.body(text, r.status === 200 ? 200 : 502, {
      'Content-Type': 'application/json',
    });
  } catch (err) {
    return c.json(
      {
        error: 'engine_unreachable',
        message: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }
});

// ─── Tests (save-as-test + suite execution) ────────────────────────────────

const SaveTestBodySchema = z.object({
  run_id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
});

interface TraceShape {
  readonly name?: string;
}

function extractToolNamesFromTrace(trace: unknown): string[] {
  if (!Array.isArray(trace)) return [];
  const out: string[] = [];
  for (const t of trace) {
    if (t !== null && typeof t === 'object' && typeof (t as TraceShape).name === 'string') {
      out.push((t as { name: string }).name);
    }
  }
  return out;
}

function shortLabel(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length > 40 ? `${trimmed.slice(0, 38)}…` : trimmed;
}

// POST /:generationId/tests — save a successful run as a regression test.
playgroundRoute.post(
  '/:generationId/tests',
  zValidator('json', SaveTestBodySchema),
  async (c) => {
    const generationId = c.req.param('generationId');
    const auth = await authorizePlaygroundAccess(c, generationId);
    if (!auth.ok) return c.json(auth.body, auth.status);
    if (auth.orgId === null) {
      // Anonymous callers can't persist tests (org_id NOT NULL) — saving a
      // test requires sign-in to attach the row to an org.
      return c.json(
        { error: 'unauthorized', reason: 'sign_in_to_save_tests' },
        401,
      );
    }

    const { run_id: runId, name: providedName } = c.req.valid('json');

    const [runRow] = await db
      .select({
        id: playground_runs.id,
        prompt: playground_runs.prompt,
        trace: playground_runs.trace,
        status: playground_runs.status,
      })
      .from(playground_runs)
      .where(
        and(
          eq(playground_runs.id, runId),
          eq(playground_runs.generation_id, generationId),
          eq(playground_runs.org_id, auth.orgId),
        ),
      )
      .limit(1);

    if (!runRow) return c.json({ error: 'not_found', reason: 'run_missing' }, 404);
    if (runRow.status !== 'ok') {
      return c.json(
        { error: 'invalid_state', reason: 'cannot_save_failed_run_as_test' },
        400,
      );
    }
    const expectedTools = extractToolNamesFromTrace(runRow.trace);
    if (expectedTools.length === 0) {
      return c.json(
        { error: 'invalid_state', reason: 'run_has_no_tool_calls' },
        400,
      );
    }

    const id = crypto.randomUUID();
    const name = providedName ?? shortLabel(runRow.prompt);
    await db.insert(playground_tests).values({
      id,
      generation_id: generationId,
      org_id: auth.orgId,
      source_run_id: runRow.id,
      name,
      prompt: runRow.prompt,
      expected_tools: expectedTools,
      last_status: null,
    });
    return c.json({ id, name, expected_tools: expectedTools }, 201);
  },
);

// GET /:generationId/tests — list saved tests for the playground rail.
playgroundRoute.get('/:generationId/tests', async (c) => {
  const generationId = c.req.param('generationId');
  const auth = await authorizePlaygroundAccess(c, generationId);
  if (!auth.ok) return c.json(auth.body, auth.status);
  // Anonymous callers don't have persisted tests — return an empty list
  // so the UI degrades gracefully (chip-row hides, suite stays disabled).
  if (auth.orgId === null) return c.json({ tests: [] });

  const rows = await db
    .select({
      id: playground_tests.id,
      name: playground_tests.name,
      prompt: playground_tests.prompt,
      expected_tools: playground_tests.expected_tools,
      last_status: playground_tests.last_status,
      last_run_at: playground_tests.last_run_at,
      last_failure: playground_tests.last_failure,
      created_at: playground_tests.created_at,
    })
    .from(playground_tests)
    .where(
      and(
        eq(playground_tests.generation_id, generationId),
        eq(playground_tests.org_id, auth.orgId),
      ),
    )
    .orderBy(desc(playground_tests.created_at))
    .limit(100);

  return c.json({ tests: rows });
});

// DELETE /:generationId/tests/:testId — drop a saved test.
playgroundRoute.delete('/:generationId/tests/:testId', async (c) => {
  const generationId = c.req.param('generationId');
  const auth = await authorizePlaygroundAccess(c, generationId);
  if (!auth.ok) return c.json(auth.body, auth.status);
  if (auth.orgId === null) {
    return c.json({ error: 'unauthorized', reason: 'sign_in_to_manage_tests' }, 401);
  }
  const testId = c.req.param('testId');
  await db
    .delete(playground_tests)
    .where(
      and(
        eq(playground_tests.id, testId),
        eq(playground_tests.org_id, auth.orgId),
      ),
    );
  return c.json({ id: testId, deleted: true });
});

// ─── Run suite ─────────────────────────────────────────────────────────────
//
// Sequential execution against the live engine playground session. We hit
// `/sessions/{job}/invoke` per saved test, parse the `done` event, diff
// the actually-invoked tool sequence against `expected_tools`. Pass = the
// expected set is a subset of the actual set (agent may invoke MORE — that
// often means it added a verification step, which is fine). Fail = at least
// one expected tool was never invoked → friendly hint surfaces the missing
// tool plus the closest substitute the agent picked.

interface SuiteRunResult {
  test_id: string;
  name: string;
  status: 'pass' | 'fail';
  expected_tools: string[];
  actual_tools: string[];
  failure?: {
    missing_tool: string;
    actual_tool: string | null;
    hint: string;
  };
  duration_ms: number;
}

async function invokeForSuite(
  engineUrl: string,
  generationId: string,
  prompt: string,
): Promise<{ ok: true; traces: unknown[] } | { ok: false; reason: string }> {
  let resp: Response;
  try {
    resp = await fetch(
      `${engineUrl}/api/v1/playground/sessions/${encodeURIComponent(generationId)}/invoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      },
    );
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'engine_unreachable' };
  }
  if (!resp.ok || resp.body === null) {
    return { ok: false, reason: `engine_${resp.status}` };
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: { traces?: unknown[] } | null = null;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    while (true) {
      const sep = buffer.indexOf('\n\n');
      if (sep === -1) break;
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (event === 'done' && data !== '') {
        try {
          done = JSON.parse(data);
        } catch {
          // ignore — partial frame
        }
      }
    }
  }
  if (done === null) return { ok: false, reason: 'no_done_event' };
  return {
    ok: true,
    traces: Array.isArray(done.traces) ? done.traces : [],
  };
}

playgroundRoute.post('/:generationId/tests/run', async (c) => {
  const generationId = c.req.param('generationId');
  const auth = await authorizePlaygroundAccess(c, generationId);
  if (!auth.ok) return c.json(auth.body, auth.status);
  if (auth.orgId === null) {
    // No persisted tests for anon callers → nothing to run.
    return c.json({ tests: [], summary: { total: 0, passed: 0, failed: 0 } });
  }

  const tests = await db
    .select({
      id: playground_tests.id,
      name: playground_tests.name,
      prompt: playground_tests.prompt,
      expected_tools: playground_tests.expected_tools,
    })
    .from(playground_tests)
    .where(
      and(
        eq(playground_tests.generation_id, generationId),
        eq(playground_tests.org_id, auth.orgId),
      ),
    );

  if (tests.length === 0) {
    return c.json({ tests: [], summary: { total: 0, passed: 0, failed: 0 } });
  }

  const engineUrl = getEngineEndpoint(c);
  const results: SuiteRunResult[] = [];

  // Sequential — Anthropic per-org rate limits + the wrangler-dev sandbox
  // is single-isolate (parallel calls would race on shared Worker state).
  for (const test of tests) {
    const expected = Array.isArray(test.expected_tools)
      ? (test.expected_tools as unknown[]).filter(
          (x): x is string => typeof x === 'string',
        )
      : [];
    const startedAt = Date.now();
    const result = await invokeForSuite(engineUrl, generationId, test.prompt);
    const durationMs = Date.now() - startedAt;

    if (!result.ok) {
      const failure = {
        missing_tool: expected[0] ?? '(none)',
        actual_tool: null,
        hint: `engine call failed: ${result.reason}`,
      };
      await db
        .update(playground_tests)
        .set({
          last_status: 'fail',
          last_run_at: new Date(),
          last_failure: failure,
        })
        .where(eq(playground_tests.id, test.id));
      results.push({
        test_id: test.id,
        name: test.name,
        status: 'fail',
        expected_tools: expected,
        actual_tools: [],
        failure,
        duration_ms: durationMs,
      });
      continue;
    }

    const actual = extractToolNamesFromTrace(result.traces);
    const actualSet = new Set(actual);
    const missing = expected.filter((t) => !actualSet.has(t));
    const passed = missing.length === 0;

    if (passed) {
      await db
        .update(playground_tests)
        .set({ last_status: 'pass', last_run_at: new Date(), last_failure: null })
        .where(eq(playground_tests.id, test.id));
      results.push({
        test_id: test.id,
        name: test.name,
        status: 'pass',
        expected_tools: expected,
        actual_tools: actual,
        duration_ms: durationMs,
      });
    } else {
      const missingTool = missing[0]!;
      // Friendly hint: surface the expected tool + the actual first tool
      // the agent picked instead. UI can prefix with a copywriter-friendly
      // sentence explaining what likely went wrong (description overlap).
      const actualTool =
        actual.find((t) => !expected.includes(t)) ?? actual[0] ?? null;
      const hint =
        actualTool !== null
          ? `expected '${missingTool}', agent picked '${actualTool}' — descriptions may overlap`
          : `expected '${missingTool}', agent did not invoke any matching tool`;
      const failure = { missing_tool: missingTool, actual_tool: actualTool, hint };
      await db
        .update(playground_tests)
        .set({ last_status: 'fail', last_run_at: new Date(), last_failure: failure })
        .where(eq(playground_tests.id, test.id));
      results.push({
        test_id: test.id,
        name: test.name,
        status: 'fail',
        expected_tools: expected,
        actual_tools: actual,
        failure,
        duration_ms: durationMs,
      });
    }
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  return c.json({
    tests: results,
    summary: { total: results.length, passed, failed: results.length - passed },
  });
});

// `sql` is imported above but only used by inline helpers in this file —
// keep the import to avoid a regression if a future helper needs raw SQL.
void sql;
