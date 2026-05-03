// apps/web/src/app/admin/users/page.tsx
//
// Phase 3 / C2-users — Admin Users & Orgs route.
//
// Mirrors the per-route gating already established by `app/admin/page.tsx`:
//   1. `ui_admin_panel_perm` flag (default OFF) — flipping ON exposes the
//      whole `/admin/*` tree, including this route.
//   2. Logto `admin`/`staff` role check on the session claims.
//
// Either gate failing returns 404 (`notFound()`), which keeps the surface
// invisible to end users until both staff role assignment AND the flag are
// in place.
//
// The actual screen body (`<UsersScreen />`) lives in
// `components/screens/admin/users/users.tsx` and is a Client Component
// (the canon `UsersScreen` uses `useState` for selection, tabs, and modal
// toggles).

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { UsersScreen } from '@/components/screens/admin/users/users';
import { evaluateBooleanFlag } from '@/lib/flags';
import { evalAdminUsersFlags } from '@/lib/flags/admin-actions';
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

export default async function AdminUsersPage(): Promise<ReactElement> {
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

  const actionFlags = await evalAdminUsersFlags({ userId, flagContext });
  return <UsersScreen actionFlags={actionFlags} />;
}
