// apps/web/src/stores/drawer.ts
//
// Foundation Phase 0 — Zustand store backing `<DrawerHost />` + `openDrawer()`.
// Replaces canon `window._mcpRegister('drawer', …)` listener bus from
// `claude-design-reference/canon/ux-glue.jsx:12-19`.
//
// Single-drawer model (canon also supports only one open at a time): a new
// `openDrawer()` call replaces the current payload; `closeDrawer()` clears it.

import type { ReactNode } from 'react';
import { create } from 'zustand';

export interface DrawerOpts {
  /** Small uppercase caption shown above the title. Mirrors canon `opts.eyebrow`. */
  eyebrow?: string;
}

export interface DrawerPayload {
  title: string;
  body: ReactNode;
  opts: DrawerOpts;
}

interface DrawerStore {
  current: DrawerPayload | null;
  open: (payload: DrawerPayload) => void;
  close: () => void;
}

export const useDrawerStore = create<DrawerStore>((set) => ({
  current: null,
  open: (payload: DrawerPayload): void => set({ current: payload }),
  close: (): void => set({ current: null }),
}));
