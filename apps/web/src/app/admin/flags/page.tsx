// apps/web/src/app/admin/flags/page.tsx
//
// Phase 3 / C3-flags — Admin "feature flags & experiments" route.
//
// Two-layer gate (mirrors `/admin/page.tsx` pattern):
//   1. `ui_admin_panel_perm` (default OFF) — when OFF the route returns
//      404 so the entire `/admin/*` surface stays invisible.
//   2. Logto admin role check on the claims (`roles` array contains
//      'admin' | 'staff'). Even with the flag ON, non-admins 404.
//
// Per-action: `ui_admin_flag_edit_perm` (default OFF). Evaluated server-side
// here and passed to the client screen as a deterministic boolean prop —
// keeps the canon UI rendering identically while the BFF is missing
// (Phase 3 brief: actions toast `'admin action: not yet wired'` until
// backends land).
//
// References:
//   - .planning/phase-rebuild/agent-briefs/PHASE-3.md (C3-flags row)
//   - .planning/phase-rebuild/SCREEN-BEHAVIORS-CATALOG.md § admin-flags
//   - apps/web/src/app/admin/page.tsx (canonical gate pattern)

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { FlagsScreen } from '@/components/screens/admin/flags/flags';
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

export default async function AdminFlagsPage(): Promise<ReactElement> {
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

  // Per-action gate — default OFF. Unknown flag keys fall back to the
  // default value, so this works even before the flag is registered in
  // packages/feature-flags/_manifest/flags.yaml.
  const editEnabled = await evaluateBooleanFlag(
    'ui_admin_flag_edit_perm',
    userId,
    flagContext,
    false,
  );

  return <FlagsScreen editEnabled={editEnabled} />;
}
