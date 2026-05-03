// apps/web/src/app/api/auth/logto/sign-up/route.ts
//
// Plan 07-02 — Logto sign-up entry point. Behaves like sign-in but passes the
// `first_screen: 'register'` interaction-mode hint when the SDK supports it.
// The Logto sign-in screen also has a "Create account" link, so this route
// degrades gracefully on SDK versions that ignore the hint.

import { signIn } from '@logto/next/server-actions';

import { LOGTO_REDIRECT_URI, logtoConfig } from '@/lib/logto/client';

export async function GET(): Promise<Response> {
  // @logto/next 4.x signIn signature: (config, options?). When `options` is
  // an object the SDK uses it directly — so we MUST include `redirectUri`,
  // otherwise the SDK falls back to its default `${baseUrl}/callback` which
  // our Logto Cloud allowlist does NOT contain (see AUTH-DIAGNOSIS.md).
  // The `firstScreen` hint asks Logto to render the register screen first.
  await (
    signIn as (
      cfg: typeof logtoConfig,
      opts?: { redirectUri?: string; firstScreen?: string },
    ) => Promise<void>
  )(logtoConfig, { redirectUri: LOGTO_REDIRECT_URI, firstScreen: 'register' });
  return new Response(null, { status: 307 });
}
