// apps/web/src/app/_not-found-client.tsx
//
// Client island for the App Router custom 404 page. Uses canon utility
// class names (`mc-*`) from the Phase 0 globals.css, whose `:root` block
// statically defines all design tokens (no runtime applyTokens needed).
//
// Navigation uses `useRouter` from `next/navigation` per Next.js 15 App
// Router conventions. The "back home" CTA always pushes to `/`, mirroring
// the canon landing's hero CTA target.

'use client';

import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

export default function NotFoundClient(): ReactElement {
  const router = useRouter();

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
