// apps/cli/tests/inspector.e2e.test.ts
//
// T-2-F3: generated server.ts loads in MCP Inspector and `tools/list`
// returns the real Pass-1 tools with non-empty descriptions.
//
// Strategy (RESEARCH lines 866-912 + plan note line 887): drive the rendered
// stdio MCP server directly with two JSON-RPC messages (`initialize` +
// `tools/list`). This is more reliable than spawning the GUI Inspector
// binary in CI and keeps the test contract-focused.
//
// We render the server.ts string into a tmpdir, use `bun` to run it with
// the monorepo's already-resolved node_modules linked in, and parse the
// JSON-RPC stdout responses.

import { spawn } from 'bun';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { stripe as stripeFixture } from '@mcpgen/engine-fixtures';
import type { Pass1Output } from '@mcpgen/ir';

import { renderServerTs } from '../src/init/render_stub.js';

const cliRoot = resolve(dirname(import.meta.path), '..');
let serverDir = '';

beforeAll(() => {
  serverDir = mkdtempSync(join(tmpdir(), 'mcpgen-inspector-'));
  // Link apps/cli/node_modules so `bun server.ts` can resolve
  // `@modelcontextprotocol/sdk` and `zod` directly without a fresh `npm install`.
  symlinkSync(join(cliRoot, 'node_modules'), join(serverDir, 'node_modules'));
  writeFileSync(
    join(serverDir, 'server.ts'),
    renderServerTs('stripe-api', stripeFixture.pass1Output as Pass1Output),
  );
  // package.json with `type: module` so .ts default resolution stays consistent.
  writeFileSync(
    join(serverDir, 'package.json'),
    JSON.stringify({ name: 'mcpgen-stripe-api', type: 'module' }, null, 2),
  );
});

afterAll(() => {
  if (serverDir !== '') {
    rmSync(serverDir, { recursive: true, force: true });
  }
});

describe('Inspector E2E (T-2-F3)', () => {
  test(
    'generated server.ts validates with MCP Inspector and tools/list returns real tools',
    async () => {
      const result = await runMcpToolsList(join(serverDir, 'server.ts'));

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain('search');
      expect(toolNames).toContain('fetch');
      expect(toolNames).toContain('list_collections');
      expect(toolNames).toContain('list_objects');
      expect(toolNames).toContain('upsert');
      expect(toolNames).toContain('delete');

      for (const tool of result.tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(10);
      }
    },
    30_000,
  );
});

interface ToolDefinition {
  name: string;
  description: string;
}

interface ToolsListResult {
  tools: ToolDefinition[];
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Spawn `bun server.ts` over stdio, send the MCP initialise + tools/list
 * pair, and parse the second response. Throws on protocol error.
 */
async function runMcpToolsList(serverTsPath: string): Promise<ToolsListResult> {
  const proc = spawn(['bun', serverTsPath], {
    cwd: dirname(serverTsPath),
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const initializeRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'inspector-e2e-test', version: '0.0.1' },
    },
  };
  const initializedNotification = {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  };
  const toolsListRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  };

  // Bun spawns expose stdin as a FileSink with .write() / .flush().
  proc.stdin.write(`${JSON.stringify(initializeRequest)}\n`);
  proc.stdin.write(`${JSON.stringify(initializedNotification)}\n`);
  proc.stdin.write(`${JSON.stringify(toolsListRequest)}\n`);
  await proc.stdin.flush();

  // Read stdout until we have at least 2 JSON-RPC responses (id=1 and id=2).
  // initializedNotification has no response.
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const responses = new Map<number | string, JsonRpcResponse<unknown>>();

  const overallDeadlineMs = 25_000;
  const start = Date.now();

  while (responses.size < 2) {
    if (Date.now() - start > overallDeadlineMs) {
      proc.kill();
      throw new Error(
        `MCP Inspector E2E timed out (got ${responses.size} responses; buffer=${buffer.slice(0, 200)})`,
      );
    }
    const readPromise = reader.read();
    const timeoutPromise = new Promise<null>((res) =>
      setTimeout(() => res(null), 500),
    );
    const racing = await Promise.race([readPromise, timeoutPromise]);
    if (racing === null) continue;
    if (racing.done) break;
    buffer += decoder.decode(racing.value, { stream: true });

    let newlineIdx = buffer.indexOf('\n');
    while (newlineIdx >= 0) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line.length > 0) {
        try {
          const parsed = JSON.parse(line) as JsonRpcResponse<unknown>;
          if (parsed.id !== undefined) {
            responses.set(parsed.id, parsed);
          }
        } catch {
          // skip non-JSON lines
        }
      }
      newlineIdx = buffer.indexOf('\n');
    }
  }

  // Cleanup
  proc.stdin.end();
  proc.kill();

  const toolsListResp = responses.get(2);
  if (toolsListResp === undefined) {
    throw new Error('No tools/list response received');
  }
  if (toolsListResp.error !== undefined) {
    throw new Error(
      `tools/list error: ${toolsListResp.error.code} — ${toolsListResp.error.message}`,
    );
  }
  return toolsListResp.result as ToolsListResult;
}
