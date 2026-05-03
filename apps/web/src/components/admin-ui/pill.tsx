// apps/web/src/components/admin-ui/pill.tsx
//
// Phase 3 / C1 — admin `<Pill>` primitive.
//
// Source of truth: claude-design-reference/canon/admin/admin-ui.jsx (`Pill`)
// + claude-design-reference/canon/admin.css (`.adm-pill`, kind variants).
//
// Visual contract:
// - Class: `adm-pill {kind}` where `kind` is one of '', 'ok', 'warn', 'alert',
//   'info', 'ink' — canon uses the kind directly as a class name (not prefixed).
// - When `dot` is true (canon default) renders the leading colored dot span.
//
// Used by: admin status pills (server status, region health, ticket priority).

import type { JSX, ReactNode } from 'react';

export type PillKind = '' | 'ok' | 'warn' | 'alert' | 'info' | 'ink';

export interface PillProps {
  kind?: PillKind;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Pill({
  kind = '',
  dot = true,
  children,
  className = '',
}: PillProps): JSX.Element {
  const cls = ['adm-pill', kind, className].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  );
}
