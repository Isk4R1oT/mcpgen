// apps/web/src/app/admin/deploys/page.tsx
//
// Phase 3 / C3-deploys — admin deploys & infra route.
//
// Two-layer gate (matches `/admin/page.tsx`):
//   1. `ui_admin_panel_perm` flag (default OFF) — gates the entire admin
//      surface; M-5 adds the internal_users segment via Flipt rule API.
//   2. Logto admin role check — even if the flag rolls out broadly the
//      role-bearing claim must be present.
//
// Either failure → `notFound()` so the screen is invisible to end users.
//
// The screen body is a Client Component (`DeploysScreen`) because it owns
// React state for the two modals + TanStack Query hooks. This server-side
// shell only does auth + flag eval and then mounts it.

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { DeploysScreen } from '@/components/screens/admin/deploys/deploys';
import { evaluateBooleanFlag } from '@/lib/flags';
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

export default async function AdminDeploysPage(): Promise<ReactElement> {
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

  // Per-action flags (region resync, rollback, view-all, killswitches)
  // are evaluated server-side and threaded as boolean props.
  const [
    regionResync,
    rollback,
    viewAll,
    killGlobal,
    killFlag,
  ] = await Promise.all([
    evaluateBooleanFlag('ui_admin_region_resync_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_deploy_rollback_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_deploys_view_all_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_killswitch_global_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_killswitch_flag_perm', userId, flagContext, false),
  ]);

  return (
    <DeploysScreen
      actionFlags={{ regionResync, rollback, viewAll, killGlobal, killFlag }}
    />
  );
}
