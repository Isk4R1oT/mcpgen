// apps/api/tests/observability/sourcemaps-skip-when-no-token.test.ts
//
// CTRL-08 / D-05 — sourcemaps upload skip-when-no-token regression test.
//
// Asserts the repo-root orchestrator script `scripts/sourcemaps/upload-all.sh`:
//   1. Exits 0 when SENTRY_AUTH_TOKEN is unset/empty AND prints a "skipping
//      upload" line (D-01 empty-DSN invariant + D-05 local-mode contract).
//   2. With SENTRY_AUTH_TOKEN=fake DRY_RUN=1, proceeds past the skip guard and
//      emits the per-app upload announcement for apps/api (proves the per-app
//      loop is wired without performing a real Sentry upload).
//
// Threat T-9-sourcemaps-02: skip path keeps `pnpm sourcemaps:upload` safe to run
// from a developer machine without a Sentry token (would otherwise block dev
// workflow). Threat T-9-sourcemaps-01 is mitigated by .env.example + runbook;
// this file only proves the skip path.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, statSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
// apps/api/tests/observability/ → repo root is 4 levels up.
const REPO_ROOT = resolve(HERE, '../../../..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/sourcemaps/upload-all.sh');

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(env: Record<string, string>): ExecResult {
  // Inherit minimal PATH so bash + git can resolve; do NOT inherit
  // SENTRY_AUTH_TOKEN from the test process — env is exhaustively whitelisted.
  const cleanEnv: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/local/bin',
    HOME: process.env.HOME ?? '/tmp',
    ...env,
  };
  try {
    const stdout = execFileSync('bash', [SCRIPT_PATH], {
      env: cleanEnv,
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

describe('SENTRY_AUTH_TOKEN', () => {
  it('script file exists and is executable', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
    const mode = statSync(SCRIPT_PATH).mode;
    // owner / group / other execute bits — at least one MUST be set.
    expect(mode & 0o111).toBeGreaterThan(0);
  });

  it('exits 0 and prints skip message when SENTRY_AUTH_TOKEN is empty', () => {
    const result = runScript({ SENTRY_AUTH_TOKEN: '' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toLowerCase()).toContain('skipping upload');
  });

  it('exits 0 and prints skip message when SENTRY_AUTH_TOKEN is unset', () => {
    // Note: cleanEnv above does NOT pass SENTRY_AUTH_TOKEN unless explicitly given;
    // omitting it from the input env effectively unsets it for the child.
    const result = runScript({});
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toLowerCase()).toContain('skipping upload');
  });

  it('proceeds past skip guard with SENTRY_AUTH_TOKEN set + DRY_RUN=1 (apps/api block runs)', () => {
    const result = runScript({
      SENTRY_AUTH_TOKEN: 'fake-token-xyz',
      SOURCEMAPS_DRY_RUN: '1',
    });
    expect(result.exitCode).toBe(0);
    // Per-app announcement proves the skip guard did NOT exit early.
    expect(result.stdout).toContain('[sourcemaps] uploading apps/api');
    // apps/web is documented as auto-uploading via @sentry/nextjs.
    expect(result.stdout).toContain('apps/web');
    // Skip message MUST NOT appear when token is set.
    expect(result.stdout.toLowerCase()).not.toContain('skipping upload');
  });
});
