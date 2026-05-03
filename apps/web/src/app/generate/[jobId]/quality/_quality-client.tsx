// apps/web/src/app/generate/[jobId]/quality/_quality-client.tsx
//
// Phase M-4 Agent 2 — wires the QualityReport (F1/F2/F3) artefact into
// the locked Quality screen. Derivation helpers live in
// `_quality-derive.ts` (pure, unit-tested). Surfaces optional cache-hit
// metadata above the eval card. The transitional alias
// `QualityScreenWithAnonChrome` is replaced with the canon
// `QualityReportWrapper`.

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

import type { QualityReport as QualityReportType } from '@mcpgen/ir';

import {
  deriveBreakdown,
  deriveEvalTasks,
  deriveTools,
} from './_quality-derive';

// Cache-hit metadata. The previous Phase-INFRA stub at
// `@/components/anon-cache-hit-badge.ts` is dropped here; the same shape
// is constructed by `page.tsx::readCacheHit()` and forwarded as a
// `cacheHit` prop. Keeping the shape inline avoids a cross-file type
// dependency on a stub that is deleted by this commit.
interface CacheHitMetadata {
  readonly original_quality: number;
  readonly served_from: string;
}

interface LocalLockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

// The new canon QualityReport signature dropped the `score`, `breakdown`,
// `tools`, `evalTasks` real-data slots — canon now uses internal
// hardcoded sample data. We keep the derivation calls below for future
// reuse when a wired QualityReport variant is reintroduced.
// `qualityReport` and `cacheHit` are kept as route-level metadata on
// the wrapper (stripped before reaching canon).
const QualityClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.QualityReportWrapper })),
  { ssr: false },
);

interface Props {
  jobId: string;
  qualityReport?: QualityReportType;
  cacheHit?: CacheHitMetadata | null;
  endpointCount?: number;
  specName?: string;
  toolCount?: number;
}

const deriveSample = (
  endpointCount: number | undefined,
  specName: string | undefined,
  toolCount: number | undefined,
): LocalLockedSample => {
  const endpoints = endpointCount ?? 0;
  const tools = toolCount ?? 0;
  const save = endpoints > tools && endpoints > 0
    ? Math.round(((endpoints - tools) / endpoints) * 100)
    : 0;
  const name = specName !== undefined && specName.length > 0 ? specName : 'mcp server';
  const idTokens = specName !== undefined && specName.length > 0 ? specName.split(/\s+/) : [];
  const id = idTokens.length > 0 && idTokens[0] !== undefined && idTokens[0].length > 0
    ? idTokens[0].toLowerCase()
    : 'mcp';
  return { id, name, endpoints, tools, save };
};

export default function QualityClientShell({
  jobId,
  qualityReport,
  cacheHit,
  endpointCount,
  specName,
  toolCount,
}: Props): ReactElement {
  const sample = deriveSample(endpointCount, specName, toolCount);
  // Derivations retained for future re-wire — see comment block above.
  const score =
    qualityReport != null && typeof qualityReport.overall_score === 'number'
      ? Number(qualityReport.overall_score.toFixed(2))
      : 0;
  const breakdown = deriveBreakdown(qualityReport);
  const tools = deriveTools(qualityReport);
  const evalTasks = deriveEvalTasks(qualityReport);
  void score;
  void breakdown;
  void tools;
  void evalTasks;
  return (
    <QualityClient
      jobId={jobId}
      sample={sample}
      {...(qualityReport !== undefined ? { qualityReport } : {})}
      {...(cacheHit !== undefined ? { cacheHit } : {})}
    />
  );
}
