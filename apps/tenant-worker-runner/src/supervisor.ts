// apps/tenant-worker-runner/src/supervisor.ts
//
// Phase 6 (per CONTEXT D-04 + RESEARCH §"Don't Hand-Roll") — Bun.spawn
// child-process supervisor. One Bun process per active deployment.
// Crash-restart with bounded loop budget (5 restarts in 60s -> abort).
//
// Threat T-6-14 mitigation: bounded restart loop prevents crash-loop from
// eating supervisor resources.

import type { Subprocess } from 'bun';

import { releasePort } from './port-allocator.js';

interface ManagedOpts {
  scriptName: string;
  port: number;
  tenantId: string;
  authMode: string;
  bundlePath: string;
}

interface Managed extends ManagedOpts {
  proc: Subprocess;
  restartCount: number;
  restartWindowStart: number;
}

const RESTART_WINDOW_MS = 60_000;
const MAX_RESTARTS_IN_WINDOW = 5;

const managed = new Map<string, Managed>();

function spawnOne(opts: ManagedOpts): Subprocess {
  return Bun.spawn({
    cmd: ['bun', 'run', opts.bundlePath],
    env: {
      ...process.env,
      PORT: String(opts.port),
      TENANT_ID: opts.tenantId,
      SCRIPT_NAME: opts.scriptName,
      AUTH_MODE: opts.authMode,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

export function startManaged(opts: ManagedOpts): { pid: number } {
  const proc = spawnOne(opts);
  const m: Managed = {
    ...opts,
    proc,
    restartCount: 0,
    restartWindowStart: Date.now(),
  };
  managed.set(opts.scriptName, m);
  // Async crash-restart loop (do not await — runs for the lifetime of the proc).
  void watchExits(m);
  return { pid: proc.pid };
}

async function watchExits(m: Managed): Promise<void> {
  const exitCode = await m.proc.exited;
  // Killed via /admin/kill — managed entry was removed BEFORE proc.kill(),
  // so we exit the watcher without restarting.
  if (!managed.has(m.scriptName)) return;

  const now = Date.now();
  if (now - m.restartWindowStart > RESTART_WINDOW_MS) {
    m.restartWindowStart = now;
    m.restartCount = 0;
  }
  m.restartCount += 1;

  if (m.restartCount > MAX_RESTARTS_IN_WINDOW) {
    console.error(
      `[supervisor] giving up on ${m.scriptName} after ${m.restartCount} restarts ` +
        `(last exit ${exitCode}); releasing port ${m.port}`,
    );
    managed.delete(m.scriptName);
    releasePort(m.port);
    return;
  }

  console.warn(
    `[supervisor] ${m.scriptName} exited (${exitCode}); restarting on port ${m.port} ` +
      `(restart ${m.restartCount}/${MAX_RESTARTS_IN_WINDOW})`,
  );
  m.proc = spawnOne(m);
  void watchExits(m);
}

export function stopManaged(scriptName: string): boolean {
  const m = managed.get(scriptName);
  if (!m) return false;
  // Delete BEFORE kill so watchExits sees the absence and does not restart.
  managed.delete(scriptName);
  try {
    m.proc.kill();
  } catch {
    // Already dead — fine.
  }
  releasePort(m.port);
  return true;
}

export function isManaged(scriptName: string): boolean {
  return managed.has(scriptName);
}

export function getManaged(scriptName: string): {
  scriptName: string;
  port: number;
  pid: number;
  tenantId: string;
  authMode: string;
  restartCount: number;
} | null {
  const m = managed.get(scriptName);
  if (!m) return null;
  return {
    scriptName: m.scriptName,
    port: m.port,
    pid: m.proc.pid,
    tenantId: m.tenantId,
    authMode: m.authMode,
    restartCount: m.restartCount,
  };
}

export function listManaged(): ReadonlyArray<{
  scriptName: string;
  port: number;
  pid: number;
  tenantId: string;
  authMode: string;
  restartCount: number;
}> {
  return [...managed.values()].map((m) => ({
    scriptName: m.scriptName,
    port: m.port,
    pid: m.proc.pid,
    tenantId: m.tenantId,
    authMode: m.authMode,
    restartCount: m.restartCount,
  }));
}

export function stopAllManaged(): void {
  for (const scriptName of [...managed.keys()]) {
    stopManaged(scriptName);
  }
}
