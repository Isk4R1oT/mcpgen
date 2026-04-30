// vitest.setup.ts — jsdom polyfills for apps/web unit tests.
//
// Per CLAUDE.md "external API calls: retries with warnings, then raise" —
// `fetch` is intentionally left as a rejecting stub here. Tests that need
// `fetch` MUST mock it explicitly (vi.spyOn(globalThis, 'fetch') or MSW).
// This forces every test author to be deliberate about network surface.

// Polyfill `crypto.randomUUID` if the underlying jsdom is older than the
// 2023 spec (crypto.randomUUID landed in jsdom 22.0.0).
if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.randomUUID !== 'function') {
  // Use Node's webcrypto when available (Node 19+); otherwise fall back to a
  // deterministic v4-like stub for tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto: typeof import('node:crypto') = require('node:crypto');
  if (nodeCrypto.webcrypto !== undefined) {
    Object.defineProperty(globalThis, 'crypto', {
      value: nodeCrypto.webcrypto,
      writable: false,
      configurable: true,
    });
  }
}

// Force tests to mock fetch explicitly (no silent fallback to a real network).
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = (): Promise<Response> =>
    Promise.reject(new Error('fetch not stubbed in this test — add vi.spyOn(globalThis, "fetch")'));
}

// MCPTokens stub — tests that need it can override; default is undefined so
// any test that touches `applyTokens()` without an explicit stub will throw
// (the loader's explicit error message), keeping coverage honest.
(globalThis as { MCPTokens?: unknown }).MCPTokens = undefined;
