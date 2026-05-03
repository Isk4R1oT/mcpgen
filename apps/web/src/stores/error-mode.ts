// apps/web/src/stores/error-mode.ts
//
// Zustand replacement for canon `window.MCPGEN_ERROR_BUS` +
// `window.useErrorMode()` from `claude-design-reference/canon/app.jsx:18-34`.
//
// Mirrors the canon hook contract:
//   const [mode, setMode] = useErrorMode();
//
// Zustand-flavored consumer (preferred):
//   const mode = useErrorMode((s) => s.mode);
//   const setMode = useErrorMode((s) => s.setMode);

import { create } from 'zustand';

export type ErrorMode =
  | 'none'
  | 'spec-fail'
  | 'auth-fail'
  | 'deploy-fail'
  | 'rate-limit';

interface ErrorModeStore {
  mode: ErrorMode;
  setMode: (mode: ErrorMode) => void;
}

export const useErrorMode = create<ErrorModeStore>((set) => ({
  mode: 'none',
  setMode: (mode: ErrorMode): void => set({ mode }),
}));
