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
//   - `/billing/*` (future, also flag-gated below)
//
// Flag-gated routes (Phase 9.2 E2E fix):
//   - `/billing/:path*` → `ui_billing_active_perm`
//   - `/admin/:path*`   → `ui_admin_panel_perm`
//
// IMPORTANT — ordering: when a route is BOTH flag-gated AND auth-protected,
// we MUST evaluate the flag BEFORE consulting Logto. Otherwise an
// unauthenticated visitor to `/billing` (flag OFF) is bounced to the Logto
// OIDC sign-in URL instead of the canon-styled 404, which (a) breaks the
// flag-OFF 404 contract and (b) can land on a broken Logto callback when
// the deployment doesn't have Logto configured. Flag-OFF must always 404
// regardless of auth state. Reported by E2E (Phase 9.2).
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-10 routes table
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-18 (auth boundary)
//   - apps/web/src/lib/logto/client.ts (logtoConfig)
//   - apps/api/src/lib/flags.ts (REST eval pattern, identical to here)
//   - docs/mcpgen-feature-flags-contract.md §3.2 (REST mode rationale)
//
// Replaces the prior plan-07-02 implementation that gated `/dashboard/:path*`
// only — Phase 9.1 broadens the matcher to cover the new protected sub-routes
// while keeping the rest of /generate/* anon-friendly. Phase 9.2 adds the
// flag-first-then-auth ordering for `/billing/*` and `/admin/*`.

import { getLogtoContext } from '@logto/next/server-actions';
import { NextResponse, type NextRequest } from 'next/server';

import { logtoConfig } from '@/lib/logto/client';
import { isProtectedPath, PROTECTED_PATTERNS } from '@/lib/route-gate';

// Re-export the predicate + pattern list so any tooling (and the existing
// callers) can read them from the canonical middleware module.
export { isProtectedPath, PROTECTED_PATTERNS };

// --- Flag-gated paths ---------------------------------------------------
//
// Each entry maps a path-prefix predicate to the Flipt boolean flag key
// that controls whether the route is reachable. When the flag is OFF the
// middleware rewrites to /404 (not-found) so the user sees the canon 404
// rather than being redirected into the auth flow.
//
// Edge runtime requires `fetch`-based eval (the WASM client doesn't bundle
// cleanly under Edge — same constraint as apps/api/src/lib/flags.ts).

interface FlagGate {
  readonly matches: (pathname: string) => boolean;
  readonly flagKey: string;
}

const FLAG_GATES: ReadonlyArray<FlagGate> = [
  {
    matches: (p): boolean => p === '/billing' || p.startsWith('/billing/'),
    flagKey: 'ui_billing_active_perm',
  },
  {
    matches: (p): boolean => p === '/admin' || p.startsWith('/admin/'),
    flagKey: 'ui_admin_panel_perm',
  },
];

interface FliptBooleanResponse {
  enabled?: boolean;
}

/** Evaluate a Flipt boolean flag via REST. Returns `defaultValue` on any
 *  error (network, non-200, malformed body). 1.5s timeout — middleware
 *  must never block requests longer than the runtime budget. */
async function evaluateFlagEdge(flagKey: string, defaultValue: boolean): Promise<boolean> {
  const url = process.env.FLIPT_URL ?? 'http://localhost:8090';
  const token = process.env.FLIPT_CLIENT_TOKEN;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${url}/evaluate/v1/boolean`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        namespaceKey: 'default',
        flagKey,
        entityId: 'anonymous',
        context: {},
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return defaultValue;
    const data = (await res.json()) as FliptBooleanResponse;
    return typeof data.enabled === 'boolean' ? data.enabled : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  // Step 1 — flag-gated paths: evaluate flag FIRST. Flag OFF → 404 rewrite
  // regardless of auth state. Flag ON → fall through to auth check.
  for (const gate of FLAG_GATES) {
    if (gate.matches(pathname)) {
      const enabled = await evaluateFlagEdge(gate.flagKey, false);
      if (!enabled) {
        // Rewrite to /404 — Next.js renders the custom not-found.tsx with
        // a 404 status. Unlike `redirect`, this preserves the requested URL
        // in the address bar and avoids leaking the gated path's existence.
        const notFoundUrl = req.nextUrl.clone();
        notFoundUrl.pathname = '/404';
        return NextResponse.rewrite(notFoundUrl, { status: 404 });
      }
      break;
    }
  }

  // Step 2 — auth gate: protected paths require an authenticated Logto
  // session. Public routes return early (no Logto call).
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

// Matcher matches the SUPERSET of protected + flag-gated paths so the
// middleware function only runs when a redirect/rewrite is potentially
// needed. Public routes never invoke the middleware (zero Logto calls on
// the anon hot path).
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/billing/:path*',
    '/admin/:path*',
    '/generate/:jobId/playground/:path*',
    '/generate/:jobId/playground',
    '/generate/:jobId/download/:path*',
    '/generate/:jobId/download',
    '/generate/:jobId/deploy/permanent/:path*',
    '/generate/:jobId/deploy/permanent',
  ],
};
