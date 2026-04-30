// CLIENT-ONLY. Only imported via `next/dynamic({ ssr: false })`. Exposes
// globalThis.React + ReactDOM, then side-effect-imports tokens.jsx → ui.jsx
// → all 9 screen-*.jsx files in dependency order.
//
// Pitfall 5: DO NOT side-effect-import `@/app` — its top level calls
// `ReactDOM.createRoot()` which would fight Next's hydration root.
// Open Q #1 (RESOLVED): DO NOT side-effect-import `@/tweaks-panel` — it's a
// dev harness only; production paths never post `__edit_mode_*` messages.
// Open Q #2 (RESOLVED): we re-export TWEAK_DEFAULTS + applyTokens() so the
// App layout (Plan 07-02) can call window.MCPTokens.makeCssVars(TWEAK_DEFAULTS)
// once and apply CSS vars to <html>.

'use client';

import * as React from 'react';
import * as ReactDOM from 'react-dom/client';

// Expose React + ReactDOM on globalThis BEFORE any locked JSX evaluates.
// Locked JSX uses `React.useState(...)` and `ReactDOM.createRoot(...)` as
// globals, inherited from the prototype's UMD harness in MCPGen.html.
if (typeof window !== 'undefined') {
  // Expose UMD-style globals to the locked JSX. Conceptually this is
  //   globalThis.React = React;
  //   globalThis.ReactDOM = ReactDOM;
  // We narrow `globalThis` to a mutable shape so the assignment type-checks
  // under strict mode without relying on @ts-expect-error (which TS 6 reports
  // as unused once the cast matches the global lib types).
  const g = globalThis as unknown as { React: typeof React; ReactDOM: typeof ReactDOM };
  g.React = React;
  g.ReactDOM = ReactDOM;
}

// Import order matches MCPGen.html <script> sequence:
//   tokens.jsx → ui.jsx → screen-*.jsx
// Each side-effect import runs `window.<Symbol> = <Symbol>` assignments at
// file end (verified for all 9 screens + ui.jsx + tokens.jsx in Plan 07-01).
import '@/tokens';                    // sets window.MCPTokens
import '@/ui';                        // defines Btn, TopBar, Icon, Badge, etc. (globals)
import '@/screen-landing';            // sets window.Landing + window.SAMPLE_APIS
import '@/screen-auth';               // sets window.AuthScreen
import '@/screen-canvas';             // sets window.Canvas
import '@/screen-stream';             // sets window.StreamLog
import '@/screen-playground';         // sets window.Playground
import '@/screen-preview';            // sets window.Preview
import '@/screen-quality';            // sets window.QualityReport
import '@/screen-deploy';             // sets window.Deploy + window.DeploySuccess
import '@/screen-dashboard';          // sets window.Dashboard

// TWEAK_DEFAULTS — copied verbatim from apps/web/src/app.jsx line 3 EDITMODE
// block. The locked global.css references CSS vars (--paper, --ink, --text,
// --font-sans, --scale, etc.) populated by window.MCPTokens.makeCssVars(t).
// The App layout (Plan 07-02) calls applyTokens() once on mount.
export const TWEAK_DEFAULTS = {
  palette: 'A',
  fonts: 'pp',
  borders: 'soft',
  shadows: 'block',
  case: 'lower',
  density: 'compact',
  bg: 'paper',
} as const;

export type TweakDefaults = typeof TWEAK_DEFAULTS;

// applyTokens — calls window.MCPTokens.makeCssVars(TWEAK_DEFAULTS) and returns
// the resulting `Record<string, string>` of CSS-var name → value. Caller (the
// app/layout.tsx in Plan 07-02) spreads the map onto <html style={{...}}>.
export function applyTokens(): Record<string, string> {
  // Type-guarded access to the window global set by side-effect import of @/tokens.
  const mcpTokens = (
    globalThis as unknown as {
      MCPTokens?: { makeCssVars: (t: TweakDefaults) => Record<string, string> };
    }
  ).MCPTokens;
  if (mcpTokens === undefined) {
    throw new Error(
      'lib/jsx-bridge/loader: window.MCPTokens not set. The loader must run before applyTokens().',
    );
  }
  return mcpTokens.makeCssVars(TWEAK_DEFAULTS);
}
