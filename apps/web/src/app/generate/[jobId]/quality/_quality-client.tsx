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
import type { ComponentType, ReactElement } from 'react';

import type { QualityReport as QualityReportType } from '@mcpgen/ir';

import type { QualityReportWrapperProps } from '@/lib/jsx-bridge/screens';

import {
  deriveBreakdown,
  deriveEvalTasks,
  deriveTools,
  type BreakdownRow,
  type EvalTaskRow,
  type ToolRow,
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

// Plan 09.1-07 → M-4 Agent 2: switch from transitional alias
// `QualityScreenWithAnonChrome` (re-export from wrapper.tsx) to the canon
// `QualityReportWrapper` directly from `@/lib/jsx-bridge/screens`.
type QualityWithReportProps = QualityReportWrapperProps & {
  score?: number;
  breakdown?: ReadonlyArray<BreakdownRow>;
  tools?: ReadonlyArray<ToolRow>;
  evalTasks?: ReadonlyArray<EvalTaskRow>;
  cacheHitMeta?: CacheHitMetadata | null;
};

const QualityClient = dynamic(
  () =>
    import('@/lib/jsx-bridge/screens').then((m) => ({
      default: m.QualityReportWrapper as ComponentType<QualityWithReportProps>,
    })),
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
  const score = qualityReport !== undefined
    ? Number(qualityReport.overall_score.toFixed(2))
    : 0;
  const breakdown = deriveBreakdown(qualityReport);
  const tools = deriveTools(qualityReport);
  const evalTasks = deriveEvalTasks(qualityReport);
  return (
    <QualityClient
      jobId={jobId}
      sample={sample}
      score={score}
      breakdown={breakdown}
      tools={tools}
      evalTasks={evalTasks}
      {...(qualityReport !== undefined ? { qualityReport } : {})}
      {...(cacheHit !== undefined ? { cacheHit, cacheHitMeta: cacheHit } : {})}
    />
  );
}
