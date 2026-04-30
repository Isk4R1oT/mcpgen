// apps/dispatch/tests/cross-tenant-id-block.test.ts
//
// Phase 9 Plan 09-08 / D-09 / Pitfall #1 layer 2.
// Defense-in-depth integration test for the dispatch runtime guard:
// confirms the existing `smartIdFuzz` middleware (Phase 6,
// `apps/dispatch/src/middleware/smartIdFuzz.ts`) rejects foreign-tenant
// smart IDs in inbound `tools/call` requests with 403
// `smart_id_tenant_mismatch`.
//
// This complements the F1 codegen-time fuzz at
// `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py`
// (Phase 9 D-08): F1 proves regexes don't intersect across tenants;
// this test proves the runtime guard rejects forged IDs.
//
// Per CONTEXT D-09: Phase 9 only adds the integration test file —
// the middleware itself already exists and is NOT modified.

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

describe('cross-tenant smart-ID dispatch block — D-09 defense in depth', () => {
  it('Test 1: foreign-tenant smart ID in tools/call.arguments.id → 403 smart_id_tenant_mismatch', async () => {
    // POST to my-tenant's URL with a smart ID prefixed for ANOTHER tenant.
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
    const body = (await res.json()) as {
      error: string;
      expected_prefix: string;
      received_prefix: string;
    };
    expect(body.error).toBe('smart_id_tenant_mismatch');
    expect(body.expected_prefix).toBe('alice-stripe');
    expect(body.received_prefix).toBe('bob-github');
  });

  it('Test 2: matching tenant prefix → middleware passes through (200)', async () => {
    const app = buildApp('alice-stripe');
    const res = await app.request('http://localhost/t/alice-stripe/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'fetch', arguments: { id: 'alice-stripe:object:Charge:ch_y' } },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('Test 3: tools/call with no smart ID (query-only) → middleware passes through (no false-block)', async () => {
    const app = buildApp('alice-stripe');
    const res = await app.request('http://localhost/t/alice-stripe/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'search', arguments: { query: 'failed payments yesterday' } },
      }),
    });
    expect(res.status).toBe(200);
  });

  it('Test 4: malformed smart ID (no colon separators) → middleware passes through cleanly', async () => {
    // Per Phase 6 contract — `collectSmartIdCandidates` only inspects
    // strings containing `:`, so a malformed ID with NO colons is
    // ignored and the request proceeds. This avoids false-blocks on
    // free-form user query text. Verified against
    // `apps/dispatch/src/middleware/smartIdFuzz.ts:15` (string filter)
    // and the existing analog test
    // `apps/dispatch/tests/smart-id-fuzz.test.ts:98-111`.
    const app = buildApp('alice-stripe');
    const res = await app.request('http://localhost/t/alice-stripe/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'fetch', arguments: { id: 'not-a-smart-id-at-all' } },
      }),
    });
    expect(res.status).toBe(200);
  });

  it('Test 5: arguments.ids array with mixed tenants → 403 (any foreign ID blocks, defense in depth)', async () => {
    // Confirms the middleware's recursive `collectSmartIdCandidates`
    // pass walks into array values too: even if 1 of N IDs is foreign,
    // the whole call is rejected. Phase 6 already implements this
    // (apps/dispatch/src/middleware/smartIdFuzz.ts:17 — Array.isArray
    // recursion). D-09 Test 5 confirms the contract holds.
    const app = buildApp('alice-stripe');
    const res = await app.request('http://localhost/t/alice-stripe/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'delete',
          arguments: {
            type: 'objects',
            ids: [
              'alice-stripe:object:Charge:ch_a',
              'mallory-evil:object:Charge:ch_b',
            ],
          },
        },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; received_prefix: string };
    expect(body.error).toBe('smart_id_tenant_mismatch');
    expect(body.received_prefix).toBe('mallory-evil');
  });
});
