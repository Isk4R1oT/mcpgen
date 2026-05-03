// apps/web/src/app/admin/login/page.tsx
//
// Phase 3 / C4-login — Admin sign-in entry route.
//
// Renders the canon-style login UI (`<Login />`) directly, full-bleed —
// the AdminShellGate (`apps/web/src/app/admin/_admin-shell-gate.tsx` from
// C1) skips the AdminShell wrapper for `/admin/login` so this page paints
// edge-to-edge.
//
// Two flag layers (per the dispatch brief):
//   1. `ui_admin_panel_perm` (default OFF) — hides the entire `/admin/*`
//      surface from end users. When OFF, login 404s alongside the rest.
//   2. `ui_admin_login_perm` (default OFF) — gates the actual sign-in
//      backends (Logto Okta SSO + MFA verify + session start). The flag
//      is plumbed at the BFF call sites inside `<Login />` (toast/mock
//      flow) until those endpoints exist; this page only owns the route
//      visibility gate (panel_perm).
//
// Anonymous flag eval: at the sign-in entry we don't have a user yet, so
// `entityId='anonymous'`. The flag's default is OFF for everyone; the
// internal_users segment override resolves on user_id once the user is
// authenticated downstream.

import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { Login } from '@/components/screens/admin/login/login';
import { evaluateBooleanFlag } from '@/lib/flags';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage(): Promise<ReactElement> {
  const enabled = await evaluateBooleanFlag(
    'ui_admin_panel_perm',
    'anonymous',
    {},
    false,
  );
  if (!enabled) notFound();
  return <Login />;
}
