// apps/web/src/app/dashboard/[id]/page.tsx
//
// Phase 2 / Agent B2 — single-server Dashboard detail (Server Component shell).
//
// Renders the production `<Dashboard>` from
// `@/components/screens/dashboard/dashboard` keyed by the route param.
// Belt-and-suspenders Logto check guards against middleware misorder; the
// real `/dashboard/:path*` gate sits in Phase 0 middleware.

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getLogtoContext } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { Dashboard } from '@/components/screens/dashboard/dashboard';
import { logtoConfig } from '@/lib/logto/client';
import { getQueryClient } from '@/providers/query-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DashboardDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { id } = await params;

  const { isAuthenticated } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    redirect(`/sign-in?redirect_to=/dashboard/${encodeURIComponent(id)}`);
  }

  const qc = getQueryClient();

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Dashboard deploymentId={id} />
    </HydrationBoundary>
  );
}
