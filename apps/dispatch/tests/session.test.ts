// apps/dispatch/tests/session.test.ts
//
// Phase 6 / RUN-01 / D-11.
// Per-session protocolVersion map keyed by Mcp-Session-Id. An `initialize`
// request without an Mcp-Session-Id header gets a generated UUID set in the
// response Mcp-Session-Id header; subsequent requests with that ID find the
// persisted protocolVersion.

import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { capabilityGate, _resetSessionVersionsForTest } from '../src/middleware/capabilityGate.js';
import { MOCK_PROTOCOL_VERSIONS, makeInitializeRequest } from '../../../tests/runtime/fixtures/mock-mcp-clients.js';

interface ToolsListResponse {
  readonly result: { readonly tools: { readonly name: string; readonly outputSchema?: Record<string, unknown> }[] };
}

function buildApp(): Hono {
  const app = new Hono();
  app.use('*', capabilityGate);
  app.post('/mcp', async (c) => {
    const body = (await c.req.json()) as { method?: string };
    if (body.method === 'initialize') {
      return c.json({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } });
    }
    if (body.method === 'tools/list') {
      return c.json({
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: [
            { name: 'search', description: 'Search', outputSchema: { type: 'object' } },
          ],
        },
      });
    }
    return c.json({ jsonrpc: '2.0', id: 1, error: { code: -32601 } }, 404);
  });
  return app;
}

beforeEach(() => {
  _resetSessionVersionsForTest();
});

describe('session — Mcp-Session-Id persistence across initialize → tools/list', () => {
  it('generates and returns a Mcp-Session-Id when initialize arrives without one', async () => {
    const app = buildApp();
    const initRes = await app.request('http://localhost:8789/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify(makeInitializeRequest(MOCK_PROTOCOL_VERSIONS.legacy)),
    });
    expect(initRes.status).toBe(200);
    const sid = initRes.headers.get('Mcp-Session-Id');
    expect(sid).toBeTruthy();
    expect(sid?.length ?? 0).toBeGreaterThan(8);
  });

  it('persists protocolVersion across requests with the same Mcp-Session-Id (legacy client → outputSchema stripped)', async () => {
    const app = buildApp();
    // Step 1: initialize with no Mcp-Session-Id → server generates one
    const initRes = await app.request('http://localhost:8789/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify(makeInitializeRequest(MOCK_PROTOCOL_VERSIONS.legacy)),
    });
    const sid = initRes.headers.get('Mcp-Session-Id');
    expect(sid).toBeTruthy();

    // Step 2: tools/list with the returned sid — outputSchema MUST be stripped
    const listRes = await app.request('http://localhost:8789/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Mcp-Session-Id': sid as string, host: 'localhost' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(listRes.status).toBe(200);
    const json = (await listRes.json()) as ToolsListResponse;
    const firstTool = json.result.tools[0];
    expect(firstTool).toBeDefined();
    expect(firstTool?.outputSchema).toBeUndefined();
  });
});
