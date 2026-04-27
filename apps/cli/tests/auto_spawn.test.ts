// apps/cli/tests/auto_spawn.test.ts
//
// T-2-F4: CLI auto-spawn engine when localhost:8000 unreachable (D-44);
// graceful SIGTERM on CLI exit (T-2-09-05).
//
// Pattern: bun:test mock(global fetch + Bun.spawn) + introspect _activeProc.

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
  _getActiveProcessForTests,
  _resetForTests,
  ensureEngineRunning,
  registerCleanup,
} from '../src/init/auto_spawn.js';

const HEALTH_URL = 'http://localhost:8000/health';

interface MockResponse {
  ok: boolean;
}

interface MockSubprocess {
  kill: ReturnType<typeof mock>;
  pid: number;
}

interface FetchCall {
  url: string;
}

let fetchCalls: FetchCall[] = [];
let fetchScript: Array<MockResponse | Error> = [];
let spawnCalls: Array<{ argv: string[]; opts: unknown }> = [];
let spawnSubprocesses: MockSubprocess[] = [];

const originalFetch = globalThis.fetch;
const originalSpawn = Bun.spawn;

function installFetchMock(): void {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    fetchCalls.push({ url });
    if (fetchScript.length === 0) {
      return Promise.reject(new Error('fetch mock script exhausted'));
    }
    const next = fetchScript.shift();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next as Response);
  }) as typeof fetch;
}

function installSpawnMock(): void {
  // Bun.spawn is a callable. Override it on the Bun object directly.
  (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = ((
    argv: string[],
    opts: unknown,
  ): MockSubprocess => {
    spawnCalls.push({ argv, opts });
    const sub: MockSubprocess = {
      kill: mock(() => undefined),
      pid: 12_345 + spawnSubprocesses.length,
    };
    spawnSubprocesses.push(sub);
    return sub;
  }) as unknown as typeof Bun.spawn;
}

function restoreMocks(): void {
  globalThis.fetch = originalFetch;
  (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
}

beforeEach(() => {
  fetchCalls = [];
  fetchScript = [];
  spawnCalls = [];
  spawnSubprocesses = [];
  _resetForTests();
  installFetchMock();
  installSpawnMock();
});

afterEach(() => {
  restoreMocks();
  _resetForTests();
});

describe('ensureEngineRunning (T-2-F4)', () => {
  test('returns null when engine is already running', async () => {
    fetchScript.push({ ok: true });
    const result = await ensureEngineRunning();
    expect(result).toBeNull();
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0]?.url).toBe(HEALTH_URL);
    expect(spawnCalls.length).toBe(0);
  });

  test('spawns engine via Bun.spawn when health check fails', async () => {
    // Initial health check fails; first poll succeeds.
    fetchScript.push(new Error('connection refused'));
    fetchScript.push({ ok: true });

    const proc = await ensureEngineRunning();
    expect(proc).not.toBeNull();
    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0]?.argv).toContain('uv');
    expect(spawnCalls[0]?.argv).toContain('run');
    expect(spawnCalls[0]?.argv).toContain('--directory');
    expect(spawnCalls[0]?.argv).toContain('apps/generation-engine');
    expect(spawnCalls[0]?.argv).toContain('uvicorn');
    expect(spawnCalls[0]?.argv).toContain('mcpgen_engine.main:app');
    expect(spawnCalls[0]?.argv).toContain('--port');
    expect(spawnCalls[0]?.argv).toContain('8000');
    const opts = spawnCalls[0]?.opts as { cwd?: string };
    expect(typeof opts?.cwd).toBe('string');
    expect(opts?.cwd?.length ?? 0).toBeGreaterThan(0);
  });

  test(
    'throws when engine fails to start within poll budget',
    async () => {
      // Initial health check fails, then 50 polls all fail.
      fetchScript.push(new Error('connection refused'));
      for (let i = 0; i < 50; i += 1) {
        fetchScript.push(new Error('not ready'));
      }
      await expect(ensureEngineRunning()).rejects.toThrow(/Engine failed to start/);
      // The spawned subprocess should have been killed before the throw.
      expect(spawnSubprocesses.length).toBe(1);
      expect(spawnSubprocesses[0]?.kill).toHaveBeenCalled();
    },
    10_000, // poll loop is 50 × 100ms = 5s; double-the-budget timeout
  );

  test('SIGTERM cleanup is registered idempotently (T-2-09-05)', () => {
    // registerCleanup should be safe to call multiple times.
    registerCleanup();
    registerCleanup();
    registerCleanup();
    // No assertion on listener count (process is shared); just exercise the
    // codepath to ensure no crash on repeat registration.
    expect(_getActiveProcessForTests()).toBeNull();
  });
});
