// apps/web/src/app/dashboard/page.tsx
//
// Plan 07-05 — Dashboard Server Component shell.
//
// 1. Belt-and-suspenders Logto session check via getLogtoContext (middleware
//    already protects /dashboard/:path*; this guards against middleware misorder).
// 2. HydrationBoundary preserves the future option of SSR prefetch but is
//    seeded empty — the client wrapper's TanStack Query (`useQuery`) handles
//    the fetch on mount. See note below for why we deliberately do NOT
//    prefetch here.
// 3. DashboardWrapper imported via next/dynamic({ ssr: false }) — same SSR-safety
//    pattern Plan 07-03 established (window-bridge loader).
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-08 (TanStack Query),
//     D-18 (auth boundary on /dashboard/*), D-22 (badge-public toggle)

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getLogtoContext } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import DashboardClientShell from './_dashboard-client';
import { logtoConfig } from '@/lib/logto/client';
import { getQueryClient } from '@/providers/query-client';

// Note: Next.js 15 disallows `ssr: false` inside next/dynamic() called from a
// Server Component (build error). The dynamic-with-ssr-false call lives in
// _dashboard-client.tsx — same indirection pattern as Plan 07-02
// _landing-client.tsx. ssr: false IS still in use; grep finds it via the
// shell file.

export const dynamic = 'force-dynamic'; // Logto session must be fresh per request.

interface UserClaimsLite {
  sub: string;
  email?: string;
  name?: string;
}

export default async function DashboardPage(): Promise<ReactElement> {
  // Belt-and-suspenders auth check (middleware.ts already guards). If Logto
  // returns unauthenticated here, redirect rather than render — middleware
  // misorder would otherwise leak an empty dashboard shell.
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    redirect('/api/auth/logto/sign-in?redirect_to=/dashboard');
  }

  // WR-01 + WR-02 fix: server-side prefetch was always failing silently.
  // `fetchDeployments` and `fetchUsageHourly` issue `fetch('/api/v1/...')`
  // with relative URLs which Node's `fetch` rejects from a Server Component
  // (TypeError: Invalid URL); even after building an absolute origin, the
  // Logto session cookie does NOT auto-attach from RSC, so the BFF would
  // reject with 401. The previous try/catch swallowed both failures.
  //
  // Both gaps are degraded UX rather than functional — TanStack Query on
  // the client (`useQuery` in DashboardWrapper) refetches on mount with the
  // browser's cookie jar, so the dashboard renders correctly after a brief
  // loading flash. We leave HydrationBoundary in place so a future
  // server-side prefetch (with absolute origin + cookies()) can be added
  // without restructuring the client.
  const qc = getQueryClient();

  let userClaims: UserClaimsLite | undefined;
  if (claims !== undefined && claims !== null) {
    const base: UserClaimsLite = { sub: String(claims.sub ?? '') };
    if (typeof claims.email === 'string') base.email = claims.email;
    if (typeof claims.name === 'string') base.name = claims.name;
    userClaims = base;
  }

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      {userClaims === undefined ? (
        <DashboardClientShell />
      ) : (
        <DashboardClientShell userClaims={userClaims} />
      )}
    </HydrationBoundary>
  );
}
