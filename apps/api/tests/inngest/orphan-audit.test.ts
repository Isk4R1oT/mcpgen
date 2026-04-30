// apps/api/tests/inngest/orphan-audit.test.ts
//
// CTRL-09 / D-14 / Pitfall #21: Inngest function-ID orphan audit.
//
// Static-source AST scan that asserts every `inngest.createFunction({ id: ... })`
// invocation in `apps/api/src/inngest/functions/*.ts` references a key from the
// `INNGEST_FUNCTION_IDS` register AND every registered key has at least one
// implementation file. Bidirectional set-equality.
//
// Closes Phase 9 CTRL-09 (orphan audit). Phase 8 shipped the 7-function register;
// Phase 9's job is to PREVENT future orphan additions via CI.
//
// Pure file read + regex (no Inngest dev server, no network) — runs in <1s.
//
// References:
//   - .planning/phases/09-observability-polish/09-RESEARCH.md §"Pattern 4"
//   - .planning/phases/09-observability-polish/09-PATTERNS.md §"orphan-audit.test.ts"
//   - packages/contracts/src/inngest-functions.ts (the register)
//   - apps/api/src/inngest/functions/index.ts (the runtime functions[] array)

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { functions } from '../../src/inngest/functions/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_DIR = resolve(HERE, '../../src/inngest/functions');
const REGISTERED_IDS = new Set<string>(Object.values(INNGEST_FUNCTION_IDS));

describe('Inngest orphan audit (CTRL-09 / D-14)', () => {
  it('every function file uses an id from INNGEST_FUNCTION_IDS', () => {
    const files = readdirSync(FN_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    const idRegex = /id:\s*INNGEST_FUNCTION_IDS\.([A-Z_]+)/g;
    const found = new Set<string>();
    for (const file of files) {
      const src = readFileSync(resolve(FN_DIR, file), 'utf-8');
      let m: RegExpExecArray | null;
      while ((m = idRegex.exec(src)) !== null) {
        const key = m[1] as string;
        const value = (INNGEST_FUNCTION_IDS as Record<string, string | undefined>)[key];
        expect(
          value,
          `${file} references unregistered key INNGEST_FUNCTION_IDS.${key}`,
        ).toBeDefined();
        // Narrow for downstream Set add (assertion above guarantees defined).
        const id = value as string;
        expect(
          REGISTERED_IDS,
          `${file} references unregistered key INNGEST_FUNCTION_IDS.${key}`,
        ).toContain(id);
        found.add(id);
      }
    }
    // Bidirectional: register has no orphan IDs without a function implementation.
    expect(found, 'register vs implementation set-equality').toEqual(REGISTERED_IDS);
  });

  it('runtime functions[] array length matches register', () => {
    expect(functions.length).toBe(Object.keys(INNGEST_FUNCTION_IDS).length);
  });

  it('no function file uses a hardcoded id literal (anti-hardcode guard)', () => {
    // T-9-orphan-01 mitigation: future PRs MUST go through INNGEST_FUNCTION_IDS register;
    // bare `id: 'drift-watcher-v1'` would bypass the audit. Reject any such literal.
    const files = readdirSync(FN_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    const hardcodedIdRegex = /id:\s*['"][a-z][a-z0-9-]*-v\d+['"]/;
    for (const file of files) {
      const src = readFileSync(resolve(FN_DIR, file), 'utf-8');
      expect(
        src,
        `${file} contains a hardcoded id literal (use INNGEST_FUNCTION_IDS.X instead)`,
      ).not.toMatch(hardcodedIdRegex);
    }
  });
});
