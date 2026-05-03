// apps/web/src/app/generate/[jobId]/preview/_preview-client.tsx
//
// Phase M-4 Agent 2 — wires real `final_tools` artefacts into the locked
// Preview screen. Derives:
//   - sample        from endpointCount + specName + finalTools.length
//   - categories    from FinalTool.type buckets (universal / action / …)
//   - tokenBudgets  from a structural baseline (1:1 endpoint cost) and
//                   a per-tool cost approximation
//   - excludedEndpoints: empty until the BFF surfaces drop reasons
//                        (Pass 0 emits this; not yet propagated through
//                        partial_result — Phase 5+ work).

'use client';

import dynamic from 'next/dynamic';
import type { ComponentType, ReactElement } from 'react';

import type { FinalTool, QualityReport as QualityReportType } from '@mcpgen/ir';

import type { PreviewWrapperProps } from '@/lib/jsx-bridge/screens';

// See _stream-client.tsx for explanation: do NOT import SAMPLE_APIS at
// module scope — triggers SSR `window is not defined` crash.

interface LocalLockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

interface PreviewCategory {
  id: string;
  label: string;
  count: number;
  on: boolean;
  rare: boolean;
}

interface ExcludedEndpoint {
  method: string;
  path: string;
  reason: string;
  override: boolean;
}

// Plan 09.1-07 → M-4 Agent 2: switch from transitional alias
// `PreviewScreenWithAnonChrome` (re-export from wrapper.tsx) to the canon
// `PreviewWrapper` directly from `@/lib/jsx-bridge/screens`.
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

/**
 * Build the locked-screen `sample` from real engine artefacts.
 *
 * The locked Preview screen reads `{id, name, endpoints, tools, save}` for
 * its bento (header label + endpoint/tool count + token-savings %). When the
 * BFF returns no artefacts (e.g. early page load before the engine writes
 * to L1), we surface zeros rather than a hard-coded fallback — the locked
 * screen renders a coherent "0 endpoints" state instead of leaking a
 * fake "lumen payments" name into production. This is consistent with the
 * I-2 invariant (no mock data in production path).
 */
const deriveSample = (
  endpointCount: number | undefined,
  specName: string | undefined,
  finalTools: ReadonlyArray<FinalTool> | undefined,
): LocalLockedSample => {
  const tools = finalTools !== undefined ? finalTools.length : 0;
  const endpoints = endpointCount ?? 0;
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

/**
 * Bucket FinalTool by type → display category. Universal tools share a
 * single `core` row; action / workflow / specialized each get their own.
 * Empty buckets are dropped. `on` defaults to true (everything ships);
 * `rare` flags low-coverage buckets to match the locked visual.
 */
const deriveCategories = (
  finalTools: ReadonlyArray<FinalTool> | undefined,
): ReadonlyArray<PreviewCategory> => {
  if (finalTools === undefined || finalTools.length === 0) return [];
  let universal = 0;
  let action = 0;
  let workflow = 0;
  let specialized = 0;
  for (const t of finalTools) {
    if (t.type === 'universal') universal += 1;
    else if (t.type === 'action') action += 1;
    else if (t.type === 'workflow') workflow += 1;
    else if (t.type === 'specialized') specialized += 1;
  }
  const out: PreviewCategory[] = [];
  if (universal > 0) {
    out.push({ id: 'universal', label: 'core', count: universal, on: true, rare: false });
  }
  if (action > 0) {
    out.push({ id: 'action', label: 'actions', count: action, on: true, rare: false });
  }
  if (workflow > 0) {
    out.push({ id: 'workflow', label: 'workflows', count: workflow, on: true, rare: false });
  }
  if (specialized > 0) {
    out.push({
      id: 'specialized',
      label: 'specialized',
      count: specialized,
      on: false,
      rare: true,
    });
  }
  return out;
};

/**
 * Token budgets — replaces hardcoded `naiveTokens=14200` /
 * `baseOptTokens=2800|3400`.
 *
 * Naive baseline ≈ 1 tool per endpoint × 250 tokens (typical raw OpenAPI
 * tool description per Anthropic engineering blog "Writing effective
 * tools for agents"). With Six-Tool Pattern (Pass 1) we collapse to N
 * final tools, each carrying ~350 tokens of authored description (Pass 2
 * length budget midpoint).
 *
 * These are display approximations — the real per-call token usage is
 * surfaced separately in dashboard metrics (Phase 8). The screen's job is
 * to communicate the structural compression ratio.
 */
const deriveTokenBudgets = (
  endpointCount: number | undefined,
  finalTools: ReadonlyArray<FinalTool> | undefined,
): { naive: number; opt: number } => {
  const endpoints = endpointCount ?? 0;
  const tools = finalTools !== undefined ? finalTools.length : 0;
  const naive = endpoints * 250;
  const opt = tools * 350;
  return { naive, opt };
};

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
