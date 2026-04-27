// packages/runtime-sdk/tests/oauth-stub.test.ts
//
// Phase 6 Wave 3 (RUN-05 / D-10) — OAuth stub returns structured deferral.

import { describe, expect, it } from 'vitest';

import {
  OAuthDeferralError,
  oauthStub,
  oauthStubErrorResponse,
} from '../src/auth/oauth-stub.js';

describe('oauthStub', () => {
  it('throws OAuthDeferralError with code + deferred_to_phase=10', () => {
    try {
      oauthStub();
      expect.fail('expected oauthStub to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(OAuthDeferralError);
      const e = err as OAuthDeferralError;
      expect(e.code).toBe('oauth_mode_phase_10_deferral');
      expect(e.deferred_to_phase).toBe(10);
    }
  });
});

describe('oauthStubErrorResponse', () => {
  it('returns a 501 Response for OAuthDeferralError', async () => {
    const err = new OAuthDeferralError();
    const res = oauthStubErrorResponse(err);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(501);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body.error).toBe('oauth_mode_phase_10_deferral');
    expect(body.deferred_to_phase).toBe(10);
    expect(typeof body.message).toBe('string');
  });

  it('returns null for non-OAuth errors', () => {
    expect(oauthStubErrorResponse(new Error('other'))).toBeNull();
    expect(oauthStubErrorResponse('string err')).toBeNull();
  });
});
