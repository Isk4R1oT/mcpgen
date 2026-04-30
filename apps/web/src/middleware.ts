// apps/web/src/middleware.ts
//
// Plan 07-02 — Logto auth guard on `/dashboard/:path*` ONLY (CONTEXT D-18).
// `/`, `/generate/*`, `/pricing`, `/sign-in`, `/sign-up` are PUBLIC: anonymous
// users can paste a URL and run free-tier generation against fixtures.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-18 (auth boundary)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-19 (httpOnly cookie)
//   - apps/web/src/lib/logto/client.ts (logtoConfig)

import { getLogtoContext } from '@logto/next/server-actions';
import { NextResponse, type NextRequest } from 'next/server';

import { logtoConfig } from '@/lib/logto/client';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { isAuthenticated } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    const url = req.nextUrl.clone();
    url.pathname = '/api/auth/logto/sign-in';
    url.searchParams.set('redirect_to', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*'] };
