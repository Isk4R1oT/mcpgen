// apps/cli/src/init/auto_spawn.ts
//
// Engine auto-spawn (D-44). Detects whether the FastAPI engine is running on
// `localhost:8000`; if not, spawns `uv run uvicorn mcpgen_engine.main:app
// --port 8000` as a child process — but ONLY when invoked from the monorepo
// root (T-2-09-01 mitigation: globally-installed CLI prints instructions and
// exits non-zero rather than spawning arbitrary subprocesses).
//
// Cleanup (T-2-09-05): three independent SIGTERM paths via `process.on(...)`.
//
// References:
// - 02-CONTEXT.md D-44 (auto-spawn pattern)
// - 02-RESEARCH.md §"Pattern 7: CLI Auto-Spawn Engine via Bun.spawn" lines 811-864
// - 02-PATTERNS.md `apps/cli/src/auto_spawn.ts` row

import type { Subprocess } from 'bun';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HEALTH_URL = 'http://localhost:8000/health';
const HEALTH_TIMEOUT_MS = 2_000;
const POLL_INTERVAL_MS = 100;
const POLL_MAX_ATTEMPTS = 50; // 5s max wait — T-2-09-04 DoS bound
const POLL_TIMEOUT_MS = 500;

const SPAWN_CMD: string[] = [
  'uv',
  'run',
  '--directory',
  'apps/generation-engine',
  'uvicorn',
  'mcpgen_engine.main:app',
  '--port',
  '8000',
];

let _activeProc: Subprocess | null = null;
let _cleanupRegistered = false;

/**
 * Ensures the engine is reachable on `localhost:8000`. Returns:
 * - `null` if the engine was already running (no spawn needed).
 * - The spawned `Subprocess` handle if we started one (caller is responsible
 *   for SIGTERM via `registerCleanup` + `try/finally`).
 *
 * Throws if the engine fails to come up within 5s on a fresh spawn.
 * Calls `process.exit(1)` if the engine is unreachable AND we are not
 * running from the monorepo root (D-44 + T-2-09-01).
 */
export async function ensureEngineRunning(): Promise<Subprocess | null> {
  // 1. Already running? Skip spawn.
  if (await isEngineHealthy(HEALTH_TIMEOUT_MS)) {
    return null;
  }

  // 2. Detect monorepo root — T-2-09-01 mitigation: refuse to spawn from
  //    arbitrary CWDs (a globally-installed `mcpgen` would otherwise launch
  //    `uvicorn mcpgen_engine.main` against attacker-controlled module).
  const monorepoRoot = detectMonorepoRoot();
  if (monorepoRoot === null) {
    process.stderr.write(
      'Engine not running at http://localhost:8000.\n'
        + 'Run `pnpm dev:engine` first, or run `mcpgen init` from the monorepo.\n',
    );
    process.exit(1);
  }

  // 3. Spawn engine. Reference `Bun.spawn` indirectly so test mocks can
  // override the global without losing reference at import-time.
  const proc = Bun.spawn(SPAWN_CMD, {
    cwd: monorepoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });
  _activeProc = proc;

  // 4. Health-poll up to 5s — T-2-09-04 DoS bound.
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    if (await isEngineHealthy(POLL_TIMEOUT_MS)) {
      return proc;
    }
  }

  proc.kill();
  _activeProc = null;
  throw new Error(
    'Engine failed to start within 5s. Check logs from `pnpm dev:engine` directly.',
  );
}

/**
 * Registers SIGINT/SIGTERM/exit handlers that SIGTERM the spawned engine.
 * Idempotent — safe to call multiple times.
 *
 * T-2-09-05 — three independent cleanup paths.
 */
export function registerCleanup(): void {
  if (_cleanupRegistered) return;
  _cleanupRegistered = true;

  const cleanup = (): void => {
    if (_activeProc !== null) {
      _activeProc.kill('SIGTERM');
      _activeProc = null;
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
  process.on('exit', cleanup);
}

/**
 * Detects the monorepo root by running `git rev-parse --show-toplevel`. Also
 * verifies the engine package exists at the resolved path (defense-in-depth
 * against a CWD that is inside *some* git repo but not this monorepo).
 *
 * Returns `null` if either check fails — caller should refuse to spawn.
 */
function detectMonorepoRoot(): string | null {
  try {
    const root = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (existsSync(resolve(root, 'apps/generation-engine/pyproject.toml'))) {
      return root;
    }
    return null;
  } catch {
    return null;
  }
}

async function isEngineHealthy(timeoutMs: number): Promise<boolean> {
  try {
    const resp = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Test-only: reset internal state between mock-spawn tests.
export function _resetForTests(): void {
  _activeProc = null;
  _cleanupRegistered = false;
}

// Test-only: introspect the active process handle.
export function _getActiveProcessForTests(): Subprocess | null {
  return _activeProc;
}
