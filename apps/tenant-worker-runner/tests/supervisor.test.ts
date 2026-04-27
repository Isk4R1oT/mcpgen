// apps/tenant-worker-runner/tests/supervisor.test.ts
//
// Phase 6 Wave 2 — admin-endpoint flow test (spawn -> health -> list -> kill).
// Uses bun:test (the test process needs Bun.spawn). The fake-tenant fixture
// is a 1-line Bun.serve script that listens on PORT for /health.

import { describe, expect, it, afterAll } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { spawnHandler } from '../src/admin/spawn.js';
import { killHandler } from '../src/admin/kill.js';
import { listHandler } from '../src/admin/list.js';
import { resetAllocator } from '../src/port-allocator.js';
import { stopAllManaged } from '../src/supervisor.js';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_TENANT_PATH = join(here, 'fixtures', 'fake-tenant.ts');

function mkCtx(body: unknown) {
  return {
    req: { json: async () => body },
    json: (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  } as unknown as Parameters<typeof spawnHandler>[0];
}

async function pollHealth(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.status === 200) return true;
    } catch {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

afterAll(() => {
  stopAllManaged();
  resetAllocator();
});

describe('supervisor admin endpoints', () => {
  it('spawn allocates port 8790, /health responds, list shows entry, kill removes it', async () => {
    const scriptName = `test-tenant-${Date.now()}`;
    const spawnRes = await spawnHandler(
      mkCtx({ scriptName, bundlePath: FAKE_TENANT_PATH }),
    );
    expect(spawnRes.status).toBe(201);
    const spawnBody = (await spawnRes.json()) as {
      pid: number;
      port: number;
      scriptName: string;
      url: string;
    };
    expect(spawnBody.scriptName).toBe(scriptName);
    expect(spawnBody.port).toBeGreaterThanOrEqual(8790);
    expect(typeof spawnBody.pid).toBe('number');

    // Child should be reachable on /health within 3s.
    const healthy = await pollHealth(spawnBody.port, 3_000);
    expect(healthy).toBe(true);

    // /admin/list shows the entry.
    const listRes = listHandler(mkCtx({}) as never);
    const listBody = (await listRes.json()) as {
      managed: ReadonlyArray<{ scriptName: string; port: number; pid: number }>;
    };
    const found = listBody.managed.find((m) => m.scriptName === scriptName);
    expect(found).toBeDefined();
    expect(found?.port).toBe(spawnBody.port);

    // /admin/kill removes it.
    const killRes = await killHandler(mkCtx({ scriptName }));
    expect(killRes.status).toBe(200);
    const killBody = (await killRes.json()) as { killed: boolean };
    expect(killBody.killed).toBe(true);

    // After kill, list does not include it.
    const list2 = listHandler(mkCtx({}) as never);
    const list2Body = (await list2.json()) as { managed: ReadonlyArray<{ scriptName: string }> };
    expect(list2Body.managed.find((m) => m.scriptName === scriptName)).toBeUndefined();
  }, 20_000);

  it('spawn rejects missing required fields with 400', async () => {
    const res = await spawnHandler(mkCtx({ scriptName: 'no-bundle' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('missing_required');
  });

  it('kill of unknown scriptName returns 404', async () => {
    const res = await killHandler(mkCtx({ scriptName: 'never-spawned-xyz' }));
    expect(res.status).toBe(404);
  });
});
