// apps/web/tests/unit/app/generate/deploy-client.test.ts
//
// M-4 Agent 3 — wiring tests for the deploy client helpers. The client
// shell renders the locked Deploy screen via next/dynamic (window-bound),
// so these tests focus on the pure logic that the client wraps:
//   1. Claude Desktop config block round-trip via buildConfig +
//      formatConfigJson
//   2. deploy() result shape on 202 success → DeploySuccess props
//   3. deploy() result shape on 409 collision → throws
//
// Real RTL render of DeployClientShell is intentionally NOT covered here —
// the locked screens read `window.useErrorMode` / `window.SAMPLE_APIS`
// which are wired only in the next/dynamic import chain (loader.ts).
// E2E coverage for the deploy flow lives in tests/e2e/deploy-collision.spec.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig, formatConfigJson } from '@/lib/claude-desktop/config';
import { deploy } from '@/lib/api/dashboard-client';

const TEST_GENERATION_ID = '01HXAAAAAAAAAAAAAAAAAAAAA1';

function installLocalStorageShim(): void {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(i: number): string | null {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
}

describe('M-4 Agent 3 — deploy client wiring', () => {
  beforeEach(() => {
    installLocalStorageShim();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('buildConfig + formatConfigJson produces the JSON block the locked DeploySuccess renders', () => {
    const block = buildConfig({
      serverName: 'fixture-stripe-mcp',
      serverUrl: 'https://fixture-stripe-mcp.mcpgen.dev/mcp',
    });
    const json = formatConfigJson(block);
    // The locked screen-deploy DeploySuccess renders `claudeDesktopConfig`
    // verbatim inside <pre>; the indented shape must match the canon.
    expect(json).toContain('"mcpServers"');
    expect(json).toContain('"fixture-stripe-mcp"');
    expect(json).toContain('"https://fixture-stripe-mcp.mcpgen.dev/mcp"');
    expect(json.split('\n').length).toBeGreaterThan(3);
  });

  it('deploy() resolves with {server_name, server_url, claude_desktop_config} on 202', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          // RFC 9562 UUID v4 (DeployResponseSchema requires v1-8 format).
          deployment_id: '11111111-1111-4111-8111-111111111111',
          server_name: 'fixture-stripe-mcp',
          server_url: 'https://fixture-stripe-mcp.mcpgen.dev',
          claude_desktop_config: {
            mcpServers: {
              'fixture-stripe-mcp': { url: 'https://fixture-stripe-mcp.mcpgen.dev' },
            },
          },
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await deploy(TEST_GENERATION_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.server_name).toBe('fixture-stripe-mcp');
      expect(result.data.server_url).toBe('https://fixture-stripe-mcp.mcpgen.dev');
      expect(result.data.claude_desktop_config).toBeDefined();
    }
  });

  it('deploy() returns 409 collision result for the wrapper to surface', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'server_name_collision',
          existing_name: 'fixture-stripe-mcp',
          suggested_name: 'fixture-stripe-mcp-2',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await deploy(TEST_GENERATION_ID);
    expect(result.ok).toBe(false);
    if (!result.ok && 'collision' in result) {
      expect(result.collision.existing_name).toBe('fixture-stripe-mcp');
      expect(result.collision.suggested_name).toBe('fixture-stripe-mcp-2');
    }
  });
});
