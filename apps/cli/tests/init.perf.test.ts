// apps/cli/tests/init.perf.test.ts
//
// T-2-F2: wall-clock perf budget for `mcpgen init`.
//   - Cold cache: <90 s soft cap; 60 s target on M1 (recorded in
//     02-PHASE-VERIFICATION.md from manual M1 run).
//   - Warm cache (L1 hit): <10 s — proves D-41 / GEN-12 zero-LLM
//     second-run on the consumer surface.
//
// Skipped automatically unless `OPENROUTER_API_KEY` is set to a real key
// (placeholders starting with `sk-or-test-` skip too — they would fail
// at engine call time anyway).
//
// VALIDATION rows: T-2-F2 + D-46. See 02-VALIDATION.md.

import { spawn } from 'bun';
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const monorepoRoot = resolve(dirname(import.meta.path), '../../..');

const REAL_KEY_OK = (() => {
  const k = process.env.OPENROUTER_API_KEY ?? '';
  if (k === '' || k.startsWith('sk-or-test-')) return false;
  return true;
})();

const STRIPE_URL = 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json';

const COLD_BUDGET_MS = 90_000; // soft cap; >90s fails CI per D-46
const WARM_BUDGET_MS = 10_000; // L1 hit per D-41 / GEN-12

const createdDirs: string[] = [];

afterAll(() => {
  for (const d of createdDirs) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe('mcpgen init perf (T-2-F2 / D-46)', () => {
  test.skipIf(!REAL_KEY_OK)(
    `cold-cache run completes under ${COLD_BUDGET_MS}ms (60 s target on M1; >${COLD_BUDGET_MS}ms fails)`,
    async () => {
      const outRoot = mkdtempSync(join(tmpdir(), 'mcpgen-perf-cold-'));
      const cacheDir = mkdtempSync(join(tmpdir(), 'mcpgen-cache-cold-'));
      createdDirs.push(outRoot, cacheDir);

      const start = Date.now();
      const proc = spawn(
        [
          'bun',
          'run',
          'apps/cli/src/index.ts',
          'init',
          STRIPE_URL,
          '--output-dir',
          outRoot,
        ],
        {
          cwd: monorepoRoot,
          env: { ...process.env, MCPGEN_CACHE_DIR: cacheDir } as Record<
            string,
            string
          >,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const exitCode = await proc.exited;
      const elapsed = Date.now() - start;

      expect(exitCode).toBe(0);
      expect(elapsed).toBeLessThan(COLD_BUDGET_MS);
    },
    180_000,
  );

  test.skipIf(!REAL_KEY_OK)(
    `warm-cache run completes under ${WARM_BUDGET_MS}ms (D-41 / GEN-12)`,
    async () => {
      const outRootWarm = mkdtempSync(join(tmpdir(), 'mcpgen-perf-warm-'));
      const cacheDir = mkdtempSync(join(tmpdir(), 'mcpgen-cache-warm-'));
      createdDirs.push(outRootWarm, cacheDir);

      // Pre-warm L1 cache: first run.
      const cold = spawn(
        [
          'bun',
          'run',
          'apps/cli/src/index.ts',
          'init',
          STRIPE_URL,
          '--output-dir',
          outRootWarm,
        ],
        {
          cwd: monorepoRoot,
          env: { ...process.env, MCPGEN_CACHE_DIR: cacheDir } as Record<
            string,
            string
          >,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      expect(await cold.exited).toBe(0);

      // Second run — must hit L1.
      const start = Date.now();
      const warm = spawn(
        [
          'bun',
          'run',
          'apps/cli/src/index.ts',
          'init',
          STRIPE_URL,
          '--output-dir',
          outRootWarm,
        ],
        {
          cwd: monorepoRoot,
          env: { ...process.env, MCPGEN_CACHE_DIR: cacheDir } as Record<
            string,
            string
          >,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const exitCode = await warm.exited;
      const elapsed = Date.now() - start;

      expect(exitCode).toBe(0);
      expect(elapsed).toBeLessThan(WARM_BUDGET_MS);
    },
    240_000,
  );
});
