// apps/web/src/app/_not-found-client.tsx
//
// Phase 9.2 E2E fix — client island for the App Router custom 404 page.
//
// We dynamic-import the canon UI loader the same way `_apply-tokens.tsx`
// does, so the global CSS variables (`--paper`, `--ink`, `--font-sans`,
// `--scale`, ...) referenced by the locked `global.css` resolve before
// paint. Without this the page would still render the canon utility
// classes but with `var(--paper)` falling back to the browser default.
//
// The view itself uses ONLY locked utility class names from
// `apps/web/src/global.css` (`mc-screen`, `mc-grain`, `mc-display-xl`,
// `mc-mono`, `mc-btn`, `mc-btn-primary`, `mc-link`). No new CSS rules,
// no edits to canon JSX.
//
// Navigation uses `useRouter` from `next/navigation` per Next.js 15 App
// Router conventions. The "back home" CTA always pushes to `/`, mirroring
// the locked landing's hero CTA target.

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactElement } from 'react';

import { applyTokens } from '@/lib/jsx-bridge';

export default function NotFoundClient(): ReactElement {
  const router = useRouter();

  // Same effect as `_apply-tokens.tsx`: hydrate window.MCPTokens-derived
  // CSS variables on <html> so the locked design tokens resolve before
  // first paint. Safe to run independently of the layout's own
  // <ApplyTokens /> instance because both write to the same root element.
  useEffect(() => {
    const vars = applyTokens();
    const root = document.documentElement;
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
  }, []);

  return (
    <main
      className="mc-screen mc-grain"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        gap: '24px',
        textAlign: 'center',
      }}
    >
      <div className="mc-mono" style={{ fontSize: '12px', opacity: 0.7 }}>
        404
      </div>
      <h1 className="mc-display-xl" style={{ margin: 0 }}>
        page not found
      </h1>
      <p className="mc-mono" style={{ fontSize: '13px', maxWidth: '420px', opacity: 0.8 }}>
        the page you&apos;re looking for doesn&apos;t exist or is not available.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          className="mc-btn mc-btn-primary mc-btn-lg"
          onClick={(): void => {
            router.push('/');
          }}
        >
          <span>back home</span>
        </button>
        <a className="mc-link mc-mono" href="/generate">
          start a new generation
        </a>
      </div>
    </main>
  );
}
