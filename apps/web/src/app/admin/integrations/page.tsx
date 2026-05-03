// apps/web/src/app/admin/integrations/page.tsx
//
// Phase 3 / C3-integrations — Admin Integrations route.
//
// Server Component shell. Two-layer gate (mirrors apps/web/src/app/admin/
// page.tsx + apps/web/src/middleware.ts):
//   1. `ui_admin_panel_perm` flag (default OFF) — also enforced in
//      middleware.ts so the route segment 404s before this code runs in
//      production. Re-evaluated here for belt-and-suspenders parity with
//      the other /admin/* pages.
//   2. Logto admin role check on the claims (`roles` array contains
//      'admin' or 'staff').
//
// When either gate fails the page returns 404 (`notFound()`), matching the
// behavior of the existing /admin entry route. The interactive screen body
// is a Client Component.

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { IntegrationsScreen } from '@/components/screens/admin/integrations/integrations';
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

export default async function AdminIntegrationsPage(): Promise<ReactElement> {
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

  // Per-action flags (oauth rotate/add, webhook edit/add, secret reveal/rotate)
  // are pre-evaluated server-side and threaded as boolean props.
  const [
    oauthRotateEnabled,
    oauthAddEnabled,
    webhookEditEnabled,
    webhookAddEnabled,
    secretRevealEnabled,
    secretRotateEnabled,
  ] = await Promise.all([
    evaluateBooleanFlag('ui_admin_oauth_rotate_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_oauth_add_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_webhook_edit_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_webhook_add_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_secret_reveal_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_secret_rotate_perm', userId, flagContext, false),
  ]);

  return (
    <IntegrationsScreen
      oauthRotateEnabled={oauthRotateEnabled}
      oauthAddEnabled={oauthAddEnabled}
      webhookEditEnabled={webhookEditEnabled}
      webhookAddEnabled={webhookAddEnabled}
      secretRevealEnabled={secretRevealEnabled}
      secretRotateEnabled={secretRotateEnabled}
    />
  );
}
