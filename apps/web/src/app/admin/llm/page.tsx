// apps/web/src/app/admin/llm/page.tsx
//
// Phase 3 / Agent C3-llm — LLM Ops route.
//
// Two-layer gate matches `app/admin/page.tsx`:
//
//   1. `ui_admin_panel_perm` (default OFF) — flips the entire `/admin/*`
//      surface on. Without it this page returns 404 (`notFound()`).
//   2. Logto admin role check on the claims (`roles` array contains
//      'admin' or 'staff'). Even if a non-admin lands in the
//      internal_users segment for the panel flag, the role gate still
//      blocks render.
//
// Per-action flags (default OFF) are evaluated server-side and passed
// down so the client component renders the proper CTA branch (toast
// stub vs real wire-up) without re-running flag eval client-side. New
// flags landed for this screen — see
// `.planning/phase-rebuild/FLAGS-NEEDED.md`:
//   - `ui_admin_llm_run_eval_perm`
//   - `ui_admin_llm_propose_route_perm`
//   - `ui_admin_llm_approve_route_perm`

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import LlmScreen from '@/components/screens/admin/llm/llm';
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

export default async function AdminLlmPage(): Promise<ReactElement> {
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

  const panelEnabled = await evaluateBooleanFlag(
    'ui_admin_panel_perm',
    userId,
    flagContext,
    false,
  );
  if (!panelEnabled) notFound();
  if (!hasAdminRole(claimsObj)) notFound();

  const [runEvalEnabled, proposeRouteEnabled, approveRouteEnabled] = await Promise.all([
    evaluateBooleanFlag('ui_admin_llm_run_eval_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_llm_propose_route_perm', userId, flagContext, false),
    evaluateBooleanFlag('ui_admin_llm_approve_route_perm', userId, flagContext, false),
  ]);

  return (
    <LlmScreen
      runEvalEnabled={runEvalEnabled}
      proposeRouteEnabled={proposeRouteEnabled}
      approveRouteEnabled={approveRouteEnabled}
    />
  );
}
