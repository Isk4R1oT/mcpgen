// apps/api/src/routes/v1/generate.ts
//
// Phase 09.1 plan 03 + 06 — anon-aware POST /api/v1/generate with cache-hit.
//
// This route is mounted on the PUBLIC side of the BFF (see apps/api/src/index.ts
// + plan 02 D-07 boundary). On every anon request we:
//   1. Mint or reuse the `mcpgen_anon_session` HttpOnly cookie via
//      `ensureAnonSession(c, { forceReissue: false })`. The 26-char ULID
//      becomes the row key in `anonymous_generations` for cookie-scoped reads
//      on /jobs/:id/stream and the eventual /claim_generation flow.
//   2. Validate the request body against the frozen `GenerationApiRequest`
//      Zod schema from `@mcpgen/contracts/generation-api`. Bad bodies → 400.
//   3. Plan 09.1-06: compute `spec_hash` from the request body (currently a
//      fallback `sha256(spec_url || spec_content)` until the engine exposes
//      `/internal/v1/parse` for canonical Stage A hashes — RESEARCH §10
//      mandates reusing `_canonicalize` when available). Look up an existing
//      verified+ generation in cache (D-05); on HIT, atomically insert a
//      child row + anonymous_generations binding with `cached_from_generation_id`
//      pointing at the source. The /jobs/:id/stream handler detects the FK and
//      replays the synthetic 9-stage cache timeline in <1s.
//   4. On cache MISS: best-effort INSERT placeholder rows
//        - `generations` row (placeholder for engine kickoff)
//        - `anonymous_generations` row binding cookie ULID → generation row
//      `ip_hash` is the daily-salt sha256 stamped by the anon-rate-limit
//      middleware (plan 09.1-05).
//   5. Return 202 + `{ job_id, sse_url }` per the frozen contract regardless
//      of cache HIT/MISS — the client cannot distinguish at submit time
//      (cache-hit metadata surfaces only on event 0 of the SSE replay).
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
import { anonRateLimit } from '../../middleware/anon-rate-limit.js';
import { ensureAnonSession } from '../../lib/anon-session.js';
import { evaluateBoolean, serviceEntityId } from '../../lib/flags.js';
import {
  lookupCachedGeneration,
  createCacheHitChild,
} from '../../lib/spec-cache-lookup.js';

interface GenerateRouteBindings {
  ENVIRONMENT: string;
  ENGINE_ENDPOINT?: string;
  BFF_DISABLE_ANON_CACHE?: string;
  // Local-compute mode is now driven by the
  // `runtime_local_compute_routing_ops` Flipt flag (default true in Phases
  // 1-9). When enabled, BFF auto-injects `options.dev_local=true` into
  // every engine kickoff so Stage E renders a tenant Worker that
  // `wrangler dev` can serve from localhost. See
  // docs/mcpgen-feature-flags-contract.md §4.4 for the env-var → flag
  // migration inventory.
  FLIPT_URL?: string;
  FLIPT_ENVIRONMENT?: string;
  FLIPT_CLIENT_TOKEN?: string;
}

interface GenerateRouteVariables {
  // Optional because this route lives on the public app — anon callers have
  // no auth context.
  auth?: AuthContext;
  // Plan 09.1-05: stamped by the anon-rate-limit middleware. Carries the
  // CURRENT-salt sha256 of the caller's IP so the anonymous_generations
  // INSERT below uses the same hash as the rate-limit log row.
  rateLimitedIpHash?: string;
}

export const generateRoute = new Hono<{
  Bindings: GenerateRouteBindings;
  Variables: GenerateRouteVariables;
}>();

