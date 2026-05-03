// apps/web/src/app/generate/[jobId]/preview/page.tsx
//
// Preview route. Server Component shell that prefetches the job snapshot from
// the BFF (`GET /api/v1/jobs/:id`) for SSR-friendly first paint, then
// delegates rendering to the `<Preview>` client component, which itself reads
// the `final-tools` artifact via TanStack Query (`useJobArtifact`).
//
// The Stage E `tenant_worker_source` is rendered as a `<CodeBlock>` section
// below the screen when the BFF returns it (FE-03 transparency principle).

import type { ReactElement } from 'react';

import { CodeBlock } from '@/lib/preview/code-block';

import Preview from '@/components/screens/preview/preview';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
  searchParams?: Promise<{ spec_url?: string }>;
}

interface JobStatusShape {
  status: string;
  partial_result?: {
    endpoint_count?: unknown;
    spec_name?: unknown;
    tenant_worker_source?: unknown;
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

export default async function PreviewPage({ params, searchParams }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  const sp = (await searchParams) ?? {};
  const origin =
    process.env['MCPGEN_PUBLIC_URL'] ?? `http://localhost:${process.env['PORT'] ?? '3000'}`;
  const job = await fetchJobStatusServerSide(jobId, origin);

  const endpointCount =
    typeof job?.partial_result?.endpoint_count === 'number'
      ? (job.partial_result.endpoint_count as number)
      : undefined;
  const specName =
    typeof job?.partial_result?.spec_name === 'string'
      ? (job.partial_result.spec_name as string)
      : undefined;
  const tenantWorkerSource =
    typeof job?.partial_result?.tenant_worker_source === 'string'
      ? (job.partial_result.tenant_worker_source as string)
      : null;
  const originalSpecUrl =
    typeof sp.spec_url === 'string' && sp.spec_url.length > 0 ? sp.spec_url : undefined;

  return (
    <>
      <Preview
        jobId={jobId}
        {...(endpointCount !== undefined ? { endpointCount } : {})}
        {...(specName !== undefined ? { specName } : {})}
        {...(originalSpecUrl !== undefined ? { originalSpecUrl } : {})}
      />
      {tenantWorkerSource !== null ? (
        <section
          aria-label="Generated TypeScript bundle"
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '0 28px 40px',
          }}
        >
          <CodeBlock code={tenantWorkerSource} lang="typescript" />
        </section>
      ) : null}
    </>
  );
}
