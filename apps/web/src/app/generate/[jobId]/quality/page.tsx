// apps/web/src/app/generate/[jobId]/quality/page.tsx

import type { ReactElement } from 'react';

import type { QualityReport as QualityReportType } from '@mcpgen/ir';

import QualityClientShell from './_quality-client';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
}

interface JobStatusShape {
  status: string;
  partial_result?: { quality_report?: unknown };
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

  return (
    <QualityClientShell
      jobId={jobId}
      {...(qualityReport !== undefined ? { qualityReport } : {})}
    />
  );
}
