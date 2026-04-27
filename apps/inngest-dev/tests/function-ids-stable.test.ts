// apps/inngest-dev/tests/function-ids-stable.test.ts
//
// Phase 6 Wave 4 (CTRL-09) — asserts the 4 Inngest function IDs are stable
// strings ending in -v1. Renaming any of these = orphaned function on
// Inngest Cloud; the test catches the rename at PR time.

import { describe, expect, it } from 'vitest';

import { usageEventsIngest } from '../src/functions/usage-events-ingest.js';
import { usageFallbackDrain } from '../src/functions/usage-fallback-drain.js';
import { usageReconciler } from '../src/functions/usage-reconciler.js';
import { warmKeepActiveTenants } from '../src/functions/warm-keep-active-tenants.js';

const EXPECTED_IDS = [
  'usage-events-ingest-v1',
  'usage-fallback-drain-v1',
  'usage-reconciler-v1',
  'warm-keep-active-tenants-v1',
] as const;

describe('Phase 6 Wave 4 — Inngest function IDs are stable per CTRL-09', () => {
  // Inngest 4.x: `.id()` returns the prefixed id; the raw configured id is
  // on `.opts.id`. We assert against the raw configured id (single source
  // of truth in the createFunction call site).
  const fns = [
    usageEventsIngest,
    usageFallbackDrain,
    usageReconciler,
    warmKeepActiveTenants,
  ];

  it('exposes exactly 4 unique function IDs', () => {
    const ids = fns.map((f) => (f as unknown as { opts: { id: string } }).opts.id);
    const set = new Set(ids);
    expect(set.size).toBe(4);
  });

  it('every ID matches the expected stable string', () => {
    const ids = fns
      .map((f) => (f as unknown as { opts: { id: string } }).opts.id)
      .sort();
    expect(ids).toEqual([...EXPECTED_IDS].sort());
  });

  it('every ID ends with -v1 (CTRL-09 versioning convention)', () => {
    const ids = fns.map((f) => (f as unknown as { opts: { id: string } }).opts.id);
    for (const id of ids) {
      expect(id).toMatch(/-v1$/);
    }
  });
});
