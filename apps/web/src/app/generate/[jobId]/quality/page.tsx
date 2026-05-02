// apps/web/src/app/generate/[jobId]/quality/page.tsx

import type { ReactElement } from 'react';

import type { QualityReport as QualityReportType } from '@mcpgen/ir';

import QualityClientShell from './_quality-client';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
}

interface CacheHitShape {
  original_quality: number;
  served_from: string;
}

interface JobStatusShape {
  status: string;
  partial_result?: {
    quality_report?: unknown;
    cache_hit?: CacheHitShape;
    final_tools?: unknown;
    endpoint_count?: unknown;
    spec_name?: unknown;
  };
}

// Plan 09.1-07 — cache-hit metadata is surfaced via SSE event 0
// (CONTEXT D-05). When the BFF replays a cached generation, the server-side
// status fetch returns the same metadata under partial_result.cache_hit so
// that the QualityScreenWithAnonChrome wrapper can render the badge above
// the locked QualityReport screen on first render.
function readCacheHit(job: JobStatusShape | null): CacheHitShape | null {
  const hit = job?.partial_result?.cache_hit;
  if (hit === undefined) return null;
  if (typeof hit.original_quality !== 'number') return null;
  if (typeof hit.served_from !== 'string') return null;
  return { original_quality: hit.original_quality, served_from: hit.served_from };
}

const fetchJobStatusServerSide = async (
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

export default async function QualityPage({ params }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  const origin =
    process.env.MCPGEN_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`;
  const job = await fetchJobStatusServerSide(jobId, origin);
  const qualityReport = job?.partial_result?.quality_report as QualityReportType | undefined;
  const cacheHit = readCacheHit(job);
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
    <QualityClientShell
      jobId={jobId}
      {...(qualityReport !== undefined ? { qualityReport } : {})}
      {...(cacheHit !== null ? { cacheHit } : {})}
      {...(endpointCount !== undefined ? { endpointCount } : {})}
      {...(specName !== undefined ? { specName } : {})}
      {...(finalTools !== undefined ? { toolCount: finalTools.length } : {})}
    />
  );
}
