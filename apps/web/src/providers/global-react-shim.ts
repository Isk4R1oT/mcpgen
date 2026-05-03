// apps/web/src/providers/global-react-shim.ts
//
// CRITICAL: the locked canon `apps/web/src/i18n.jsx` (and other canon
// JSX files) reference `React.createContext`, `React.useState`, etc.
// without an explicit `import React from 'react'` — they were designed
// for the standalone HTML preview where React is loaded via a global
// <script> tag.
//
// In Next.js SSR the runtime evaluates these modules without that
// global. We provide it here. This file is imported BEFORE any canon
// JSX side-effect import (see providers/i18n-provider.tsx + jsx-bridge
// loader). ESM module evaluation order ensures `globalThis.React` is
// set before the next import's body runs.
//
// I-1 invariant satisfied: we do NOT modify any canon file. This shim
// lives entirely in our wiring layer.

import * as React from 'react';
import * as ReactDOM from 'react-dom';

const g = globalThis as {
  React?: typeof React;
  ReactDOM?: typeof ReactDOM;
};

if (g.React === undefined) g.React = React;
if (g.ReactDOM === undefined) g.ReactDOM = ReactDOM;

// Canon JSX modules also do `Object.assign(window, {...})` to expose
// hooks/components for legacy SPA loading. Server-side `window` is
// undefined; alias it to globalThis so those side-effects no-op safely.
// Also stub the most-referenced `window.location` shape so destructuring
// like `const { protocol, host } = window.location` doesn't throw on
// initial SSR render. Real values arrive on hydration.
type WindowShim = typeof globalThis & {
  location?: {
    protocol: string;
    host: string;
    hostname: string;
    href: string;
    origin: string;
    pathname: string;
    search: string;
    hash: string;
  };
  localStorage?: { getItem: (k: string) => null; setItem: () => void; removeItem: () => void };
};
const gAny = globalThis as { window?: WindowShim };
if (gAny.window === undefined) gAny.window = globalThis as WindowShim;
if (gAny.window.location === undefined) {
  gAny.window.location = {
    protocol: 'http:',
    host: 'localhost:3000',
    hostname: 'localhost',
    href: 'http://localhost:3000/',
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: '',
  };
}
if (gAny.window.localStorage === undefined) {
  gAny.window.localStorage = {
    getItem: (): null => null,
    setItem: (): void => {},
    removeItem: (): void => {},
  };
}
