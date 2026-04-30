// apps/web/src/app/(auth)/sign-in/page.tsx
//
// Plan 07-02 — Sign-in route (FE-01). Server Component shell that delegates
// to a Client Component shell which renders AuthScreenWrapper with
// mode='sign-in' via next/dynamic({ ssr: false }).

import type { ReactElement } from 'react';

import AuthClientShell from '../../_auth-client';

// Force dynamic rendering — this page renders inside RootLayout, which calls
// getLogtoContext() (Server Component). At build time without LOGTO_*
// env vars, Logto's CookieStorage rejects empty cookieSecret. Skipping
// static prerender keeps build green; the page renders fine at request time.
export const dynamic = 'force-dynamic';

export default function SignInPage(): ReactElement {
  return <AuthClientShell mode="sign-in" />;
}
