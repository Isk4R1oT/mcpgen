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
import type {
  Pass1Output,
  Pass2Output,
  Pass3Output,
  Pass4Output,
  ToolDescription,
} from '@mcpgen/ir';

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

// ─── Phase-3 stub Pass 2/3/4 outputs covering every Stripe Pass 1 tool ────
function makeStubDescription(name: string): ToolDescription {
  return {
    purpose: `Stub purpose for tool '${name}' covering 5+ rubric components.`,
    when_to_use: [`finding ${name} via canonical pipeline`],
    limitations: [`stub limitation entry for '${name}'`],
    parameter_overview: `Stub parameter overview for ${name}; orchestrator-shape only.`,
  };
}

const stripePass2: Pass2Output = {
  descriptions: Object.fromEntries(
    stripePass1.tools.map((t) => [t.name, makeStubDescription(t.name)]),
  ),
};

const stripePass3: Pass3Output = {
  input_schemas: Object.fromEntries(
    stripePass1.tools.map((t) => {
      const properties: Record<string, Record<string, unknown>> = {};
      const required: string[] = [];
      if (t.name === 'search') {
        properties.query = { type: 'string', description: 'search query' };
        required.push('query');
      } else if (t.name === 'fetch') {
        properties.id = { type: 'string', description: 'object id' };
        required.push('id');
      }
      const schema: Record<string, unknown> = {
        type: 'object',
        properties,
        additionalProperties: false,
      };
      if (required.length > 0) {
        schema.required = required;
      }
      return [t.name, schema];
    }),
  ),
};

const stripePass4: Pass4Output = {
  annotations: Object.fromEntries(
    stripePass1.tools.map((t) => {
      const readUniversal = new Set(['search', 'fetch', 'list_collections', 'list_objects']);
      const isRead = readUniversal.has(t.name) || t.type === 'specialized';
      return [
        t.name,
        {
          readOnlyHint: isRead,
          destructiveHint: t.name === 'delete',
          idempotentHint: isRead || t.name === 'delete',
          openWorldHint: true as const,
        },
      ];
    }),
  ),
  titles: Object.fromEntries(
    stripePass1.tools.map((t) => [t.name, t.name.replace(/_/g, ' ')]),
  ),
};

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
  test('emits MCP-SDK-v1 registerTool config-object form for all Pass 1 tools (D-37)', () => {
    const code = renderServerTs(
      'stripe-api',
      stripePass1,
      stripePass2,
      stripePass3,
      stripePass4,
    );
    expect(code).toContain('@modelcontextprotocol/sdk/server/mcp.js');
    // Phase-3 D-37: registerTool config-object form (the only SDK v1 surface
    // that supports description + inputSchema + annotations + title together).
    expect(code).toContain('server.registerTool(');
    for (const tool of stripePass1.tools) {
      expect(code).toContain(JSON.stringify(tool.name));
    }
    expect(code).toContain('Stage E codegen lands in Phase 4'); // D-45 placeholder text
  });

  test('search tool registration includes Pass 3 query schema in comment (D-30 OpenAI compliance)', () => {
    const code = renderServerTs(
      'stripe-api',
      stripePass1,
      stripePass2,
      stripePass3,
      stripePass4,
    );
    // Pass 3 JSON Schema preserved as comment for Stage E lifting.
    expect(code).toMatch(/Pass 3 input schema.*"properties":\{"query":\{"type":"string"/);
    // D-30 OpenAI compliance: runtime Zod shape stays single-string.
    expect(code).toMatch(/"search",\s*\{[\s\S]*?inputSchema:\s*\{ query: z\.string\(\) \}/);
  });

  test('fetch tool registration includes Pass 3 id schema in comment (D-30 OpenAI compliance)', () => {
    const code = renderServerTs(
      'stripe-api',
      stripePass1,
      stripePass2,
      stripePass3,
      stripePass4,
    );
    expect(code).toMatch(/Pass 3 input schema.*"properties":\{"id":\{"type":"string"/);
    expect(code).toMatch(/"fetch",\s*\{[\s\S]*?inputSchema:\s*\{ id: z\.string\(\) \}/);
  });

  test('every tool registration carries title + annotations in config (D-37)', () => {
    const code = renderServerTs(
      'stripe-api',
      stripePass1,
      stripePass2,
      stripePass3,
      stripePass4,
    );
    const annotationsBlocks = code.match(/annotations:\s*\{[^}]*\}/g) ?? [];
    expect(annotationsBlocks.length).toBe(stripePass1.tools.length);
    expect(code).toContain('title:');
  });

  test('every annotation carries openWorldHint=true (Phase 3 D-27 invariant)', () => {
    const code = renderServerTs(
      'stripe-api',
      stripePass1,
      stripePass2,
      stripePass3,
      stripePass4,
    );
    const annotationsBlocks = code.match(/annotations:\s*\{[^}]*\}/g) ?? [];
    expect(annotationsBlocks.length).toBeGreaterThan(0);
    for (const block of annotationsBlocks) {
      expect(block).toContain('"openWorldHint":true');
    }
  });

  test('every Pass 3 schema is preserved as comment with additionalProperties:false (D-22)', () => {
    const code = renderServerTs(
      'stripe-api',
      stripePass1,
      stripePass2,
      stripePass3,
      stripePass4,
    );
    const additionalPropsBlocks = code.match(/"additionalProperties":false/g) ?? [];
    expect(additionalPropsBlocks.length).toBe(stripePass1.tools.length);
  });

  test('descriptions render as Pass 2 markdown (## When to use / ## Limitations)', () => {
    const code = renderServerTs(
      'stripe-api',
      stripePass1,
      stripePass2,
      stripePass3,
      stripePass4,
    );
    expect(code).toContain('## When to use');
    expect(code).toContain('## Limitations');
    expect(code).toContain('## Parameters');
    // Phase-2 placeholder text MUST NOT appear when Pass 2 outputs are present.
    expect(code).not.toContain('Pass 2 description authoring lands in Phase 3.');
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
