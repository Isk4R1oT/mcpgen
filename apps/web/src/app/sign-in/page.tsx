// apps/web/src/app/sign-in/page.tsx
//
// Phase Frontend Rebuild — sign-in route. Server Component shell that
// evaluates the eight account-related flags server-side and hands them to
// the production AccountScreen Client Component.
//
// `ui_auth_password_perm` is the implicit always-on baseline (the canonical
// e-mail+password sign-in flow). The seven additional `_perm` flags gate the
// SSO providers, the magic-link CTA, the signup tab, and the "forgot?" link.

import { getLogtoContext } from '@logto/next/server-actions';
import type { ReactElement } from 'react';

import AccountScreen from '@/components/screens/account/account';
import { evalAccountFlags } from '@/lib/flags/account-actions';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

export default async function SignInPage(): Promise<ReactElement> {
  const { claims } = await getLogtoContext(logtoConfig);
  const userId = typeof claims?.sub === 'string' ? claims.sub : 'anonymous';
  const emailDomain =
    typeof claims?.email === 'string' && claims.email.includes('@')
      ? (claims.email.split('@')[1] ?? '')
      : '';
  const flagContext: Record<string, string> = {
    user_id: userId,
    email_domain: emailDomain,
  };

  const flags = await evalAccountFlags({ userId, flagContext });

  return <AccountScreen mode="signin" flags={flags} />;
}
