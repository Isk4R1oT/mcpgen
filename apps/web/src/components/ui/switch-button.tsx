// apps/web/src/components/ui/switch-button.tsx
//
// Phase 0 / F-UIKit — canon toggle primitive (renamed `SwitchButton` to avoid
// conflict with the JS reserved word and the HTML/ARIA "switch" notion).
//
// Source of truth: claude-design-reference/canon/admin.css (`.adm-toggle`).
// Two-piece toggle: outer label `adm-toggle` (mono caption) + nested
// `track`/`knob` divs. `on` modifier flips the track to primary green and
// shifts the knob to the right.
//
// We render a `<button role="switch">` so screen readers announce on/off
// state via `aria-checked`. Visual styling is the canon `adm-toggle` set —
// pure CSS, no shadcn (shadcn is not installed in the Phase 0 bundle).
//
// API:
// - Controlled `checked` + `onChange(next: boolean)`.
// - Optional `label` rendered next to the track (canon often pairs the
//   toggle with a short label).
// - `size` is reserved for future variants (canon ships only one size today
//   so this is currently informational).

import type { JSX, ReactNode } from 'react';

export interface SwitchButtonProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  /** Reserved for future variant — canon ships a single size only. */
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  /** Optional id forwarded to the underlying button (for label `for` linking). */
  id?: string;
}

export function SwitchButton({
  checked,
  onChange,
  label,
  size: _size = 'md',
  disabled = false,
  className = '',
  id,
}: SwitchButtonProps): JSX.Element {
  const cls = ['adm-toggle', checked ? 'on' : '', className].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      id={id}
      className={cls}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
    >
      <span className="track" aria-hidden>
        <span className="knob" />
      </span>
      {label !== undefined && label !== null ? <span>{label}</span> : null}
    </button>
  );
}

// Re-export under the canon name for screens that would prefer `<Switch>`.
export { SwitchButton as Switch };
