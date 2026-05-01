// apps/web/src/components/anon-signup-cta.tsx
//
// Plan 09.1-07 — Footer sign-up CTA on the preview screen per CONTEXT D-10.
// Shown ONLY when the caller is anonymous; nudges signup to unlock download +
// playground (the two routes gated by middleware in plan 09.1-07 task 1).
//
// Copy verbatim from CONTEXT D-10:
//   "Want to download / use playground? Sign up free →"

'use client';

import type { ReactElement } from 'react';

import { useAnonState } from '@/lib/anon-state';

export function AnonSignupCta(): ReactElement | null {
  const { isAnonymous, loading } = useAnonState();
  if (loading) return null;
  if (!isAnonymous) return null;

  return (
    <div
      data-testid="signup-cta"
      role="complementary"
      aria-label="signup prompt"
      className="mc-mono"
      style={{
        maxWidth: 1180,
        margin: '24px auto 32px',
        padding: '12px 16px',
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
      <span>Want to download / use playground? Sign up free →</span>
      <a
        className="mc-link mc-mono"
        data-testid="signup-cta-link"
        href="/sign-up"
        style={{ fontSize: 12.5 }}
      >
        sign up
      </a>
    </div>
  );
}
