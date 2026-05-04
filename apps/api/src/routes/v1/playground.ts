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
import { playground_runs } from '@mcpgen/contracts/db-schema';

import { db } from '../../db.js';
import { generationBelongsToOrg } from '../../lib/auth-helpers.js';
import type { AuthContext } from '../../middleware/auth.js';

interface PlaygroundBindings {
  ENGINE_ENDPOINT?: string;
}

export const playgroundRoute = new Hono<{
  Bindings: PlaygroundBindings;
  Variables: { auth: AuthContext };
}>();

// ─── Helpers ───────────────────────────────────────────────────────────────

interface UserAuth {
  organizationId: string;
}

function ensureUserAuth(
  auth: AuthContext,
):
  | { ok: true; userAuth: UserAuth }
  | { ok: false; status: 401 | 403 | 400; body: { error: string; reason: string } } {
  if (auth.isM2M) {
    return {
      ok: false,
      status: 403,
      body: { error: 'forbidden', reason: 'm2m_cannot_use_playground' },
    };
  }
  if (auth.subject.length === 0) {
    return {
      ok: false,
      status: 401,
      body: { error: 'unauthorized', reason: 'missing_subject' },
    };
  }
  if (!auth.organizationId) {
    return {
      ok: false,
      status: 400,
      body: { error: 'no_org_context', reason: 'organization_id_missing' },
    };
  }
  return { ok: true, userAuth: { organizationId: auth.organizationId } };
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
  const guard = ensureUserAuth(c.var.auth);
  if (!guard.ok) return c.json(guard.body, guard.status);
  const generationId = c.req.param('generationId');
  const owns = await generationBelongsToOrg(generationId, guard.userAuth.organizationId);
  if (!owns) return c.json({ error: 'not_found' }, 404);

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
    const guard = ensureUserAuth(c.var.auth);
    if (!guard.ok) return c.json(guard.body, guard.status);
    const generationId = c.req.param('generationId');
    const owns = await generationBelongsToOrg(generationId, guard.userAuth.organizationId);
    if (!owns) return c.json({ error: 'not_found' }, 404);

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
      if (donePayload !== null) {
        await persistRun({
          generationId,
          orgId: guard.userAuth.organizationId,
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
  const guard = ensureUserAuth(c.var.auth);
  if (!guard.ok) return c.json(guard.body, guard.status);
  const generationId = c.req.param('generationId');
  const owns = await generationBelongsToOrg(generationId, guard.userAuth.organizationId);
  if (!owns) return c.json({ error: 'not_found' }, 404);

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
        eq(playground_runs.org_id, guard.userAuth.organizationId),
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
      WHERE org_id = ${guard.userAuth.organizationId}
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
  const guard = ensureUserAuth(c.var.auth);
  if (!guard.ok) return c.json(guard.body, guard.status);
  const generationId = c.req.param('generationId');
  const owns = await generationBelongsToOrg(generationId, guard.userAuth.organizationId);
  if (!owns) return c.json({ error: 'not_found' }, 404);

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
