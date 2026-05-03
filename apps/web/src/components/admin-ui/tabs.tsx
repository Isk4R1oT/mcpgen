// apps/web/src/components/admin-ui/tabs.tsx
//
// Phase 3 / C1 — admin `<Tabs>` primitive.
//
// Source of truth: admin.css (`.adm-tabs`, `.adm-tab`, `.adm-tab.sel`,
// `.adm-tab .count`). Canon admin screens build the tab strip inline
// per screen (admin-users, admin-servers, etc.); we extract the row
// into a reusable component so C2/C3/C4 don't duplicate markup.
//
// Visual contract:
// - Outer `<div class="adm-tabs">` with horizontal padding from CSS.
// - Each tab is `<div class="adm-tab" />` (canon also uses div, not button).
//   Selected tab gets `.sel` (primary-bottom-border).
// - Optional trailing `count` badge rendered as `<span class="count">`.
//
// API allows ReactNode labels and arbitrary tab id strings, since admin
// screens key state on tab id (e.g. `'overview' | 'servers' | …`).

import type { JSX, ReactNode } from 'react';

export interface TabItem<TId extends string = string> {
  id: TId;
  label: ReactNode;
  /** Optional small count chip rendered to the right of the label. */
  count?: ReactNode;
}

export interface TabsProps<TId extends string = string> {
  items: TabItem<TId>[];
  selected: TId;
  onChange: (next: TId) => void;
  className?: string;
}

export function Tabs<TId extends string = string>({
  items,
  selected,
  onChange,
  className = '',
}: TabsProps<TId>): JSX.Element {
  const cls = ['adm-tabs', className].filter(Boolean).join(' ');
  return (
    <div className={cls} role="tablist">
      {items.map((it) => {
        const sel = it.id === selected;
        return (
          <div
            key={it.id}
            className={`adm-tab ${sel ? 'sel' : ''}`.trim()}
            role="tab"
            aria-selected={sel}
            tabIndex={0}
            onClick={() => onChange(it.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange(it.id);
              }
            }}
          >
            <span>{it.label}</span>
            {it.count !== undefined && it.count !== null ? (
              <span className="count">{it.count}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
