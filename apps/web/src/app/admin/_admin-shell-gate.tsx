// apps/web/src/app/admin/_admin-shell-gate.tsx
//
// Phase 3 / C1 — Client gate that decides whether to render the
// `<AdminShell>` chrome around the route's children.
//
// Why a separate client component instead of a server-side branch in
// `layout.tsx`? Next.js layouts cannot read the active pathname on the
// server (no hooks available) and we still want the admin shell to wrap
// every admin route EXCEPT `/admin/login`, where the login screen is
// full-bleed (canon admin-login.jsx). Shipping the gate as a tiny client
// component keeps layout.tsx itself a server component and avoids
// breaking the auth `getLogtoContext` calls in /admin/page.tsx.
//
// The login page `app/admin/login/page.tsx` (C4-login's territory) renders
// without the shell — this gate skips the shell when pathname starts
// with `/admin/login`. All other admin/* routes get the full shell.

'use client';

import { usePathname } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

import { AdminShell } from '@/components/screens/admin/admin-shell';

interface Props {
  children: ReactNode;
}

export function AdminShellGate({ children }: Props): ReactElement {
  const pathname = usePathname() ?? '/admin';
  // Login is full-bleed — no shell. Anything else (including /admin index)
  // gets the shell wrapper.
  if (pathname.startsWith('/admin/login')) {
    return <>{children}</>;
  }
  return <AdminShell>{children}</AdminShell>;
}
