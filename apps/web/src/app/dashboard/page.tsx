// apps/web/src/app/dashboard/page.tsx
//
// Phase 2 / Agent B2 — multi-server Dashboard list (Server Component shell).
//
// Renders the production `<DashboardList>` from
// `@/components/screens/dashboard-list/dashboard-list` with Logto-resolved
// claims threaded through. Single-server detail moved to
// `/dashboard/[id]/page.tsx`.
//
// 1. Belt-and-suspenders Logto session check via `getLogtoContext`. The
//    middleware already protects `/dashboard/:path*` (per Phase 0
//    middleware setup) — this guard is a safety net against middleware
//    misorder so we never leak an authenticated UI to anonymous traffic.
// 2. `HydrationBoundary` is mounted but seeded empty: WR-01/WR-02 still
//    apply (RSC fetch can't carry the Logto cookie + relative URL is
//    rejected by Node's fetch). The client island fetches via
//    `useDashboardSummary()` after mount.
// 3. The `DashboardList` body is a client component (uses TanStack Query
//    + `useState`); we import it directly here — Next.js infers the
//    boundary from the `'use client'` pragma in the screen file.

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getLogtoContext } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { DashboardList } from '@/components/screens/dashboard-list/dashboard-list';
import { logtoConfig } from '@/lib/logto/client';
import { getQueryClient } from '@/providers/query-client';

export const dynamic = 'force-dynamic';

interface UserClaimsLite {
  sub: string;
  email?: string;
  name?: string;
}

export default async function DashboardPage(): Promise<ReactElement> {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    redirect('/sign-in?redirect_to=/dashboard');
  }

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
        <DashboardList />
      ) : (
        <DashboardList userClaims={userClaims} />
      )}
    </HydrationBoundary>
  );
}
