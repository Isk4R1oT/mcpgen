// apps/web/src/app/generate/[jobId]/preview/_preview-client.tsx
//
// Phase M-4 Agent 2 — wires real `final_tools` artefacts into the locked
// Preview screen. Derivation helpers live in `_preview-derive.ts` (pure,
// unit-tested). Switches dynamic import from the transitional alias
// `PreviewScreenWithAnonChrome` to the canon `PreviewWrapper`.

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

import type { FinalTool, QualityReport as QualityReportType } from '@mcpgen/ir';

import {
  deriveCategories,
  deriveSample,
  deriveTokenBudgets,
  type ExcludedEndpoint,
} from './_preview-derive';

// Plan 09.1-07 → M-4 Agent 2: switch from transitional alias
// `PreviewScreenWithAnonChrome` (re-export from wrapper.tsx) to the
// canon `PreviewWrapper` directly from `@/lib/jsx-bridge/screens`.
//
// The new canon Preview signature dropped the `categories`,
// `excludedEndpoints`, `naiveTokenBudget`, `baseOptTokenBudget`,
// and `finalTools` real-data slots — canon now uses internal hardcoded
// sample data. We keep the derivation logic above for future reuse when
// a wired Preview variant is reintroduced. `qualityReport` is kept as
// route-level metadata on the wrapper (stripped before reaching canon).
const PreviewClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.PreviewWrapper })),
  { ssr: false },
);

interface Props {
  jobId: string;
  endpointCount?: number;
  specName?: string;
  finalTools?: ReadonlyArray<FinalTool>;
  qualityReport?: QualityReportType;
}

export default function PreviewClientShell({
  jobId,
  endpointCount,
  specName,
  finalTools,
  qualityReport,
}: Props): ReactElement {
  const sample = deriveSample(endpointCount, specName, finalTools);
  // Derivations retained for future re-wire — see comment block above.
  const categories = deriveCategories(finalTools);
  const { naive, opt } = deriveTokenBudgets(endpointCount, finalTools);
  const excludedEndpoints: ReadonlyArray<ExcludedEndpoint> = [];
  void categories;
  void excludedEndpoints;
  void naive;
  void opt;
  return (
    <PreviewClient
      jobId={jobId}
      sample={sample}
      {...(qualityReport !== undefined ? { qualityReport } : {})}
    />
  );
}
