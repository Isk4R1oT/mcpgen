// apps/web/src/app/sign-up/page.tsx
//
// Phase Frontend Rebuild — sign-up route. Server Component shell that
// evaluates account flags server-side. When `ui_auth_signup_perm` is OFF the
// signup mode is dark — we render a canon-styled `mc-stamp` "coming soon"
// empty state instead of leaking through to AccountScreen with the signup
// flag missing.

import { getLogtoContext } from '@logto/next/server-actions';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import AccountScreen from '@/components/screens/account/account';
import { TopBar } from '@/components/ui';
import { evalAccountFlags } from '@/lib/flags/account-actions';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

async function SignupComingSoon(): Promise<ReactElement> {
  const t = await getTranslations('account');
  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar crumb={t('crumb')} />
      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '80px 28px 64px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div className="mc-stamp" style={{ padding: 32 }}>
          <div className="mc-caption-up" style={{ marginBottom: 10 }}>
            {t('eyebrow')}
          </div>
          <div className="mc-display-l" style={{ marginBottom: 14 }}>
            {t('signupComingSoonTitle')}
          </div>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: 'var(--text-muted)',
              maxWidth: 480,
              margin: '0 auto',
            }}
          >
            {t('signupComingSoonBody')}
          </p>
        </div>
      </main>
    </div>
  );
}

export default async function SignUpPage(): Promise<ReactElement> {
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
  if (!flags.ui_auth_signup_perm) {
    return SignupComingSoon();
  }

  return <AccountScreen mode="signup" flags={flags} />;
}
