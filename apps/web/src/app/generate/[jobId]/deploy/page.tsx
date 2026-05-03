// apps/web/src/app/generate/[jobId]/deploy/page.tsx
//
// Phase 1 / Agent A5 — deploy route. Server Component shell that renders
// either Deploy or DeploySuccess based on URL state.
//
// Render branches:
//   ?deployed=1&url=<encoded>  → DeploySuccess
//   (no query)                 → Deploy form
//
// On successful deploy in `<Deploy>`, the parent client wrapper updates the
// URL via `router.push(...?deployed=1&url=...)` and the page re-renders the
// success view. This avoids stale React state across hard reloads.
//
// Auth: `/deploy` is anonymous (ephemeral deploy). `/deploy/permanent` is
// auth-protected by the route-gate (see lib/route-gate.ts).
//
// The previous `_deploy-client.tsx` shim is intentionally left — Phase 4
// sweeps it.

import type { ReactElement } from 'react';

import DeployRouteShell from './_deploy-route-shell';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{
    deployed?: string;
    url?: string;
    config?: string;
  }>;
}

interface JobStatusShape {
  status?: string;
  partial_result?: {
    spec_name?: unknown;
  };
}

const fetchJobStatus = async (
  jobId: string,
  origin: string,
): Promise<JobStatusShape | null> => {
  try {
    const res = await fetch(
      `${origin}/api/v1/jobs/${encodeURIComponent(jobId)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as JobStatusShape;
  } catch {
    return null;
  }
};

export default async function DeployPage({
  params,
  searchParams,
}: Params): Promise<ReactElement> {
  const { jobId } = await params;
  const sp = await searchParams;
  const origin =
    process.env.MCPGEN_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`;
  const job = await fetchJobStatus(jobId, origin);
  const specName =
    typeof job?.partial_result?.spec_name === 'string'
      ? (job.partial_result.spec_name as string)
      : undefined;

  const deployedFlag = sp.deployed === '1';
  const mcpUrl = sp.url !== undefined ? decodeURIComponent(sp.url) : '';

  return (
    <DeployRouteShell
      jobId={jobId}
      {...(specName !== undefined ? { specName } : {})}
      deployedFromQuery={deployedFlag}
      mcpUrlFromQuery={mcpUrl}
    />
  );
}
