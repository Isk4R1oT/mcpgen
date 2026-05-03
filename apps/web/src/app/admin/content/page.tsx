// apps/web/src/app/admin/content/page.tsx
//
// Phase 3 / C4-content — /admin/content route shell.
//
// Server Component shell. Renders the canon admin content screen
// (docs / listings / email / in-app / status page tabs).
//
// Two layers of access protection:
//   1. `/admin/:path*` is gated by `ui_admin_panel_perm` at the middleware
//      level (apps/web/src/middleware.ts). With the flag OFF (default) every
//      `/admin/*` route — including this one — returns 404 before reaching
//      the page. Per PHASE-3 brief, the entire admin namespace renders in
//      code regardless; flipping the flag ON immediately exposes the surface.
//   2. The shared `app/admin/layout.tsx` wraps every admin page (except
//      /admin/login) in the `<AdminShell>` chrome via `<AdminShellGate>`.
//      No additional gating is required here.
//
// All BFF reads happen inside the Client Component `<Content />`; this
// shell is a thin server passthrough so the route segment stays static.

import { getLogtoContext } from '@logto/next/server-actions';
import type { ReactElement } from 'react';

import { Content } from '@/components/screens/admin/content/content';
import { evalAdminContentFlags } from '@/lib/flags/admin-actions';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

interface ClaimsLike {
  sub?: unknown;
  email?: unknown;
}

export default async function AdminContentPage(): Promise<ReactElement> {
  // Route-level admin gate is enforced by middleware + the shared layout.
  // Here we just resolve the per-action flags so the screen knows whether
  // each action should hit a real BFF or fall back to a toast stub.
  const { claims } = await getLogtoContext(logtoConfig);
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

  const actionFlags = await evalAdminContentFlags({ userId, flagContext });
  return <Content actionFlags={actionFlags} />;
}
