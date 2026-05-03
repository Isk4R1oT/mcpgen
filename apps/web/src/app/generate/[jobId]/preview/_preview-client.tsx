// apps/web/src/app/generate/[jobId]/preview/_preview-client.tsx
//
// Phase M-4 Agent 2 — wires real `final_tools` artefacts into the locked
// Preview screen. Derivation helpers live in `_preview-derive.ts` (pure,
// unit-tested). Switches dynamic import from the transitional alias
// `PreviewScreenWithAnonChrome` to the canon `PreviewWrapper`.

'use client';

import dynamic from 'next/dynamic';
import type { ComponentType, ReactElement } from 'react';

import type { FinalTool, QualityReport as QualityReportType } from '@mcpgen/ir';

import type { PreviewWrapperProps } from '@/lib/jsx-bridge/screens';

import {
  deriveCategories,
  deriveSample,
  deriveTokenBudgets,
  type ExcludedEndpoint,
  type PreviewCategory,
} from './_preview-derive';

// Plan 09.1-07 → M-4 Agent 2: switch from transitional alias
// `PreviewScreenWithAnonChrome` (re-export from wrapper.tsx) to the
// canon `PreviewWrapper` directly from `@/lib/jsx-bridge/screens`.
//
// The wrapper internally `<Preview {...rest} />`s, so any extra props
// not declared in `PreviewWrapperProps` flow through to the locked JSX
// component. We extend the type locally with the new prop slots
// `categories` / `excludedEndpoints` / `naiveTokenBudget` /
// `baseOptTokenBudget` (which screen-preview.jsx now reads — see
// PROP-CONTRACTS.md §screen-preview), without modifying the bridge.
type PreviewWithBudgetProps = PreviewWrapperProps & {
  categories?: ReadonlyArray<PreviewCategory>;
  excludedEndpoints?: ReadonlyArray<ExcludedEndpoint>;
  naiveTokenBudget?: number;
  baseOptTokenBudget?: number;
};

const PreviewClient = dynamic(
  () =>
    import('@/lib/jsx-bridge/screens').then((m) => ({
      default: m.PreviewWrapper as ComponentType<PreviewWithBudgetProps>,
    })),
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
  const categories = deriveCategories(finalTools);
  const { naive, opt } = deriveTokenBudgets(endpointCount, finalTools);
  // Excluded endpoints: empty until the BFF surfaces drop reasons (Pass
  // 0 emits this; not yet propagated through partial_result — Phase 5+
  // work).
  const excludedEndpoints: ReadonlyArray<ExcludedEndpoint> = [];
  return (
    <PreviewClient
      jobId={jobId}
      sample={sample}
      categories={categories}
      excludedEndpoints={excludedEndpoints}
      naiveTokenBudget={naive}
      baseOptTokenBudget={opt}
      {...(finalTools !== undefined ? { finalTools } : {})}
      {...(qualityReport !== undefined ? { qualityReport } : {})}
    />
  );
}
