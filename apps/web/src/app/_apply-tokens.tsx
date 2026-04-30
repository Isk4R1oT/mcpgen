// apps/web/src/app/_apply-tokens.tsx
//
// Plan 07-02 — Client island that calls applyTokens() once on mount and
// applies the resulting CSS-var map to <html>. The locked global.css
// references vars (--paper, --ink, --font-sans, --scale, etc.) that are
// populated by `window.MCPTokens.makeCssVars(TWEAK_DEFAULTS)`.
//
// Reference: .planning/phases/07-frontend-wire-up/07-RESEARCH.md Open Q #2
// (RESOLVED): bridge re-exports applyTokens(); the layout calls it client-side.

'use client';

import { useEffect } from 'react';

import { applyTokens } from '@/lib/jsx-bridge';

export default function ApplyTokens(): null {
  useEffect(() => {
    const vars = applyTokens();
    const root = document.documentElement;
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
  }, []);
  return null;
}
