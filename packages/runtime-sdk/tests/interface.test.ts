// Interface compile-test + stub-runtime behavior.
// FND-06: tenant Workers import these signatures (Phase 4 codegen + Phase 5
// hand-coded sample). Phase 6 implements the bodies.

import { describe, expect, it } from 'vitest';

import {
  createStubRuntime,
  type AuthMode,
  type OAuthAuth,
  type OAuthUpstreamConfig,
  type PassthroughAuth,
  type Runtime,
  type RuntimeContext,
  type SmartId,
  type StoredAuth,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Compile-time: every public type imports cleanly.
// If this file compiles (the test runner is the proof), the interface contract
// is intact. Runtime sanity below.
// ─────────────────────────────────────────────────────────────────────────────
describe('Interface compiles (Test 1)', () => {
  it('imports every exported interface without error', () => {
    // Compile-time assertion (TypeScript's `satisfies`-equivalent for type
    // identity): construct a values-shaped object that uses every imported
    // type at least once. If any import is wrong, this fails to compile.
    const sample: {
      runtime: Runtime;
      ctx: Pick<RuntimeContext, 'deploymentId' | 'upstreamCredential'>;
      smartId: SmartId;
      modes: ReadonlyArray<AuthMode>;
      pt: PassthroughAuth;
      st: StoredAuth;
      oa: OAuthAuth;
      cfg: OAuthUpstreamConfig;
    } = {
      runtime: createStubRuntime(),
      ctx: { deploymentId: 'd', upstreamCredential: 'u' },
      smartId: { server: 's', type: 'object', collection: 'C', identifier: 'i' },
      modes: [{ mode: 'passthrough' }, { mode: 'stored' }],
      pt: { mode: 'passthrough' },
      st: { mode: 'stored' },
      oa: {
        mode: 'oauth',
        upstream: {
          authorization_endpoint: 'https://example.com/a',
          token_endpoint: 'https://example.com/t',
          scopes: [],
          pkce: true,
        },
      },
      cfg: {
        authorization_endpoint: 'https://example.com/a',
        token_endpoint: 'https://example.com/t',
        scopes: [],
        pkce: true,
      },
    };
    expect(typeof sample.runtime.parseSmartId).toBe('function');
    expect(sample.modes.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — Every stub method throws the documented Phase-1 error.
// ─────────────────────────────────────────────────────────────────────────────
describe('createStubRuntime() (Test 2)', () => {
  const r = createStubRuntime();

  // 11 methods listed by the Runtime interface; each must throw with the
  // documented "Phase 1" error string.
  it('parseSmartId() throws Phase-1 error', () => {
    expect(() => r.parseSmartId('any:object:Charge:ch_x')).toThrow(/Phase 1/);
  });

  it('makeSmartId() throws', () => {
    expect(() =>
      r.makeSmartId({ server: 's', type: 'object', collection: 'C', identifier: 'i' }),
    ).toThrow(/Phase 1/);
  });

  it('routeSearch() throws', async () => {
    await expect(async () => r.routeSearch('q', {})).rejects.toThrow(/Phase 1/);
  });

  it('routeFetch() throws', async () => {
    await expect(async () => r.routeFetch('id', {})).rejects.toThrow(/Phase 1/);
  });

  it('routeListCollections() throws', async () => {
    await expect(async () => r.routeListCollections({})).rejects.toThrow(/Phase 1/);
  });

  it('routeListObjects() throws', async () => {
    await expect(async () => r.routeListObjects({ collection: 'X' })).rejects.toThrow(/Phase 1/);
  });

  it('routeUpsert() throws', async () => {
    await expect(async () => r.routeUpsert({ collection: 'X', data: {} })).rejects.toThrow(
      /Phase 1/,
    );
  });

  it('routeDelete() throws', async () => {
    await expect(async () => r.routeDelete({ type: 'object', confirm: false })).rejects.toThrow(
      /Phase 1/,
    );
  });

  it('shapeResponse() throws', () => {
    expect(() =>
      r.shapeResponse(
        {},
        {
          pagination: null,
          field_filtering: null,
          truncation: { threshold_tokens: 100, guidance_template: '' },
          has_response_format_param: false,
        },
      ),
    ).toThrow(/Phase 1/);
  });

  it('applyFieldFilter() throws', () => {
    expect(() =>
      r.applyFieldFilter({}, { always_include: [], opt_in: [], always_exclude: [] }),
    ).toThrow(/Phase 1/);
  });

  it('handleUpstreamError() throws', () => {
    expect(() =>
      r.handleUpstreamError(new Error('boom'), { tool_name: 'x', upstream_status: 500 }),
    ).toThrow(/Phase 1/);
  });

  it('error message points to RUN-01..05 in Phase 6', () => {
    try {
      r.parseSmartId('z');
    } catch (e) {
      expect(String(e)).toMatch(/Phase 6.*RUN-01/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — SmartId types are restrictive (object|collection|schema only).
// ─────────────────────────────────────────────────────────────────────────────
describe('SmartId discriminator (Test 3)', () => {
  it('accepts the 3 documented types', () => {
    const objId: SmartId = { server: 's', type: 'object', collection: 'C', identifier: 'i' };
    const colId: SmartId = { server: 's', type: 'collection', collection: 'C', identifier: 'i' };
    const schId: SmartId = { server: 's', type: 'schema', collection: 'C', identifier: 'i' };
    expect(objId.type).toBe('object');
    expect(colId.type).toBe('collection');
    expect(schId.type).toBe('schema');
  });

  it('rejects unknown types at the type level', () => {
    // @ts-expect-error type 'invalid' is not assignable to 'object'|'collection'|'schema'
    const bad: SmartId = { server: 's', type: 'invalid', collection: 'C', identifier: 'i' };
    // Pull `bad` into runtime so TS does not strip it (the directive above is
    // the actual assertion — TS errors on the next line because 'invalid' is
    // outside the SmartId.type union).
    expect(typeof bad).toBe('object');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — AuthMode discriminated union narrows correctly on `mode`.
// ─────────────────────────────────────────────────────────────────────────────
describe('AuthMode discriminated union (Test 4)', () => {
  function authIs(a: AuthMode): string {
    switch (a.mode) {
      case 'oauth':
        // narrowing here: TS knows `a` is OAuthAuth -> has `upstream`
        return a.upstream.authorization_endpoint;
      case 'passthrough':
        return 'pt';
      case 'stored':
        return 'st';
    }
  }

  it('narrows to passthrough', () => {
    const a: AuthMode = { mode: 'passthrough' };
    expect(authIs(a)).toBe('pt');
  });

  it('narrows to stored', () => {
    const a: AuthMode = { mode: 'stored' };
    expect(authIs(a)).toBe('st');
  });

  it('narrows to oauth and exposes upstream', () => {
    const upstream: OAuthUpstreamConfig = {
      authorization_endpoint: 'https://example.com/oauth/authorize',
      token_endpoint: 'https://example.com/oauth/token',
      scopes: ['read', 'write'],
      pkce: true,
    };
    const a: AuthMode = { mode: 'oauth', upstream };
    expect(authIs(a)).toBe('https://example.com/oauth/authorize');
  });

  it('rejects an unknown mode at the type level', () => {
    // @ts-expect-error 'invalid' is not assignable to AuthMode discriminator
    const bad: AuthMode = { mode: 'invalid' };
    expect(typeof bad).toBe('object');
  });
});
