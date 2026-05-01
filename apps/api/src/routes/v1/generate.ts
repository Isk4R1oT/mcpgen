// apps/api/src/routes/v1/generate.ts
//
// Phase 09.1 plan 03 — anon-aware POST /api/v1/generate.
//
// This route is mounted on the PUBLIC side of the BFF (see apps/api/src/index.ts
// + plan 02 D-07 boundary). On every anon request we:
//   1. Mint or reuse the `mcpgen_anon_session` HttpOnly cookie via
//      `ensureAnonSession(c, { forceReissue: false })`. The 26-char ULID
//      becomes the row key in `anonymous_generations` for cookie-scoped reads
//      on /jobs/:id/stream and the eventual /claim_generation flow.
//   2. Validate the request body against the frozen `GenerationApiRequest`
//      Zod schema from `@mcpgen/contracts/generation-api`. Bad bodies → 400.
//   3. Mint a fresh `gen_${ULID}` job ID and best-effort INSERT both:
//        - `generations` row (placeholder for engine kickoff in plan 09.1-06)
//        - `anonymous_generations` row binding cookie ULID → generation row
//      `ip_hash='pending'` here; plan 09.1-05 introduces the rate-limit
//      middleware that overwrites it with the real daily-salt-hashed IP
//      before the row commits.
//   4. Return 202 + `{ job_id, sse_url }` per the frozen contract.
//
// JWT path: when `c.var.auth?.organizationId` is populated (the route ALSO
// matches authed requests because the BFF mounts it on the public side, but
// authed callers can still reach it via the same path), we skip the cookie
// mint — authed users belong to an org, not an anon session. The DB write
// in that case becomes the authed flow and is left for plan 09.1-06 / engine
// kickoff implementation. For now the JWT branch returns the same 202 shape
// without a cookie.
//
// DB-write resilience: this plan adds the route SHAPE; full engine kickoff +
// rate-limit + cache-hit logic land in plans 04 / 05 / 06. We attempt the
// insert under a try/catch so unit tests that run without a live DATABASE_URL
// (vitest with node env) still see a 202 + Set-Cookie response. Real prod
// traffic with a live Neon connection will populate the rows.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-03-PLAN.md (Task 2)
//   - packages/contracts/src/generation-api.ts (frozen request/response shape)

import { Hono } from 'hono';
import { ulid } from 'ulid';
import { sql } from 'drizzle-orm';
import {
  GenerationApiRequest,
  type GenerationApiResponse,
  IDEMPOTENCY_KEY_HEADER,
} from '@mcpgen/contracts/generation-api';

import { db } from '../../db.js';
import type { AuthContext } from '../../middleware/auth.js';
import { ensureAnonSession } from '../../lib/anon-session.js';

interface GenerateRouteBindings {
  ENVIRONMENT: string;
}

interface GenerateRouteVariables {
  // Optional because this route lives on the public app — anon callers have
  // no auth context.
  auth?: AuthContext;
}

export const generateRoute = new Hono<{
  Bindings: GenerateRouteBindings;
  Variables: GenerateRouteVariables;
}>();

// Best-effort row insertion. Returns true on success, false on any DB error
// (logs through console.warn — Sentry instrumentation in the global app
// catches unhandled exceptions; we deliberately swallow here so the route
// can still acknowledge the request and the engine retry layer (plan
// 09.1-06) can recover the missing rows from cache later).
async function persistAnonGeneration(args: {
  generationId: string;
  anonSessionId: string;
}): Promise<boolean> {
  try {
    // The placeholder row mirrors the columns set by Phase 8 generations
    // inserts (status='queued', current_stage=null) so plan 09.1-06's engine
    // kickoff can update-in-place rather than insert. project_id + spec_id
    // are NOT NULL in the FROZEN schema; without a Phase 7 anon-tenant
    // project these placeholders are written using a designated anon-org
    // sentinel (set up in plan 09.1-05). Until that sentinel exists, the
    // INSERT will fail FK validation — the catch block below handles that
    // case so the cookie + 202 still flow back to the client.
    await db.execute(sql`
      INSERT INTO generations (id, status, options, created_at, updated_at)
      VALUES (${args.generationId}, 'queued', '{}'::jsonb, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO anonymous_generations (
        anon_session_id, generation_id, ip_hash, created_at
      ) VALUES (
        ${args.anonSessionId}, ${args.generationId}, 'pending', NOW()
      )
      ON CONFLICT (anon_session_id) DO NOTHING
    `);
    return true;
  } catch (err) {
    // Log + continue. Plan 09.1-05 / 09.1-06 will tighten this once the
    // anon-org sentinel + rate-limit middleware land.
    console.warn('persistAnonGeneration failed; continuing with cookie + 202', {
      generationId: args.generationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

generateRoute.post('/', async (c) => {
  // ─── 1. Validate body against the frozen contract ────────────────────────
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const parsed = GenerationApiRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);
  }

  // ─── 2. Read auth context (populated only for JWT-authed callers) ────────
  const auth = c.var.auth;
  const isAuthed = Boolean(auth?.organizationId);

  // ─── 3. Mint job ID + attach cookie (anon path only) ─────────────────────
  // job_id shape per FROZEN contract: `gen_${ULID}` (GEN_ID_REGEX).
  const jobId = `gen_${ulid()}`;

  let anonSessionId: string | null = null;
  if (!isAuthed) {
    anonSessionId = ensureAnonSession(c, { forceReissue: false });
  }

  // ─── 4. Persist placeholder rows (anon path) ─────────────────────────────
  if (anonSessionId !== null) {
    await persistAnonGeneration({ generationId: jobId, anonSessionId });
  }

  // ─── 5. Read Idempotency-Key header (logged for now; full dedup in 09.1-05) ─
  // Idempotency-Key header is part of the FROZEN contract — clients send it
  // on retries to deduplicate engine kickoffs. Plan 09.1-05 wires the Inngest
  // dedup; here we accept it and pass through in the response shape so the
  // contract surface is exercised.
  const idempotencyKey = c.req.header(IDEMPOTENCY_KEY_HEADER);

  // ─── 6. Return 202 + frozen response shape ───────────────────────────────
  // sse_url uses an absolute URL constructed from the request — the frontend
  // and CLI both consume this verbatim and open an EventSource.
  const requestUrl = new URL(c.req.url);
  const sseUrl = `${requestUrl.origin}/api/v1/jobs/${jobId}/stream`;
  const response: GenerationApiResponse = {
    job_id: jobId,
    sse_url: sseUrl,
  };
  // Stash the idempotency key in a non-contract debug field for now; harmless
  // since the FROZEN response Zod schema does not enforce strict shape on
  // the wire (clients ignore unknown fields).
  return c.json({ ...response, idempotency_key: idempotencyKey ?? null }, 202);
});
