// apps/web/src/components/admin-ui/top-bar.tsx
//
// Phase 3 / C1 — admin `<TopBar>` primitive (admin shell variant).
//
// Source of truth: claude-design-reference/canon/admin/admin-app.jsx
// (the `.adm-top` row inside `App()`). DIFFERENT from the main canon
// `<TopBar>` (which renders `mc-top` for the product chrome). The admin
// top bar lives inside the `.adm-shell` grid and contains:
//
//   1. A clickable search "input" (placeholder text + ⌘K hint chips)
//      that opens the command palette.
//   2. Right-side actions: env switch, demo state switch (dev-only),
//      density toggle, theme toggle, divider, user identity chip.
//
// We expose this as a single primitive so the admin shell composes it
// directly. The shell controls all state — this component is purely
// presentational.

import type { JSX, MouseEventHandler, ReactNode } from 'react';

export type AdminEnv = 'prod' | 'staging' | 'dev';
export type AdminDensity = 'compact' | 'comfy';
export type AdminTheme = 'dark' | 'light';

export interface AdminTopBarProps {
  /** Search bar click handler — typically opens the command palette. */
  onSearchClick?: MouseEventHandler<HTMLDivElement>;
  /** Environment select. */
  env: AdminEnv;
  onEnvChange: (next: AdminEnv) => void;
  /** Density toggle. */
  density: AdminDensity;
  onDensityToggle: () => void;
  /** Theme toggle. */
  theme: AdminTheme;
  onThemeToggle: () => void;
  /** User identity slot (initials chip + caption). */
  user?: ReactNode;
  /** Optional left-of-actions slot for the demo-state preview select. */
  demoSlot?: ReactNode;
  /** Search placeholder text. */
  searchPlaceholder?: string;
}

const ENV_COLOR_MAP: Record<AdminEnv, string> = {
  prod: 'var(--accent)',
  staging: 'var(--info)',
  dev: 'var(--success)',
};

export function AdminTopBar({
  onSearchClick,
  env,
  onEnvChange,
  density,
  onDensityToggle,
  theme,
  onThemeToggle,
  user,
  demoSlot,
  searchPlaceholder = 'search users, orgs, servers, tickets, deploys…',
}: AdminTopBarProps): JSX.Element {
  return (
    <div className="adm-top">
      <div className="adm-search" onClick={onSearchClick} role="button" tabIndex={0}>
        <span style={{ opacity: 0.5 }}>⌕</span>
        <span style={{ flex: 1 }}>{searchPlaceholder}</span>
        <kbd className="mc-kbd">⌘</kbd>
        <kbd className="mc-kbd">K</kbd>
      </div>
      <div className="adm-top-actions">
        <select
          className="adm-env"
          value={env}
          onChange={(e) => onEnvChange(e.target.value as AdminEnv)}
          aria-label="environment"
          style={{
            borderColor: ENV_COLOR_MAP[env],
            color: ENV_COLOR_MAP[env],
          }}
        >
          <option value="prod">prod</option>
          <option value="staging">staging</option>
          <option value="dev">dev</option>
        </select>
        {demoSlot}
        <span
          className="adm-env"
          onClick={onDensityToggle}
          title="toggle density"
          role="button"
          tabIndex={0}
        >
          {density === 'compact' ? '◧ compact' : '◨ comfy'}
        </span>
        <span
          className="adm-env"
          onClick={onThemeToggle}
          title="toggle theme"
          role="button"
          tabIndex={0}
        >
          {theme === 'dark' ? '◐ dark' : '◑ light'}
        </span>
        <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
        {user !== undefined && user !== null ? user : null}
      </div>
    </div>
  );
}
