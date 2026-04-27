// packages/runtime-sdk/src/auth/oauth-stub.ts
//
// Phase 6 (per RUN-05 / D-10) — STUB. The Phase-6 stub returns a structured
// 501 payload `{ error: "oauth_mode_phase_10_deferral", deferred_to_phase: 10 }`
// so frontend FE-04 can detect and show the right UI. Throwing generic 500
// hides the deferral.
//
// Phase 10 wires the real @cloudflare/workers-oauth-provider integration.

export class OAuthDeferralError extends Error {
  readonly code = 'oauth_mode_phase_10_deferral';
  readonly deferred_to_phase = 10;
  constructor() {
    super(
      'OAuth on-behalf flow ships in Phase 10 with @cloudflare/workers-oauth-provider. Use auth_mode = "passthrough" or "stored" until then.',
    );
    this.name = 'OAuthDeferralError';
  }
}

export function oauthStub(): never {
  throw new OAuthDeferralError();
}

// Hono error-handler helper for tenant Workers and dispatch-sample.
// Use as: app.onError((err, c) => oauthStubErrorResponse(err) ?? defaultHandler(err, c));
export function oauthStubErrorResponse(err: unknown): Response | null {
  if (err instanceof OAuthDeferralError) {
    return new Response(
      JSON.stringify({
        error: err.code,
        message: err.message,
        deferred_to_phase: err.deferred_to_phase,
      }),
      { status: 501, headers: { 'content-type': 'application/json' } },
    );
  }
  return null;
}
