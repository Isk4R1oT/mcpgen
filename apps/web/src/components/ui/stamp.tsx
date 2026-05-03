// apps/web/src/components/ui/stamp.tsx
//
// Phase 0 / F-UIKit — canon `<Stamp>` container primitive.
//
// Source of truth: claude-design-reference/canon/global.css (`.mc-stamp`).
//
// Visual contract:
// - 1px sharp border + radius + 4px padding + nested-input override
//   (inset double-border via `box-shadow: inset 0 0 0 4px var(--paper),
//    inset 0 0 0 5px var(--border-sharp)`).
// - Used to wrap inputs (notably the landing URL input) in canon screens.
//
// API:
// - Pure layout container. `children` is required for use; `className` and
//   `style` are forwarded for layout overrides.

import type { CSSProperties, JSX, ReactNode } from 'react';

export interface StampProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Stamp({ children, className = '', style }: StampProps): JSX.Element {
  const cls = ['mc-stamp', className].filter(Boolean).join(' ');
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}
