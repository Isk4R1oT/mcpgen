// apps/api/tests/security/sentry-redaction.test.ts
//
// CTRL-08 / D-12 — vitest table-driven leak-vector regression suite for
// apps/api. Loads the shared fixture at `tests/fixtures/leak-vectors.json`
// (consumed in parallel by pytest in apps/generation-engine + a per-app
// equivalent suite in apps/dispatch/tests/instrumentation.test.ts proving
// Pitfall #3 closed) and asserts that `sentryOptionsFor(env).beforeSend(event)`
// strips every leak vector.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sentryOptionsFor } from '../../src/instrumentation.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// apps/api/tests/security/ → repo root is 4 levels up.
const REPO_ROOT = resolve(HERE, '../../../..');
const FIXTURE_PATH = resolve(REPO_ROOT, 'tests/fixtures/leak-vectors.json');

interface LeakVector {
  name: string;
  input_event: Record<string, unknown>;
  expected_no_match: string[];
}
interface LeakVectorFile {
  vectors: LeakVector[];
}

function loadVectors(): LeakVector[] {
  const raw = readFileSync(FIXTURE_PATH, 'utf-8');
  return (JSON.parse(raw) as LeakVectorFile).vectors;
}

describe('CTRL-08 / D-12 — leak-vector regression suite (apps/api)', () => {
  const vectors = loadVectors();

  for (const vector of vectors) {
    it(`vector "${vector.name}" — apps/api beforeSend strips all leak strings`, () => {
      const opts = sentryOptionsFor({ SENTRY_DSN: 'https://fake@sentry.io/1' });
      const beforeSend = opts.beforeSend;
      expect(typeof beforeSend).toBe('function');
      const inputCopy = JSON.parse(JSON.stringify(vector.input_event)) as Record<
        string,
        unknown
      >;
      // CloudflareOptions.beforeSend signature returns ErrorEvent | PromiseLike<...> | null.
      // Call with `unknown` cast since the shared helper is structurally typed.
      const out = (beforeSend as (e: unknown) => unknown)(inputCopy);
      const serialized = JSON.stringify(out);
      for (const leak of vector.expected_no_match) {
        expect(
          serialized,
          `vector ${vector.name} — leaked string "${leak}" still present in: ${serialized}`,
        ).not.toContain(leak);
      }
    });
  }
});

describe('D-01 empty-DSN no-op invariant (apps/api)', () => {
  it('sentryOptionsFor returns empty DSN when env.SENTRY_DSN unset', () => {
    const opts = sentryOptionsFor({});
    expect(opts.dsn).toBe('');
  });

  it('sentryOptionsFor preserves explicit DSN', () => {
    const opts = sentryOptionsFor({ SENTRY_DSN: 'https://fake@sentry.io/1' });
    expect(opts.dsn).toBe('https://fake@sentry.io/1');
  });
});
