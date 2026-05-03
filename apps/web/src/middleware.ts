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
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { routing } from '@/i18n/routing';
import { logtoConfig } from '@/lib/logto/client';
import { isProtectedPath, PROTECTED_PATTERNS } from '@/lib/route-gate';

// Phase F-i18n — locale routing middleware. Handles:
//   - locale negotiation from Accept-Language / cookie / URL prefix
//   - rewriting `/ru/dashboard` → `/dashboard` internally with locale ctx
//   - setting NEXT_LOCALE cookie so subsequent navigations remember
// Default locale ('en') has no URL prefix (`localePrefix: 'as-needed'`).
const intlMiddleware = createIntlMiddleware(routing);

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

/**
 * CI-only test override — comma-separated list of flag keys forced to `true`
 * regardless of Flipt state. Used by the visual-lock CI workflow to expose
 * `_perm`-gated routes for snapshot capture. NEVER set in production —
 * bypasses the Flipt eval graph entirely.
 *
 * Format: `MCPGEN_FLAG_OVERRIDES_ON=ui_admin_panel_perm,ui_marketplace_perm`
 */
const FLAG_OVERRIDES_ON: ReadonlySet<string> = new Set(
  (process.env.MCPGEN_FLAG_OVERRIDES_ON ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
);

/** Evaluate a Flipt boolean flag via REST. Returns `defaultValue` on any
 *  error (network, non-200, malformed body). 1.5s timeout — middleware
 *  must never block requests longer than the runtime budget. */
async function evaluateFlagEdge(flagKey: string, defaultValue: boolean): Promise<boolean> {
  if (FLAG_OVERRIDES_ON.has(flagKey)) return true;

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

/**
 * Strip a leading locale segment (e.g. `/ru/billing` → `/billing`) so
 * the existing flag/auth gate logic — which keys off un-prefixed paths
 * like `/billing` — keeps working under multi-locale routing. English
 * paths have no prefix (`localePrefix: 'as-needed'`).
 */
function stripLocalePrefix(pathname: string): string {
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue;
    if (pathname === `/${locale}`) return '/';
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  // Step 0 — non-app paths bypass the gate logic entirely. The matcher
  // already excludes /api/*, /_next/*, /_vercel/*, and static assets,
  // but auth API routes (/api/auth/logto/*) and /404 are referenced by
  // redirects below and must always pass through. Defensive guard.
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/_vercel/') ||
    pathname === '/404'
  ) {
    return NextResponse.next();
  }

  // Compute the canonical (locale-stripped) path once. All gate logic
  // operates on this so `/ru/billing` and `/billing` get treated the
  // same by the flag and auth checks.
  const canonical = stripLocalePrefix(pathname);

  // Step 1 — flag-gated paths: evaluate flag FIRST. Flag OFF → 404 rewrite
  // regardless of auth state. Flag ON → fall through to auth check.
  for (const gate of FLAG_GATES) {
    if (gate.matches(canonical)) {
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
  // session. Public routes fall through to the intl middleware.
  if (isProtectedPath(canonical)) {
    const { isAuthenticated } = await getLogtoContext(logtoConfig);
    if (!isAuthenticated) {
      const url = req.nextUrl.clone();
      url.pathname = '/api/auth/logto/sign-in';
      url.searchParams.set('redirect_to', pathname);
      return NextResponse.redirect(url);
    }
  }

  // Step 3 — locale handling. With `localePrefix: 'never'` (cookie-only),
  // we deliberately DO NOT call next-intl's middleware: even in 'never'
  // mode it adds an `x-middleware-rewrite: /${locale}` header that under
  // our flat App Router (no `[locale]` segment) yields a 404 because
  // `/en` is not a real route. Locale resolution still works because
  // layout.tsx calls `getLocale()` on the server which reads the
  // NEXT_LOCALE cookie set by `LangSwitcher` (and respects Accept-Language
  // for the first request via the request config). All routes serve the
  // user's resolved locale at the same URL — matching the canon UX where
  // `LangSwitcher` is the sole way to switch language and URLs never
  // carry a prefix.
  // The unused `intlMiddleware` import is retained for the future migration
  // to `[locale]`-segment routing if/when SEO needs URL-prefix locales.
  void intlMiddleware;
  return NextResponse.next();
}

// Phase F-i18n — the matcher now covers all app routes (excluding API,
// static assets, and Next internals) because the intl middleware needs
// to observe every navigation to set the locale cookie / handle prefix
// rewrites. The flag + auth gates short-circuit on un-protected paths
// inside the middleware function itself, so the cost is one cheap
// `isProtectedPath` call per request rather than spinning up Logto.
//
// Anon hot path stays Logto-free: the auth check only fires when the
// canonical path actually matches isProtectedPath().
//
// Pattern from next-intl docs: match everything except the listed
// exceptions. Equivalent in spirit to the prior protected-paths list,
// but allows intl to rewrite locale-prefixed URLs everywhere.
export const config = {
  matcher: [
    // Match all pathnames except for:
    //   - API routes (handled by Logto callbacks / BFF rewrites)
    //   - _next internals (build manifest, static chunks, image opt)
    //   - _vercel deployment infra
    //   - any path containing a dot (static files: .js, .css, .png, …)
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
