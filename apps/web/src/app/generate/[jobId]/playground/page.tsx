// apps/web/src/app/generate/[jobId]/playground/page.tsx
//
// POST-09.1: server-side prefetch of the live job's artefact summary so the
// locked Playground screen renders the spec's real name + endpoint / tool
// counts in its bento header instead of the lumen FALLBACK fixture.
// Mirrors the prefetch wired into preview/page.tsx.

import type { ReactElement } from 'react';

import PlaygroundClientShell from './_playground-client';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
}

interface JobStatusShape {
  status: string;
  partial_result?: {
    final_tools?: unknown;
    endpoint_count?: unknown;
    spec_name?: unknown;
  };
}

const fetchJobStatus = async (
  jobId: string,
  origin: string,
): Promise<JobStatusShape | null> => {
  try {
    const res = await fetch(`${origin}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as JobStatusShape;
  } catch {
    return null;
  }
};

export default async function PlaygroundPage({ params }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  const origin =
    process.env.MCPGEN_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`;
  const job = await fetchJobStatus(jobId, origin);
  const finalTools = Array.isArray(job?.partial_result?.final_tools)
    ? (job!.partial_result!.final_tools as ReadonlyArray<unknown>)
    : undefined;
  const endpointCount =
    typeof job?.partial_result?.endpoint_count === 'number'
      ? (job.partial_result.endpoint_count as number)
      : undefined;
  const specName =
    typeof job?.partial_result?.spec_name === 'string'
      ? (job.partial_result.spec_name as string)
      : undefined;

  return (
    <PlaygroundClientShell
      jobId={jobId}
      {...(endpointCount !== undefined ? { endpointCount } : {})}
      {...(specName !== undefined ? { specName } : {})}
      {...(finalTools !== undefined ? { toolCount: finalTools.length } : {})}
    />
  );
}
