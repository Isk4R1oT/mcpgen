// apps/web/src/app/admin/layout.tsx
//
// Admin sub-tree layout. Imports the locked admin.css so any admin/* JSX
// that mounts inherits the staff-panel theme alongside the global design
// tokens from app/layout.tsx. Production paths are gated by
// `ui_admin_panel_perm` (per route page.tsx) so this layout never renders
// for end users until the admin module ships.
//
// Phase 3 / C1 — wraps every `/admin/*` route with the canon admin shell
// (sidebar nav + top bar + status bar) via `<AdminShellGate>`. The gate is
// a thin client component that branches on pathname so `/admin/login`
// renders without the shell (canon admin-login.jsx is full-bleed).
//
// Per docs/mcpgen-frontend-rebuild-contract.md §13 Q9 — Admin is embedded
// under /admin/* in the main Next.js app (single Vercel deploy, shared
// Logto session). Role check (Logto admin role) is applied per-route on
// top of the flag.

import type { ReactElement, ReactNode } from 'react';

import '@/admin.css';
import '@/styles/admin-globals.css';

import { AdminShellGate } from './_admin-shell-gate';

interface Props {
  children: ReactNode;
}

export default function AdminLayout({ children }: Props): ReactElement {
  return <AdminShellGate>{children}</AdminShellGate>;
}
