// apps/web/src/app/api/auth/embedded/change-password/route.ts
//
// POST /api/auth/embedded/change-password
//
// Authenticated password change. The /settings security section posts here.
// Validates the current password via Logto's verifyUserPassword endpoint
// before patching the new one, so a stolen session cookie alone cannot
// rotate the password.
//
// Required env vars (see apps/web/src/lib/logto/client.ts header):
//   LOGTO_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET
//
// Behavior:
//   - no session                → 401 unauthorized
//   - current_password wrong    → 400 invalid_current_password
//   - new password too weak     → 400 invalid_password
//   - success                   → 200 { ok: true }

import { getLogtoContext } from '@logto/next/server-actions';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logtoConfig } from '@/lib/logto/client';
import {
  changeUserPassword,
  verifyUserPassword,
  LogtoExperienceError,
} from '@/lib/logto/experience';
import { validatePassword } from '@/lib/logto/password';
import { errorResponse, fiveHundredFromError, readJsonOr400 } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ChangePasswordBody = z.object({
  current_password: z.string().min(1).max(256),
  new_password: z.string().min(8).max(256),
});

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Require an authenticated Logto session.
  const ctx = await getLogtoContext(logtoConfig);
  if (!ctx.isAuthenticated || ctx.claims === undefined) {
    return errorResponse(401, 'unauthorized', 'sign in required');
  }
  const claims = ctx.claims as { sub?: unknown };
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    return errorResponse(401, 'unauthorized', 'sign in required');
  }
  const logtoUserId = claims.sub;

  // 2. Body validation.
  let raw: unknown;
  try {
    raw = await readJsonOr400(req);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid_body';
    return errorResponse(400, reason, 'request body could not be parsed');
  }
  const parsed = ChangePasswordBody.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_body', firstZodMessage(parsed.error));
  }
  const { current_password, new_password } = parsed.data;

  // 3. New password strength.
  const pwdCheck = validatePassword(new_password);
  if (!pwdCheck.ok) {
    const message =
      pwdCheck.reason === 'too_short'
        ? 'new password must be at least 8 characters'
        : 'new password must contain at least 2 of: uppercase letter, digit, symbol';
    return errorResponse(400, 'invalid_password', message);
  }

  // 4. Verify current password.
  try {
    const ok = await verifyUserPassword(logtoUserId, current_password);
    if (!ok) {
      return errorResponse(
        400,
        'invalid_current_password',
        'current password is incorrect',
      );
    }
  } catch (err) {
    return fiveHundredFromError(err, 'verify current password failed');
  }

  // 5. Patch the password.
  try {
    await changeUserPassword(logtoUserId, new_password);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof LogtoExperienceError && err.status === 400) {
      return errorResponse(400, err.code, err.message);
    }
    return fiveHundredFromError(err, 'password change failed');
  }
}

function firstZodMessage(err: z.ZodError): string {
  const first = err.issues[0];
  return first === undefined ? 'invalid request' : `${first.path.join('.')}: ${first.message}`;
}
