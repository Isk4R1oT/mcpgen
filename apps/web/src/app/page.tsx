// apps/web/src/app/page.tsx
//
// Landing route. Server Component shell that renders the production Landing
// client component (see `@/components/screens/landing/landing.tsx`).
//
// `dynamic = 'force-dynamic'` is required because RootLayout's
// `LogtoSessionProvider` calls `getLogtoContext()` at SSR; when
// `LOGTO_COOKIE_SECRET` is unset (build/CI) Logto's CookieStorage rejects the
// empty value. Skipping static prerender keeps the build green; landing
// renders fine at request time.
//
// BUG-008 fix: evaluate ui_marketplace_perm + ui_docs_perm server-side and
// pass results down so the topbar nav links are hidden when the routes
// would 404. Without this, anonymous landing rendered "marketplace" /
// "docs" links pointing at flag-gated 404 routes.

import { getLogtoContext } from '@logto/next/server-actions';
import type { ReactElement } from 'react';

import Landing from '@/components/screens/landing/landing';
import { evaluateBooleanFlag } from '@/lib/flags';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

export default async function LandingPage(): Promise<ReactElement> {
  const { claims } = await getLogtoContext(logtoConfig);
  const userId = typeof claims?.sub === 'string' ? claims.sub : 'anonymous';
  const emailDomain =
    typeof claims?.email === 'string' && claims.email.includes('@')
      ? (claims.email.split('@')[1] ?? '')
      : '';
  const flagContext = { user_id: userId, email_domain: emailDomain };

  const [marketplaceEnabled, docsEnabled] = await Promise.all([
    evaluateBooleanFlag('ui_marketplace_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_docs_perm', userId, flagContext, false),
  ]);

  return <Landing marketplaceEnabled={marketplaceEnabled} docsEnabled={docsEnabled} />;
}
