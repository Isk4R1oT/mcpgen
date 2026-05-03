// apps/web/src/components/admin-ui/toggle.tsx
//
// Phase 3 / C1 — admin `<Toggle>` primitive.
//
// Source of truth: claude-design-reference/canon/admin/admin-ui.jsx
// (`Toggle`) + admin.css (`.adm-toggle`, `.adm-toggle.on`).
//
// On/off toggle with optional trailing label. Click anywhere on the
// element flips state via `onChange(!on)`. The visual track + knob
// are CSS-only — we only toggle the `.on` class.

import type { JSX, ReactNode } from 'react';

export interface ToggleProps {
  on: boolean;
  onChange?: (next: boolean) => void;
  label?: ReactNode;
  className?: string;
}

export function Toggle({
  on,
  onChange,
  label,
  className = '',
}: ToggleProps): JSX.Element {
  const cls = ['adm-toggle', on ? 'on' : '', className].filter(Boolean).join(' ');
  return (
    <span
      className={cls}
      onClick={() => onChange?.(!on)}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange?.(!on);
        }
      }}
    >
      <span className="track">
        <span className="knob" />
      </span>
      {label !== undefined && label !== null ? <span>{label}</span> : null}
    </span>
  );
}
