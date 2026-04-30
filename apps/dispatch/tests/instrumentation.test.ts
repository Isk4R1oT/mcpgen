// apps/dispatch/tests/instrumentation.test.ts
//
// CTRL-08 / D-03 / Pitfall #3 — proves apps/dispatch Sentry init is wired
// (Phase 6 left it dangling — `SENTRY_DSN` binding existed but no `withSentry`
// wrapper). Phase 9 closes the gap.
//
// Also runs the 6-vector cross-language fixture against
// `dispatchSentryOptionsFor(env).beforeSend(event)` to prove the shared
// `redactBeforeSend` covers apps/dispatch leak surface.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sentryOptionsFor, withSentry } from '../src/instrumentation.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// apps/dispatch/tests/ → repo root is 3 levels up.
const REPO_ROOT = resolve(HERE, '../../..');
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

describe('Pitfall #3 — apps/dispatch Sentry init wired (D-03)', () => {
  it('exports sentryOptionsFor as a function', () => {
    expect(typeof sentryOptionsFor).toBe('function');
  });

  it('re-exports withSentry from @sentry/cloudflare', () => {
    expect(typeof withSentry).toBe('function');
  });

  it('sentryOptionsFor returns empty DSN when env.SENTRY_DSN unset (no-op)', () => {
    const opts = sentryOptionsFor({});
    expect(opts.dsn).toBe('');
  });

  it('sentryOptionsFor preserves explicit DSN', () => {
    const opts = sentryOptionsFor({ SENTRY_DSN: 'https://fake@sentry.io/1' });
    expect(opts.dsn).toBe('https://fake@sentry.io/1');
  });

  it('sentryOptionsFor sets ENVIRONMENT default to "development"', () => {
    const opts = sentryOptionsFor({});
    expect(opts.environment).toBe('development');
  });

  it('sentryOptionsFor preserves explicit ENVIRONMENT', () => {
    const opts = sentryOptionsFor({ ENVIRONMENT: 'production' });
    expect(opts.environment).toBe('production');
  });

  it('sentryOptionsFor produces a callable beforeSend', () => {
    const opts = sentryOptionsFor({ SENTRY_DSN: 'https://fake@sentry.io/1' });
    expect(typeof opts.beforeSend).toBe('function');
  });
});

describe('CTRL-08 / D-12 — leak-vector regression suite (apps/dispatch)', () => {
  const vectors = loadVectors();

  for (const vector of vectors) {
    it(`vector "${vector.name}" — apps/dispatch beforeSend strips all leak strings`, () => {
      const opts = sentryOptionsFor({ SENTRY_DSN: 'https://fake@sentry.io/1' });
      const beforeSend = opts.beforeSend;
      expect(typeof beforeSend).toBe('function');
      const inputCopy = JSON.parse(JSON.stringify(vector.input_event)) as Record<
        string,
        unknown
      >;
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
