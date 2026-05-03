// apps/web/src/app/admin/support/page.tsx
//
// Phase 3 / C4-support — Admin support inbox route. Two-layer gate (same
// shape as `apps/web/src/app/admin/page.tsx`):
//
//   1. `ui_admin_panel_perm` flag (default OFF). When the flag is OFF the
//      whole admin tree is invisible — return 404.
//   2. Logto admin role check (`roles` array contains `'admin'` or
//      `'staff'`). Even if the flag flips ON, a non-admin still 404s.
//
// When both gates pass the route renders the canon support inbox under the
// admin shell wrapper provided by `apps/web/src/app/admin/layout.tsx`.

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import Support from '@/components/screens/admin/support/support';
import { evaluateBooleanFlag } from '@/lib/flags';
import { evalAdminSupportFlags } from '@/lib/flags/admin-actions';
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

export default async function AdminSupportPage(): Promise<ReactElement> {
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

  // Per-action flags (assign / snooze / resolve / reply / internal / attach)
  // are pre-evaluated server-side and passed to the Client Component as
  // `flags` so the toast-stub vs real-call branch is deterministic per
  // request without a re-eval on the client.
  const adminSupportFlags = await evalAdminSupportFlags({ userId, flagContext });
  return (
    <Support
      flags={{
        assign: adminSupportFlags.ui_admin_support_assign_perm,
        snooze: adminSupportFlags.ui_admin_support_snooze_perm,
        resolve: adminSupportFlags.ui_admin_support_resolve_perm,
        reply: adminSupportFlags.ui_admin_support_reply_perm,
        internal: adminSupportFlags.ui_admin_support_internal_perm,
        attach: adminSupportFlags.ui_admin_support_attach_perm,
      }}
    />
  );
}
