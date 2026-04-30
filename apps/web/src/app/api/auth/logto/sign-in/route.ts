// apps/web/src/app/api/auth/logto/sign-in/route.ts
//
// Plan 07-02 — Logto sign-in entry point. signIn() redirects to the Logto
// endpoint; the OAuth callback comes back through `/api/auth/logto/callback`.
//
// Reference: .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Code Examples".

import { signIn } from '@logto/next/server-actions';

import { logtoConfig } from '@/lib/logto/client';

export async function GET(): Promise<Response> {
  await signIn(logtoConfig);
  // signIn always redirects; this is unreachable but keeps the handler
  // signature explicit for the Next.js Route Handler contract.
  return new Response(null, { status: 307 });
}
