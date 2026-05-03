// apps/web/src/app/generate/[jobId]/deploy/_deploy-route-shell.tsx
//
// Phase 1 / Agent A5 — client wrapper that toggles between Deploy and
// DeploySuccess. Owns the URL state machine:
//   - Deploy renders by default.
//   - On Deploy `onDeployed(response)`, we push `?deployed=1&url=<encoded>`
//     so a hard refresh stays on the success view.
//   - DeploySuccess renders when the URL has `?deployed=1` OR local React
//     state has captured the response (covers the in-page transition before
//     the URL update flushes).

'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, type ReactElement } from 'react';

import Deploy from '@/components/screens/deploy/deploy';
import DeploySuccess from '@/components/screens/deploy-success/deploy-success';
import type { DeployResponse } from '@mcpgen/contracts/dashboard-api';

interface Props {
  readonly jobId: string;
  readonly specName?: string;
  readonly deployedFromQuery: boolean;
  readonly mcpUrlFromQuery: string;
}

export default function DeployRouteShell({
  jobId,
  specName,
  deployedFromQuery,
  mcpUrlFromQuery,
}: Props): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const [localDeploy, setLocalDeploy] = useState<DeployResponse | null>(null);

  const sample =
    specName !== undefined
      ? { id: slugifyName(specName), name: specName }
      : undefined;

  const showSuccess = deployedFromQuery || localDeploy !== null;
  const onDashboard = (): void => {
    router.push('/dashboard');
  };

  if (showSuccess) {
    const mcpUrl =
      localDeploy?.server_url ??
      (mcpUrlFromQuery !== '' ? mcpUrlFromQuery : `https://${jobId}.mcpgen.app/mcp`);
    return (
      <DeploySuccess
        jobId={jobId}
        mcpUrl={mcpUrl}
        {...(sample !== undefined ? { sample } : {})}
        onDashboard={onDashboard}
      />
    );
  }

  return (
    <Deploy
      jobId={jobId}
      {...(sample !== undefined ? { sample } : {})}
      onBack={() => router.push(`/generate/${jobId}/preview`)}
      onDeployed={(response) => {
        setLocalDeploy(response);
        const url = response.server_url;
        const next = `${pathname}?deployed=1&url=${encodeURIComponent(url)}`;
        router.push(next);
      }}
    />
  );
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}
