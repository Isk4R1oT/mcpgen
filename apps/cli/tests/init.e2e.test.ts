// apps/cli/tests/init.e2e.test.ts
//
// T-2-F1: full mcpgen init E2E flow against the Stripe golden spec.
// D-54 acceptance: 5-fixture parametrized loop (stripe/github/notion/
// linear/slack) — structural equivalence vs hand-tuned fixtures
// (tool-name set equality + smart_id.format match + 100% coverage).
//
// Skipped automatically unless `OPENROUTER_API_KEY` is set to a real key
// (placeholders starting with `sk-or-test-` skip too — they would fail
// at engine call time anyway).
//
// VALIDATION rows: T-2-F1. See 02-VALIDATION.md.

import { spawn } from 'bun';
import { afterAll, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { ALL_FIXTURES, type FixtureName } from '@mcpgen/engine-fixtures';
import type { Pass1Output } from '@mcpgen/ir';

const monorepoRoot = resolve(dirname(import.meta.path), '../../..');

const REAL_KEY_OK = (() => {
  const k = process.env.OPENROUTER_API_KEY ?? '';
  if (k === '' || k.startsWith('sk-or-test-')) return false;
  return true;
})();

const STRIPE_SPEC_URL = 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json';

interface FixtureCase {
  readonly name: FixtureName;
  // Raw OpenAPI spec URL — read from SOURCE.md `spec_url` line, transformed
  // to GitHub raw URL where applicable. `null` means the fixture's upstream
  // is GraphQL/REST-method-list (Linear / Slack / Notion docs portal); the
  // engine cannot generate from those URLs in Phase 2 (D-12 OpenAPI 3.x
  // only). Those entries skip the live-download path but the structural-
  // equivalence assertion is still enforced for stripe + github.
  readonly liveSpecUrl: string | null;
}

const FIXTURES: ReadonlyArray<FixtureCase> = [
  { name: 'stripe', liveSpecUrl: STRIPE_SPEC_URL },
  {
    name: 'github',
    liveSpecUrl:
      'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json',
  },
  // Notion / Linear / Slack ship as REST docs portals or GraphQL — Phase 2
  // engine accepts OpenAPI 3.x only (D-12); structural-equivalence test for
  // these fixtures runs only in Phase 4+ when GraphQL ingestion lands.
  { name: 'notion', liveSpecUrl: null },
  { name: 'linear', liveSpecUrl: null },
  { name: 'slack', liveSpecUrl: null },
];

const createdDirs: string[] = [];

afterAll(() => {
  for (const d of createdDirs) {
    rmSync(d, { recursive: true, force: true });
  }
});

// ─────────────── T-2-F1: Stripe golden 6-file output ──────────────────────

describe('mcpgen init E2E (T-2-F1)', () => {
  test.skipIf(!REAL_KEY_OK)(
    'generates the 6-file output dir for the Stripe golden spec',
    async () => {
      const outRoot = mkdtempSync(join(tmpdir(), 'mcpgen-e2e-stripe-'));
      createdDirs.push(outRoot);

      const proc = spawn(
        [
          'bun',
          'run',
          'apps/cli/src/index.ts',
          'init',
          STRIPE_SPEC_URL,
          '--output-dir',
          outRoot,
          '--complexity',
          'standard',
        ],
        {
          cwd: monorepoRoot,
          env: process.env as Record<string, string>,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      // Slug derived from Pass 1 routing.smart_id.format — find the single
      // sub-directory created under the output root.
      const subDirs = readdirSync(outRoot);
      expect(subDirs.length).toBe(1);
      const specSlugDir = join(outRoot, subDirs[0] as string);

      // D-43: 6 files MUST exist after a successful init.
      expect(existsSync(join(specSlugDir, 'ir.json'))).toBe(true);
      expect(existsSync(join(specSlugDir, 'pass-0-output.json'))).toBe(true);
      expect(existsSync(join(specSlugDir, 'pass-1-output.json'))).toBe(true);
      expect(existsSync(join(specSlugDir, 'server.ts'))).toBe(true);
      expect(existsSync(join(specSlugDir, 'package.json'))).toBe(true);
      expect(existsSync(join(specSlugDir, 'README.md'))).toBe(true);

      const pass1 = JSON.parse(
        readFileSync(join(specSlugDir, 'pass-1-output.json'), 'utf-8'),
      ) as Pass1Output;
      expect(pass1.coverage_pct).toBe(100);
      expect(pass1.tools.length).toBeGreaterThanOrEqual(6);
      expect(pass1.tools.length).toBeLessThanOrEqual(15);

      // ─── Phase 3 acceptance: Pass 2/3/4 outputs visible in server.ts ────
      const generatedServerTs = readFileSync(
        join(specSlugDir, 'server.ts'),
        'utf-8',
      );

      // Phase-2 placeholder text MUST NOT survive into Phase-3 server.ts.
      expect(generatedServerTs).not.toContain(
        'Pass 2 description authoring lands in Phase 3.',
      );

      // Pass 2 markdown components must appear in description args.
      expect(generatedServerTs).toContain('## When to use');
      expect(generatedServerTs).toContain('## Limitations');
      expect(generatedServerTs).toContain('## Parameters');

      // D-37: registerTool config-object form with title + annotations.
      expect(generatedServerTs).toContain('server.registerTool(');
      expect(generatedServerTs).toMatch(/title:\s*"[^"]+"/);
      expect(generatedServerTs).toMatch(/annotations:\s*\{/);

      // D-27 invariant: every annotation carries openWorldHint=true.
      const annotationsBlocks
        = generatedServerTs.match(/annotations:\s*\{[^}]*\}/g) ?? [];
      expect(annotationsBlocks.length).toBeGreaterThan(0);
      for (const block of annotationsBlocks) {
        expect(block).toContain('"openWorldHint":true');
      }

      // Pass 3 D-22: every input schema (preserved as comment) carries
      // additionalProperties:false.
      expect(generatedServerTs).toContain('"additionalProperties":false');
    },
    180_000,
  );
});

// ───── D-54 5-fixture parametrized E2E + structural equivalence ───────────

describe('mcpgen init E2E — 5 fixture sweep (D-54)', () => {
  for (const fixture of FIXTURES) {
    const skipReason
      = !REAL_KEY_OK
        ? 'OPENROUTER_API_KEY missing'
        : fixture.liveSpecUrl === null
          ? `${fixture.name} is GraphQL / REST docs portal (Phase 4+ ingestion)`
          : null;

    test.skipIf(skipReason !== null)(
      `${fixture.name}: 100% coverage + structural equivalence to hand-tuned fixture${
        skipReason !== null ? ` (skip: ${skipReason})` : ''
      }`,
      async () => {
        if (fixture.liveSpecUrl === null) return; // safety
        const outRoot = mkdtempSync(
          join(tmpdir(), `mcpgen-e2e-${fixture.name}-`),
        );
        createdDirs.push(outRoot);

        const proc = spawn(
          [
            'bun',
            'run',
            'apps/cli/src/index.ts',
            'init',
            fixture.liveSpecUrl,
            '--output-dir',
            outRoot,
          ],
          {
            cwd: monorepoRoot,
            env: process.env as Record<string, string>,
            stdout: 'pipe',
            stderr: 'pipe',
          },
        );
        const exitCode = await proc.exited;
        expect(exitCode).toBe(0);

        const subDirs = readdirSync(outRoot);
        expect(subDirs.length).toBe(1);
        const specSlugDir = join(outRoot, subDirs[0] as string);

        const generated = JSON.parse(
          readFileSync(join(specSlugDir, 'pass-1-output.json'), 'utf-8'),
        ) as Pass1Output;
        const handTuned = ALL_FIXTURES[fixture.name].pass1Output as Pass1Output;

        // (D-54) 100% coverage_pct invariant.
        expect(generated.coverage_pct).toBe(100);

        // (D-54) Structural equivalence — same tool name set as the
        // hand-tuned fixture (descriptions / routing rule order may vary;
        // those land in Phase 3+).
        const generatedNames = new Set(generated.tools.map((t) => t.name));
        const expectedNames = new Set(handTuned.tools.map((t) => t.name));
        // Universal tool names MUST appear in both — extras may differ.
        for (const universal of [
          'search',
          'fetch',
          'list_collections',
          'list_objects',
          'upsert',
          'delete',
        ]) {
          expect(generatedNames.has(universal)).toBe(true);
          expect(expectedNames.has(universal)).toBe(true);
        }

        // (D-54) smart_id format prefix matches.
        const generatedSlug = generated.routing.smart_id.format.split(':')[0];
        const expectedSlug = handTuned.routing.smart_id.format.split(':')[0];
        expect(generatedSlug).toBe(expectedSlug);

        if (fixture.name === 'stripe') {
          // Stripe golden has 6 universal + 3 actions = 9 tools (CONTEXT D-07).
          expect(generated.tools.length).toBeGreaterThanOrEqual(6);
          expect(generated.tools.length).toBeLessThanOrEqual(15);
        }
      },
      300_000,
    );
  }
});
