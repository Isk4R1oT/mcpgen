// apps/web/src/app/api/auth/logto/callback/route.ts
//
// Plan 07-02 — Logto OAuth callback. handleSignIn validates the state param
// (CSRF mitigation per T-7-04), exchanges the code, and persists the session
// cookie. We then redirect to /dashboard (or to ?redirect_to=… if set by the
// middleware on its way to a protected route).
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Code Examples"
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-18 (auth boundary)

import LogtoClient from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { logtoConfig, LOGTO_REDIRECT_URI } from '@/lib/logto/client';

export async function GET(request: NextRequest): Promise<void> {
  // Reconstruct the callback URL from LOGTO_REDIRECT_URI (the canonical
  // origin the SDK stored in signInSession.redirectUri) + the inbound
  // query string. We CANNOT use request.url / request.nextUrl directly
  // because behind docker-compose Next.js binds to 0.0.0.0 and writes
  // `http://0.0.0.0:3000/...` into request.url even though the browser
  // hit `http://localhost:3000/...`. The SDK's prefix check
  // (`callbackUri.startsWith(redirectUri)`) then fails because
  // "0.0.0.0" != "localhost". Building the URL from LOGTO_REDIRECT_URI
  // pins the host to whatever the SDK's signInSession was created with.
  //
  // Calling the lower-level handleSignInCallback (instead of the
  // handleSignIn wrapper) also avoids the wrapper's hardcoded
  // `${baseUrl}/callback` path coercion.
  const callbackUrl = `${LOGTO_REDIRECT_URI}${request.nextUrl.search}`;
  const client = new LogtoClient(logtoConfig);
  await client.handleSignInCallback(callbackUrl);
  const redirectTo = request.nextUrl.searchParams.get('redirect_to');
  redirect(redirectTo !== null && redirectTo.startsWith('/') ? redirectTo : '/dashboard');
}
