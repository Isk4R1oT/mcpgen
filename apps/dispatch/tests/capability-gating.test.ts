// apps/dispatch/tests/capability-gating.test.ts
//
// Phase 6 / RUN-01 / T-6-04 / pitfall #4.
// MCP protocolVersion negotiator. For clients with protocolVersion < 2025-06-18,
// dispatch strips outputSchema from tools/list and structuredContent from
// tools/call response bodies. Per CONTEXT D-11.

import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { capabilityGate, _resetSessionVersionsForTest } from '../src/middleware/capabilityGate.js';
import { MOCK_PROTOCOL_VERSIONS, makeInitializeRequest } from '../../../tests/runtime/fixtures/mock-mcp-clients.js';

interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly outputSchema?: Record<string, unknown>;
}
interface ToolsListResult {
  readonly tools: ToolSchema[];
}
interface ToolCallResult {
  readonly content: { type: string; text: string }[];
  readonly structuredContent?: Record<string, unknown>;
}

function buildApp(): Hono {
  const app = new Hono();
  app.use('*', capabilityGate);
  // Stand-in upstream that always responds with both modern fields present.
  app.post('/mcp', async (c) => {
    const body = (await c.req.json()) as { method?: string };
    if (body.method === 'tools/list') {
      const result: ToolsListResult = {
        tools: [
          {
            name: 'search',
            description: 'Search the upstream',
            outputSchema: { type: 'object', properties: { hits: { type: 'array' } } },
          },
        ],
      };
      return c.json({ jsonrpc: '2.0', id: 1, result });
    }
    if (body.method === 'tools/call') {
      const result: ToolCallResult = {
        content: [{ type: 'text', text: '{"hits":[]}' }],
        structuredContent: { hits: [] },
      };
      return c.json({ jsonrpc: '2.0', id: 1, result });
    }
    if (body.method === 'initialize') {
      return c.json({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } });
    }
    return c.json({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'method not found' } }, 404);
  });
  return app;
}

beforeEach(() => {
  _resetSessionVersionsForTest();
});

describe('capabilityGate — protocolVersion negotiation', () => {
  it('keeps outputSchema for clients on protocolVersion 2025-06-18 (latest)', async () => {
    const app = buildApp();
    const sessionId = crypto.randomUUID();

    const initRes = await app.request('http://localhost:8789/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Mcp-Session-Id': sessionId, host: 'localhost' },
      body: JSON.stringify(makeInitializeRequest(MOCK_PROTOCOL_VERSIONS.latest)),
    });
    expect(initRes.status).toBe(200);

    const listRes = await app.request('http://localhost:8789/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Mcp-Session-Id': sessionId, host: 'localhost' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(listRes.status).toBe(200);
    const json = (await listRes.json()) as { result: ToolsListResult };
    const firstTool = json.result.tools[0];
    expect(firstTool).toBeDefined();
    expect(firstTool?.outputSchema).toBeDefined();
  });

  it('strips outputSchema from tools/list responses for legacy 2024-11-05 clients', async () => {
    const app = buildApp();
    const sessionId = crypto.randomUUID();

    await app.request('http://localhost:8789/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Mcp-Session-Id': sessionId, host: 'localhost' },
      body: JSON.stringify(makeInitializeRequest(MOCK_PROTOCOL_VERSIONS.legacy)),
    });

    const listRes = await app.request('http://localhost:8789/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Mcp-Session-Id': sessionId, host: 'localhost' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(listRes.status).toBe(200);
    const json = (await listRes.json()) as { result: ToolsListResult };
    const firstTool = json.result.tools[0];
    expect(firstTool).toBeDefined();
    expect(firstTool?.outputSchema).toBeUndefined();
  });

  it('strips structuredContent from tools/call responses for prior 2025-03-26 clients', async () => {
    const app = buildApp();
    const sessionId = crypto.randomUUID();

    await app.request('http://localhost:8789/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Mcp-Session-Id': sessionId, host: 'localhost' },
      body: JSON.stringify(makeInitializeRequest(MOCK_PROTOCOL_VERSIONS.prior)),
    });

    const callRes = await app.request('http://localhost:8789/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Mcp-Session-Id': sessionId, host: 'localhost' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search' } }),
    });
    expect(callRes.status).toBe(200);
    const json = (await callRes.json()) as { result: ToolCallResult };
    expect(json.result.content).toBeDefined();
    expect(json.result.structuredContent).toBeUndefined();
  });
});
