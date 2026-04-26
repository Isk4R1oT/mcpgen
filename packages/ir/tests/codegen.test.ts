// Codegen tests — gated behind RUN_CODEGEN_TESTS=1 because they require
// `uvx datamodel-code-generator` (or `pip install datamodel-code-generator==0.26.4`)
// to be available. CI sets the env var; local `pnpm test` skips by default.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const SCRIPT = resolve(PKG_ROOT, 'scripts/codegen.ts');
const PYTHON_OUT = resolve(PKG_ROOT, 'python/types.py');

const SHOULD_RUN = process.env.RUN_CODEGEN_TESTS === '1';

describe.skipIf(!SHOULD_RUN)('IR codegen pipeline (Zod → JSON Schema → Pydantic)', () => {
  it('generates packages/ir/python/types.py with FinalTool + ToolDescription', () => {
    // Run from the package root so relative paths in the script resolve.
    execFileSync('npx', ['tsx', SCRIPT], {
      cwd: PKG_ROOT,
      stdio: 'inherit',
    });
    expect(existsSync(PYTHON_OUT)).toBe(true);
    const content = readFileSync(PYTHON_OUT, 'utf8');
    expect(content).toMatch(/class FinalTool\(BaseModel\)/);
    expect(content).toMatch(/class ToolDescription\(BaseModel\)/);
    expect(content).toMatch(/class ToolAnnotations\(BaseModel\)/);
    expect(content).toMatch(/class ResponseConfig\(BaseModel\)/);
    expect(content).toMatch(/from pydantic import/);
  });

  it('--check exits 0 when committed mirror is fresh', () => {
    // Pre-condition: the prior test (or `pnpm codegen`) just regenerated.
    expect(() =>
      execFileSync('npx', ['tsx', SCRIPT, '--check'], {
        cwd: PKG_ROOT,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
