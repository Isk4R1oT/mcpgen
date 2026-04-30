// apps/web/src/app/generate/[jobId]/page.tsx
//
// Plan 07-03 — /generate/[jobId] route segment (stream). Server Component
// reads jobId from params and passes it to the Client shell which dynamic-
// imports StreamLogWrapper.

import type { ReactElement } from 'react';

import StreamClientShell from './_stream-client';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
}

export default async function StreamPage({ params }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  return <StreamClientShell jobId={jobId} />;
}
