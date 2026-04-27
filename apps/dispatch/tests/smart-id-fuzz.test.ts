// apps/dispatch/tests/smart-id-fuzz.test.ts
//
// Phase 6 / RUN-01 / T-6-01 / pitfall #1.
// Cross-tenant smart-ID fuzz: dispatch validates the smart-ID prefix in any
// forwarded JSON-RPC params (id/ids/cursor) against the resolved tenantPrefix.
// Mismatch returns 403 smart_id_tenant_mismatch.
// Per CONTEXT D-03 + D-07 (single-source-of-truth regex shared with F1 fixture).

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { smartIdFuzz } from '../src/middleware/smartIdFuzz.js';

interface TestVariables {
  tenantPrefix?: string;
}

function buildApp(tenantPrefix: string | undefined): Hono<{ Variables: TestVariables }> {
  const app = new Hono<{ Variables: TestVariables }>();
  app.use('*', async (c, next) => {
    if (tenantPrefix !== undefined) c.set('tenantPrefix', tenantPrefix);
    return next();
  });
  app.use('*', smartIdFuzz);
  app.post('*', (c) => c.json({ ok: true }));
  return app;
}

describe('smartIdFuzz — cross-tenant prefix protection', () => {
  it('returns 403 smart_id_tenant_mismatch when the smart-ID prefix does NOT match the tenant', async () => {
    const app = buildApp('alice-stripe');
    const res = await app.request('http://localhost/t/alice-stripe/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'fetch', arguments: { id: 'bob-github:object:Charge:ch_x' } },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; expected_prefix: string; received_prefix: string };
    expect(body.error).toBe('smart_id_tenant_mismatch');
    expect(body.expected_prefix).toBe('alice-stripe');
    expect(body.received_prefix).toBe('bob-github');
  });

  it('proceeds when the smart-ID prefix matches the resolved tenant', async () => {
    const app = buildApp('alice-stripe');
    const res = await app.request('http://localhost/t/alice-stripe/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'fetch', arguments: { id: 'alice-stripe:object:Charge:ch_x' } },
      }),
    });
    expect(res.status).toBe(200);
  });

  it('checks every smart-ID-shaped string in nested params (id, ids[], cursor)', async () => {
    const app = buildApp('alice-stripe');
    const res = await app.request('http://localhost/t/alice-stripe/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'delete',
          arguments: {
            type: 'objects',
            ids: ['alice-stripe:object:Charge:ch_a', 'mallory-evil:object:Charge:ch_b'],
          },
        },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; received_prefix: string };
    expect(body.error).toBe('smart_id_tenant_mismatch');
    expect(body.received_prefix).toBe('mallory-evil');
  });

  it('passes through non-tenant paths (no tenantPrefix set, e.g. /health)', async () => {
    const app = buildApp(undefined);
    const res = await app.request('http://localhost/health', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify({ ping: 'pong' }),
    });
    expect(res.status).toBe(200);
  });

  it('ignores strings that are not in smart-ID shape', async () => {
    const app = buildApp('alice-stripe');
    const res = await app.request('http://localhost/t/alice-stripe/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search', arguments: { query: 'hello:world' } },
      }),
    });
    expect(res.status).toBe(200);
  });
});
