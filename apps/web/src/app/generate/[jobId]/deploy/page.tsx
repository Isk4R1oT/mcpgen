// apps/web/src/app/generate/[jobId]/deploy/page.tsx

import type { ReactElement } from 'react';

import DeployClientShell from './_deploy-client';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
}

export default async function DeployPage({ params }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  return <DeployClientShell jobId={jobId} />;
}
