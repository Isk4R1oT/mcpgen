// apps/web/src/app/api/auth/logto/sign-out/route.ts
//
// Plan 07-02 — Logto sign-out. Clears the httpOnly session cookie via the SDK
// and returns the user to the landing page.

import { signOut } from '@logto/next/server-actions';

import { logtoConfig } from '@/lib/logto/client';

export async function GET(): Promise<Response> {
  await signOut(logtoConfig);
  return new Response(null, { status: 307 });
}
