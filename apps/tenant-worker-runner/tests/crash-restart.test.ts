// apps/tenant-worker-runner/tests/crash-restart.test.ts
//
// Phase 6 Wave 2 — supervisor crash-restart loop test.
// Spawn fake-tenant; SIGKILL it directly (NOT via /admin/kill) and verify the
// supervisor restarts it on the same port within 5s, with a different pid.

import { describe, expect, it, afterAll } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { spawnHandler } from '../src/admin/spawn.js';
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

async function pollHealth(port: number, timeoutMs: number): Promise<{ pid: number } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.status === 200) {
        const body = (await res.json()) as { pid: number };
        return body;
      }
    } catch {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

afterAll(() => {
  stopAllManaged();
  resetAllocator();
});

describe('supervisor crash-restart', () => {
  it('SIGKILL of child triggers automatic restart on same port within 5s', async () => {
    const scriptName = `crash-tenant-${Date.now()}`;
    const spawnRes = await spawnHandler(
      mkCtx({ scriptName, bundlePath: FAKE_TENANT_PATH }),
    );
    expect(spawnRes.status).toBe(201);
    const spawnBody = (await spawnRes.json()) as { port: number; pid: number };

    // Wait for first child to be healthy.
    const initial = await pollHealth(spawnBody.port, 3_000);
    expect(initial).not.toBeNull();
    const firstPid = initial!.pid;
    expect(firstPid).toBeGreaterThan(0);

    // SIGKILL the child directly.
    process.kill(firstPid, 'SIGKILL');

    // Within 5s, the supervisor should have restarted the child on the same
    // port. The new /health response carries a different pid.
    const deadline = Date.now() + 5_000;
    let restarted: { pid: number } | null = null;
    while (Date.now() < deadline) {
      const h = await pollHealth(spawnBody.port, 500);
      if (h && h.pid !== firstPid) {
        restarted = h;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(restarted).not.toBeNull();
    expect(restarted!.pid).not.toBe(firstPid);

    // /admin/list still shows the entry on the same port (with new pid + restartCount > 0).
    const listRes = listHandler(mkCtx({}) as never);
    const listBody = (await listRes.json()) as {
      managed: ReadonlyArray<{ scriptName: string; port: number; pid: number; restartCount: number }>;
    };
    const found = listBody.managed.find((m) => m.scriptName === scriptName);
    expect(found).toBeDefined();
    expect(found?.port).toBe(spawnBody.port);
    expect(found?.restartCount).toBeGreaterThanOrEqual(1);
  }, 20_000);
});
