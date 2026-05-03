// apps/web/src/app/generate/[jobId]/deploy/_deploy-client.tsx
//
// M-4 Agent 3 (Deploy) — wires the locked Deploy + DeploySuccess screens
// to the real BFF deploy endpoint and Claude Desktop config generator.
//
// Flow:
//   1. User picks target + auth + clicks Deploy → screen-deploy calls
//      `onSubmit({target, auth})` (M-4 prop addition).
//   2. We call `deploy(generationId)` from `lib/api/dashboard-client.ts`
//      which posts to `/api/v1/deploy/:generationId` with an idempotency
//      key + parses the 202 / 409 collision response.
//   3. On 202 we read `{server_name, server_url, claude_desktop_config}`
//      from the response, format the config block via
//      `formatConfigJson(buildConfig(...))`, and switch local state to
//      render `DeploySuccess` with the real values.
//   4. On 409 collision we currently surface a console error — the locked
//      DeployScreenWithAnonChrome (M-3) already covers the rename modal
//      path; this client uses DeployWrapper directly per the M-4 brief
//      and defers the rename UI to M-5 ephemeral-collision work.
//
// References:
//   - .planning/ui-rebuild-sandbox/INTEGRATION-MAP.md §1.2 + §2.7
//   - apps/web/src/lib/api/dashboard-client.ts (deploy fn)
//   - apps/web/src/lib/claude-desktop/config.ts (buildConfig + formatConfigJson)

'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState, type ReactElement } from 'react';

import { deploy } from '@/lib/api/dashboard-client';
import { buildConfig, copyToClipboard, formatConfigJson } from '@/lib/claude-desktop/config';

// See _stream-client.tsx for explanation: do NOT import SAMPLE_APIS at
// module scope — triggers SSR `window is not defined` crash.

interface LocalLockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

// M-4: switch from DeployScreenWithAnonChrome (M-3 transitional alias) to
// DeployWrapper directly. Anon-chrome composition no longer applies — the
// locked Deploy screen now exposes `onSubmit` for wired deploy + the
// DeploySuccess screen accepts `mcpUrl` / `claudeDesktopConfig` props.
const DeployWrapper = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.DeployWrapper })),
  { ssr: false },
);
const DeploySuccessWrapper = dynamic(
  () =>
    import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.DeploySuccessWrapper })),
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

interface DeployedState {
  readonly mcpUrl: string;
  readonly claudeDesktopConfig: string;
  readonly serverName: string;
}

interface ServerConfigBlock {
  readonly mcpServers: Record<
    string,
    { readonly url: string; readonly headers?: Record<string, string> | undefined }
  >;
}

/**
 * Re-pack the BFF response config into `BuildConfigInput` shape (single
 * mcpServers entry → buildConfig args). Picks the first entry; if the
 * response shape is malformed we fall back to the response's
 * server_name + server_url fields.
 */
const extractConfigInput = (
  block: ServerConfigBlock,
  fallbackServerName: string,
): { serverName: string; serverUrl: string; headers?: Record<string, string> } => {
  const entries = Object.entries(block.mcpServers);
  if (entries.length > 0) {
    const [name, entry] = entries[0]!;
    if (entry.headers !== undefined) {
      return { serverName: name, serverUrl: entry.url, headers: entry.headers };
    }
    return { serverName: name, serverUrl: entry.url };
  }
  return { serverName: fallbackServerName, serverUrl: '' };
};

export default function DeployClientShell({
  jobId,
  endpointCount,
  specName,
  toolCount,
}: Props): ReactElement {
  const sample = deriveSample(endpointCount, specName, toolCount);
  const [deployed, setDeployed] = useState<DeployedState | null>(null);

  const handleSubmit = useCallback(async (): Promise<void> => {
    const result = await deploy(jobId);
    if (!result.ok) {
      // 409 collision or transport error — bubble as Promise rejection so
      // the locked Deploy screen surfaces its recoverable failed state.
      // M-5 ephemeral-collision plan owns the rename-modal UI; for now
      // the wrapper just shows the failure card with retry CTA.
      // The DeployResult discriminated union has overlapping `ok: false`
      // members (409-collision vs other-status) — narrow by presence of
      // `collision` rather than `status` so TS picks the right arm.
      if ('collision' in result) {
        throw new Error(
          `server name ${result.collision.existing_name} taken; suggested ${result.collision.suggested_name}`,
        );
      }
      throw new Error(result.message);
    }
    const { server_name, server_url, claude_desktop_config } = result.data;
    // Re-format from the structured response so the JSON block is
    // deterministic + indented for paste-into-Claude-Desktop UX.
    // Always pass through buildConfig so the local schema (with
    // exactOptionalPropertyTypes) is honored on round-trip.
    const configJson = formatConfigJson(
      buildConfig(
        claude_desktop_config !== undefined
          ? extractConfigInput(claude_desktop_config, server_name)
          : { serverName: server_name, serverUrl: server_url },
      ),
    );
    setDeployed({
      mcpUrl: server_url,
      claudeDesktopConfig: configJson,
      serverName: server_name,
    });
  }, [jobId]);

  const handleCopy = useCallback((text: string, _key: string): void => {
    // Fire-and-forget — locked screen already manages its `copied` flag
    // for the success-checkmark transition.
    void copyToClipboard(text);
  }, []);

  const handleDownload = useCallback((): void => {
    if (deployed === null) return;
    if (typeof window === 'undefined') return;
    const blob = new Blob([deployed.claudeDesktopConfig], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deployed.serverName}.claude-desktop.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [deployed]);

  const handleDashboard = useCallback((): void => {
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  }, []);

  if (deployed !== null) {
    return (
      <DeploySuccessWrapper
        sample={sample}
        mcpUrl={deployed.mcpUrl}
        claudeDesktopConfig={deployed.claudeDesktopConfig}
        serverName={deployed.serverName}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onDashboard={handleDashboard}
      />
    );
  }

  return (
    <DeployWrapper
      jobId={jobId}
      sample={sample}
      onSubmit={handleSubmit}
    />
  );
}
