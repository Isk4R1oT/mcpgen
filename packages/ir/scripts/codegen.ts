#!/usr/bin/env tsx
// packages/ir/scripts/codegen.ts
// 4-step pipeline (D-02):
//   1. Author Zod schemas in src/types.ts (manual, source of truth).
//   2. Convert each top-level z.* export to JSON Schema (draft-2020-12).
//   3. Run datamodel-code-generator to produce a Pydantic v2 mirror.
//   4. With --check: regenerate to a temp dir and diff vs committed python/types.py.
//
// Why subprocess for datamodel-code-generator? It's a Python tool (no JS port).
// We invoke it via `uvx datamodel-codegen` (preferred) with a `pip install` fallback
// hint if uvx is missing.
//
// CI: .github/workflows/contract-codegen-check.yml runs `pnpm --filter @mcpgen/ir codegen:check`
// on every PR touching packages/ir/. Local pre-commit hook `ir-codegen-check` runs the same
// command. Three-layer freshness defense (local + CI + scripted).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z, type ZodType } from 'zod';

import * as IR from '../src/types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const BUILD_DIR = join(PKG_ROOT, 'build', 'jsonschema');
const COMBINED_SCHEMA_PATH = join(BUILD_DIR, 'ir.json');
const PYTHON_OUT = join(PKG_ROOT, 'python', 'types.py');

const isCheckMode = process.argv.includes('--check');

// ── Step 2: emit a SINGLE JSON Schema document with $defs per top-level Zod export ──
// We combine all schemas into one document (rather than one file per type) because
// datamodel-code-generator's "modular references" path produces an output directory
// (not a single types.py file). $defs gives a single types.py with one class per export.
function isZodSchema(value: unknown): value is ZodType {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { _zod?: unknown };
  return candidate._zod !== undefined;
}

function emitJsonSchema(outFile: string): string[] {
  const outDir = dirname(outFile);
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });

  const defs: Record<string, unknown> = {};
  const exportedNames: string[] = [];

  for (const [name, value] of Object.entries(IR)) {
    if (!isZodSchema(value)) continue;
    // io: 'input' so that Zod `.default(...)` fields are NOT in `required[]`
    // (Pydantic codegen will then emit them as optional with a default value).
    // This is the additive-contract enabler for Phase 5 D-29 (RetryRound /
    // GoldenTask / new QualityReport fields) — without it, datamodel-codegen
    // marks defaulted fields as required and pre-Phase-5 fixtures break.
    const json = z.toJSONSchema(value, { target: 'draft-2020-12', io: 'input' });
    // Keep the title so datamodel-codegen picks it up as the class name.
    defs[name] = { title: name, ...(json as Record<string, unknown>) };
    exportedNames.push(name);
  }

  // datamodel-code-generator generates classes for every entry in $defs.
  // The top-level title is used for the root model — we use a synthetic name
  // and rely on $defs for the real types.
  const combined = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: '_McpgenIrRoot',
    type: 'object',
    $defs: defs,
  };

  writeFileSync(outFile, JSON.stringify(combined, null, 2) + '\n');
  return exportedNames;
}

