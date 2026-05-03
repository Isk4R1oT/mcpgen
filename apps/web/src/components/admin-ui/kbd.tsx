// apps/web/src/components/admin-ui/kbd.tsx
//
// Phase 3 / C1 — admin `<Kbd>` primitive.
//
// Source of truth: claude-design-reference/canon/ui.jsx (`Kbd`) — used
// inline in canon admin-app.jsx for the ⌘K hint inside the search bar.
//
// Single-key chip rendered with the canon `mc-kbd` class.

import type { JSX, ReactNode } from 'react';

export interface KbdProps {
  children?: ReactNode;
  className?: string;
}

export function Kbd({ children, className = '' }: KbdProps): JSX.Element {
  const cls = ['mc-kbd', className].filter(Boolean).join(' ');
  return <kbd className={cls}>{children}</kbd>;
}
