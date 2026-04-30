// apps/web/src/app/generate/[jobId]/playground/page.tsx

import type { ReactElement } from 'react';

import PlaygroundClientShell from './_playground-client';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
}

export default async function PlaygroundPage({ params }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  return <PlaygroundClientShell jobId={jobId} />;
}
