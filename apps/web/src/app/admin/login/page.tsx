// apps/web/src/app/admin/login/page.tsx
//
// Phase M-4 (Wave-2 Agent 5) — Admin sign-in entry. The locked
// `admin/admin-login.jsx` screen is not yet exposed through the jsx-bridge
// (no AdminLoginWrapper exists). Per the dispatch brief: "uses
// admin/admin-login.jsx via jsx-bridge if available, otherwise basic Logto
// redirect." Bridge wrapper is unavailable — fall back to the basic Logto
// redirect.
//
// Gate is the same `ui_admin_panel_perm` flag; without it, the login page
// 404s too (so the /admin/* surface stays fully invisible). Once the flag
// is ON we redirect to Logto sign-in with /admin as the post-auth target;
// the admin/page.tsx role check then either renders the panel or 404s if
// the signed-in user is not an admin.

import { notFound, redirect } from 'next/navigation';

import { evaluateBooleanFlag } from '@/lib/flags';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage(): Promise<never> {
  // Anonymous flag-eval: we don't have a user yet (this is the sign-in
  // entry). entityId='anonymous' is fine — the flag's default is OFF for
  // everyone; internal_users segment override resolves on user_id once the
  // user is authenticated.
  const enabled = await evaluateBooleanFlag(
    'ui_admin_panel_perm',
    'anonymous',
    {},
    false,
  );
  if (!enabled) notFound();
  redirect('/api/auth/logto/sign-in?redirect_to=/admin');
}