// ── Step 3: invoke datamodel-code-generator ─────────────────────────────────
function runDatamodelCodegen(inputDir: string, outputFile: string): void {
  // Try uvx first (zero-install), then python -m datamodel_code_generator (CI uses pip).
  // If both fail, print actionable error.
  const args = [
    '--input',
    inputDir,
    '--input-file-type',
    'jsonschema',
    '--output',
    outputFile,
    '--output-model-type',
    'pydantic_v2.BaseModel',
    '--use-double-quotes',
    '--target-python-version',
    '3.12',
    '--use-schema-description',
    '--use-title-as-name',
    // Coerce JSON-Schema string `default` values into actual Enum members
    // (Phase 5 D-29 requirement: QualityReport.golden_task_set_origin default
    // serializes cleanly via `model_dump()` without PydanticSerializationUnexpectedValue
    // warnings when `filterwarnings=error` is set).
    '--set-default-enum-member',
    // Determinism: omit the timestamp header so `codegen:check` can byte-compare.
    '--disable-timestamp',
  ];

  // Ensure parent dir exists
  mkdirSync(dirname(outputFile), { recursive: true });

  // The PyPI package is `datamodel-code-generator` but the executable it provides is
  // `datamodel-codegen`. uvx requires `--from` when the package name and binary name differ.
  // Pinned to 0.26.4 to match .github/workflows/contract-codegen-check.yml (Plan 02).
  const candidates: Array<{ cmd: string; args: string[] }> = [
    {
      cmd: 'uvx',
      args: ['--from', 'datamodel-code-generator==0.26.4', 'datamodel-codegen', ...args],
    },
    { cmd: 'python3', args: ['-m', 'datamodel_code_generator', ...args] },
    { cmd: 'datamodel-codegen', args },
  ];

  let lastErr: unknown = null;
  for (const { cmd, args: cmdArgs } of candidates) {
    try {
      execFileSync(cmd, cmdArgs, { stdio: 'inherit' });
      return;
    } catch (err) {
      lastErr = err;
      // Try next candidate
    }
  }

  throw new Error(
    `datamodel-code-generator unavailable. Tried: uvx, python3 -m, datamodel-codegen.\n` +
      `Install one of:\n` +
      `  - uv (https://github.com/astral-sh/uv) — then \`uvx datamodel-code-generator\` works\n` +
      `  - pip install datamodel-code-generator==0.26.4\n` +
      `Last error: ${String(lastErr)}`,
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
function main(): void {
  if (isCheckMode) {
    // Regenerate to a temp dir; compare against committed PYTHON_OUT.
    if (!existsSync(PYTHON_OUT)) {
      console.error(
        `ERROR: ${PYTHON_OUT} does not exist. Run \`pnpm --filter @mcpgen/ir codegen\` first and commit.`,
      );
      process.exit(1);
    }
    const tmpRoot = mkdtempSync(join(tmpdir(), 'mcpgen-ir-codegen-'));
    const tmpJsonFile = join(tmpRoot, 'jsonschema', 'ir.json');
    const tmpPy = join(tmpRoot, 'types.py');
    try {
      emitJsonSchema(tmpJsonFile);
      runDatamodelCodegen(tmpJsonFile, tmpPy);
      const committed = readFileSync(PYTHON_OUT, 'utf8');
      const fresh = readFileSync(tmpPy, 'utf8');
      if (committed !== fresh) {
        console.error(
          `ERROR: ${PYTHON_OUT} is out of date.\n` +
            `Run \`pnpm --filter @mcpgen/ir codegen\` and commit the result.\n` +
            `Hint: diff length ${committed.length} vs ${fresh.length} bytes.`,
        );
        process.exit(1);
      }
      console.log('OK: packages/ir/python/types.py is up-to-date with src/types.ts.');
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
    return;
  }

  // Generate mode: write combined JSON Schema + Pydantic mirror in place.
  const exportedNames = emitJsonSchema(COMBINED_SCHEMA_PATH);
  console.log(
    `Wrote combined JSON Schema (${exportedNames.length} top-level types) to ${COMBINED_SCHEMA_PATH}`,
  );
  runDatamodelCodegen(COMBINED_SCHEMA_PATH, PYTHON_OUT);
  // Sanity: ensure expected classes are present (early failure is better than silent drift).
  const py = readFileSync(PYTHON_OUT, 'utf8');
  const required = ['FinalTool', 'ToolDescription', 'ToolAnnotations', 'ResponseConfig'];
  const missing = required.filter((cls) => !py.includes(`class ${cls}(`));
  if (missing.length > 0) {
    throw new Error(
      `Generated ${PYTHON_OUT} is missing expected class(es): ${missing.join(', ')}.\n` +
        `Top-level Zod exports detected: ${exportedNames.join(', ')}`,
    );
  }
  console.log(`OK: wrote ${PYTHON_OUT} (${py.length} bytes).`);
}

main();
