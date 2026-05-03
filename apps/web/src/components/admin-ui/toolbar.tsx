// apps/web/src/components/admin-ui/toolbar.tsx
//
// Phase 3 / C1 — admin `<Toolbar>` primitive.
//
// Horizontal action row used above tables/grids in admin screens (e.g.
// "select all · 0 selected · bulk action ▾"). Canon admin screens
// implement these inline; this primitive captures the layout so C2/C3/C4
// don't duplicate it.
//
// Visual contract: a flex row with the canon `.row` class and an 8px gap.
// Left/right slots split the row via `marginLeft: auto` on the right slot.

import type { JSX, ReactNode } from 'react';

export interface ToolbarProps {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function Toolbar({ left, right, className = '' }: ToolbarProps): JSX.Element {
  const cls = ['row', 'adm-toolbar', className].filter(Boolean).join(' ');
  return (
    <div className={cls} style={{ gap: 8, padding: '10px 14px' }}>
      {left !== undefined && left !== null ? <div className="row" style={{ gap: 8 }}>{left}</div> : null}
      {right !== undefined && right !== null ? (
        <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          {right}
        </div>
      ) : null}
    </div>
  );
}
