// apps/web/src/app/api/auth/logto/sign-up/route.ts
//
// Plan 07-02 — Logto sign-up entry point. Behaves like sign-in but passes the
// `first_screen: 'register'` interaction-mode hint when the SDK supports it.
// The Logto sign-in screen also has a "Create account" link, so this route
// degrades gracefully on SDK versions that ignore the hint.

import { signIn } from '@logto/next/server-actions';

import { logtoConfig } from '@/lib/logto/client';

export async function GET(): Promise<Response> {
  // @logto/next 4.x signIn signature: (config, options?). The `firstScreen`
  // option (when present) renders the register screen first. We pass it via
  // a typed cast since older SDK builds may not declare it.
  await (signIn as (cfg: typeof logtoConfig, opts?: { firstScreen?: string }) => Promise<void>)(
    logtoConfig,
    { firstScreen: 'register' },
  );
  return new Response(null, { status: 307 });
}
