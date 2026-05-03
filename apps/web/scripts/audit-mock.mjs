#!/usr/bin/env node
// Greps apps/web/src/ for production-path mock markers. Exits 1 if found.
// See docs/mcpgen-frontend-rebuild-contract.md §3 (I-2) + §5.2.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FORBIDDEN = [
  'FALLBACK_SAMPLE',
  'LUMEN_SAMPLE',
  'DEMO_DATA',
  'lorem ipsum',
  'TODO_MOCK',
];

// Allowed contexts:
// - tests/ (unit + e2e)
// - lib/fixture-mode/ (dev-only, NODE_ENV=production hard-blocked)
// - .test. files
// - "mock" inside vi.mock / sinon.mock identifiers
// - i18n keys with "mock" in name
// - comments containing the word `mock` describing test patterns

const EXCLUDE_GLOBS = [
  '**/__tests__/**',
  '**/*.test.*',
  '**/tests/**',
  '**/lib/fixture-mode/**',
  '**/*.stories.*',
  '**/scripts/**', // this script itself
];

// Per-line allow marker: `// audit:allow <reason>` on the same line OR the
// line immediately above suppresses a single hit. Used for legitimate
// loading-skeleton fallbacks, doc comments, and i18n keys that mention a
// forbidden marker by necessity.
const ALLOW_MARKER = /\/\/\s*audit:allow\b/;

const isAllowed = (filePath, lineNumber) => {
  try {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    const line = lines[lineNumber - 1] ?? '';
    const prev = lines[lineNumber - 2] ?? '';
    return ALLOW_MARKER.test(line) || ALLOW_MARKER.test(prev);
  } catch {
    return false;
  }
};

let hits = 0;
for (const pat of FORBIDDEN) {
  const args = [
    'rg', '-n', '--type-add', 'webprod:*.{ts,tsx,jsx}', '-t', 'webprod',
    ...EXCLUDE_GLOBS.flatMap((g) => ['-g', '!' + g]),
    pat, 'apps/web/src',
  ];
  try {
    const out = execSync(args.join(' '), { encoding: 'utf8' });
    if (out.trim()) {
      const filtered = [];
      for (const raw of out.split('\n').filter(Boolean)) {
        // rg -n format: <path>:<line>:<content>
        const match = raw.match(/^([^:]+):(\d+):/);
        if (match && isAllowed(match[1], Number(match[2]))) continue;
        filtered.push(raw);
      }
      if (filtered.length > 0) {
        console.error(`HIT for "${pat}":\n${filtered.join('\n')}`);
        hits += filtered.length;
      }
    }
  } catch (err) {
    // rg exits 1 when no matches — that's the success path
    if (err.status !== 1) throw err;
  }
}

if (hits > 0) {
  console.error(`\nFAIL — ${hits} mock-marker hit(s) in production paths`);
  process.exit(1);
}
console.log('OK — zero mock-data markers in apps/web/src/ production paths');
