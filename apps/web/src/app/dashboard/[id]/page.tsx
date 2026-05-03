// apps/web/src/app/dashboard/[id]/page.tsx
//
// M-4-ENTRY — single-server dashboard detail view.
//
// /dashboard is the multi-server LIST view (DashboardListWrapper).
// Clicking a card navigates here, where DashboardWrapper renders the
// detailed health/usage/drift screen for one server.
//
// Belt-and-suspenders Logto session check (middleware /dashboard/:path*
// already gates this; redundant guard for misorder safety).
//
// References:
//   - docs/mcpgen-frontend-rebuild-contract.md §4.4 (dashboard split)
//   - apps/web/src/lib/api/dashboard-client.ts (Deployment shape)
//   - apps/web/src/screen-dashboard.jsx (canon screen + drift state machine)

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getLogtoContext } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import DetailClientShell from './_detail-client';
import { logtoConfig } from '@/lib/logto/client';
import { getQueryClient } from '@/providers/query-client';

export const dynamic = 'force-dynamic'; // Logto session must be fresh per request.

interface UserClaimsLite {
  sub: string;
  email?: string;
  name?: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DashboardDetailPage({ params }: PageProps): Promise<ReactElement> {
  const { id } = await params;

  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    redirect(`/api/auth/logto/sign-in?redirect_to=/dashboard/${encodeURIComponent(id)}`);
  }

  // RSC fetch limitation (WR-01 + WR-02 from plan 07-05): relative URLs
  // and the missing Logto cookie make server-side prefetch infeasible.
  // The client island fetches GET /api/v1/deployments and selects the
  // matching deployment by id.
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
        <DetailClientShell deploymentId={id} />
      ) : (
        <DetailClientShell deploymentId={id} userClaims={userClaims} />
      )}
    </HydrationBoundary>
  );
}
