// apps/web/src/lib/route-gate.ts
//
// Plan 09.1-07 — pure route-gate predicate per CONTEXT D-10. Extracted from
// `apps/web/src/middleware.ts` so unit tests can import the predicate without
// pulling in `@logto/next/server-actions` (which transitively imports
// `next/navigation` and breaks vitest's Node ESM resolution).
//
// The single source of truth for which paths require Logto auth.

export const PROTECTED_PATTERNS: readonly RegExp[] = [
  /^\/dashboard(\/.*)?$/,
  /^\/billing(\/.*)?$/,
  /^\/settings(\/.*)?$/,
  /^\/generate\/[^/]+\/playground(\/.*)?$/,
  /^\/generate\/[^/]+\/download(\/.*)?$/,
  /^\/generate\/[^/]+\/deploy\/permanent(\/.*)?$/,
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATTERNS.some((re) => re.test(pathname));
}
