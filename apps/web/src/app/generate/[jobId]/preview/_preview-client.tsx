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
  endpointCount?: number;
  specName?: string;
  finalTools?: ReadonlyArray<FinalTool>;
  qualityReport?: QualityReportType;
}

/**
 * Build the locked-screen `sample` from real engine artefacts.
 *
 * The locked Preview screen reads `{id, name, endpoints, tools, save}` for
 * its bento (header label + endpoint/tool count + token-savings %).
 * POST-09.1 wire-up: when the BFF returns the live job artefacts we derive
 * each field from real data; the FALLBACK_SAMPLE is only used when the
 * page renders BEFORE the engine writes artefacts to L1 (rare race).
 *
 * Token-savings derivation: 1:1 baseline ≈ endpoints (one tool per
 * endpoint), final tool count comes from Pass 5. The fraction
 * `(endpoints - tools) / endpoints` matches the locked screen's "↓ X%
 * fewer tokens" badge — it is the structural compression ratio that
 * Six-Tool Pattern delivers (~70% on typical APIs per RULES §2.7).
 */
const deriveSample = (
  endpointCount: number | undefined,
  specName: string | undefined,
  finalTools: ReadonlyArray<FinalTool> | undefined,
): LocalLockedSample => {
  if (
    finalTools === undefined ||
    finalTools.length === 0 ||
    endpointCount === undefined ||
    endpointCount <= 0
  ) {
    return FALLBACK_SAMPLE;
  }
  const tools = finalTools.length;
  const endpoints = endpointCount;
  const save = endpoints > tools ? Math.round(((endpoints - tools) / endpoints) * 100) : 0;
  const name = specName !== undefined && specName.length > 0 ? specName : 'generated MCP';
  return { id: 'live', name, endpoints, tools, save };
};

export default function PreviewClientShell({
  jobId,
  endpointCount,
  specName,
  finalTools,
  qualityReport,
}: Props): ReactElement {
  const sample = deriveSample(endpointCount, specName, finalTools);
  return (
    <PreviewClient
      jobId={jobId}
      sample={sample}
      {...(finalTools !== undefined ? { finalTools } : {})}
      {...(qualityReport !== undefined ? { qualityReport } : {})}
    />
  );
}
