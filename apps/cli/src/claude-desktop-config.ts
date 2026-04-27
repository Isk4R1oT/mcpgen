// apps/cli/src/claude-desktop-config.ts
//
// Phase 6 (per RUN-07 / pitfall #30) — Claude Desktop config block emit
// with collision detection by BOTH `mcpServers.{name}` AND URL.
//
// Path table (RESEARCH §"Pitfall 9"):
//   macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
//   Windows: %APPDATA%\Claude\claude_desktop_config.json
//   Linux:   ~/.config/Claude/claude_desktop_config.json
//
// Phase-6 default: emit the block to stdout for the user to paste manually.
// Direct file mutation (with --write flag) is opt-in to avoid surprising
// the user.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveConfigPath(): string {
  const p = process.platform;
  if (p === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    );
  }
  if (p === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

export interface McpServerEntry {
  readonly url: string;
  readonly transport?: 'sse' | 'http';
}

export interface ClaudeDesktopConfig {
  mcpServers?: Record<string, McpServerEntry>;
}

export function readExistingConfig(path: string = resolveConfigPath()): ClaudeDesktopConfig {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ClaudeDesktopConfig;
  } catch {
    return {};
  }
}

export interface ClaudeDesktopConfigBlockInput {
  readonly name: string;
  readonly url: string;
}

export interface ClaudeDesktopConfigBlockOutput {
  readonly mcpServers: Record<string, McpServerEntry>;
}

export function buildBlock(
  input: ClaudeDesktopConfigBlockInput,
  existing: ClaudeDesktopConfig,
): ClaudeDesktopConfigBlockOutput {
  const existingServers = existing.mcpServers ?? {};
  if (existingServers[input.name]) {
    throw new Error(
      `mcp_server_name_collision: ${input.name} already exists. Use --name to override.`,
    );
  }
  for (const [k, v] of Object.entries(existingServers)) {
    if (v.url === input.url) {
      throw new Error(
        `mcp_server_url_collision: ${input.url} is already used by '${k}'.`,
      );
    }
  }
  return {
    mcpServers: { [input.name]: { url: input.url, transport: 'http' } },
  };
}

export function emitBlockToStdout(block: ClaudeDesktopConfigBlockOutput): void {
  // Pretty-print with 2-space indent for paste-ability.
  process.stdout.write('\n# Add this block to your Claude Desktop config:\n');
  process.stdout.write(`#   ${resolveConfigPath()}\n\n`);
  process.stdout.write(`${JSON.stringify(block, null, 2)}\n`);
}
