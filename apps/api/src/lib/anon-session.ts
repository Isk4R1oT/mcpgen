// apps/api/src/lib/anon-session.ts
//
// Phase 09.1 plan 03 — anonymous session cookie primitives.
//
// Centralizes the `mcpgen_anon_session` HttpOnly cookie helpers used by:
//   - POST /api/v1/generate (mints / rotates the cookie)
//   - GET  /api/v1/jobs/:id, GET /api/v1/jobs/:id/stream (cookie-scoped read)
//   - POST /api/v1/deploy/ephemeral (cookie-scoped read/write)
//   - POST /api/v1/claim_generation (cookie consumed + cleared on success)
//   - GET  / landing handler (cold-start fixation re-issue per T-9.1-claim)
//
// Cookie shape is locked by ANON-04:
//   Name:        mcpgen_anon_session
//   Value:       26-char Crockford-base32 ULID (regex /^[0-9A-HJKMNP-TV-Z]{26}$/)
//   Attributes:  HttpOnly; SameSite=Lax; Path=/; Max-Age=604800; Secure (prod only)
//
// Session-fixation mitigation (T-9.1-claim, CONTEXT D-04 + RESEARCH §1):
//   isColdStartLanding(c) returns true when the request has no Referer header
//   OR a Referer pointing off-origin. ensureAnonSession({ forceReissue: true })
//   minted a fresh ULID even when a valid cookie is present, closing the
//   pre-set-cookie attack window before signup.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04 (lines 107–135)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §1 (lines 80–141)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-03-PLAN.md (interfaces block)

import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { ulid } from 'ulid';

// ─── Public surface ────────────────────────────────────────────────────────
// All exports here are intentionally narrow — downstream plans (06 / 08 / 09)
// should compose against these primitives rather than touching cookies directly.

export const ANON_COOKIE_NAME = 'mcpgen_anon_session';

// 7 days per D-04 + D-06 (matches the unclaimed-anon retention window so the
// cookie expires no later than the row it points at).
const ANON_COOKIE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

// 26-char Crockford base32 alphabet (no I, L, O, U) — same regex as
// `packages/contracts/src/idempotency.ts::ULID_REGEX`. We keep a local
// constant so the cookie helper has zero contract-package dependency
// (this file is on a hot path for every anon /generate request).
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// Minimum bindings the helper reads from `c.env`. Routes that call
// ensureAnonSession do not need to declare anything more — the helper
// accepts a wide `Context` and reads `ENVIRONMENT` defensively.

interface EnsureOptions {
  forceReissue: boolean;
}

// ─── ensureAnonSession ─────────────────────────────────────────────────────
//
// Returns the caller's anon session ULID. If the request carries a valid
// cookie AND `forceReissue` is false, the existing value is returned and no
// Set-Cookie header is added (idempotent — important for repeat anon
// /generate calls within the 7-day window).
//
// On any of the following, a fresh ULID is minted and Set-Cookie is added:
//   - no cookie present
//   - cookie value fails the ULID regex (malformed / pollution attempt)
//   - forceReissue=true (caller has detected a fixation attempt)
//
// Context type: deliberately unconstrained (`Context`) so callers with
// arbitrary Bindings/Variables generic shapes can pass their `c` without a
// cast. The helper only reads `c.env.ENVIRONMENT` (string) — any narrower
// generic would force every route file to widen its Bindings to match.

export function ensureAnonSession(c: Context, opts: EnsureOptions): string {
  const existing = getCookie(c, ANON_COOKIE_NAME);
  if (!opts.forceReissue && existing && ULID_REGEX.test(existing)) {
    return existing;
  }

  const id = ulid();
  const env = c.env as { ENVIRONMENT?: string };
  setCookie(c, ANON_COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.ENVIRONMENT === 'production',
    path: '/',
    maxAge: ANON_COOKIE_MAX_AGE_SEC,
  });
  return id;
}

// ─── isColdStartLanding ────────────────────────────────────────────────────
//
// True iff the request looks like a top-level cold-start landing visit,
// which is the only point at which we re-issue the cookie defensively.
//
// Heuristic per RESEARCH §1:
//   - No Referer header  → cold start (browser landed without prior navigation
//                                       within our origin)
//   - Off-origin Referer → cold start (user clicked an external link)
//   - Same-origin Referer → user is mid-flow on our site, do NOT rotate
//
// Off-host comparison uses URL.hostname (not raw header text) to handle
// trailing slash / scheme variance robustly.

export function isColdStartLanding(c: Context): boolean {
  const referer = c.req.header('Referer');
  if (!referer) return true;
  let refHost: string;
  let ourHost: string;
  try {
    refHost = new URL(referer).hostname;
    ourHost = new URL(c.req.url).hostname;
  } catch {
    // Malformed Referer is treated as cold-start; refusing to parse + falling
    // through to "rotate" is the conservative choice for a security boundary.
    return true;
  }
  return refHost !== ourHost;
}

// ─── clearAnonSession ──────────────────────────────────────────────────────
//
// Removes the cookie by setting Max-Age=0. Used by the claim flow (plan
// 09.1-09) once the anon session is bound to an org — there is no longer a
// reason for the browser to send the anon ULID on subsequent requests.

export function clearAnonSession(c: Context): void {
  const env = c.env as { ENVIRONMENT?: string };
  setCookie(c, ANON_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.ENVIRONMENT === 'production',
    path: '/',
    maxAge: 0,
  });
}

// ─── readAnonSession ───────────────────────────────────────────────────────
//
// Pure read — returns the cookie value iff it is a valid ULID, otherwise
// null. Used by /jobs/:id, /jobs/:id/stream, /claim_generation where the
// presence of a session is consulted but no rotation should occur.

export function readAnonSession(c: Context): string | null {
  const existing = getCookie(c, ANON_COOKIE_NAME);
  if (existing && ULID_REGEX.test(existing)) return existing;
  return null;
}
