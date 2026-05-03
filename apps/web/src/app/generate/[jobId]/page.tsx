// apps/web/src/app/generate/[jobId]/page.tsx
//
// /generate/[jobId] Server Component shell. Reads jobId from the dynamic
// params and renders the production <StreamLog /> client component.

import type { ReactElement } from 'react';

import { StreamLog } from '@/components/screens/stream/stream';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
}

export default async function StreamPage({ params }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  return <StreamLog jobId={jobId} />;
}
