// apps/web/src/app/admin/marketplace/page.tsx
//
// Phase 3 / C3-marketplace — Admin marketplace moderation route shell.
//
// Two-layer gate (mirrors `apps/web/src/app/admin/page.tsx`):
//   1. `ui_admin_panel_perm` flag (default OFF). Internal users segment is
//      configured in Flipt; flipping it ON for `entityId=user.id` exposes
//      the entire admin tree.
//   2. Logto admin role check on the claims (`roles` array contains
//      'admin' or 'staff'). The flag alone is not sufficient.
//
// When either gate fails the page returns 404 (`notFound()`) so the
// /admin/* surface is invisible to end users.
//
// The interactive screen body lives in
// `@/components/screens/admin/marketplace/marketplace`. This shell is a
// Server Component (no `'use client'`) so the auth + flag check happens
// before any client-side code is shipped.

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import AdminMarketplaceScreen from '@/components/screens/admin/marketplace/marketplace';
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

export default async function AdminMarketplacePage(): Promise<ReactElement> {
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

  // Per-action flags (default OFF). When OFF the screen renders canon
  // surfaces but the click fires a `toast('admin action: not yet wired')`
  // stub. Flipping ON requires the matching BFF route to exist (see
  // FLAGS-NEEDED.md § Phase 3 / C3-marketplace).
  const [
    bulkApproveEnabled,
    approveEnabled,
    requestChangesEnabled,
    takedownEnabled,
  ] = await Promise.all([
    evaluateBooleanFlag(
      'ui_admin_marketplace_bulk_approve_perm',
      userId,
      flagContext,
      false,
    ),
    evaluateBooleanFlag(
      'ui_admin_marketplace_approve_perm',
      userId,
      flagContext,
      false,
    ),
    evaluateBooleanFlag(
      'ui_admin_marketplace_request_changes_perm',
      userId,
      flagContext,
      false,
    ),
    evaluateBooleanFlag(
      'ui_admin_marketplace_takedown_perm',
      userId,
      flagContext,
      false,
    ),
  ]);

  return (
    <AdminMarketplaceScreen
      bulkApproveEnabled={bulkApproveEnabled}
      approveEnabled={approveEnabled}
      requestChangesEnabled={requestChangesEnabled}
      takedownEnabled={takedownEnabled}
    />
  );
}
