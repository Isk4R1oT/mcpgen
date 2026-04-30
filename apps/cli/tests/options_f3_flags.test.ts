// apps/cli/tests/options_f3_flags.test.ts
//
// Plan 05-09 Task 1 — CLI flag tests for `--f3` / `--sandbox-creds` /
// `--strict` plus sandbox-credentials YAML/.env loader.
//
// References:
// - 05-CONTEXT.md D-39 (CLI flags)
// - 05-09-PLAN.md Task 1 (behavior matrix)

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Command } from 'commander';

import {
  loadSandboxCredentials,
  registerStageFOptions,
  type CliInitOptions,
} from '../src/init/options.js';

// ─────────────────────────────────────────────────────────── tmp helpers ───
const createdDirs: string[] = [];
function makeTmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'mcpgen-options-f3-'));
  createdDirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of createdDirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────── flag-definition wiring ───────
//
// We register the Stage F flags onto a fresh Commander instance (no
// `--complexity`/`--include` from registerInitCommand needed) — keeps the
// tests focused on the new surface.

interface ParsedFlags {
  f3?: boolean;
  sandboxCreds?: string;
  strict?: boolean;
}

function runFlagParse(argv: ReadonlyArray<string>): ParsedFlags {
  const program = new Command();
  program.exitOverride(); // throw instead of process.exit
  // Stub command that absorbs the flags; we mirror the registration
  // shape used by the real `init` command in `index.ts`.
  let captured: ParsedFlags = {};
  const cmd = program.command('init <spec>').action(() => {
    captured = cmd.opts();
  });
  registerStageFOptions(cmd);
  program.parse(['node', 'mcpgen', 'init', 'fixture-spec', ...argv]);
  return captured;
}

// ─────────────────────────────────────────────────────────────── tests ───

describe('Plan 05-09 Task 1 — Stage F CLI flags', () => {
  test('Test 1: `--f3` flag sets f3_enabled=true', () => {
    const opts = runFlagParse(['--f3']);
    expect(opts.f3).toBe(true);
  });

  test('Test 2: absence of `--f3` defaults to false', () => {
    const opts = runFlagParse([]);
    expect(opts.f3 === true).toBe(false); // defaults to false / undefined
  });

  test('Test 3: `--sandbox-creds <path>` stores path on options', () => {
    const opts = runFlagParse(['--sandbox-creds', '/tmp/creds.yaml']);
    expect(opts.sandboxCreds).toBe('/tmp/creds.yaml');
  });

  test('Test 5: `--strict` flag sets strict_mode=true', () => {
    const opts = runFlagParse(['--strict']);
    expect(opts.strict).toBe(true);
  });
});

describe('Plan 05-09 Task 1 — loadSandboxCredentials (YAML)', () => {
  test('parses a simple key:value YAML file', () => {
    const dir = makeTmp();
    const file = join(dir, 'creds.yaml');
    writeFileSync(
      file,
      'stripe.test_key: sk_test_dummy_xxx\ngithub.test_pat: ghp_dummy_yyy\n',
      'utf-8',
    );
    const result = loadSandboxCredentials(file);
    expect(result['stripe.test_key']).toBe('sk_test_dummy_xxx');
    expect(result['github.test_pat']).toBe('ghp_dummy_yyy');
  });

  test('parses a .env-style file with KEY=VALUE pairs', () => {
    const dir = makeTmp();
    const file = join(dir, 'creds.env');
    writeFileSync(
      file,
      '# comment line\nSTRIPE_KEY=sk_test_aaa\n\nGITHUB_PAT=ghp_bbb\n',
      'utf-8',
    );
    const result = loadSandboxCredentials(file);
    expect(result['STRIPE_KEY']).toBe('sk_test_aaa');
    expect(result['GITHUB_PAT']).toBe('ghp_bbb');
  });

  test('Test 4: throws clear error when file does not exist', () => {
    expect(() => loadSandboxCredentials('/nonexistent/path/creds.yaml')).toThrow(
      /not found/,
    );
  });

  test('Test 6: rejects raw credential value (sk_ prefix) with explicit error', () => {
    expect(() => loadSandboxCredentials('sk_test_xxx')).toThrow(
      /Refusing to accept raw credential|never via shell history/,
    );
  });

  test('Test 6: rejects raw credential value (ghp_ prefix)', () => {
    expect(() => loadSandboxCredentials('ghp_xxx')).toThrow(
      /Refusing to accept raw credential/,
    );
  });

  test('Test 6: rejects Bearer-prefixed string', () => {
    expect(() => loadSandboxCredentials('Bearer abcdef')).toThrow(
      /Refusing to accept raw credential/,
    );
  });

  test('rejects YAML that is not a key-value object', () => {
    const dir = makeTmp();
    const file = join(dir, 'list.yaml');
    writeFileSync(file, '- one\n- two\n', 'utf-8');
    expect(() => loadSandboxCredentials(file)).toThrow(
      /YAML must be a key-value object/,
    );
  });
});

// Tightening: ensure the typed CliInitOptions exported by `options.ts`
// gains the new Phase-5 fields.
describe('Plan 05-09 Task 1 — CliInitOptions surface', () => {
  test('CliInitOptions accepts f3Enabled / sandboxCredentials / strict fields', () => {
    const o: CliInitOptions = {
      outputDir: '/tmp',
      complexity: 'standard',
      include: [],
      exclude: [],
      devLocal: false,
      f3Enabled: true,
      sandboxCredentials: { 'stripe.key': 'sk_test_x' },
      strict: true,
    };
    expect(o.f3Enabled).toBe(true);
    expect(o.sandboxCredentials?.['stripe.key']).toBe('sk_test_x');
    expect(o.strict).toBe(true);
  });
});
