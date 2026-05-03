// apps/web/src/lib/drawer.tsx
//
// Foundation Phase 0 — Vaul wrapper that replicates canon `window.mcpDrawer`
// from `claude-design-reference/canon/ux-glue.jsx:12-19, 56-89`.
//
// Canon contract:
//   window.mcpDrawer(title: string, body: ReactNode, opts?: { eyebrow?: string })
//
// Style invariant (CONTEXT D-01/D-07): right-edge sheet (`direction="right"`),
// 480px wide / 92vw cap, full viewport height, canon CSS vars (`--card`,
// `--border-sharp`, `--border`, etc.), header with eyebrow + h2 + close button,
// scrollable body. We do NOT redesign — vaul provides the open/close machinery,
// the visual is the canon `.mc-card` + custom inline styles preserved verbatim.
//
// Usage:
//   import { openDrawer, DrawerHost } from '@/lib/drawer';
//   <DrawerHost />            // mount once in root layout
//   openDrawer('access log', <AccessLogBody />, { eyebrow: 'audit' });

'use client';

import type { ReactElement, ReactNode } from 'react';
import { Drawer as VaulDrawer } from 'vaul';

import { useDrawerStore, type DrawerOpts } from '@/stores/drawer';

export type { DrawerOpts } from '@/stores/drawer';

/**
 * Programmatic API mirroring canon `window.mcpDrawer(title, body, opts)`.
 * Pushes a payload into the drawer store; `<DrawerHost />` renders it.
 */
export function openDrawer(
  title: string,
  body: ReactNode,
  opts: DrawerOpts = {},
): void {
  useDrawerStore.getState().open({ title, body, opts });
}

/** Imperative close — primarily for tests / explicit programmatic dismissal. */
export function closeDrawer(): void {
  useDrawerStore.getState().close();
}

/**
 * Mount once in the root layout. Subscribes to the drawer store and renders
 * the canon-styled right-edge sheet whenever `current` is non-null.
 */
export function DrawerHost(): ReactElement {
  const current = useDrawerStore((s) => s.current);
  const close = useDrawerStore((s) => s.close);

  const isOpen = current !== null;

  return (
    <VaulDrawer.Root
      direction="right"
      open={isOpen}
      onOpenChange={(next: boolean): void => {
        if (!next) close();
      }}
    >
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay
          className="mc-modal-veil"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
          }}
        />
        <VaulDrawer.Content
          className="mc-card"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 480,
            maxWidth: '92vw',
            height: '100vh',
            background: 'var(--card)',
            borderLeft: '1px solid var(--border-sharp)',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 0,
            zIndex: 101,
            outline: 'none',
          }}
        >
          {/* a11y: vaul/radix requires a Title for screen readers. */}
          <VaulDrawer.Title style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
            {current?.title ?? ''}
          </VaulDrawer.Title>
          {current !== null ? (
            <>
              <div
                style={{
                  padding: '20px 24px 14px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <div>
                  <div className="mc-caption-up">
                    {current.opts.eyebrow ?? 'details'}
                  </div>
                  <div className="mc-h2" style={{ marginTop: 2 }}>
                    {current.title}
                  </div>
                </div>
                <button
                  type="button"
                  className="mc-btn mc-btn-ghost mc-btn-sm"
                  onClick={close}
                  style={{ padding: '0 8px' }}
                  aria-label="close drawer"
                >
                  ×
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '20px 24px',
                }}
              >
                {current.body}
              </div>
            </>
          ) : null}
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  );
}
