// apps/api/src/middleware/anon-rate-limit.ts
//
// Phase 09.1 plan 05 — Hono middleware enforcing 1 anon generation / IP / 24h.
//
// Flow:
//   1. Auth bypass: when the request is JWT-authed (c.var.auth.organizationId
//      populated), skip the gate entirely. Authed users are subject to org-
//      level quota (Phase 8) and have no anon-rate-limit dimension.
//   2. Localhost bypass (D-02): 127.0.0.1 / ::1 / 192.168.* / 10.* skip the
//      gate so founder/CI testing is never throttled. The current-salt hash
//      is still computed and stashed on the context so the route handler can
//      use it when persisting the row (consistency with the non-bypass path).
//   3. Real path:
//      a. Compute BOTH current+previous salt hashes (`hashIpsForLookup`) —
//         the dual-hash lookup is the G-4 24h grace window mitigating the
//         salt-rotation race (Pitfall #5).
//      b. Count rows in `anon_generation_log` matching either hash within
//         the last 24h.
//      c. If count >= 1 → return 429 with the canonical
//         `{ error:'anon_rate_limit', message, signup_url:'/sign-up' }`
//         shape. The signup_url is the exact target the frontend banner
//         points to.
//      d. Else: hash the IP under the CURRENT salt only, INSERT the log row,
//         stash the hash on the context for the route handler (so the
//         eventual `anonymous_generations.ip_hash` write uses the same
//         value), and call next().
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §5
//     (lines 491-637 — full salt + hash + grace block)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md "Pitfall 5"
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-02 + D-11

import { createMiddleware } from 'hono/factory';
import { sql } from 'drizzle-orm';

import { db } from '../db.js';
import {
  extractRawIp,
  hashIpForRateLimit,
  hashIpsForLookup,
  isLocalhostIp,
} from '../lib/anon-ip-hash.js';
import type { AuthContext } from './auth.js';

// ─── Variables stamped on the Context for the route handler ────────────────

export interface AnonRateLimitVariables {
  // The CURRENT-salt hash of the request's IP. Set on every request that
  // passes the gate (including localhost bypass). Route handlers read this
  // when writing `anon_generation_log` rows so the INSERT and the gate
  // SELECT use a consistent hash.
  rateLimitedIpHash?: string;
  // Optional: also pass `auth` through unchanged so route handlers that read
  // both auth and rateLimitedIpHash can compose a single Variables type.
  auth?: AuthContext;
}

// ─── Middleware ────────────────────────────────────────────────────────────

interface CountRow {
  count: number;
}

export const anonRateLimit = createMiddleware<{
  Variables: AnonRateLimitVariables;
}>(async (c, next) => {
  // ─── 1. Skip for authed callers ──────────────────────────────────────────
  // When this middleware is mounted behind an authMiddleware sub-app,
  // `c.var.auth.organizationId` will be populated. When mounted on the
  // PUBLIC side (current case for /api/v1/generate per Phase 09.1 plan 02
  // D-07), authMiddleware does not run — so we additionally treat a Bearer
  // Authorization header as a signal "authed flow incoming" and let the
  // request through. The bearer is validated downstream by whichever route
  // handler eventually requires it (e.g. /claim_generation, /deploy/permanent).
  // This keeps anon rate-limit a single dimension that applies ONLY to
  // unauthenticated traffic, matching D-02 product intent.
  const auth = c.var.auth;
  if (auth?.organizationId) {
    return next();
  }
  const authz = c.req.header('Authorization');
  if (authz && authz.startsWith('Bearer ')) {
    return next();
  }

  // ─── 2. Localhost bypass (D-02) ──────────────────────────────────────────
  // Even on the bypass path we still try to compute and stash the IP hash so
  // the downstream route handler writes a consistent value into
  // `anonymous_generations.ip_hash`. If the salt SELECT fails (DB unavailable
  // — e.g. unit tests without DATABASE_URL), we still bypass without setting
  // the hash; the route handler falls back to the 'pending' sentinel.
  const rawIp = extractRawIp(c);
  if (isLocalhostIp(rawIp)) {
    try {
      c.set('rateLimitedIpHash', await hashIpForRateLimit(rawIp));
    } catch (err) {
      console.warn('anon-rate-limit: localhost bypass hash failed; continuing', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return next();
  }

  // ─── 3. Real check — dual-hash lookup with 24h window ────────────────────
  // Hashing requires reading the salts from app_secrets. If the DB is
  // unavailable (e.g. unit tests without DATABASE_URL or transient outage),
  // we FAIL OPEN — the gate is a per-IP throttle, not a security boundary,
  // and the cost cap on the engine layer (Phase 4/5 cost-tracker, $0.50)
  // is the real financial floor. Failing closed would block the entire
  // anon flow on any DB hiccup — a worse user-facing outcome than briefly
  // permitting an extra anon request. Rule 2 accept: aligned with the
  // best-effort write pattern in routes/v1/generate.ts (plan 03 precedent).
  let ipHashes: string[];
  try {
    ipHashes = await hashIpsForLookup(rawIp);
  } catch (err) {
    console.warn('anon-rate-limit: salts read failed; failing open', {
      error: err instanceof Error ? err.message : String(err),
    });
    return next();
  }

  let count: number;
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM anon_generation_log
      WHERE ip_hash = ANY(${ipHashes})
        AND created_at >= NOW() - INTERVAL '24 hours'
    `);
    const rows = r.rows as unknown as CountRow[];
    count = rows[0]?.count ?? 0;
  } catch (err) {
    console.warn('anon-rate-limit: count query failed; failing open', {
      error: err instanceof Error ? err.message : String(err),
    });
    return next();
  }

  if (count >= 1) {
    return c.json(
      {
        error: 'anon_rate_limit',
        message:
          'Anonymous tier limited to 1 generation per 24 hours. Sign up for 5/month free.',
        signup_url: '/sign-up',
      },
      429,
    );
  }

  // ─── 4. Allow + persist + stash hash for route handler ───────────────────
  let currentHash: string;
  try {
    currentHash = await hashIpForRateLimit(rawIp);
  } catch (err) {
    // Salt read should already have succeeded above (cache hit), but defend
    // against the case where the cache TTL expired mid-request.
    console.warn('anon-rate-limit: rate-limit hash failed; using sentinel', {
      error: err instanceof Error ? err.message : String(err),
    });
    return next();
  }
  // Best-effort INSERT — the route handler also writes
  // `anonymous_generations.ip_hash` with this same hash so the row pair stays
  // consistent. We deliberately do NOT wrap this in a transaction with the
  // route handler's writes; the gate is decision-only, and a partial failure
  // (insert succeeds, route fails) just consumes the user's daily quota with
  // no generation row to show for it — acceptable.
  try {
    await db.execute(sql`
      INSERT INTO anon_generation_log (ip_hash, created_at)
      VALUES (${currentHash}, NOW())
    `);
  } catch (err) {
    console.warn('anon_generation_log INSERT failed; continuing', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  c.set('rateLimitedIpHash', currentHash);
  return next();
});
