// apps/web/src/components/ui/card.tsx
//
// Phase 0 / F-UIKit — canon `<Card>` primitive.
//
// Source of truth: claude-design-reference/canon/ui.jsx (`Card`) +
// claude-design-reference/canon/global.css (`.mc-card` / `.mc-card-pad`).
//
// Visual contract:
// - `mc-card` provides border (`var(--border-w) solid var(--border-sharp)`),
//   `var(--card)` bg, `var(--radius-lg)` corners, and offset block shadow.
// - `mc-card-pad` adds padding `calc(var(--pad) * 1.5)`. Canon defaulted
//   `padding = true`; we keep that default.
//
// We deliberately use the canon class name string instead of Tailwind
// utilities (`bg-card`, `border-border-sharp`, …) so the look stays in lock-step
// with canon CSS. Callers can still extend with extra Tailwind via `className`.

import type { CSSProperties, JSX, MouseEventHandler, ReactNode } from 'react';

export interface CardProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Toggles the canon `mc-card-pad` modifier (default true — matches canon). */
  padding?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function Card({
  children,
  className = '',
  style,
  padding = true,
  onClick,
}: CardProps): JSX.Element {
  const cls = ['mc-card', padding ? 'mc-card-pad' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} style={style} onClick={onClick}>
      {children}
    </div>
  );
}
