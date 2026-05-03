// apps/web/src/components/ui/btn.tsx
//
// Phase 0 / F-UIKit — canon `<Btn>` primitive.
//
// Source of truth: claude-design-reference/canon/ui.jsx (`Btn`).
// Renders an `mc-btn mc-btn-{kind} mc-btn-{size}` button. Optional left/right
// icons rendered via `<Icon>` at size 13 to match canon hard-coded inline value.
//
// Visual contract:
// - Class is exactly: `mc-btn mc-btn-{kind} mc-btn-{size}` (+ `mc-btn-full`).
// - Children wrapped in <span> per canon (so the icon-text gap of 8px renders).
// - Icons sized at 13 (canon hard-coded), color follows currentColor.
//
// API:
// - `kind` — accepts canon-supported variants. Brief specifies primary/ink/ghost/soft/danger;
//   canon CSS ships primary/ink/ghost/link, plus screens use accent/success/soft.
//   We accept the broader union so screens compile, even if `mc-btn-soft` etc.
//   need additional CSS rules later (canon Btn just passes the class through).
// - `iconR` is the right-side icon (canon name); `icon` is left.
// - `full` toggles the canon `mc-btn-full` width-100% modifier.
// - Forwards remaining HTMLButtonElement props (e.g. type, name, aria-*).

import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';
import { Icon, type IconName } from './icon';

export type BtnKind =
  | 'primary'
  | 'ink'
  | 'ghost'
  | 'soft'
  | 'danger'
  | 'link'
  | 'accent'
  | 'success';

export type BtnSize = 'sm' | 'md' | 'lg';

export interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  kind?: BtnKind;
  size?: BtnSize;
  icon?: IconName;
  iconR?: IconName;
  full?: boolean;
  children?: ReactNode;
}

export function Btn({
  kind = 'ghost',
  size = 'md',
  icon,
  iconR,
  full = false,
  className = '',
  children,
  type = 'button',
  ...rest
}: BtnProps): JSX.Element {
  // Canon class composition: `mc-btn mc-btn-{kind} mc-btn-{size}` + optional `mc-btn-full`.
  const cls = [
    'mc-btn',
    `mc-btn-${kind}`,
    `mc-btn-${size}`,
    full ? 'mc-btn-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button {...rest} type={type} className={cls}>
      {icon ? <Icon name={icon} size={13} /> : null}
      {children !== undefined && children !== null ? <span>{children}</span> : null}
      {iconR ? <Icon name={iconR} size={13} /> : null}
    </button>
  );
}
