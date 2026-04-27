// Interface compile-test + factory surface check.
// FND-06: tenant Workers import these signatures (Phase 4 codegen + Phase 5
// hand-coded sample). Phase 6 implements the bodies.
//
// Wave-2 update (per BLOCKER-4): the Phase-1 `it(...)` blocks asserting every
// stub method throws `/Phase 1/` are deleted because Wave 2 rebound
// createStubRuntime to createRuntime (real bodies). The compile-time imports
// test (Test 1) and the AuthMode discriminated-union test (Test 4) are
// preserved verbatim. Per-method "is no longer a stub" assertions live in
// not-stubbed.test.ts.

import { describe, expect, it } from 'vitest';

import {
  createRuntime,
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
// Test 2 — Phase-6 surface: createRuntime is a callable factory that returns
// a real Runtime (replaces the Phase-1 throw-assertion suite).
// ─────────────────────────────────────────────────────────────────────────────
describe('createRuntime (Test 2 — Phase 6)', () => {
  it('createRuntime is callable and returns a Runtime', () => {
    expect(typeof createRuntime).toBe('function');
    const r = createRuntime();
    expect(typeof r.parseSmartId).toBe('function');
    expect(typeof r.makeSmartId).toBe('function');
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
