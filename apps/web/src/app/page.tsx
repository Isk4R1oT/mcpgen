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

import type { ReactElement } from 'react';

import Landing from '@/components/screens/landing/landing';

export const dynamic = 'force-dynamic';

export default function LandingPage(): ReactElement {
  return <Landing />;
}
