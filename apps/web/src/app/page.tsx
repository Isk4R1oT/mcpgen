// apps/web/src/app/page.tsx
//
// Plan 07-02 — Landing route (FE-01). Server Component shell that delegates
// to a Client Component shell which calls next/dynamic({ ssr: false }) on
// the LandingWrapper. Next.js 15 disallows ssr:false from a Server Component
// directly, so the indirection lives in _landing-client.tsx.
//
// Reference: .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-06 + RESEARCH
// "Anti-Patterns" — direct SSR import of locked JSX crashes on React.useState.

import type { ReactElement } from 'react';

import LandingClientShell from './_landing-client';

// Force dynamic rendering — RootLayout's LogtoSessionProvider calls
// getLogtoContext() at SSR; when LOGTO_COOKIE_SECRET is unset (build/CI),
// Logto's CookieStorage rejects the empty value. Skipping static prerender
// keeps build green; landing renders fine at request time.
export const dynamic = 'force-dynamic';

export default function LandingPage(): ReactElement {
  return <LandingClientShell />;
}
