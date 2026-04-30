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

import { handleSignIn } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { logtoConfig } from '@/lib/logto/client';

export async function GET(request: NextRequest): Promise<void> {
  await handleSignIn(logtoConfig, request.nextUrl.searchParams);
  const redirectTo = request.nextUrl.searchParams.get('redirect_to');
  redirect(redirectTo !== null && redirectTo.startsWith('/') ? redirectTo : '/dashboard');
}
