// apps/web/src/app/api/auth/embedded/_shared.ts
//
// Shared helpers for the embedded-auth route handlers. Keeps the per-route
// files focused on the flow + validation; common error-shape construction
// + cookie forwarding lives here.

import { NextResponse } from 'next/server';

import { AuthMethodDisabledError } from '@/lib/flags/auth-method';
import { LogtoConfigError, LogtoExperienceError } from '@/lib/logto/experience';

/**
 * Canonical error response shape for embedded-auth routes:
 *   { error: <machine-readable code>, error_message: <human-readable> }
 */
export interface EmbeddedAuthError {
  error: string;
  error_message: string;
}

export function errorResponse(
  status: number,
  error: string,
  message: string,
): NextResponse<EmbeddedAuthError> {
  return NextResponse.json<EmbeddedAuthError>(
    { error, error_message: message },
    { status },
  );
}

/**
 * Map a flag-disabled exception to the documented HTTP status:
 *   ui_auth_password_perm OFF      → 404 (sign-in/magic-link/forgot)
 *   ui_auth_signup_perm OFF        → 403 (signup_disabled)
 *   ui_auth_magic_link_perm OFF    → 404
 *   ui_auth_forgot_password_perm OFF → 404
 *
 * Each route picks the right status + payload at the call site; this
 * helper just centralizes the type narrowing.
 */
export function isAuthMethodDisabled(err: unknown): err is AuthMethodDisabledError {
  return err instanceof AuthMethodDisabledError;
}

/**
 * Map an unhandled error from the Experience-API client to a 500 response
 * payload. We DO NOT leak the raw Logto details to the client — those go
 * to the server logs only.
 */
export function fiveHundredFromError(
  err: unknown,
  defaultMessage: string,
): NextResponse<EmbeddedAuthError> {
  // eslint-disable-next-line no-console
  console.error('[embedded-auth] unhandled error', err);
  if (err instanceof LogtoConfigError) {
    return errorResponse(500, 'server_misconfigured', `missing config: ${err.variable}`);
  }
  if (err instanceof LogtoExperienceError) {
    return errorResponse(500, err.code, err.message);
  }
  return errorResponse(500, 'internal_error', defaultMessage);
}

/**
 * Forward each raw Set-Cookie header from Logto's response onto our
 * NextResponse. We use `response.headers.append('set-cookie', value)` so
 * multiple cookies stack (Next's NextResponse type accepts a single set-cookie
 * header otherwise; .append is the documented multi-cookie path).
 */
export function attachCookies<T>(res: NextResponse<T>, cookies: ReadonlyArray<string>): NextResponse<T> {
  for (const raw of cookies) {
    res.headers.append('set-cookie', raw);
  }
  return res;
}

/**
 * Read + parse JSON body with a hard ceiling on size (8 KiB). Embedded-auth
 * payloads should never be larger than a few hundred bytes; cap protects
 * against accidental large uploads.
 */
export async function readJsonOr400(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 8 * 1024) {
    throw new Error('payload_too_large');
  }
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('invalid_json');
  }
}
