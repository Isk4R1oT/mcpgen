// apps/web/src/app/sign-out/route.ts
//
// BUG-009 fix — `/sign-out` was a 404 even though Logto's actual sign-out
// flow lives at `/api/auth/logto/sign-out`. QA correctly tried the
// canonical short URL and got a dead end, with no UI button anywhere on
// `/dashboard` either.
//
// This route handler is a thin redirect to the existing Logto endpoint.
// Keeping it as a `GET` so users can hit `/sign-out` directly in the
// address bar OR from an external link without needing to know the
// `/api/auth/...` shape.
//
// `post_logout_redirect_uri` defaults to `/` (landing) but accepts a
// `?next=/some/path` query param for flows that want to bounce somewhere
// specific after sign-out (kept lightweight — tools like dashboard /
// account can opt-in by appending the query themselves).

import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest): Response {
  const url = new URL(req.url);
  const next = url.searchParams.get('next') ?? '/';
  // Logto's sign-out endpoint clears the encrypted session cookie and
  // bounces back to the supplied `post_logout_redirect_uri`.
  redirect(
    `/api/auth/logto/sign-out?post_logout_redirect_uri=${encodeURIComponent(next)}`,
  );
}
