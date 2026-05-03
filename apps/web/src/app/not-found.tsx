// apps/web/src/app/not-found.tsx
//
// Phase 9.2 E2E fix — Next.js 15 App Router custom 404 page.
//
// The default Next.js 404 stub (a) ignores the locked canon design tokens,
// so the page renders unstyled white-on-white, and (b) throws
// `ReferenceError: React is not defined` because the canon JSX bridge
// installs `globalThis.React` only after `loader.ts` runs in the browser
// — and the stub never imports the bridge.
//
// This server component is the canonical Next.js custom-404 surface
// (`app/not-found.tsx`). It delegates rendering to a thin client island
// (`./_not-found-client`) which dynamic-imports the canon UI loader so the
// global tokens (`mc-screen`, `mc-grain`, `mc-display-xl`, `mc-mono`,
// `mc-btn`, `mc-link`) resolve to the locked design.
//
// IMPORTANT: this file does NOT modify any locked canon JSX. It only adds
// a route-scoped wrapper, per CLAUDE.md §12 rule 16 (canon is locked, only
// wire-up indirection is allowed).
//
// References:
//   - apps/web/src/app/not-found-client.tsx (the client island)
//   - apps/web/src/global.css (mc-* utility classes used by the island)

import type { ReactElement } from 'react';

import NotFoundClient from './_not-found-client';

export default function NotFound(): ReactElement {
  return <NotFoundClient />;
}
