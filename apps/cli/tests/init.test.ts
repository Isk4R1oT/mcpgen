// apps/cli/tests/init.test.ts
//
// CLI-01 unit tests — option parsing, idempotency-key generation, render
// invariants, and path-traversal protection. These run on every push (no
// network, no engine, no LLM).
//
// VALIDATION rows: CLI-01 unit (output rendering, idempotency-key generation,
// error handling). See 02-VALIDATION.md.

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { stripe as stripeFixture } from '@mcpgen/engine-fixtures';
import { GEN_ID_REGEX } from '@mcpgen/contracts';
import type { Pass1Output } from '@mcpgen/ir';

import {
  buildEngineRequestBody,
  generateIdempotencyKey,
  parseComplexity,
} from '../src/init/options.js';
import {
  ensureSafeOutputDir,
  writeOutputFile,
} from '../src/init/output_dir.js';
import { renderPackageJson } from '../src/init/render_package_json.js';
import { renderReadme } from '../src/init/render_readme.js';
import { renderServerTs } from '../src/init/render_stub.js';

const stripePass1 = stripeFixture.pass1Output as Pass1Output;

// ─────────────────────────────── options ──────────────────────────────────

describe('options', () => {
  test('generateIdempotencyKey matches GEN_ID_REGEX (gen_<ULID>)', () => {
    const key = generateIdempotencyKey();
    expect(key).toMatch(GEN_ID_REGEX);
    expect(key).toMatch(/^gen_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  test('generateIdempotencyKey returns fresh key per call', () => {
    const a = generateIdempotencyKey();
    const b = generateIdempotencyKey();
    expect(a).not.toBe(b);
  });

  test('buildEngineRequestBody passes through complexity / include / exclude', () => {
    const body = buildEngineRequestBody(
      'https://example.com/openapi.json',
      null,
      {
        outputDir: './x',
        complexity: 'minimal',
        include: ['/v1/*'],
        exclude: ['/v1/test_helpers/*'],
      },
    );
    expect(body).toMatchObject({
      spec_url: 'https://example.com/openapi.json',
      options: {
        target_complexity: 'minimal',
        explicit_includes: ['/v1/*'],
        explicit_excludes: ['/v1/test_helpers/*'],
      },
    });
    expect((body as unknown as Record<string, unknown>).spec_content).toBeUndefined();
  });

  test('buildEngineRequestBody rejects both spec_url and spec_content', () => {
    expect(() =>
      buildEngineRequestBody('url', 'content', {
        outputDir: './x',
        complexity: 'standard',
        include: [],
        exclude: [],
      }),
    ).toThrow();
    expect(() =>
      buildEngineRequestBody(null, null, {
        outputDir: './x',
        complexity: 'standard',
        include: [],
        exclude: [],
      }),
    ).toThrow();
  });

  test('parseComplexity narrows valid values', () => {
    expect(parseComplexity('minimal')).toBe('minimal');
    expect(parseComplexity('standard')).toBe('standard');
    expect(parseComplexity('comprehensive')).toBe('comprehensive');
  });

  test('parseComplexity rejects unknown values', () => {
    expect(() => parseComplexity('aggressive')).toThrow(/--complexity/);
    expect(() => parseComplexity('')).toThrow(/--complexity/);
  });
});

// ───────────────────────────── render_stub ────────────────────────────────

describe('render_stub', () => {
  test('emits MCP-SDK-v1 server.tool signature for all Pass 1 tools', () => {
    const code = renderServerTs('stripe-api', stripePass1);
    expect(code).toContain('@modelcontextprotocol/sdk/server/mcp.js');
    expect(code).toContain('server.tool(');
    expect(code).not.toContain('registerTool'); // v2 — forbidden D-45
    for (const tool of stripePass1.tools) {
      expect(code).toContain(JSON.stringify(tool.name));
    }
    expect(code).toContain('Stage E codegen lands in Phase 4'); // D-45 placeholder text
  });

  test('search tool gets {query: z.string()} schema (D-30)', () => {
    const code = renderServerTs('stripe-api', stripePass1);
    expect(code).toMatch(/"search",[\s\S]*?\{ query: z\.string\(\) \}/);
  });

  test('fetch tool gets {id: z.string()} schema (D-30)', () => {
    const code = renderServerTs('stripe-api', stripePass1);
    expect(code).toMatch(/"fetch",[\s\S]*?\{ id: z\.string\(\) \}/);
  });

  test('non-search/fetch tools get empty schema shape (Pass 3 placeholder)', () => {
    const code = renderServerTs('stripe-api', stripePass1);
    expect(code).toMatch(/"upsert",[\s\S]*?\{\}/);
    expect(code).toMatch(/"delete",[\s\S]*?\{\}/);
  });
});

// ──────────────────────────── render_package_json ─────────────────────────

describe('render_package_json', () => {
  test('emits runnable npm package with MCP SDK + zod dependencies', () => {
    const json = renderPackageJson('stripe-api');
    const pkg = JSON.parse(json) as {
      name: string;
      type: string;
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('mcpgen-stripe-api');
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBe('^1.29.0');
    expect(pkg.dependencies.zod).toBe('^4.3.6');
  });
});

// ────────────────────────────── render_readme ─────────────────────────────

describe('render_readme', () => {
  const FAKE_ABS_OUTPUT = '/tmp/mcpgen-test-out/stripe-api';

  test('contains Claude Desktop config snippet with absolute server.ts path', () => {
    const md = renderReadme('stripe-api', stripePass1, FAKE_ABS_OUTPUT);
    expect(md).toContain('claude_desktop_config.json');
    expect(md).toContain('"stripe-api":');
    expect(md).toContain('command');
    // Phase-2 manual-gate fix: Claude Desktop ignores cwd, so server.ts
    // path must be absolute in args.
    expect(md).toContain(`${FAKE_ABS_OUTPUT}/server.ts`);
    expect(md).not.toContain('"cwd":');
    expect(md).not.toContain('./server.ts');
  });

  test('lists all Pass 1 tools', () => {
    const md = renderReadme('stripe-api', stripePass1, FAKE_ABS_OUTPUT);
    for (const tool of stripePass1.tools) {
      expect(md).toContain(`\`${tool.name}\``);
    }
  });

  test('reports coverage percentage', () => {
    const md = renderReadme('stripe-api', stripePass1, FAKE_ABS_OUTPUT);
    expect(md).toContain(`Coverage: ${stripePass1.coverage_pct}%`);
  });
});

// ────────────────────────────── output_dir ────────────────────────────────

describe('output_dir', () => {
  let createdDirs: string[] = [];

  afterEach(() => {
    for (const d of createdDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    createdDirs = [];
  });

  test('rejects path-traversal attempts (T-2-09-06)', async () => {
    await expect(ensureSafeOutputDir('../../../etc/passwd')).rejects.toThrow(
      /must be under cwd/,
    );
  });

  test('accepts paths under cwd', async () => {
    const dir = await ensureSafeOutputDir('./mcpgen-output-test-relative');
    createdDirs.push(dir);
    expect(dir.startsWith(process.cwd())).toBe(true);
  });

  test('accepts explicit absolute paths starting with /', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mcpgen-out-abs-'));
    createdDirs.push(tmp);
    const resolved = await ensureSafeOutputDir(tmp);
    expect(resolved).toBe(tmp);
  });

  test('writeOutputFile writes content under the validated dir', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mcpgen-out-write-'));
    createdDirs.push(tmp);
    await writeOutputFile(tmp, 'hello.txt', 'world\n');
    const entries = readdirSync(tmp);
    expect(entries).toContain('hello.txt');
  });
});
