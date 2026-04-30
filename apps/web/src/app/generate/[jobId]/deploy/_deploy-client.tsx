// apps/web/src/app/generate/[jobId]/deploy/_deploy-client.tsx

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

// See _stream-client.tsx for explanation: do NOT import SAMPLE_APIS at
// module scope — triggers SSR `window is not defined` crash.

interface LocalLockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

const DeployClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.DeployWrapper })),
  { ssr: false },
);

const FALLBACK_SAMPLE: LocalLockedSample = {
  id: 'lumen',
  name: 'lumen payments',
  endpoints: 348,
  tools: 47,
  save: 76,
};

interface Props {
  jobId: string;
}

export default function DeployClientShell({ jobId }: Props): ReactElement {
  return <DeployClient jobId={jobId} sample={FALLBACK_SAMPLE} />;
}
