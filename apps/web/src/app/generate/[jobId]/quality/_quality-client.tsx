// apps/web/src/app/generate/[jobId]/quality/_quality-client.tsx

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

import type { QualityReport as QualityReportType } from '@mcpgen/ir';

import type { CacheHitMetadata } from '@/components/anon-cache-hit-badge';

// See _stream-client.tsx for explanation: do NOT import SAMPLE_APIS at
// module scope — triggers SSR `window is not defined` crash.

interface LocalLockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

// Plan 09.1-07 — switch consumer to QualityScreenWithAnonChrome wrapper
// (composes AnonBanner + AnonCacheHitBadge ABOVE the locked QualityReport
// screen, byte-identical to the locked baseline when isAnonymous=false).
const QualityClient = dynamic(
  () =>
    import('@/lib/jsx-bridge/wrapper').then((m) => ({ default: m.QualityScreenWithAnonChrome })),
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
  cacheHit?: CacheHitMetadata | null;
}

export default function QualityClientShell({
  jobId,
  qualityReport,
  cacheHit,
}: Props): ReactElement {
  return (
    <QualityClient
      jobId={jobId}
      sample={FALLBACK_SAMPLE}
      {...(qualityReport !== undefined ? { qualityReport } : {})}
      {...(cacheHit !== undefined ? { cacheHit } : {})}
    />
  );
}
