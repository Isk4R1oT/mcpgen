// apps/web/src/app/generate/[jobId]/preview/page.tsx
//
// Plan 07-03 — Server-side prefetch of fetchJobStatus(jobId). Reads the
// completed job's `partial_result.final_tools` + `partial_result.quality_report`
// and passes them to the Client shell.
//
// Plan 07-04 — extends the prefetch to also pull `partial_result.tenant_worker_source`
// (Stage E codegen output, single TS file) and renders it via the Shiki
// Server Component CodeBlock adjacent to the locked Preview screen. The
// locked Preview has no code-panel slot (verified at Task 1 spike), so the
// CodeBlock sits below the Client wrapper inside the route's Server Component.
//
// FE-03 transparency principle: full Stage-E-generated TypeScript bundle is
// visible in the preview screen.

import type { ReactElement } from 'react';

import type { FinalTool, QualityReport as QualityReportType } from '@mcpgen/ir';

import { CodeBlock } from '@/lib/preview/code-block';

import PreviewClientShell from './_preview-client';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
}

interface JobStatusShape {
  status: string;
  partial_result?: {
    final_tools?: unknown;
    quality_report?: unknown;
    // Phase 5 + Stage E ship the generated TS bundle as a string. Field name
    // verified against `apps/api/src/routes/v1/jobs/<id>` GET response (when
    // Phase 8 + a follow-up plan close the BFF gap; current Phase-1 stub does
    // NOT include this — falls through to `null` and CodeBlock is omitted).
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

export default async function PreviewPage({ params }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  // In fixture mode the GET /api/v1/jobs/:id endpoint returns
  // `{ status: 'streaming', last_known_event_id: null, events: [] }` for fresh
  // jobs — `partial_result` is undefined and the CodeBlock is skipped.
  // Live mode (post-Phase-8 generate-kickoff implementation) returns
  // `partial_result.tenant_worker_source` for completed jobs.
  const origin =
    process.env.MCPGEN_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`;
  const job = await fetchJobStatusServerSide(jobId, origin);
  const finalTools = job?.partial_result?.final_tools as ReadonlyArray<FinalTool> | undefined;
  const qualityReport = job?.partial_result?.quality_report as QualityReportType | undefined;
  const tenantWorkerSource =
    typeof job?.partial_result?.tenant_worker_source === 'string'
      ? (job.partial_result.tenant_worker_source as string)
      : null;

  return (
    <>
      <PreviewClientShell
        jobId={jobId}
        {...(finalTools !== undefined ? { finalTools } : {})}
        {...(qualityReport !== undefined ? { qualityReport } : {})}
      />
      {tenantWorkerSource !== null && (
        // Server Component context — CodeBlock awaits Shiki's codeToHtml at
        // request time. No client JS overhead.
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
      )}
    </>
  );
}
