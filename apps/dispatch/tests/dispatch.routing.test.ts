// apps/dispatch/tests/dispatch.routing.test.ts
//
// Phase 6 / RUN-01 / T-6-01 / pitfall #11.
// Multi-port routing: dispatch resolves /t/{script_name}/* to localhost:879N
// for any registered local deployment. Postgres `deployments` is the source of
// truth; the in-memory cache fronts it with a 5-min TTL.

import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Per-test-controllable mock for the db.select() chain. `vi.hoisted` lifts the
// container above the `vi.mock` call so the factory can reference it safely.
interface DeploymentRow {
  cf_worker_name: string;
  local_port: number | null;
  auth_mode: string;
}

const mocks = vi.hoisted(() => ({
  rows: [] as DeploymentRow[],
}));

vi.mock('../src/db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.rows,
        }),
      }),
    }),
  },
}));

import { clearCache, setCachedTenant } from '../src/tenant-cache.js';
import { tenantLookup } from '../src/middleware/tenantLookup.js';
import { forwardToTenant } from '../src/routing/forward.js';

const realFetch = globalThis.fetch;

beforeEach(async () => {
  await clearCache();
  mocks.rows = [];                    // default: DB miss
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('dispatch routing /t/:name/* → localhost:879N', () => {
  it('resolves a registered tenant from cache and forwards to the matching local port', async () => {
    await setCachedTenant({
      scriptName: 'sample-stripe',
      localPort: 8790,
      authMode: 'passthrough',
      tenantPrefix: 'sample-stripe',
    });

    const captured: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      captured.push(url);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const app = new Hono();
    app.use('*', tenantLookup);
    app.all('/t/:name/*', forwardToTenant);

    const res = await app.request('http://localhost:8789/t/sample-stripe/health', {
      headers: { host: 'localhost' },
    });

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe('http://localhost:8790/health');
  });

  it('returns 404 tenant_not_found when the script_name has no matching deployment (cache miss + DB miss)', async () => {
    // mocks.rows defaults to [] in beforeEach — simulates DB miss.
    const app = new Hono();
    app.use('*', tenantLookup);
    app.all('/t/:name/*', forwardToTenant);

    const res = await app.request('http://localhost:8789/t/does-not-exist/health', {
      headers: { host: 'localhost' },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; script_name: string };
    expect(body.error).toBe('tenant_not_found');
    expect(body.script_name).toBe('does-not-exist');
  });

  it('falls back to Postgres `deployments` when the cache misses, then caches and forwards', async () => {
    // Populate the mock row to simulate a successful DB lookup.
    mocks.rows = [{ cf_worker_name: 'fresh-deploy', local_port: 8791, auth_mode: 'passthrough' }];

    const captured: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      captured.push(url);
      return new Response('ok', { status: 200 });
    }) as typeof fetch;

    const app = new Hono();
    app.use('*', tenantLookup);
    app.all('/t/:name/*', forwardToTenant);

    const res = await app.request('http://localhost:8789/t/fresh-deploy/mcp', {
      headers: { host: 'localhost' },
    });
    expect(res.status).toBe(200);
    expect(captured[0]).toBe('http://localhost:8791/mcp');
  });
});
