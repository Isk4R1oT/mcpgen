// apps/web/src/app/dashboard/page.tsx
//
// Plan 07-05 + M-4-ENTRY — Dashboard Server Component shell.
//
// Routing change vs. plan 07-05: /dashboard is now the multi-server LIST
// view (DashboardListWrapper). Single-server detail moved to
// /dashboard/[id]/page.tsx (DashboardWrapper). Per UI rebuild contract
// §4.4 — both screens are real defaults; no rollout flag.
//
// 1. Belt-and-suspenders Logto session check via getLogtoContext
//    (middleware already protects /dashboard/:path*; this guards against
//    middleware misorder).
// 2. HydrationBoundary preserves the future option of SSR prefetch but is
//    seeded empty — the client wrapper's TanStack Query (`useQuery`) and
//    GET /api/v1/deployments handle the fetch on mount. Server-side
//    prefetch deferred per WR-01 + WR-02 RSC-fetch limitations (see
//    plan 07-05 commentary preserved below).
// 3. DashboardListWrapper imported via next/dynamic({ ssr: false }) —
//    same SSR-safety pattern as plan 07-03.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-08 (TanStack
//     Query), D-18 (auth boundary on /dashboard/*)
//   - docs/mcpgen-frontend-rebuild-contract.md §4.4 (dashboard split)

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getLogtoContext } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import DashboardClientShell from './_dashboard-client';
import { logtoConfig } from '@/lib/logto/client';
import { getQueryClient } from '@/providers/query-client';

// Note: Next.js 15 disallows `ssr: false` inside next/dynamic() called from
// a Server Component (build error). The dynamic-with-ssr-false call lives
// in _dashboard-client.tsx — same indirection pattern as Plan 07-02
// _landing-client.tsx.

export const dynamic = 'force-dynamic'; // Logto session must be fresh per request.

interface UserClaimsLite {
  sub: string;
  email?: string;
  name?: string;
}

export default async function DashboardPage(): Promise<ReactElement> {
  // Belt-and-suspenders auth check (middleware.ts already guards). If
  // Logto returns unauthenticated, redirect rather than render — middleware
  // misorder would otherwise leak an empty dashboard shell.
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    redirect('/api/auth/logto/sign-in?redirect_to=/dashboard');
  }

  // WR-01 + WR-02 (preserved from plan 07-05): server-side prefetch via
  // fetchDeployments() is not viable from RSC because (a) relative URLs
  // are rejected by Node's fetch, and (b) the Logto session cookie does
  // not auto-attach from RSC. TanStack Query on the client refetches
  // with the browser's cookie jar after mount.
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
