// apps/web/src/components/admin-ui/row-action.tsx
//
// Phase 3 / C1 — admin `<RowAction>` primitive.
//
// Lightweight wrapper around `<Btn kind="ghost" size="sm">` for inline
// row-level actions inside admin tables. Canon admin screens use raw
// `<Btn kind="ghost" size="sm">…</Btn>` repeatedly; this primitive
// names the pattern so C2/C3/C4 rows are uniform and visually consistent.
//
// Visual contract: a small ghost button. `onAction` is fired on click.
// The primitive intentionally does NOT add a confirm dialog — confirmation
// (e.g. for destructive operations) is the screen's responsibility, behind
// the `_perm` flag.

import type { JSX, MouseEventHandler, ReactNode } from 'react';

import { Btn } from './btn';
import type { IconName } from '@/components/ui/icon';

export interface RowActionProps {
  icon?: IconName;
  iconR?: IconName;
  onAction?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  title?: string;
  children?: ReactNode;
  className?: string;
}

export function RowAction({
  icon,
  iconR,
  onAction,
  disabled,
  title,
  children,
  className,
}: RowActionProps): JSX.Element {
  // Build `BtnProps` selectively — `exactOptionalPropertyTypes: true` rejects
  // explicit `undefined` for optional fields, so we only spread when set.
  const btnProps: Record<string, unknown> = { kind: 'ghost', size: 'sm' };
  if (icon !== undefined) btnProps.icon = icon;
  if (iconR !== undefined) btnProps.iconR = iconR;
  if (onAction !== undefined) btnProps.onClick = onAction;
  if (disabled !== undefined) btnProps.disabled = disabled;
  if (title !== undefined) btnProps.title = title;
  if (className !== undefined) btnProps.className = className;
  return <Btn {...(btnProps as Parameters<typeof Btn>[0])}>{children}</Btn>;
}
