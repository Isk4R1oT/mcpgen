// apps/inngest-dev/tests/warm-keep.test.ts
//
// Phase 6 Wave 5 — warm-keep-active-tenants-v1 cron round-trip test.
//
// Wave 4 wrote the function and unit-asserted its config shape (function-ids-
// stable.test.ts). This Wave-5 test wires a REAL round-trip:
//   1. Spawn 2 fake tenant Bun servers on ports 8800 + 8801 that respond 200
//      to HEAD /health.
//   2. Mock the `db` module so .select().from(deployments).where(...) returns
//      2 rows pointing at those local_port values.
//   3. Invoke the handler with a synthetic {step} object that runs the
//      step.run callback inline.
//   4. Capture console.log output and assert it includes
//      "[warm-keep] pinged 2 active tenants".
//   5. afterAll: kill both fake tenant servers.

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import type { Subprocess } from 'bun';

const FAKE_PORT_A = 8800;
const FAKE_PORT_B = 8801;

// Mock the db module BEFORE importing the function. drizzle's
// .select(cols).from(table).where(filter) is fluent — we mock the chain to
// return the two fake-tenant rows synchronously.
const fakeRows = [
  { cf_worker_name: 'fake-warm-keep-1', local_port: FAKE_PORT_A },
  { cf_worker_name: 'fake-warm-keep-2', local_port: FAKE_PORT_B },
];

await mock.module('../src/db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => fakeRows,
      }),
    }),
  },
}));

const { warmKeepActiveTenants } = await import(
  '../src/functions/warm-keep-active-tenants.js'
);

let serverA: Subprocess | null = null;
let serverB: Subprocess | null = null;

function spawnFakeTenant(port: number): Subprocess {
  return Bun.spawn(
    [
      'bun',
      '-e',
      `Bun.serve({ port: ${port}, fetch(req) { const url = new URL(req.url); if (url.pathname === '/health') return new Response('ok', { status: 200 }); return new Response('nf', { status: 404 }); } });`,
    ],
    { stdout: 'ignore', stderr: 'ignore' },
  );
}

async function waitForHealth(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/health`, { method: 'HEAD' });
      if (r.ok) return true;
    } catch {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

beforeAll(async () => {
  serverA = spawnFakeTenant(FAKE_PORT_A);
  serverB = spawnFakeTenant(FAKE_PORT_B);
  const upA = await waitForHealth(FAKE_PORT_A, 5_000);
  const upB = await waitForHealth(FAKE_PORT_B, 5_000);
  expect(upA).toBe(true);
  expect(upB).toBe(true);
});

afterAll(() => {
  serverA?.kill();
  serverB?.kill();
});

describe('Phase 6 Wave 5 — warm-keep-active-tenants-v1 round-trip', () => {
  it('pings each active-tenant local_port and logs the count', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    // eslint-disable-next-line no-console
    console.log = (...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(' '));
    };

    try {
      const handler = (
        warmKeepActiveTenants as unknown as { fn: (args: unknown) => Promise<void> }
      ).fn;

      await handler({
        step: {
          run: async (_name: string, fn: () => Promise<unknown>) => fn(),
        },
      });

      expect(logs.some((l) => l.includes('[warm-keep] pinged 2 active tenants'))).toBe(true);
    } finally {
      // eslint-disable-next-line no-console
      console.log = originalLog;
    }
  }, 15_000);
});
