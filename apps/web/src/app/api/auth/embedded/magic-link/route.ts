// apps/web/src/app/api/auth/embedded/magic-link/route.ts
//
// POST /api/auth/embedded/magic-link
//
// Sends a passwordless sign-in link via Logto's email connector. The
// canon-styled "email me a magic link instead" CTA on /sign-in posts here.
//
// Required env vars (see apps/web/src/lib/logto/client.ts header):
//   LOGTO_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET
//   LOGTO_EMAIL_CONNECTOR_ID — REQUIRED for this route to function. If unset,
//                              we return 501 magic_link_not_configured.
//
// Behavior:
//   - flag `ui_auth_magic_link_perm` OFF → 404
//   - email connector not configured     → 501 magic_link_not_configured
//   - success                            → 200 { ok: true } (we never
//                                          disclose whether the email exists)

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { assertAuthMethodEnabled } from '@/lib/flags/auth-method';
import {
  isMagicLinkConfigured,
  sendMagicLink,
  LogtoExperienceError,
} from '@/lib/logto/experience';
import {
  errorResponse,
  fiveHundredFromError,
  isAuthMethodDisabled,
  readJsonOr400,
} from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MagicLinkBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Flag gate.
  try {
    await assertAuthMethodEnabled('ui_auth_magic_link_perm');
  } catch (err) {
    if (isAuthMethodDisabled(err)) {
      return errorResponse(404, 'not_found', 'route disabled');
    }
    return fiveHundredFromError(err, 'flag eval failed');
  }

  // 2. Connector configured? — else 501 (so the canon UI can show
  // "magic-link unavailable, use password" gracefully).
  if (!isMagicLinkConfigured()) {
    return errorResponse(
      501,
      'magic_link_not_configured',
      'magic-link sign-in is not configured on this deployment',
    );
  }

  // 3. Body validation.
  let raw: unknown;
  try {
    raw = await readJsonOr400(req);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid_body';
    return errorResponse(400, reason, 'request body could not be parsed');
  }
  const parsed = MagicLinkBody.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_body', firstZodMessage(parsed.error));
  }
  const { email } = parsed.data;

  // 4. Send. We swallow user_not_exist and similar — never disclose
  // whether the email is registered. Only surface 501 (connector
  // misconfigured) and structured 5xx errors.
  try {
    await sendMagicLink(email);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof LogtoExperienceError && err.status === 501) {
      return errorResponse(
        501,
        'magic_link_not_configured',
        'magic-link sign-in is not configured on this deployment',
      );
    }
    return fiveHundredFromError(err, 'magic-link send failed');
  }
}

function firstZodMessage(err: z.ZodError): string {
  const first = err.issues[0];
  return first === undefined ? 'invalid request' : `${first.path.join('.')}: ${first.message}`;
}
