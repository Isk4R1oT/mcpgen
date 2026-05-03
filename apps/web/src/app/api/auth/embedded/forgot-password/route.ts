// apps/web/src/app/api/auth/embedded/forgot-password/route.ts
//
// POST /api/auth/embedded/forgot-password
//
// Initiates a password-reset flow. The canon "forgot?" link on /sign-in
// posts here. We always return 200 ok:true so the response cannot be used
// to enumerate registered email addresses.
//
// Required env vars (see apps/web/src/lib/logto/client.ts header):
//   LOGTO_ENDPOINT
//   LOGTO_EMAIL_CONNECTOR_ID — required to actually send the email; if
//                              missing we still return 200 (don't leak)
//                              but log a server-side warning so the
//                              misconfiguration is discoverable.
//
// Behavior:
//   - flag `ui_auth_forgot_password_perm` OFF → 404
//   - success / unknown email                 → 200 { ok: true } (idempotent)
//   - infrastructure error (Logto down)       → 500 with structured error

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { assertAuthMethodEnabled } from '@/lib/flags/auth-method';
import { startForgotPassword, LogtoExperienceError } from '@/lib/logto/experience';
import {
  errorResponse,
  fiveHundredFromError,
  isAuthMethodDisabled,
  readJsonOr400,
} from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ForgotBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Flag gate.
  try {
    await assertAuthMethodEnabled('ui_auth_forgot_password_perm');
  } catch (err) {
    if (isAuthMethodDisabled(err)) {
      return errorResponse(404, 'not_found', 'route disabled');
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
  const parsed = ForgotBody.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_body', firstZodMessage(parsed.error));
  }
  const { email } = parsed.data;

  // 3. Drive the Logto reset flow. Idempotent — every non-infra error
  // surfaces as 200 ok:true to prevent enumeration.
  try {
    await startForgotPassword(email);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof LogtoExperienceError && err.status === 501) {
      // Connector misconfigured — log loudly server-side, return ok:true
      // to the client so the surface stays opaque.
      // eslint-disable-next-line no-console
      console.error(
        '[forgot-password] LOGTO_EMAIL_CONNECTOR_ID is not set — reset email cannot be sent',
        err,
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    return fiveHundredFromError(err, 'forgot-password failed');
  }
}

function firstZodMessage(err: z.ZodError): string {
  const first = err.issues[0];
  return first === undefined ? 'invalid request' : `${first.path.join('.')}: ${first.message}`;
}
