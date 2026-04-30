// apps/api/tests/observability/leak-audit.test.ts
//
// CTRL-08 / D-13 — leak-audit operator script integration tests.
//
// Invokes the script as a child process via tsx (matches operator usage
// `pnpm leak-audit`) and asserts:
//   1. All vectors clean → exit 0 + "PASS" stdout.
//   2. Seeded leak event → exit 1 + diagnostic naming the offending vector.
//   3. `--mode real` → exits non-zero with "not yet implemented" message
//      (Phase 10 will swap in RealSentryEventsAdapter).
//
// The script reads a fixture file path from env
// `SENTRY_EVENTS_MOCK_FIXTURE_PATH` to seed the mock — keeps the test free
// of cross-process state and gitleaks-safe (sentinels in fixture files
// allowlisted at .gitleaks.toml).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SentryEvent } from '../../src/lib/sentry-events-adapter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// apps/api/tests/observability/ → repo root is 4 levels up.
const REPO_ROOT = resolve(HERE, '../../../..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/observability/leak-audit.ts');

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let workdir: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), 'mcpgen-leak-audit-'));
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function runScript(args: string[], env: Record<string, string>): ExecResult {
  const cleanEnv: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/local/bin',
    HOME: process.env.HOME ?? '/tmp',
    ...env,
  };
  try {
    const stdout = execFileSync(
      'npx',
      ['--yes', 'tsx', SCRIPT_PATH, ...args],
      {
        env: cleanEnv,
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return { exitCode: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as {
      status?: number;
      stdout?: Buffer | string;
      stderr?: Buffer | string;
    };
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

function writeFixture(events: SentryEvent[]): string {
  const path = join(workdir, `fixture-${String(Date.now())}-${String(Math.random()).slice(2, 8)}.json`);
  writeFileSync(path, JSON.stringify({ events }), 'utf-8');
  return path;
}

describe('CTRL-08 / D-13 — leak-audit operator script', () => {
  it('exits 0 with PASS message when no leak vectors hit (clean run)', () => {
    const fixturePath = writeFixture([]);
    const result = runScript(['--mode', 'mock'], {
      SENTRY_EVENTS_MOCK_FIXTURE_PATH: fixturePath,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[leak-audit] PASS');
    // Each vector must be logged for operator review.
    expect(result.stdout).toContain('Bearer ');
    expect(result.stdout).toContain('sk_live_');
    expect(result.stdout).toContain('ghp_');
    expect(result.stdout).toContain('MCPGEN_LEAK_CANARY_2026Q2');
  }, 30_000);

  it('exits 1 with diagnostic when a Bearer leak event is seeded', () => {
    const now = new Date().toISOString();
    const leakEvent: SentryEvent = {
      event_id: 'evt-bearer-leak',
      message: 'Bearer leaked-token-foobar',
      received_at: now,
    };
    const fixturePath = writeFixture([leakEvent]);
    const result = runScript(['--mode', 'mock'], {
      SENTRY_EVENTS_MOCK_FIXTURE_PATH: fixturePath,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('[leak-audit] FAIL');
    // Diagnostic must name the offending vector.
    expect(result.stdout).toContain('Bearer ');
    // Diagnostic must surface the offending event_id.
    expect(result.stdout).toContain('evt-bearer-leak');
  }, 30_000);

  it('exits non-zero with "not yet implemented" message in --mode real', () => {
    const result = runScript(['--mode', 'real'], {});
    expect(result.exitCode).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined.toLowerCase()).toContain('not yet implemented');
  }, 30_000);
});
