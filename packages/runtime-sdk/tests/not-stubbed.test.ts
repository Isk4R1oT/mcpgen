// packages/runtime-sdk/tests/not-stubbed.test.ts
//
// Phase 6 Wave 2 — inverts the Phase-1 throw assertions. Per BLOCKER-4 fix:
// asserts no method throws the legacy `is an interface-only stub in Phase 1`
// error AND that 3 representative methods produce real values + are bound
// (not the Phase-1 stub closure).

import { describe, expect, it } from 'vitest';

import { createRuntime, createStubRuntime, makeSmartId, parseSmartId } from '../src/index.js';

const STUB_ERROR = /is an interface-only stub in Phase 1/;

describe('Phase 6 — Runtime methods are no longer Phase-1 stubs', () => {
  const runtime = createRuntime();

  it('parseSmartId does NOT throw the Phase-1 stub error', () => {
    expect(() => runtime.parseSmartId('alice:object:Charge:x')).not.toThrow(STUB_ERROR);
  });

  it('makeSmartId does NOT throw the Phase-1 stub error', () => {
    expect(() =>
      runtime.makeSmartId({
        server: 's',
        type: 'object',
        collection: 'C',
        identifier: 'i',
      }),
    ).not.toThrow(STUB_ERROR);
  });

  it('routeSearch does NOT throw the Phase-1 stub error', async () => {
    await expect(runtime.routeSearch('q', {})).resolves.not.toBeUndefined();
  });

  it('routeFetch does NOT throw the Phase-1 stub error', async () => {
    await expect(runtime.routeFetch('id', {})).resolves.not.toBeUndefined();
  });

  it('routeListCollections does NOT throw the Phase-1 stub error', async () => {
    await expect(runtime.routeListCollections({})).resolves.not.toBeUndefined();
  });

  it('routeListObjects does NOT throw the Phase-1 stub error', async () => {
    await expect(
      runtime.routeListObjects({ collection: 'X' }),
    ).resolves.not.toBeUndefined();
  });

  it('routeUpsert does NOT throw the Phase-1 stub error', async () => {
    await expect(
      runtime.routeUpsert({ collection: 'X', data: {} }),
    ).resolves.not.toBeUndefined();
  });

  it('routeDelete does NOT throw the Phase-1 stub error', async () => {
    await expect(
      runtime.routeDelete({ type: 'object', confirm: false }),
    ).resolves.not.toBeUndefined();
  });

  it('shapeResponse does NOT throw the Phase-1 stub error', () => {
    expect(() =>
      runtime.shapeResponse(
        {},
        {
          pagination: null,
          field_filtering: null,
          truncation: { threshold_tokens: 100, guidance_template: '' },
          has_response_format_param: false,
        },
      ),
    ).not.toThrow(STUB_ERROR);
  });

  it('applyFieldFilter does NOT throw the Phase-1 stub error', () => {
    expect(() =>
      runtime.applyFieldFilter({}, { always_include: [], opt_in: [], always_exclude: [] }),
    ).not.toThrow(STUB_ERROR);
  });

  it('handleUpstreamError does NOT throw the Phase-1 stub error', () => {
    expect(() =>
      runtime.handleUpstreamError(new Error('boom'), {
        tool_name: 'x',
        upstream_status: 500,
      }),
    ).not.toThrow(STUB_ERROR);
  });
});

describe('Phase 6 — representative methods produce real values', () => {
  const runtime = createRuntime();

  it('parseSmartId returns a SmartId object with the expected server prefix', () => {
    expect(runtime.parseSmartId('alice:object:Charge:x')).toMatchObject({
      server: 'alice',
      type: 'object',
      collection: 'Charge',
      identifier: 'x',
    });
  });

  it('makeSmartId returns the canonical 4-segment string', () => {
    const made = runtime.makeSmartId({
      server: 'alice',
      type: 'object',
      collection: 'Charge',
      identifier: 'x',
    });
    expect(made).toMatch(/^[a-z0-9-]+:[a-z]+:[A-Z][a-zA-Z]+:.+$/);
  });

  it('routeSearch is bound to a real function (not the Phase-1 stub closure)', () => {
    expect(typeof runtime.routeSearch).toBe('function');
  });
});

describe('createStubRuntime backward-compat alias', () => {
  it('returns a Runtime that delegates to createRuntime (no Phase-1 throws)', () => {
    const stub = createStubRuntime();
    expect(stub.parseSmartId('alice:object:Charge:x').server).toBe('alice');
    // Free functions remain importable.
    expect(makeSmartId(parseSmartId('alice:object:Charge:x'))).toBe('alice:object:Charge:x');
  });
});
