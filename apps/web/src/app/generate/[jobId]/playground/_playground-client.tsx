// apps/web/src/app/generate/[jobId]/playground/_playground-client.tsx
//
// M-4 Agent 3 (Playground) — wires the locked Playground screen.
//
// The new canon Playground signature ({ onBack, onDeploy, sample })
// dropped the `tools`, `history`, and `onRunTool` real-data slots
// (canon now uses internal hardcoded sample data). We keep the local
// derivation logic below — tool catalog fetch + run-tool BFF call —
// for future reuse when a wired Playground variant is reintroduced.

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import type {
  PlaygroundRunArgs,
  PlaygroundRunResult,
  PlaygroundToolHint,
} from '@/lib/jsx-bridge';

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

// audit:allow loading-state placeholder; renders only before engine artefacts arrive (zero values)
const FALLBACK_SAMPLE: LocalLockedSample = {
  id: 'live',
  name: 'generated MCP',
  endpoints: 0,
  tools: 0,
  save: 0,
};

interface Props {
  jobId: string;
  endpointCount?: number;
  specName?: string;
  toolCount?: number;
}

/**
 * Build the locked-screen `sample = {id, name, endpoints, tools, save}`
 * from real engine artefacts. FALLBACK_SAMPLE only fires when the page // audit:allow doc comment
 * renders before the engine writes artefacts to L1 (rare race).
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
    // audit:allow returns zero-valued loading placeholder
    return FALLBACK_SAMPLE;
  }
  const endpoints = endpointCount;
  const tools = toolCount;
  const save = endpoints > tools ? Math.round(((endpoints - tools) / endpoints) * 100) : 0;
  const name = specName !== undefined && specName.length > 0 ? specName : 'generated MCP';
  return { id: 'live', name, endpoints, tools, save };
};

interface JobArtifactShape {
  partial_result?: {
    final_tools?: ReadonlyArray<{ name?: unknown }>;
  };
}

const fetchToolCatalog = async (jobId: string): Promise<ReadonlyArray<PlaygroundToolHint>> => {
  const res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = (await res.json()) as JobArtifactShape;
  const tools = json.partial_result?.final_tools ?? [];
  const hints: PlaygroundToolHint[] = [];
  for (const t of tools) {
    if (typeof t?.name === 'string' && t.name.length > 0) hints.push({ name: t.name });
  }
  return hints;
};

const runToolViaBff = async (
  jobId: string,
  args: PlaygroundRunArgs,
): Promise<PlaygroundRunResult> => {
  const res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/run-tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_name: args.tool_name, args: args.args }),
  });
  if (!res.ok) {
    if (res.status === 404) {
      // run-tool endpoint not yet implemented in apps/api — surface a
      // user-readable message (locked screen renders it in the agent
      // message body) instead of a generic 404.
      throw new Error('run-tool endpoint not yet available (Phase M-5)');
    }
    const body = await res.text().catch(() => '');
    throw new Error(`run-tool failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as PlaygroundRunResult;
  return json;
};

export default function PlaygroundClientShell({
  jobId,
  endpointCount,
  specName,
  toolCount,
}: Props): ReactElement {
  const sample = deriveSample(endpointCount, specName, toolCount);
  const [tools, setTools] = useState<ReadonlyArray<PlaygroundToolHint>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const catalog = await fetchToolCatalog(jobId);
        if (!cancelled) setTools(catalog);
      } catch {
        // Tool catalog is best-effort — the locked screen falls back to
        // a generic agent dropdown without it. Do not surface as an
        // error; SSE / generation flow is not blocked by this.
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, [jobId]);

  const onRunTool = useMemo(
    () => async (args: PlaygroundRunArgs): Promise<PlaygroundRunResult> =>
      runToolViaBff(jobId, args),
    [jobId],
  );

  // The new canon Playground signature dropped `tools`, `history`, and
  // `onRunTool`. Canon now uses internal hardcoded sample data. We keep
  // the local derivations (`tools`, `onRunTool`) above for future reuse
  // when the BFF endpoint lands and a wired Playground variant is added.
  void tools;
  void onRunTool;
  return <PlaygroundClient jobId={jobId} sample={sample} />;
}
