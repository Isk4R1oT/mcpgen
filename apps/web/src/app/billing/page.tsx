// apps/web/src/app/billing/page.tsx
//
// Phase 2 — Agent B3 — Billing route.
//
// Server-Component shell that:
//   1. Resolves the Logto session (middleware also gates `/billing/*`, this
//      is belt-and-suspenders — same pattern as `/dashboard`).
//   2. Evaluates the `ui_billing_active_perm` flag. OFF → notFound() (404).
//   3. Hands off to the Phase-2 production billing screen, passing the
//      authenticated user's email for the TopBar address line.
//
// References:
//   - apps/web/src/components/screens/billing/billing.tsx (the screen)
//   - docs/mcpgen-feature-flags-contract.md (perm category, default OFF)
//   - apps/web/src/lib/route-gate.ts / middleware.ts (route-segment gate)

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import Billing from '@/components/screens/billing/billing';
import { evaluateBooleanFlag } from '@/lib/flags';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

export default async function BillingPage(): Promise<ReactElement> {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    redirect('/api/auth/logto/sign-in?redirect_to=/billing');
  }

  const userId = typeof claims?.sub === 'string' ? claims.sub : 'anonymous';
  const emailDomain =
    typeof claims?.email === 'string' && claims.email.includes('@')
      ? (claims.email.split('@')[1] ?? '')
      : '';
  const flagContext: Record<string, string> = {
    user_id: userId,
    email_domain: emailDomain,
  };

  const enabled = await evaluateBooleanFlag(
    'ui_billing_active_perm',
    userId,
    flagContext,
    false,
  );
  if (!enabled) {
    notFound();
  }

  const userEmail = typeof claims?.email === 'string' ? claims.email : undefined;

  return userEmail === undefined ? <Billing /> : <Billing userEmail={userEmail} />;
}
