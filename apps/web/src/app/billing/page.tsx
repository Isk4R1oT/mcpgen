// apps/web/src/app/billing/page.tsx
//
// Phase M-4 (Wave-2 Agent 5) — Billing route, gated behind
// `ui_billing_active_perm` (default OFF). When the flag is OFF the route is
// 404'd via `notFound()` so end users do not see partial billing UI while
// Stripe wiring is incomplete (GET /api/v1/billing/plan is TBD per
// .planning/ui-rebuild-sandbox/INTEGRATION-MAP.md §2.10). When the flag is
// ON the screen mounts the locked Billing JSX via BillingClientShell;
// Phase 8 ops workstream wires real Stripe state through the optional
// `plans` / `invoices` / `usage` props once the BFF endpoints land.
//
// References:
//   - docs/mcpgen-frontend-rebuild-contract.md §5 (flag taxonomy), §5.3
//     Level 1 route gate, §13 Q3 (Stripe-via-props decision)
//   - docs/mcpgen-feature-flags-contract.md (perm category)

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import BillingClientShell from './_billing-client';
import { evaluateBooleanFlag } from '@/lib/flags';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

interface UserClaimsLite {
  sub: string;
  email?: string;
  name?: string;
}

export default async function BillingPage(): Promise<ReactElement> {
  // Belt-and-suspenders auth check — middleware.ts already gates /billing/*
  // (see apps/web/src/lib/route-gate.ts). Same pattern as /dashboard.
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    redirect('/api/auth/logto/sign-in?redirect_to=/billing');
  }

  const userId = typeof claims?.sub === 'string' ? claims.sub : 'anonymous';
  const emailDomain =
    typeof claims?.email === 'string' && claims.email.includes('@')
      ? (claims.email.split('@')[1] ?? '')
      : '';
  const flagContext: Record<string, string> = { user_id: userId, email_domain: emailDomain };

  const enabled = await evaluateBooleanFlag(
    'ui_billing_active_perm',
    userId,
    flagContext,
    false,
  );
  if (!enabled) {
    notFound();
  }

  let userClaims: UserClaimsLite | undefined;
  if (claims !== undefined && claims !== null) {
    const base: UserClaimsLite = { sub: String(claims.sub ?? '') };
    if (typeof claims.email === 'string') base.email = claims.email;
    if (typeof claims.name === 'string') base.name = claims.name;
    userClaims = base;
  }

  // TODO(Phase 8 ops): fetch real Stripe state via BFF
  // (`GET /api/v1/billing/plan`, `GET /api/v1/usage/hourly`,
  //  `GET /api/v1/invoices`) and forward as `plans` / `invoices` / `usage`
  // props. Until those endpoints exist, the flag stays OFF and end users
  // never reach this branch.
  return userClaims === undefined ? (
    <BillingClientShell />
  ) : (
    <BillingClientShell userClaims={userClaims} />
  );
}
