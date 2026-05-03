// apps/web/src/lib/toast.ts
//
// Foundation Phase 0 — Sonner wrapper that replicates canon `window.mcpToast`
// from `claude-design-reference/canon/ux-glue.jsx:8-10`.
//
// Canon contract:
//   window.mcpToast(msg: string, opts?: { kind?: 'info' | 'warn' | 'error'; icon?: string })
//
// Default kind is 'info'. Canon ToastHost styles success vs warn vs error via
// a colored dot; we map onto sonner's typed variants and forward `icon` so
// canon callsites that pass a glyph still get something rendered.
//
// Usage:
//   import { toast, Toaster } from '@/lib/toast';
//   toast('settings saved', { kind: 'info' });
//
// Mount `<Toaster />` once in the root layout (apps/web/src/app/layout.tsx).

import { toast as sonnerToast, Toaster as SonnerToaster } from 'sonner';
import type { ReactNode } from 'react';

export type ToastKind = 'info' | 'warn' | 'error';

export interface ToastOptions {
  /** Mirrors canon `opts.kind`. Defaults to `'info'`. */
  kind?: ToastKind;
  /** Mirrors canon `opts.icon` — a glyph or `<Icon name=… />` ReactNode. */
  icon?: ReactNode;
}

const KIND_DURATION_MS = 3200; // matches canon `setTimeout(..., 3200)`

function toast(msg: string, opts: ToastOptions = {}): void {
  const { kind = 'info', icon } = opts;

  const sonnerOpts = {
    duration: KIND_DURATION_MS,
    icon,
  };

  switch (kind) {
    case 'warn':
      sonnerToast.warning(msg, sonnerOpts);
      return;
    case 'error':
      sonnerToast.error(msg, sonnerOpts);
      return;
    case 'info':
    default:
      sonnerToast(msg, sonnerOpts);
      return;
  }
}

export { toast, SonnerToaster as Toaster };
