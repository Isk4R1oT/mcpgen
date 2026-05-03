// apps/web/src/components/admin-ui/filter-bar.tsx
//
// Phase 3 / C1 — admin `<FilterBar>` primitive.
//
// Canon admin screens use ad-hoc filter strips (admin-users / admin-servers
// each have their own one-liner). This primitive consolidates the canon
// pattern observed in admin-users.jsx so C2/C3/C4 do not duplicate
// markup.
//
// Visual contract:
// - Outer flex row, 14px vertical padding, 18px horizontal padding,
//   bottom border (matches canon admin-users filter strip).
// - Optional `search` input slot using `mc-input mc-mono` (canon).
// - Optional `actions` slot for `<Btn>` filter triggers.
// - Optional `chips` slot for status chip row underneath.
//
// All slots are ReactNode — the primitive is layout-only. C2/C3/C4 supply
// their own filter logic + state.

import type { JSX, ReactNode } from 'react';

export interface FilterBarProps {
  search?: ReactNode;
  actions?: ReactNode;
  chips?: ReactNode;
  className?: string;
}

export function FilterBar({
  search,
  actions,
  chips,
  className = '',
}: FilterBarProps): JSX.Element {
  const cls = ['adm-filter-bar', className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        {search !== undefined && search !== null ? (
          <div style={{ flex: 1 }}>{search}</div>
        ) : null}
        {actions !== undefined && actions !== null ? (
          <div className="row" style={{ gap: 8 }}>
            {actions}
          </div>
        ) : null}
      </div>
      {chips !== undefined && chips !== null ? (
        <div
          style={{
            padding: '6px 14px',
            display: 'flex',
            gap: 6,
            borderBottom: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}
        >
          {chips}
        </div>
      ) : null}
    </div>
  );
}
