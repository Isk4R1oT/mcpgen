// apps/web/src/app/generate/[jobId]/playground/_playground-client.tsx

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

const PlaygroundClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.PlaygroundWrapper })),
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

export default function PlaygroundClientShell({ jobId }: Props): ReactElement {
  return <PlaygroundClient jobId={jobId} sample={FALLBACK_SAMPLE} />;
}
