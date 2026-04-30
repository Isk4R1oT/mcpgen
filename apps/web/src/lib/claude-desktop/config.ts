// apps/web/src/lib/claude-desktop/config.ts
//
// Plan 07-03 — Claude Desktop config block helpers. The locked screen-deploy
// JSX has a slot for a JSON config block; this module produces the JSON
// payload + clipboard helper + `claude://install?...` deep-link.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-23, D-24, D-25
//   - .planning/research/PITFALLS.md #30 (server-name collision detection)

export interface ClaudeDesktopConfigBlock {
  mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
}

interface BuildConfigInput {
  serverName: string;
  serverUrl: string;
  headers?: Record<string, string>;
}

export const buildConfig = ({
  serverName,
  serverUrl,
  headers,
}: BuildConfigInput): ClaudeDesktopConfigBlock => {
  const entry: { url: string; headers?: Record<string, string> } = { url: serverUrl };
  if (headers !== undefined && Object.keys(headers).length > 0) entry.headers = headers;
  return { mcpServers: { [serverName]: entry } };
};

export const formatConfigJson = (config: ClaudeDesktopConfigBlock): string =>
  JSON.stringify(config, null, 2);

/**
 * Copy `text` to the user's clipboard. Returns true on success, false when
 * the clipboard API is unavailable (Safari incognito, insecure context, etc.) —
 * graceful degradation per CLAUDE.md "external API calls" rule. Caller decides
 * to surface a fallback (e.g., select-text-and-prompt-Cmd-C).
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/**
 * `claude://install?name=<server>` deep-link. Per D-25 the protocol handler
 * may not be registered in the user's OS — the link is fire-and-forget and
 * the deploy screen also surfaces a copy-to-clipboard fallback CTA.
 */
export const buildClaudeProtocolHref = (serverName: string): string =>
  `claude://install?name=${encodeURIComponent(serverName)}`;
