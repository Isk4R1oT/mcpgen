// apps/web/src/components/anon-banner.tsx
//
// Plan 09.1-07 — Top-of-quality-report disclosure banner. Renders ONLY when
// the caller is anonymous (no Logto session). Composes locked CSS-vars from
// global.css (FE-05 anti-drift) + a tracked sign-up CTA link.
//
// Banner copy is verbatim from CONTEXT D-10:
//   "Free anonymous tier — sign up to deploy permanently or open playground"
//
// Visibility:
//   - loading      → null  (avoid flash)
//   - !isAnonymous → null  (signed-in users get the locked baseline)
//   - isAnonymous  → render banner ABOVE the locked QualityReport screen

'use client';

import type { ReactElement } from 'react';

import { useAnonState } from '@/lib/anon-state';

export function AnonBanner(): ReactElement | null {
  const { isAnonymous, loading } = useAnonState();
  if (loading) return null;
  if (!isAnonymous) return null;

  return (
    <div
      role="status"
      data-testid="anon-banner"
      aria-label="anonymous tier disclosure"
      className="mc-mono"
      style={{
        maxWidth: 1180,
        margin: '24px auto 0',
        padding: '10px 16px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--paper-alt, transparent)',
        color: 'var(--text)',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <span>
        Free anonymous tier — sign up to deploy permanently or open playground
      </span>
      <a
        className="mc-link mc-mono"
        data-testid="anon-banner-signup"
        href="/sign-up"
        style={{ fontSize: 12.5 }}
      >
        sign up free →
      </a>
    </div>
  );
}
