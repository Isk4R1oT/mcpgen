// apps/web/src/app/admin/layout.tsx
//
// Phase M-4 (Wave-2 Agent 5) — Admin sub-tree layout. Imports the locked
// admin.css so any admin/* JSX that mounts inherits the staff-panel theme
// alongside the global design tokens from app/layout.tsx. Production paths
// are gated by `ui_admin_panel_perm` (per route page.tsx) so this layout
// never renders for end users until the admin module ships.
//
// Per docs/mcpgen-frontend-rebuild-contract.md §13 Q9 — Admin is embedded
// under /admin/* in the main Next.js app (single Vercel deploy, shared
// Logto session). Role check (Logto admin role) is applied per-route on
// top of the flag.

import type { ReactElement, ReactNode } from 'react';

import '@/admin.css';

interface Props {
  children: ReactNode;
}

export default function AdminLayout({ children }: Props): ReactElement {
  return <>{children}</>;
}
