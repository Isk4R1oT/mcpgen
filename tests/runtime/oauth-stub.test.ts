// tests/runtime/oauth-stub.test.ts
//
// Phase 6 Wave 3 (RUN-05 / D-10) — cross-app integration: resolveUpstreamCredential
// with mode='oauth' MUST throw OAuthDeferralError.
//
// Bun-only because @mcpgen/runtime/auth (the dispatcher barrel) imports stored.ts
// which uses bun:sqlite. Runs via pnpm test:bun.

import { describe, expect, it } from 'bun:test';

import {
  OAuthDeferralError,
  resolveUpstreamCredential,
} from '@mcpgen/runtime/auth';

describe('resolveUpstreamCredential — oauth mode', () => {
  it('throws OAuthDeferralError when mode is oauth', async () => {
    const req = new Request('https://example.test/x');
    const tenant = { id: 'alice', upstream: 'github' };
    const mode = {
      mode: 'oauth' as const,
      upstream: {
        authorization_endpoint: 'https://example.test/authorize',
        token_endpoint: 'https://example.test/token',
        scopes: ['read'] as ReadonlyArray<string>,
        pkce: true as const,
      },
    };
    await expect(resolveUpstreamCredential(req, tenant, mode)).rejects.toThrow(
      OAuthDeferralError,
    );
  });
});
