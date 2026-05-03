// apps/web/src/components/ui/section-label.tsx
//
// Phase 0 / F-UIKit — canon `<SectionLabel>` primitive.
//
// Source of truth: claude-design-reference/canon/ui.jsx (`SectionLabel`) +
// claude-design-reference/canon/global.css (`.mc-seclbl`, `.mc-caption-up`).
//
// Visual contract:
// - Wraps content in a `mc-seclbl` row (mono uppercase 11px, dashed bottom rule,
//   right-aligned right slot via `mc-seclbl-r`).
// - When used as a tiny caption only (no row), apply `mc-caption-up` instead.
//
// The brief mentions "tiny caption used in admin/auth screens" + canon class
// `mc-caption-up`. Canon also has the row-style `mc-seclbl` (with right slot).
// We support both: when a `right` slot is passed we render the row layout
// (mc-seclbl); without `right` we render the caption-only span (mc-caption-up).

import type { JSX, ReactNode } from 'react';

export interface SectionLabelProps {
  children?: ReactNode;
  /** Optional right-aligned slot — renders the row variant `mc-seclbl`. */
  right?: ReactNode;
  className?: string;
}

export function SectionLabel({
  children,
  right,
  className = '',
}: SectionLabelProps): JSX.Element {
  if (right !== undefined) {
    // Row variant — canon `mc-seclbl` with bottom rule + right slot.
    const cls = ['mc-seclbl', className].filter(Boolean).join(' ');
    return (
      <div className={cls}>
        <span>{children}</span>
        <span className="mc-seclbl-r">{right}</span>
      </div>
    );
  }

  // Tiny caption — canon `mc-caption-up` (no border, no layout).
  const cls = ['mc-caption-up', className].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}
