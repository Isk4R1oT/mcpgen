// apps/web/src/app/sign-in/magic/page.tsx
//
// Phase Frontend Rebuild — magic-link sign-in route. Server Component shell.
// When `ui_auth_magic_link_perm` is OFF we 404 (mirror the admin flag-OFF
// pattern in `/admin/page.tsx`).

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import AccountScreen from '@/components/screens/account/account';
import { evalAccountFlags } from '@/lib/flags/account-actions';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

export default async function MagicLinkPage(): Promise<ReactElement> {
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
  if (!flags.ui_auth_magic_link_perm) {
    notFound();
  }

  return <AccountScreen mode="magic" flags={flags} />;
}
