// apps/web/src/components/dev/error-mode-switch.tsx
//
// Foundation Phase 0 — Dev-only floating error-mode switch. Production version
// of canon `ErrorDemoSwitch` from
// `claude-design-reference/canon/app.jsx:36-99`.
//
// Visual is preserved verbatim (CLAUDE.md §12 rule 15 — UI is locked, only
// the state plumbing changes from `window.useErrorMode()` → Zustand store at
// `apps/web/src/stores/error-mode.ts`).
//
// Two gates per Phase 0 brief:
//   1. `process.env.NODE_ENV !== 'production'` — Next.js bundles this constant
//      into client builds, so production tree-shakes the entire component out.
//   2. `ui_tweaks_panel_perm` flag — evaluated server-side by the parent layout
//      and passed down via the `enabled` prop. Same gate as the tweaks panel.
//
// If either gate is false, the component renders `null`.

'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import { useErrorMode, type ErrorMode } from '@/stores/error-mode';

interface Props {
  /** Result of `evaluateBooleanFlag('ui_tweaks_panel_perm', …)` from the parent layout. */
  enabled: boolean;
  /** Display label tail, e.g. ['stream', 'quality', 'deploy']. */
  screens?: readonly string[];
}

const OPTIONS: ReadonlyArray<readonly [ErrorMode, string]> = [
  ['none', 'happy path'],
  ['spec-fail', 'spec parse fails'],
  ['auth-fail', 'auth probe fails'],
  ['deploy-fail', 'deploy crashes'],
  ['rate-limit', 'rate limited'],
];

export default function ErrorModeSwitch({
  enabled,
  screens = ['stream', 'quality', 'deploy'],
}: Props): ReactElement | null {
  const mode = useErrorMode((s) => s.mode);
  const setMode = useErrorMode((s) => s.setMode);
  const [open, setOpen] = useState<boolean>(false);

  // Production tree-shake gate.
  if (process.env.NODE_ENV === 'production') return null;
  // Flag gate — owner is parent layout.
  if (!enabled) return null;

  const current: readonly [ErrorMode, string] =
    OPTIONS.find((o) => o[0] === mode) ?? ['none', 'happy path'];

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 60,
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
      }}
    >
      {open ? (
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 'calc(100% + 6px)',
            background: 'var(--card)',
            border: '1px solid var(--border-sharp)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)',
            minWidth: 200,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              fontSize: 10,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              borderBottom: '1px solid var(--border)',
            }}
          >
            demo error states
          </div>
          {OPTIONS.map(([id, label]) => (
            <div
              key={id}
              onClick={(): void => {
                setMode(id);
                setOpen(false);
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: mode === id ? 'var(--ink)' : 'transparent',
                color: mode === id ? 'var(--paper)' : 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: id === 'none' ? 'var(--success)' : 'var(--accent)',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {label}
            </div>
          ))}
          <div
            style={{
              padding: '6px 12px',
              fontSize: 10,
              color: 'var(--text-muted)',
              borderTop: '1px solid var(--border)',
            }}
          >
            applies to: {screens.join(' · ')}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={(): void => setOpen((o) => !o)}
        style={{
          padding: '8px 12px',
          background: mode === 'none' ? 'var(--card)' : 'var(--accent)',
          color: mode === 'none' ? 'var(--text)' : '#fff',
          border: '1px solid var(--border-sharp)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: mode === 'none' ? 'var(--success)' : '#fff',
            display: 'inline-block',
          }}
        />
        error: {current[1]}
      </button>
    </div>
  );
}
