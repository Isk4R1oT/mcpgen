// apps/web/src/app/generate/[jobId]/playground/page.tsx
//
// Playground route. Server Component shell that renders the production
// Playground client (`@/components/screens/playground`).
//
// Auth: this route is matched by `PROTECTED_PATTERNS` in `lib/route-gate.ts`,
// so middleware redirects anonymous users to Logto sign-in BEFORE this page
// runs. We therefore don't need to assert auth here.
//
// SSR prefetch: we fetch the job status JSON to extract `spec_name` for the
// breadcrumb. Tool list is fetched client-side via `useJobArtifact`.

import type { ReactElement } from 'react';

import Playground from '@/components/screens/playground/playground';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
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

export default async function PlaygroundPage({
  params,
}: Params): Promise<ReactElement> {
  const { jobId } = await params;
  const origin =
    process.env.MCPGEN_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`;
  const job = await fetchJobStatus(jobId, origin);
  const specName =
    typeof job?.partial_result?.spec_name === 'string'
      ? (job.partial_result.spec_name as string)
      : undefined;

  const sample =
    specName !== undefined
      ? { id: slugifyName(specName), name: specName }
      : undefined;

  return <Playground jobId={jobId} {...(sample !== undefined ? { sample } : {})} />;
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}
