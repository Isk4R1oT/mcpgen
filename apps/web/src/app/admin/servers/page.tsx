// apps/web/src/app/admin/servers/page.tsx
//
// Phase 3 / C2-servers — `/admin/servers` route. Server Component that
// applies the same two-layer admin gate used by every other admin route:
//
//   1. `ui_admin_panel_perm` flag (default OFF). When OFF (production
//      default) the page returns 404 so /admin/* is invisible.
//   2. Logto admin role check on the claims. The flag alone is not
//      sufficient — even if a non-admin somehow ends up in the
//      internal_users segment, the role check still blocks render.
//
// On pass-through, the AdminShell (mounted by `app/admin/layout.tsx` via
// `<AdminShellGate>`) wraps the screen with the canon admin chrome
// (sidebar nav · top bar · status bar). This Server Component therefore
// only renders the screen body itself.
//
// References:
//   - claude-design-reference/canon/admin/admin-servers.jsx
//   - apps/web/src/app/admin/page.tsx (overview entry — gate template)

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { ServersScreen } from '@/components/screens/admin/servers/servers';
import { evaluateBooleanFlag } from '@/lib/flags';
import { evalAdminServersFlags } from '@/lib/flags/admin-actions';
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

export default async function AdminServersPage(): Promise<ReactElement> {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    redirect('/admin/login');
  }

  const claimsObj = (claims ?? {}) as ClaimsLike;
  const userId =
    typeof claimsObj.sub === 'string' ? claimsObj.sub : 'anonymous';
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

  const actionFlags = await evalAdminServersFlags({ userId, flagContext });
  return <ServersScreen actionFlags={actionFlags} />;
}
