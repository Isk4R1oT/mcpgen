// apps/web/tests/middleware-route-gate.test.ts
//
// Plan 09.1-07 — middleware route-gate behavior matrix per CONTEXT D-10.
//
// We exercise the pure `isProtectedPath` predicate (the matcher predicate
// shared with the runtime config). It is the single source of truth for
// which paths require Logto auth; the middleware function itself just
// composes this predicate with `getLogtoContext` + a redirect.
//
// References:
//   - apps/web/src/middleware.ts (PROTECTED_PATTERNS + isProtectedPath)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-10

import { describe, expect, it } from 'vitest';

// Test imports the pure predicate from src/lib/route-gate.ts (NOT
// src/middleware.ts) to avoid pulling @logto/next/server-actions into the
// vitest ESM resolution graph. middleware.ts re-exports the same symbols, so
// the production code path is identical — see src/middleware.ts top imports.
import { isProtectedPath, PROTECTED_PATTERNS } from '../src/lib/route-gate';

describe('middleware-route-gate (Plan 09.1-07)', () => {
  it('test 1: GET /generate/x is anon-allowed (no redirect)', () => {
    expect(isProtectedPath('/generate/x')).toBe(false);
  });

  it('test 2: GET /generate/x/playground is anon-allowed (BUG-003 fix)', () => {
    // Per docs/mcpgen-ux-flow.md §3 Screen 4 the playground is the
    // trust-building moment for anonymous users — the prior gate
    // contradicted that. Anon users now drive the agent loop with no
    // persistence; save-as-test still requires sign-in.
    expect(isProtectedPath('/generate/x/playground')).toBe(false);
  });

  it('test 3: GET /generate/x/deploy is anon-allowed (ephemeral path)', () => {
    expect(isProtectedPath('/generate/x/deploy')).toBe(false);
  });

  it('test 4: GET /generate/x/deploy/permanent is gated', () => {
    expect(isProtectedPath('/generate/x/deploy/permanent')).toBe(true);
  });

  it('test 5: GET /dashboard is gated', () => {
    expect(isProtectedPath('/dashboard')).toBe(true);
    expect(isProtectedPath('/dashboard/usage')).toBe(true);
  });

  it('test 6: GET /generate/x/playground stays out of the auth gate (BUG-003 fix)', () => {
    // The auth-aware part of the middleware no longer fires on this path —
    // anon users render the playground with engine-only mode. Save-as-test
    // and other persistence endpoints still 401 without a Logto session.
    expect(isProtectedPath('/generate/x/playground')).toBe(false);
  });

  it('test 7: anon-allowed routes from CONTEXT D-10 are not protected', () => {
    expect(isProtectedPath('/')).toBe(false);
    expect(isProtectedPath('/generate')).toBe(false);
    expect(isProtectedPath('/generate/abc-123')).toBe(false);
    expect(isProtectedPath('/generate/abc-123/preview')).toBe(false);
    expect(isProtectedPath('/generate/abc-123/quality')).toBe(false);
  });

  it('test 8: download is gated', () => {
    expect(isProtectedPath('/generate/x/download')).toBe(true);
    expect(isProtectedPath('/generate/abc/download/zip')).toBe(true);
  });

  it('test 9: PROTECTED_PATTERNS list is non-empty and does NOT match /playground (BUG-003 fix)', () => {
    expect(PROTECTED_PATTERNS.length).toBeGreaterThan(0);
    const playgroundRe = PROTECTED_PATTERNS.find((re) =>
      re.test('/generate/job-1/playground'),
    );
    expect(playgroundRe).toBeUndefined();
  });
});
