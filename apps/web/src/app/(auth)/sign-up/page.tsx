// apps/web/src/app/(auth)/sign-up/page.tsx
//
// Plan 07-02 — Sign-up route (FE-01). Server Component shell that delegates
// to a Client Component shell which renders AuthScreenWrapper with
// mode='sign-up' via next/dynamic({ ssr: false }).

import type { ReactElement } from 'react';

import AuthClientShell from '../../_auth-client';

// See sign-in/page.tsx for rationale — getLogtoContext at SSR fails with empty
// cookieSecret during build, so opt out of static prerender.
export const dynamic = 'force-dynamic';

export default function SignUpPage(): ReactElement {
  return <AuthClientShell mode="sign-up" />;
}
