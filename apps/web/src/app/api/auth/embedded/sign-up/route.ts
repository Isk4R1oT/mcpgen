// apps/web/src/app/api/auth/embedded/sign-up/route.ts
//
// POST /api/auth/embedded/sign-up
//
// Embedded sign-up — creates a new Logto user via the Management API and
// then drives the Experience API to sign that user in (so the response
// already carries the LOGTO_SESSION cookie and the canon /sign-up page can
// redirect straight to /dashboard).
//
// Required env vars (see apps/web/src/lib/logto/client.ts header):
//   LOGTO_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET
//
// Behavior:
//   - flag `ui_auth_signup_perm` OFF       → 403 signup_disabled
//   - password fails canon score >=2 rule  → 400 invalid_password
//   - email already exists                 → 409 email_taken
//   - success                              → 201 { ok: true } + LOGTO_SESSION cookie

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { assertAuthMethodEnabled } from '@/lib/flags/auth-method';
import { createUser, signInWithPassword, LogtoExperienceError } from '@/lib/logto/experience';
import { validatePassword } from '@/lib/logto/password';
import {
  attachCookies,
  errorResponse,
  fiveHundredFromError,
  isAuthMethodDisabled,
  readJsonOr400,
} from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SignUpBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(256),
  company: z.string().trim().max(120).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Flag gate — sign-up disabled (invite-only mode) returns 403.
  try {
    await assertAuthMethodEnabled('ui_auth_signup_perm');
  } catch (err) {
    if (isAuthMethodDisabled(err)) {
      return errorResponse(403, 'signup_disabled', 'public sign-up is disabled');
    }
    return fiveHundredFromError(err, 'flag eval failed');
  }

  // 2. Body validation.
  let raw: unknown;
  try {
    raw = await readJsonOr400(req);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid_body';
    return errorResponse(400, reason, 'request body could not be parsed');
  }
  const parsed = SignUpBody.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_body', firstZodMessage(parsed.error));
  }
  const { name, email, password, company } = parsed.data;

  // 3. Password strength (canon score >= 2 rule).
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.ok) {
    const message =
      pwdCheck.reason === 'too_short'
        ? 'password must be at least 8 characters'
        : 'password must contain at least 2 of: uppercase letter, digit, symbol';
    return errorResponse(400, 'invalid_password', message);
  }

  // 4. Create the Logto user.
  try {
    await createUser({
      email,
      password,
      name,
      company: company !== undefined && company.length > 0 ? company : null,
    });
  } catch (err) {
    if (err instanceof LogtoExperienceError && err.status === 409) {
      return errorResponse(409, 'email_taken', 'an account with that email already exists');
    }
    return fiveHundredFromError(err, 'sign-up failed');
  }

  // 5. Sign the new user in so the response already carries the session.
  try {
    const result = await signInWithPassword(email, password);
    // Forward the OIDC redirectTo URL so the client can hard-nav to it
    // and the @logto/next callback handler can mint LOGTO_SESSION. Without
    // this hop the browser only has experience-flow cookies — middleware
    // sees no session and bounces /playground back to /sign-in.
    const ok = NextResponse.json(
      { ok: true, redirect_to: result.redirectTo },
      { status: 201 },
    );
    return attachCookies(ok, result.cookies);
  } catch (err) {
    // User was created but auto-sign-in failed — surface a 200 response
    // with a hint so the client knows to redirect to /sign-in. We still
    // log the underlying error for observability.
    // eslint-disable-next-line no-console
    console.warn('[sign-up] user created but auto-sign-in failed:', err);
    return NextResponse.json(
      {
        ok: true,
        pending_login: true,
        error_message: 'account created — please sign in',
      },
      { status: 201 },
    );
  }
}

function firstZodMessage(err: z.ZodError): string {
  const first = err.issues[0];
  return first === undefined ? 'invalid request' : `${first.path.join('.')}: ${first.message}`;
}
