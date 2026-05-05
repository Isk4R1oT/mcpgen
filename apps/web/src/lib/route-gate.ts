// apps/web/src/lib/route-gate.ts
//
// Plan 09.1-07 — pure route-gate predicate per CONTEXT D-10. Extracted from
// `apps/web/src/middleware.ts` so unit tests can import the predicate without
// pulling in `@logto/next/server-actions` (which transitively imports
// `next/navigation` and breaks vitest's Node ESM resolution).
//
// The single source of truth for which paths require Logto auth.
//
// BUG-003 fix (2026-05-05) — `/generate/<jobId>/playground` was REMOVED
// from this list. The UX flow doc (`docs/mcpgen-ux-flow.md` §3 Screen 4)
// explicitly designates the playground as the no-auth trust-building
// moment ("До него пользователь не верит, что оно работает") — the prior
// gate redirected anonymous users to /sign-in mid-flow which directly
// contradicts that. The playground BFF (apps/api/src/routes/v1/playground.ts)
// already handles anon-cookie ownership for ULID-format job ids and
// short-circuits persistence (org_id NULL → no playground_runs INSERT),
// so removing the URL-level gate is safe.
//
// The downstream surfaces that DO require auth (claim a generation,
// permanent deploy, download bundle) keep their own gates below.
export const PROTECTED_PATTERNS: readonly RegExp[] = [
  /^\/dashboard(\/.*)?$/,
  /^\/billing(\/.*)?$/,
  /^\/settings(\/.*)?$/,
  /^\/generate\/[^/]+\/download(\/.*)?$/,
  /^\/generate\/[^/]+\/deploy\/permanent(\/.*)?$/,
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATTERNS.some((re) => re.test(pathname));
}