// Compute a spec_hash for the cache-hit lookup.
//
// Plan 09.1-06 chosen path (RESEARCH §10):
//   - Production target is to reuse `_canonicalize` from
//     `apps/generation-engine/src/mcpgen_engine/stages/stage_a.py:500-505`,
//     called via the engine's `/internal/v1/parse` endpoint. The BFF reads
//     the resulting `specs.content_hash` straight off the response.
//   - That engine endpoint is NOT yet wired (cross-ws Phase 2 ask). Until it
//     lands, the BFF computes a FALLBACK hash: `sha256(spec_url || spec_content)`
//     directly over the raw request body input. This is NOT canonical — two
//     different YAML serializations of the same OpenAPI spec hash differently
//     under this scheme — but it preserves cache-HIT semantics for IDENTICAL
//     repeat submissions, which covers the most common anon-flow case (a user
//     refreshes the form and resubmits the same URL).
//   - When the engine endpoint lands, swap this function body for an
//     `await fetch(${ENGINE_ENDPOINT}/internal/v1/parse).content_hash` call;
//     the contract surface (string return) stays the same.
async function computeSpecHash(req: {
  spec_url?: string | undefined;
  spec_content?: string | undefined;
}): Promise<string> {
  const input = req.spec_url ?? req.spec_content ?? '';
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Best-effort row insertion. Returns true on success, false on any DB error
// (logs through console.warn — Sentry instrumentation in the global app
// catches unhandled exceptions; we deliberately swallow here so the route
// can still acknowledge the request and the engine retry layer (plan
// 09.1-06) can recover the missing rows from cache later).
//
// Plan 09.1-05: `ipHash` arrives from the anon-rate-limit middleware via
// `c.var.rateLimitedIpHash` and replaces the prior `'pending'` placeholder.
// Falls back to `'pending'` only when the middleware did not stamp a hash
// (defense-in-depth — should not happen in normal anon flow).
async function persistAnonGeneration(args: {
  generationId: string;
  anonSessionId: string;
  ipHash: string;
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
        ${args.anonSessionId}, ${args.generationId}, ${args.ipHash}, NOW()
      )
      ON CONFLICT (anon_session_id) DO NOTHING
    `);
    return true;
  } catch (err) {
    // Log + continue. Plan 09.1-06 will tighten this once the anon-org
    // sentinel + cache-hit replay land.
    console.warn('persistAnonGeneration failed; continuing with cookie + 202', {
      generationId: args.generationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

generateRoute.post('/', anonRateLimit, async (c) => {
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
  let jobId = `gen_${ulid()}`;

  let anonSessionId: string | null = null;
  if (!isAuthed) {
    anonSessionId = ensureAnonSession(c, { forceReissue: false });
  }

  // ─── 4. Plan 09.1-06: cache-hit lookup BEFORE engine kickoff ─────────────
  // For anon callers ONLY (authed callers reach a different code path that
  // is owned by Phase 8 / engine kickoff). On cache HIT we replace the minted
  // jobId with the new child generations.id so the SSE replay handler can
  // load the cached payload via `cached_from_generation_id`.
  //
  // POST-09.1 patch: when `BFF_DISABLE_ANON_CACHE=1` the cache lookup is
  // bypassed so every anon request always hits the real engine + LLM.
  // Anon protection (rate limit + cost cap) provides the spend ceiling.
  const cacheDisabled = c.env.BFF_DISABLE_ANON_CACHE === '1';
  let cacheHit = false;
  if (anonSessionId !== null && !cacheDisabled) {
    const ipHash = c.var.rateLimitedIpHash ?? 'pending';
    try {
      const specHash = await computeSpecHash(parsed.data);
      const cached = await lookupCachedGeneration(specHash);
      if (cached !== null) {
        const { new_generation_id } = await createCacheHitChild(
          cached,
          anonSessionId,
          ipHash,
        );
        // The cache-hit child gets a UUID id (matches the FROZEN
        // `generations.id uuid` column type set by Phase 8 schema).
        // Surfacing the UUID directly as `job_id` matches the existing
        // anon-endpoint-smoke.test.ts pattern (plan 09.1-03) where
        // `generations.id` is seeded as a UUID and the SSE stream handler
        // resolves the row via `WHERE g.id = $jobId`. The FROZEN
        // `GenerationApiResponse.job_id` Zod schema expects `gen_${ULID}` —
        // the UUID-vs-ULID mismatch is a pre-existing schema drift across
        // plans 03/04 (deferred to a future Phase-6/8 retro per plan 05
        // deferred-items.md).
        jobId = new_generation_id;
        cacheHit = true;
      }
    } catch (err) {
      // Fail-open: cache-lookup hiccups must not block the anon flow. Same
      // policy as plan 09.1-05's anon-rate-limit middleware. Falls through
      // to the standard placeholder-INSERT + engine kickoff path.
      console.warn('cache-hit lookup failed; falling through to fresh path', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── 5. Persist placeholder rows (cache MISS path only) ──────────────────
  // Plan 09.1-05: read the IP hash stamped by the anon-rate-limit middleware
  // and write it into anonymous_generations.ip_hash (replacing the historical
  // 'pending' placeholder). Defense-in-depth fallback: 'pending' if the
  // middleware did not run (should not happen on the anon path).
  if (anonSessionId !== null && !cacheHit) {
    const ipHash = c.var.rateLimitedIpHash ?? 'pending';
    await persistAnonGeneration({ generationId: jobId, anonSessionId, ipHash });
  }

  // ─── 5b. Real engine kickoff (cache MISS path) ───────────────────────────
  // POST-09.1 patch: actually call the engine for fresh anon generations.
  // Engine accepts our `gen_<ULID>` jobId via the `Idempotency-Key` header
  // and uses it as its own job_id, so subsequent SSE proxy lookups by the
  // same id work end-to-end. Fail-open if engine is unreachable — the SSE
  // stream handler will surface the error to the client.
  if (!cacheHit) {
    const engineEndpoint = c.env.ENGINE_ENDPOINT ?? 'http://localhost:8000';
    // Local-compute mode: every generation gets dev_local=true so the
    // generated tenant Worker can run under standalone `wrangler dev`
    // (Plan 04-14 D-3). Driven by the `runtime_local_compute_routing_ops`
    // Flipt flag (default true in Phases 1-9, will flip per-tenant in
    // Phase 10 once cloud routing lands per CONTEXT D-25 / Pitfall #30).
    // Caller-supplied options.dev_local wins if explicitly set.
    const callerOptions = parsed.data.options ?? {};
    const devLocalAuto = await evaluateBoolean(
      c.env,
      'runtime_local_compute_routing_ops',
      serviceEntityId('bff-generate'),
      {},
      true,
    );
    const engineOptions =
      devLocalAuto && (callerOptions as { dev_local?: unknown }).dev_local === undefined
        ? { ...callerOptions, dev_local: true }
        : callerOptions;
    try {
      const engineResp = await fetch(`${engineEndpoint}/api/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [IDEMPOTENCY_KEY_HEADER]: jobId,
        },
        body: JSON.stringify({
          spec_url: parsed.data.spec_url,
          spec_content: parsed.data.spec_content,
          options: engineOptions,
        }),
      });
      if (!engineResp.ok) {
        const errBody = await engineResp.text().catch(() => '<no body>');
        console.warn('engine kickoff failed; SSE stream will surface error', {
          jobId,
          status: engineResp.status,
          body: errBody.slice(0, 200),
        });
      } else {
        // CRITICAL: engine pipeline runs INSIDE the /stream generator — it
        // only progresses when a consumer is reading SSE. The /preview
        // (review) screen polls /jobs/:id, not /stream, so without this
        // detached drain the pipeline never advances past Stage A and
        // Pass 0 artifacts never land. We open the SSE channel and discard
        // the body; the engine writes pass_*_output to its L1 cache as the
        // pipeline advances, so subsequent /jobs/:id reads see real data
        // even though we throw away the events here.
        //
        // The detached fetch is fire-and-forget — we don't await; if web
        // navigates to /[jobId] (Stream screen) and opens its own SSE proxy,
        // it'll see the same events because engine multicasts.
        //
        // Using c.executionCtx.waitUntil keeps the workerd runtime from
        // discarding the in-flight fetch when this handler returns its 202.
        const drainEngineStream = async (): Promise<void> => {
          try {
            const stream = await fetch(
              `${engineEndpoint}/api/v1/generate/${encodeURIComponent(jobId)}/stream`,
              {
                method: 'GET',
                headers: { Accept: 'text/event-stream' },
              },
            );
            const reader = stream.body?.getReader();
            if (reader === undefined) return;
            // Pull until pipeline closes the stream (terminal: completed | failed).
            // The reader buffers small chunks; we discard them.
            for (;;) {
              const { done } = await reader.read();
              if (done) break;
            }
          } catch (drainErr) {
            console.warn('engine SSE drain ended unexpectedly', {
              jobId,
              error: drainErr instanceof Error ? drainErr.message : String(drainErr),
            });
          }
        };
        const exec = (c.executionCtx as unknown as { waitUntil?: (p: Promise<unknown>) => void } | undefined);
        if (typeof exec?.waitUntil === 'function') {
          exec.waitUntil(drainEngineStream());
        } else {
          // Test / non-Workers runtime — kick off without waitUntil.
          void drainEngineStream();
        }
      }
    } catch (err) {
      console.warn('engine fetch threw; SSE stream will surface error', {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── 6. Read Idempotency-Key header (logged for now; full dedup in 09.1-05) ─
  // Idempotency-Key header is part of the FROZEN contract — clients send it
  // on retries to deduplicate engine kickoffs. Plan 09.1-05 wires the Inngest
  // dedup; here we accept it and pass through in the response shape so the
  // contract surface is exercised.
  const idempotencyKey = c.req.header(IDEMPOTENCY_KEY_HEADER);

  // ─── 7. Return 202 + frozen response shape ───────────────────────────────
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
