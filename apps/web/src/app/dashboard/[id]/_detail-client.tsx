// apps/web/src/app/dashboard/[id]/_detail-client.tsx
//
// M-4-ENTRY — Client island for /dashboard/[id] (single-server detail).
//
// Wires DashboardWrapper to GET /api/v1/deployments and selects the
// deployment matching the route param. specDiff is left undefined
// (no drift data wired yet — Phase 9 will add a /drift endpoint;
// the locked screen auto-dismisses the drift banner when no diff
// is supplied).
//
// References:
//   - apps/web/src/lib/api/dashboard-client.ts (fetchDeployments)
//   - apps/web/src/screen-dashboard.jsx (specDiff prop contract)
//   - apps/web/src/lib/jsx-bridge/index.ts (LockedSample, SpecDiff)

'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, type ReactElement } from 'react';

import { fetchDeployments, type Deployment } from '@/lib/api/dashboard-client';
import type {
  DashboardWrapperProps,
  LockedSample,
} from '@/lib/jsx-bridge/screens';

const DashboardClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.DashboardWrapper })),
  { ssr: false },
);

interface UserClaimsLite {
  sub: string;
  email?: string;
  name?: string;
}

interface Props {
  deploymentId: string;
  userClaims?: UserClaimsLite;
}

// Adapt a Deployment row to the LockedSample shape that the canon screen
// uses for display (name, id). Counts default to 0 — the canon falls
// back to dashes for unknown values. Real per-server stats arrive in
// Phase 9 once the BFF emits per-deployment usage rollups.
function adaptDeploymentToSample(d: Deployment): LockedSample {
  return {
    id: d.deployment_id,
    name: d.server_name,
    endpoints: 0,
    tools: 0,
    save: 0,
  };
}

export default function DetailClientShell({
  deploymentId,
  userClaims,
}: Props): ReactElement {
  const router = useRouter();

  const { data: deployments } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: fetchDeployments,
    staleTime: 30_000,
  });

  const sample = useMemo<LockedSample | undefined>(() => {
    const match = (deployments ?? []).find((d) => d.deployment_id === deploymentId);
    return match !== undefined ? adaptDeploymentToSample(match) : undefined;
  }, [deployments, deploymentId]);

  const handleBack = useCallback((): void => {
    router.push('/dashboard');
  }, [router]);

  const handlePlay = useCallback((): void => {
    // Playground for an existing server — Phase 9 wires this to a real
    // playground route per server. Today: route to root playground or no-op.
    router.push('/');
  }, [router]);

  const props: DashboardWrapperProps = {
    onBack: handleBack,
    onPlay: handlePlay,
    ...(sample !== undefined ? { sample } : {}),
    // specDiff intentionally omitted — no drift endpoint yet. The screen
    // auto-dismisses the drift banner when specDiff is null/undefined.
    ...(userClaims !== undefined ? { userClaims } : {}),
  };

  return <DashboardClient {...props} />;
}
