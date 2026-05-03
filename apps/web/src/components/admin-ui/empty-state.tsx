// apps/web/src/components/admin-ui/empty-state.tsx
//
// Phase 3 / C1 — admin `<EmptyState>` primitive.
//
// Source of truth: claude-design-reference/canon/admin/admin-ui.jsx
// (`EmptyState`) + admin.css (`.adm-empty`).
//
// Dashed-border centered empty placeholder shown when a list / table has
// zero rows or the screen is in `demoState='empty'`.

import type { JSX, ReactNode } from 'react';

export interface EmptyStateProps {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  sub,
  action,
  className = '',
}: EmptyStateProps): JSX.Element {
  const cls = ['adm-empty', className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div style={{ fontSize: 14, marginBottom: 6, color: 'var(--text)' }}>
        {title}
      </div>
      {sub !== undefined && sub !== null ? (
        <div style={{ fontSize: 12 }}>{sub}</div>
      ) : null}
      {action !== undefined && action !== null ? (
        <div style={{ marginTop: 14 }}>{action}</div>
      ) : null}
    </div>
  );
}
