// packages/runtime-sdk/tests/smart-id.test.ts
//
// Phase 6 Wave 2 (per D-07) — smart-ID parse/make round-trip + error cases.
// Asserts the runtime's SMART_ID_REGEX is byte-identical to the Wave-0 fixture
// in tests/runtime/fixtures/smart-id-fuzz.ts (cross-package single-source-of-truth
// invariant; pitfall #1 mitigation).

import { describe, expect, it } from 'vitest';

import { SMART_ID_REGEX, makeSmartId, parseSmartId } from '../src/index.js';

describe('parseSmartId / makeSmartId — round-trip', () => {
  it('round-trips a well-formed object id', () => {
    const id = 'alice-stripe:object:Charge:ch_3O5jJ2';
    const parsed = parseSmartId(id);
    expect(parsed).toEqual({
      server: 'alice-stripe',
      type: 'object',
      collection: 'Charge',
      identifier: 'ch_3O5jJ2',
    });
    expect(makeSmartId(parsed)).toBe(id);
  });

  it('round-trips a collection id', () => {
    const id = 'bob-github:collection:Repository:repo_42';
    const parsed = parseSmartId(id);
    expect(parsed.type).toBe('collection');
    expect(makeSmartId(parsed)).toBe(id);
  });

  it('round-trips a schema id', () => {
    const id = 'carol-notion:schema:Page:default';
    const parsed = parseSmartId(id);
    expect(parsed.type).toBe('schema');
    expect(makeSmartId(parsed)).toBe(id);
  });

  it('accepts identifiers containing colons (greedy capture)', () => {
    // identifier captures `.+` — anything after the 3rd colon, including more colons.
    const id = 'alice-stripe:object:Webhook:hook:abc:123';
    const parsed = parseSmartId(id);
    expect(parsed.identifier).toBe('hook:abc:123');
    expect(makeSmartId(parsed)).toBe(id);
  });
});

describe('parseSmartId — error cases', () => {
  it('throws invalid_smart_id on malformed input', () => {
    expect(() => parseSmartId('not_a_smart_id')).toThrow(/invalid_smart_id/);
  });

  it('throws invalid_smart_id on empty string', () => {
    expect(() => parseSmartId('')).toThrow(/invalid_smart_id/);
  });

  it('throws invalid_smart_id on too-few segments', () => {
    expect(() => parseSmartId('alice:object:Charge')).toThrow(/invalid_smart_id/);
  });

  // The current regex enforces type ∈ {object|collection|schema} as part of
  // the alternation, so a "badtype" input never matches the regex at all and
  // surfaces as `invalid_smart_id` rather than `invalid_smart_id_type`. This
  // is structurally correct: bad types don't pass the regex.
  it('throws invalid_smart_id on unknown type prefix', () => {
    expect(() => parseSmartId('alice:badtype:Foo:x')).toThrow(/invalid_smart_id/);
  });
});

describe('SMART_ID_REGEX — single source of truth', () => {
  it('matches the Wave-0 fixture regex source byte-for-byte', async () => {
    // Cross-package alignment: dispatch fuzz + tenant Worker + F1 fixture all
    // see the same regex. Imported dynamically so the fixture path resolution
    // is deferred until the test runs (the fixture sits outside the runtime
    // package — same monorepo, separate workspace).
    const fixture = await import('../../../tests/runtime/fixtures/smart-id-fuzz.js' as string);
    expect(SMART_ID_REGEX.source).toBe(
      (fixture as { SMART_ID_REGEX: RegExp }).SMART_ID_REGEX.source,
    );
  });
});
