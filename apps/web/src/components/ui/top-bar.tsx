// apps/web/src/components/ui/top-bar.tsx
//
// Phase 0 / F-UIKit — canon `<TopBar>` primitive.
//
// Source of truth: claude-design-reference/canon/ui.jsx (`TopBar`).
// Renders the canon `mc-top` header with logo + breadcrumb + right slot.
//
// Visual contract:
// - Header tag with class `mc-top` (sticky paper bg + bottom border + backdrop-filter).
// - Logo button: `mc-logo` containing `mc-logo-mark` (◤) + `mc-logo-word` (mcpgen).
// - Optional breadcrumb rendered after logo word as `mc-crumb` ("/ {breadcrumb}").
// - Right slot in a `mc-top-right` flex container.
//
// API:
// - Brief asks `breadcrumb` prop. Canon used `crumb`. We accept both (preferring
//   `breadcrumb` when both are passed), so screens migrating from canon JSX
//   can stay verbatim while new code uses the brief's name.
// - `onLogo` is a click handler for the logo button.

import type { JSX, MouseEventHandler, ReactNode } from 'react';

export interface TopBarProps {
  /** Right-side slot — typically buttons/badges. */
  right?: ReactNode;
  /** Logo click handler. */
  onLogo?: MouseEventHandler<HTMLButtonElement>;
  /** Breadcrumb tail rendered after the logo. */
  breadcrumb?: ReactNode;
  /** Canon alias for `breadcrumb` — kept so canon JSX can be ported verbatim. */
  crumb?: ReactNode;
}

export function TopBar({ right, onLogo, breadcrumb, crumb }: TopBarProps): JSX.Element {
  // Prefer the brief's `breadcrumb` if present, else fall back to canon `crumb`.
  const trail = breadcrumb ?? crumb;

  return (
    <header className="mc-top">
      <button
        type="button"
        className="mc-logo"
        onClick={onLogo}
        aria-label="home"
      >
        <span className="mc-logo-mark">◤</span>
        <span className="mc-logo-word">mcpgen</span>
        {trail !== undefined && trail !== null ? (
          <span className="mc-crumb"> / {trail}</span>
        ) : null}
      </button>
      <div className="mc-top-right">{right}</div>
    </header>
  );
}
