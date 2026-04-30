// apps/api/src/lib/claude-desktop-config.ts
//
// Plan 09-04 Task 2 — pure helper that builds a Claude Desktop
// `mcpServers` config block for a deployment. The block is the snippet
// the dashboard surfaces as copy-to-clipboard / `claude://install` deep
// link content (Phase 7 D-23 / D-24 / D-25).
//
// Mirrors the frontend's apps/web/src/lib/claude-desktop/config.ts
// `buildConfig` shape verbatim so the wire-shape contract holds — but
// adds server-side knowledge of `auth_mode` so passthrough-mode entries
// embed an `X-Upstream-Auth: <paste-your-API-key-here>` placeholder
// (T-9-bff-auth-08 — placeholder string only; never serializes a real
// upstream key per RUN-03 pass-through invariant).
//
// References:
//   - apps/web/src/lib/claude-desktop/config.ts (frontend twin)
//   - .planning/phases/09-observability-polish/09-04-PLAN.md Task 2
//   - .planning/phases/09-observability-polish/09-CONTEXT.md D-23

export type AuthMode = 'passthrough' | 'stored' | 'oauth';

export interface ClaudeDesktopConfigInput {
  server_name: string;
  server_url: string;
  auth_mode: AuthMode;
}

export interface ClaudeDesktopConfigBlock {
  mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
}

/**
 * Builds a Claude Desktop `mcpServers` config block for one deployment.
 *
 * - passthrough: embeds `X-Upstream-Auth: <paste-your-API-key-here>`
 *   placeholder so the user knows where to paste their API key. NEVER
 *   serializes a real upstream key (CLAUDE.md §6 / RUN-03 pass-through
 *   invariant).
 * - stored: no headers — server handles auth via stored credentials
 *   (AES-256-GCM in CF KV per architecture §6).
 * - oauth: no headers — browser-based flow handles auth.
 *
 * Pure function — no I/O, no env vars, deterministic output. Unit-testable
 * in isolation; the route's integration tests then verify the wiring.
 */
export function buildClaudeDesktopConfig(
  d: ClaudeDesktopConfigInput,
): ClaudeDesktopConfigBlock {
  const entry: { url: string; headers?: Record<string, string> } = {
    url: d.server_url,
  };
  if (d.auth_mode === 'passthrough') {
    entry.headers = { 'X-Upstream-Auth': '<paste-your-API-key-here>' };
  }
  // stored / oauth: no headers — server handles auth.
  return { mcpServers: { [d.server_name]: entry } };
}
