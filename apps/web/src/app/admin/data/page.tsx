// apps/web/src/app/admin/data/page.tsx
//
// Phase 3 / C2-data — `/admin/data` route shell.
//
// Two-layer gate (mirrors `app/admin/page.tsx` and sibling admin pages):
//   1. `ui_admin_panel_perm` flag (default OFF) — when OFF the entire
//      /admin/* surface returns 404.
//   2. Logto admin role check on the claims (`roles` array contains
//      `'admin'` or `'staff'`). Even with the flag ON, only admin
//      principals see the screen.
//
// The interactive body is the `<AdminData>` Client Component; this
// page is a Server Component shell so we can read Logto context +
// Flipt without bleeding secrets to the client. The screen itself
// renders the canon "loading" branch while the BFF stub
// (`useAdminMetrics`) returns `flag_off_or_not_implemented`.

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { AdminData } from '@/components/screens/admin/data/data';
import { evaluateBooleanFlag } from '@/lib/flags';
import { evalAdminDataFlags } from '@/lib/flags/admin-actions';
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

export default async function AdminDataPage(): Promise<ReactElement> {
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

  const actionFlags = await evalAdminDataFlags({ userId, flagContext });
  return <AdminData actionFlags={actionFlags} />;
}
