// apps/web/src/app/api/auth/embedded/sign-in/route.ts
//
// POST /api/auth/embedded/sign-in
//
// Embedded sign-in entry point — drives Logto's Experience API directly so
// the canon-styled /sign-in page can authenticate users without redirecting
// through the purple Logto Hosted UI. The classic Hosted-UI redirect lives
// in /api/auth/logto/sign-in and remains the SSO path.
//
// Required env vars (see apps/web/src/lib/logto/client.ts header):
//   LOGTO_ENDPOINT        — Logto Cloud tenant endpoint
//   LOGTO_M2M_APP_ID      — Machine-to-Machine app id (Logto Console)
//   LOGTO_M2M_APP_SECRET  — M2M secret
//
// Behavior:
//   - flag `ui_auth_password_perm` OFF → 404
//   - bad creds                       → 401 invalid_credentials
//   - success                         → 200 { ok: true } + LOGTO_SESSION cookie
//   - other errors                    → 500 with structured error shape

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { assertAuthMethodEnabled } from '@/lib/flags/auth-method';
import { signInWithPassword, LogtoExperienceError } from '@/lib/logto/experience';
import {
  attachCookies,
  errorResponse,
  fiveHundredFromError,
  isAuthMethodDisabled,
  readJsonOr400,
} from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Node runtime needed for Buffer + getSetCookie

// Hard limits to keep the validator predictable.
const SignInBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Flag gate — flip OFF returns 404 (route effectively doesn't exist).
  try {
    await assertAuthMethodEnabled('ui_auth_password_perm');
  } catch (err) {
    if (isAuthMethodDisabled(err)) {
      return errorResponse(404, 'not_found', 'route disabled');
    }
    return fiveHundredFromError(err, 'flag eval failed');
  }

  // 2. Body validation — malformed JSON / wrong shape → 400.
  let raw: unknown;
  try {
    raw = await readJsonOr400(req);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid_body';
    return errorResponse(400, reason, 'request body could not be parsed');
  }
  const parsed = SignInBody.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_body', firstZodMessage(parsed.error));
  }
  const { email, password } = parsed.data;

  // 3. Drive the Logto Experience API.
  try {
    const result = await signInWithPassword(email, password);
    const ok = NextResponse.json({ ok: true }, { status: 200 });
    return attachCookies(ok, result.cookies);
  } catch (err) {
    if (err instanceof LogtoExperienceError && err.status === 401) {
      return errorResponse(401, 'invalid_credentials', 'incorrect email or password');
    }
    return fiveHundredFromError(err, 'sign-in failed');
  }
}

function firstZodMessage(err: z.ZodError): string {
  const first = err.issues[0];
  return first === undefined ? 'invalid request' : `${first.path.join('.')}: ${first.message}`;
}
