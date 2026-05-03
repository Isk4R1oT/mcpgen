// apps/web/src/app/generate/[jobId]/quality/page.tsx
//
// Quality route. Server Component shell that prefetches the job snapshot
// for SSR-friendly first paint, then delegates rendering to the `<Quality>`
// client component. The actual `quality-report` artifact is read by the
// client via TanStack Query (`useJobArtifact`), so the server prefetch only
// carries breadcrumb metadata (`spec_name`).

import type { ReactElement } from 'react';

import Quality from '@/components/screens/quality/quality';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
}

interface JobStatusShape {
  status: string;
  partial_result?: {
    spec_name?: unknown;
  };
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
    process.env['MCPGEN_PUBLIC_URL'] ?? `http://localhost:${process.env['PORT'] ?? '3000'}`;
  const job = await fetchJobStatusServerSide(jobId, origin);
  const specName =
    typeof job?.partial_result?.spec_name === 'string'
      ? (job.partial_result.spec_name as string)
      : undefined;

  return <Quality jobId={jobId} {...(specName !== undefined ? { specName } : {})} />;
}
