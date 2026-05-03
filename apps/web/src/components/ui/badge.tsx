// apps/web/src/components/ui/badge.tsx
//
// Phase 0 / F-UIKit — canon `<Badge>` primitive.
//
// Source of truth: claude-design-reference/canon/ui.jsx (`Badge`).
// Renders the canon `mc-badge mc-badge-{kind}` span, optionally suffixed with
// `mc-mono` (default true — canon hard-coded `mono = true`).
//
// Visual contract:
// - Class is exactly: `mc-badge mc-badge-{kind}` (+ ` mc-mono` if mono).
// - Inline content children — canon does not wrap children in any extra span.
//
// API:
// - `kind` accepts the canon CSS-shipped variants (default/success/accent/primary/ink/soft)
//   plus brief-specified `warn` and `live`. Even if those last two have no
//   bespoke CSS rule yet, the class is emitted so additional canon CSS will
//   pick them up. The default value mirrors canon (`'default'`).

import type { JSX, ReactNode } from 'react';

export type BadgeKind =
  | 'default'
  | 'primary'
  | 'soft'
  | 'warn'
  | 'success'
  | 'live'
  | 'accent'
  | 'ink';

export interface BadgeProps {
  kind?: BadgeKind;
  /** When true (default — matching canon), the mono token class is appended. */
  mono?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Badge({
  kind = 'default',
  mono = true,
  className = '',
  children,
}: BadgeProps): JSX.Element {
  // Canon class composition: `mc-badge mc-badge-{kind}` (+ mono token).
  const cls = ['mc-badge', `mc-badge-${kind}`, mono ? 'mc-mono' : '', className]
    .filter(Boolean)
    .join(' ');

  return <span className={cls}>{children}</span>;
}
