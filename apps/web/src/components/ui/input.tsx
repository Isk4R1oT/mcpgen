// apps/web/src/components/ui/input.tsx
//
// Phase 0 / F-UIKit — canon `<Input>` primitive.
//
// Source of truth: claude-design-reference/canon/global.css (`.mc-input`).
// Pure styled `<input>` — no shadcn wrapper. Class `mc-input` already provides
// border, radius, font-size, focus ring (var(--tint) 3px); when nested inside
// `<Stamp>` the parent rule strips the inner border per canon.
//
// API:
// - Controlled `value`/`onChange` (strict — uncontrolled `defaultValue` left to
//   callers via `...rest`).
// - Forwards remaining `<input>` HTML attrs (e.g. inputMode, name, id).

import type { ChangeEventHandler, InputHTMLAttributes, JSX } from 'react';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** When true, applies the canon mono variant `mc-mono`. */
  mono?: boolean;
}

export function Input({
  className = '',
  mono = false,
  type = 'text',
  ...rest
}: InputProps): JSX.Element {
  const cls = ['mc-input', mono ? 'mc-mono' : '', className].filter(Boolean).join(' ');
  return <input {...rest} type={type} className={cls} />;
}
