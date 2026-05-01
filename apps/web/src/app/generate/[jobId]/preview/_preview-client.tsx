// apps/web/src/app/generate/[jobId]/preview/_preview-client.tsx

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

import type { FinalTool, QualityReport as QualityReportType } from '@mcpgen/ir';

// See _stream-client.tsx for explanation: do NOT import SAMPLE_APIS at
// module scope — triggers SSR `window is not defined` crash.

interface LocalLockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

// Plan 09.1-07 — switch consumer to PreviewScreenWithAnonChrome wrapper
// (composes AnonSignupCta BELOW the locked Preview screen, byte-identical to
// the locked baseline when isAnonymous=false).
const PreviewClient = dynamic(
  () =>
    import('@/lib/jsx-bridge/wrapper').then((m) => ({ default: m.PreviewScreenWithAnonChrome })),
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
  finalTools?: ReadonlyArray<FinalTool>;
  qualityReport?: QualityReportType;
}

export default function PreviewClientShell({
  jobId,
  finalTools,
  qualityReport,
}: Props): ReactElement {
  return (
    <PreviewClient
      jobId={jobId}
      sample={FALLBACK_SAMPLE}
      {...(finalTools !== undefined ? { finalTools } : {})}
      {...(qualityReport !== undefined ? { qualityReport } : {})}
    />
  );
}
