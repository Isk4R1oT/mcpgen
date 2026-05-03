// apps/web/src/app/admin/billing/page.tsx
//
// Phase 3 / C3-billing — Admin Billing & Plans entry route.
//
// Two-layer gate (mirrors `/admin/page.tsx`):
//
//   1. `ui_admin_panel_perm` flag (default OFF). Internal users segment
//      is added by M-5 via Flipt rule API after bootstrap (per
//      `_manifest/flags.yaml` notes for this flag).
//   2. Logto admin role check on the claims (`roles` array contains
//      'admin' or 'staff'). Even if a non-admin somehow lands in the
//      internal_users segment, the role check still blocks render.
//
// When either gate fails the page returns 404 (`notFound()`) so the
// /admin/billing surface is invisible to end users.
//
// Per docs/mcpgen-frontend-rebuild-contract.md §13 Q9 the admin module
// is embedded under /admin/* in the main Next.js app. The body renders
// the `<Billing />` Client Component which calls the BFF billing hooks
// (currently the disabled stubs returning `flag_off_or_not_implemented`
// until Phase 3 backend lands).

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { Billing } from '@/components/screens/admin/billing/billing';
import { evaluateBooleanFlag } from '@/lib/flags';
import { evalAdminBillingFlags } from '@/lib/flags/admin-actions';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

interface ClaimsLike {
  sub?: unknown;
  email?: unknown;
  roles?: unknown;
}

function hasAdminRole(claims: ClaimsLike): boolean {
  const roles = claims.roles;
  if (!Array.isArray(roles)) return false;
  return roles.some((r) => r === 'admin' || r === 'staff');
}

export default async function AdminBillingPage(): Promise<ReactElement> {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    redirect('/admin/login');
  }

  const claimsObj = (claims ?? {}) as ClaimsLike;
  const userId = typeof claimsObj.sub === 'string' ? claimsObj.sub : 'anonymous';
  const emailDomain =
    typeof claimsObj.email === 'string' && claimsObj.email.includes('@')
      ? (claimsObj.email.split('@')[1] ?? '')
      : '';
  const flagContext: Record<string, string> = {
    user_id: userId,
    email_domain: emailDomain,
  };

  const enabled = await evaluateBooleanFlag(
    'ui_admin_panel_perm',
    userId,
    flagContext,
    false,
  );
  if (!enabled) notFound();
  if (!hasAdminRole(claimsObj)) notFound();

  const actionFlags = await evalAdminBillingFlags({ userId, flagContext });
  return <Billing actionFlags={actionFlags} />;
}
