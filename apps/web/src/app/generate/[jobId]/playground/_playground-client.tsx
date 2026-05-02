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
  endpointCount?: number;
  specName?: string;
  toolCount?: number;
}

/**
 * Mirror of preview's `deriveSample` (POST-09.1) — builds the
 * locked-screen `sample = {id, name, endpoints, tools, save}` from real
 * engine artefacts when present. FALLBACK_SAMPLE only fires when the
 * page renders before the engine writes artefacts to L1 (rare race).
 */
const deriveSample = (
  endpointCount: number | undefined,
  specName: string | undefined,
  toolCount: number | undefined,
): LocalLockedSample => {
  if (
    toolCount === undefined ||
    toolCount <= 0 ||
    endpointCount === undefined ||
    endpointCount <= 0
  ) {
    return FALLBACK_SAMPLE;
  }
  const endpoints = endpointCount;
  const tools = toolCount;
  const save = endpoints > tools ? Math.round(((endpoints - tools) / endpoints) * 100) : 0;
  const name = specName !== undefined && specName.length > 0 ? specName : 'generated MCP';
  return { id: 'live', name, endpoints, tools, save };
};

export default function PlaygroundClientShell({
  jobId,
  endpointCount,
  specName,
  toolCount,
}: Props): ReactElement {
  const sample = deriveSample(endpointCount, specName, toolCount);
  return <PlaygroundClient jobId={jobId} sample={sample} />;
}
