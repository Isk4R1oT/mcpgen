// apps/web/src/app/generate/[jobId]/quality/_quality-client.tsx

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

import type { QualityReport as QualityReportType } from '@mcpgen/ir';

// See _stream-client.tsx for explanation: do NOT import SAMPLE_APIS at
// module scope — triggers SSR `window is not defined` crash.

interface LocalLockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

const QualityClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.QualityReportWrapper })),
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
  qualityReport?: QualityReportType;
}

export default function QualityClientShell({ jobId, qualityReport }: Props): ReactElement {
  return (
    <QualityClient
      jobId={jobId}
      sample={FALLBACK_SAMPLE}
      {...(qualityReport !== undefined ? { qualityReport } : {})}
    />
  );
}
