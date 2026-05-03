// apps/web/src/app/admin/audit/page.tsx
//
// Phase 3 / C4-audit — `/admin/audit` route.
//
// Server Component shell mirroring the gating contract enforced by every
// other admin route (`apps/web/src/app/admin/page.tsx`):
//   1. `ui_admin_panel_perm` flag (default OFF). When OFF the route 404s,
//      hiding the entire admin surface from end users.
//   2. Logto admin role check on the claims. Even if the flag flips ON
//      for a non-admin user the role check still 404s.
//
// Per Phase 3 brief (Common rules) the screen body is a Client Component
// that consumes admin-ui primitives. This page only routes + gates.

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import Audit from '@/components/screens/admin/audit/audit';
import { evaluateBooleanFlag } from '@/lib/flags';
import { evalAdminAuditFlags } from '@/lib/flags/admin-actions';
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

export default async function AdminAuditPage(): Promise<ReactElement> {
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

  const actionFlags = await evalAdminAuditFlags({ userId, flagContext });
  return <Audit actionFlags={actionFlags} />;
}
