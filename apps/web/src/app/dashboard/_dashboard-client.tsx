// apps/web/src/app/dashboard/_dashboard-client.tsx
//
// M-4-ENTRY — Client island for /dashboard (multi-server LIST view).
//
// Replaces the plan-07-05 single-server DashboardWrapper wiring; that
// view is now at /dashboard/[id]. The shell:
//
//   1. next/dynamic({ ssr: false }) on DashboardListWrapper — locked
//      JSX uses React.useState at module top, crashes under SSR.
//   2. TanStack Query useQuery → GET /api/v1/deployments via
//      fetchDeployments(). Browser cookie jar carries Logto session.
//   3. Adapts the BFF Deployment shape to the canon's
//      DashboardServerSummary shape expected by screen-dashboard-list.
//   4. Threads userClaims through to the wrapper (keeps Plan 07-05
//      contract intact for downstream consumers).
//
// References:
//   - apps/web/src/lib/api/dashboard-client.ts (fetchDeployments)
//   - packages/contracts/src/dashboard-api.ts (Deployment shape)
//   - apps/web/src/lib/jsx-bridge/index.ts (DashboardServerSummary)

'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, type ReactElement } from 'react';

import { fetchDeployments, type Deployment } from '@/lib/api/dashboard-client';
import type {
  DashboardListWrapperProps,
  DashboardServerSummary,
} from '@/lib/jsx-bridge/screens';

const DashboardListClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.DashboardListWrapper })),
  { ssr: false },
);

interface UserClaimsLite {
  sub: string;
  email?: string;
  name?: string;
}

interface Props {
  userClaims?: UserClaimsLite;
}

// Adapt a BFF Deployment row to the canon's DashboardServerSummary shape
// rendered by screen-dashboard-list.jsx. Fields not yet provided by the
// BFF (calls7, p95, deltaPct, drift, region, etc.) default to zero / null;
// the screen renders dashes / empty states for those columns. Phase 9
// extends the BFF response with usage rollups; the adapter widens then.
function adaptDeployment(d: Deployment): DashboardServerSummary {
  return {
    id: d.deployment_id,
    name: d.server_name,
    api: d.server_name,
    tools: 0,
    status: 'live',
    visibility: d.public_badge ? 'public' : 'private',
    uptime: '—',
    calls7: 0,
    p95: 0,
    deltaPct: 0,
    version: '—',
    updated: d.deployed_at,
    drift: null,
    region: [],
    owner: 'me',
  };
}

export default function DashboardClientShell({ userClaims }: Props): ReactElement {
  const router = useRouter();

  const { data: deployments } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: fetchDeployments,
    staleTime: 30_000,
  });

  const servers = useMemo<ReadonlyArray<DashboardServerSummary>>(
    () => (deployments ?? []).map(adaptDeployment),
    [deployments],
  );

  const handleOpen = useCallback(
    (server: DashboardServerSummary): void => {
      router.push(`/dashboard/${encodeURIComponent(server.id)}`);
    },
    [router],
  );

  const handleLanding = useCallback((): void => {
    router.push('/');
  }, [router]);

  const handleMarketplace = useCallback((): void => {
    // Marketplace is gated behind ui_marketplace_perm (default OFF) — Agent 5
    // owns the route. Navigation here is harmless: the page returns 404 when
    // the flag is off.
    router.push('/marketplace');
  }, [router]);

  const handleBilling = useCallback((): void => {
    router.push('/pricing');
  }, [router]);

  const props: DashboardListWrapperProps = {
    servers,
    onOpen: handleOpen,
    onLanding: handleLanding,
    onMarketplace: handleMarketplace,
    onBilling: handleBilling,
    onBack: handleLanding,
    ...(userClaims !== undefined ? { userClaims } : {}),
  };

  return <DashboardListClient {...props} />;
}
