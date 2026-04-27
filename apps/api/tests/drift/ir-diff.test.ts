// apps/api/tests/drift/ir-diff.test.ts
//
// CTRL-03 / D-17 / Pitfall #34: parsed-IR diff strips cosmetic fields.
//
// Fixture: packages/engine-fixtures/stripe/ir.json (Phase 1) hand-mutated
// in-memory to 3 variants (cosmetic-only, parameter-added, endpoint-removed).

import { describe, it, expect } from 'vitest';
import { stripe } from '@mcpgen/engine-fixtures';
import { computeIrDiff, stripCosmetic } from '../../src/lib/drift/ir-diff.js';

interface MutableEndpoint {
  method?: string;
  path?: string;
  description?: string;
  summary?: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema?: { type: string };
  }>;
  [key: string]: unknown;
}

interface MutableIr {
  endpoints: MutableEndpoint[];
  [key: string]: unknown;
}

function cloneIr(): MutableIr {
  return JSON.parse(JSON.stringify(stripe.ir)) as MutableIr;
}

describe('computeIrDiff', () => {
  it('returns empty diff when only cosmetic fields change (D-17 / Pitfall #34)', () => {
    const baseline = cloneIr();
    const current = cloneIr();
    // Mutate cosmetic-only: change description text + add x-extension + change tags + summary.
    const first = current.endpoints[0];
    expect(first).toBeDefined();
    if (first) {
      first.description = 'Updated marketing copy that should be ignored';
      first.summary = 'New summary that should be ignored';
      (first as Record<string, unknown>)['x-internal-flag'] = true;
      (first as Record<string, unknown>)['tags'] = ['ignored', 'too'];
      (first as Record<string, unknown>)['externalDocs'] = { url: 'http://x' };
    }
    const diff = computeIrDiff(baseline, current);
    expect(diff.empty).toBe(true);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('detects parameter addition as changed', () => {
    const baseline = cloneIr();
    const current = cloneIr();
    const first = current.endpoints[0];
    expect(first).toBeDefined();
    if (first) {
      const existing = Array.isArray(first.parameters) ? first.parameters : [];
      first.parameters = [
        ...existing,
        { name: 'expand', in: 'query', required: false, schema: { type: 'string' } },
      ];
    }
    const diff = computeIrDiff(baseline, current);
    expect(diff.empty).toBe(false);
    expect(diff.changed.length).toBeGreaterThanOrEqual(1);
  });

  it('detects endpoint removal', () => {
    const baseline = cloneIr();
    const current = cloneIr();
    current.endpoints = current.endpoints.slice(1); // drop the first endpoint
    const diff = computeIrDiff(baseline, current);
    expect(diff.empty).toBe(false);
    expect(diff.removed).toHaveLength(1);
  });

  it('detects endpoint addition', () => {
    const baseline = cloneIr();
    const current = cloneIr();
    current.endpoints.push({
      method: 'POST',
      path: '/v1/synthetic-new-endpoint',
      operation_id: 'PostSyntheticNew',
      parameters: [],
      request_body: null,
      responses: { 200: { description: 'ok' } },
      tags: ['Synthetic'],
      deprecated: false,
    });
    const diff = computeIrDiff(baseline, current);
    expect(diff.empty).toBe(false);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]?.method).toBe('POST');
    expect(diff.added[0]?.path).toBe('/v1/synthetic-new-endpoint');
  });
});

describe('stripCosmetic', () => {
  it('removes summary/description/tags/externalDocs and x-* keys', () => {
    const input = {
      keep: 1,
      summary: 'drop',
      description: 'drop',
      tags: ['drop'],
      externalDocs: { url: 'drop' },
      'x-internal': true,
      nested: {
        keep: 2,
        summary: 'drop',
        'x-other': 'drop',
      },
    };
    const out = stripCosmetic(input) as Record<string, unknown>;
    expect(out).toHaveProperty('keep', 1);
    expect(out).not.toHaveProperty('summary');
    expect(out).not.toHaveProperty('description');
    expect(out).not.toHaveProperty('tags');
    expect(out).not.toHaveProperty('externalDocs');
    expect(out).not.toHaveProperty('x-internal');
    expect(out['nested']).toEqual({ keep: 2 });
  });

  it('produces deterministic output regardless of input key order', () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    expect(JSON.stringify(stripCosmetic(a))).toBe(JSON.stringify(stripCosmetic(b)));
  });

  it('handles arrays element-wise', () => {
    const input = [{ keep: 1, description: 'drop' }, { keep: 2, summary: 'drop' }];
    const out = stripCosmetic(input) as Array<Record<string, unknown>>;
    expect(out).toEqual([{ keep: 1 }, { keep: 2 }]);
  });

  it('preserves primitives untouched', () => {
    expect(stripCosmetic('hello')).toBe('hello');
    expect(stripCosmetic(42)).toBe(42);
    expect(stripCosmetic(null)).toBeNull();
    expect(stripCosmetic(true)).toBe(true);
  });
});
