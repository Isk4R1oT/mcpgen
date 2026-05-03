// apps/web/src/app/api/auth/embedded/magic-link/verify/route.ts
//
// GET /api/auth/embedded/magic-link/verify?token=...&email=...
//
// Lands when the user clicks the magic-link in their email. Verifies the
// token via Logto's Experience API (verifications/verification-code/verify)
// and on success sets the LOGTO_SESSION cookie + 302 redirects to /dashboard.
// On failure, redirects to /sign-in?error=expired_link.
//
// Required env vars (see apps/web/src/lib/logto/client.ts header):
//   LOGTO_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET
//   LOGTO_EMAIL_CONNECTOR_ID — required for the verify path to mean anything
//
// Behavior:
//   - flag `ui_auth_magic_link_perm` OFF      → 302 → /sign-in?error=expired_link
//   - missing/invalid token                   → 302 → /sign-in?error=expired_link
//   - success                                 → 302 → /dashboard + cookie

import { NextResponse } from 'next/server';

import { assertAuthMethodEnabled, AuthMethodDisabledError } from '@/lib/flags/auth-method';
import { verifyMagicLinkToken } from '@/lib/logto/experience';
import { logtoConfig } from '@/lib/logto/client';
import { attachCookies } from '../../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function expiredRedirect(): NextResponse {
  const base = logtoConfig.baseUrl.length > 0 ? logtoConfig.baseUrl : 'http://localhost:3000';
  return NextResponse.redirect(`${base.replace(/\/$/, '')}/sign-in?error=expired_link`, 302);
}

function dashboardRedirect(): NextResponse {
  const base = logtoConfig.baseUrl.length > 0 ? logtoConfig.baseUrl : 'http://localhost:3000';
  return NextResponse.redirect(`${base.replace(/\/$/, '')}/dashboard`, 302);
}

export async function GET(req: Request): Promise<NextResponse> {
  // 1. Flag gate — when OFF, treat the link as expired (don't expose the
  // route's existence).
  try {
    await assertAuthMethodEnabled('ui_auth_magic_link_perm');
  } catch (err) {
    if (err instanceof AuthMethodDisabledError) {
      return expiredRedirect();
    }
    // eslint-disable-next-line no-console
    console.error('[magic-link/verify] flag eval failed', err);
    return expiredRedirect();
  }

  // 2. Read query params.
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const email = url.searchParams.get('email');
  if (token === null || email === null || token.length === 0 || email.length === 0) {
    return expiredRedirect();
  }

  // 3. Verify via Experience API.
  try {
    const result = await verifyMagicLinkToken(email, token);
    if (!result.ok) return expiredRedirect();
    const ok = dashboardRedirect();
    return attachCookies(ok, result.cookies);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[magic-link/verify] verify failed', err);
    return expiredRedirect();
  }
}
