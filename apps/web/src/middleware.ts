// apps/web/src/middleware.ts
//
// Plan 09.1-07 — Per-route auth gate per CONTEXT D-10 (Phase 9.1 anonymous
// hero flow).
//
// Public routes (anon-allowed):
//   - `/` (landing)
//   - `/generate` (paste URL form)
//   - `/generate/:jobId` (SSE progress / canvas)
//   - `/generate/:jobId/preview` (preview code screen)
//   - `/generate/:jobId/quality` (quality report)
//   - `/generate/:jobId/deploy` (ephemeral 24h deploy CTA, no `/permanent`)
//
// Protected routes (Logto session required):
//   - `/generate/:jobId/playground` (real LLM agent calls — D-01 gate)
//   - `/generate/:jobId/deploy/permanent` (claim & permanent deploy — D-08)
//   - `/generate/:jobId/download` (ZIP / Docker bundle download — D-03)
//   - `/dashboard/*` (existing — already gated)
//   - `/billing/*` (future)
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-10 routes table
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-18 (auth boundary)
//   - apps/web/src/lib/logto/client.ts (logtoConfig)
//
// Replaces the prior plan-07-02 implementation that gated `/dashboard/:path*`
// only — Phase 9.1 broadens the matcher to cover the new protected sub-routes
// while keeping the rest of /generate/* anon-friendly.

import { getLogtoContext } from '@logto/next/server-actions';
import { NextResponse, type NextRequest } from 'next/server';

import { logtoConfig } from '@/lib/logto/client';

// Patterns that REQUIRE auth. The matcher in `config.matcher` below already
// narrows the request set to these URLs; this list is the source of truth and
// is also exported for tests to assert against.
//
// IMPORTANT: order matters — `/generate/:jobId/deploy/permanent` must be
// considered before `/generate/:jobId/deploy` so the `/permanent` suffix
// match wins. The matcher excludes the public `/deploy` (no trailing /permanent)
// path entirely — see `isProtectedPath` below.
export const PROTECTED_PATTERNS: readonly RegExp[] = [
  /^\/dashboard(\/.*)?$/,
  /^\/billing(\/.*)?$/,
  /^\/generate\/[^/]+\/playground(\/.*)?$/,
  /^\/generate\/[^/]+\/download(\/.*)?$/,
  /^\/generate\/[^/]+\/deploy\/permanent(\/.*)?$/,
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATTERNS.some((re) => re.test(pathname));
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;
  if (!isProtectedPath(pathname)) {
    // Public route — let the request through without consulting Logto.
    // Anon users keep their `mcpgen_anon_session` cookie issued by the BFF
    // (plan 09.1-03) for ephemeral-deploy / cookie-scoped job reads.
    return NextResponse.next();
  }

  const { isAuthenticated } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    const url = req.nextUrl.clone();
    url.pathname = '/api/auth/logto/sign-in';
    url.searchParams.set('redirect_to', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Matcher matches the SUPERSET of protected paths so the middleware function
// only runs when a redirect is potentially needed. Public routes never invoke
// the middleware (zero Logto calls on the anon hot path).
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/billing/:path*',
    '/generate/:jobId/playground/:path*',
    '/generate/:jobId/playground',
    '/generate/:jobId/download/:path*',
    '/generate/:jobId/download',
    '/generate/:jobId/deploy/permanent/:path*',
    '/generate/:jobId/deploy/permanent',
  ],
};
