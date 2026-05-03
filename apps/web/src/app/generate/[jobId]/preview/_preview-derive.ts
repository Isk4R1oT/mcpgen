// apps/web/src/app/generate/[jobId]/preview/_preview-derive.ts
//
// Pure helpers that map BFF artefacts (`final_tools`, `endpoint_count`,
// `spec_name`) onto the display-friendly shapes consumed by the locked
// screen-preview.jsx. Extracted from `_preview-client.tsx` so the
// derivation logic is unit-testable without booting the React tree.

import type { FinalTool } from '@mcpgen/ir';

export interface LocalLockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

export interface PreviewCategory {
  id: string;
  label: string;
  count: number;
  on: boolean;
  rare: boolean;
}

export interface ExcludedEndpoint {
  method: string;
  path: string;
  reason: string;
  override: boolean;
}

/**
 * Build the locked-screen `sample` from real engine artefacts.
 *
 * The locked Preview screen reads `{id, name, endpoints, tools, save}`
 * for its bento (header label + endpoint/tool count + token-savings %).
 * When the BFF returns no artefacts (e.g. early page load before the
 * engine writes to L1), we surface zeros rather than a hard-coded
 * fallback — the locked screen renders a coherent "0 endpoints" state
 * instead of leaking a fake "lumen payments" name into production. This
 * is consistent with the I-2 invariant (no mock data in production
 * path).
 */
export const deriveSample = (
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
export const deriveCategories = (
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
 * Naive baseline ≈ 1 tool per endpoint × 250 tokens (typical raw
 * OpenAPI tool description per Anthropic engineering blog "Writing
 * effective tools for agents"). With Six-Tool Pattern (Pass 1) we
 * collapse to N final tools, each carrying ~350 tokens of authored
 * description (Pass 2 length budget midpoint).
 *
 * These are display approximations — the real per-call token usage is
 * surfaced separately in dashboard metrics (Phase 8). The screen's job
 * is to communicate the structural compression ratio.
 */
export const deriveTokenBudgets = (
  endpointCount: number | undefined,
  finalTools: ReadonlyArray<FinalTool> | undefined,
): { naive: number; opt: number } => {
  const endpoints = endpointCount ?? 0;
  const tools = finalTools !== undefined ? finalTools.length : 0;
  const naive = endpoints * 250;
  const opt = tools * 350;
  return { naive, opt };
};
