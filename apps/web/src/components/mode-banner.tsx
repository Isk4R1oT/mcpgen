// apps/web/src/components/mode-banner.tsx
//
// Plan 07-03 — fixture-mode banner. Renders a small fixed-position pill
// "Fixture mode — engine not connected" so Friday demos can't accidentally
// claim the engine is live. Composes the locked `Badge` primitive from
// `ui.jsx` (typed via the jsx-bridge); NO new visual primitives.
//
// Renders `null` in production builds AND when MCPGEN_FRONTEND_MODE !== 'fixtures'.

'use client';

import type { ReactElement } from 'react';
import * as React from 'react';

// Read the locked Badge global via the jsx-bridge typed re-exports. The
// loader has already side-effect-imported `@/ui` so window.Badge is set.
type BadgeGlobal = React.ComponentType<{ children?: React.ReactNode; tone?: string }>;

// NEXT_PUBLIC_ vars are inlined at build time; we reference the runtime env
// directly. In dev / preview-fixture builds the var is "fixtures"; in live
// production it is "live" or unset.
const isFixtureMode = (): boolean => {
  if (process.env.NODE_ENV === 'production') {
    // Production builds NEVER show the banner — the env var is meaningless
    // post-build because `process.env` is inlined and the prod deploy sets
    // MCPGEN_FRONTEND_MODE=live (CONTEXT D-16 + T-7-09).
    return false;
  }
  return process.env.MCPGEN_FRONTEND_MODE === 'fixtures';
};

export function ModeBanner(): ReactElement | null {
  if (!isFixtureMode()) return null;

  const Badge = (globalThis as unknown as { Badge?: BadgeGlobal }).Badge;

  return (
    <div
      role="status"
      aria-label="fixture mode banner"
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 50,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        pointerEvents: 'none',
      }}
    >
      {Badge !== undefined ? (
        <Badge tone="warn">fixture mode — engine not connected</Badge>
      ) : (
        <span
          className="mc-mono"
          style={{
            padding: '4px 8px',
            border: '1px solid var(--border)',
            background: 'var(--paper-alt, transparent)',
            color: 'var(--text)',
            borderRadius: 'var(--radius)',
          }}
        >
          fixture mode — engine not connected
        </span>
      )}
    </div>
  );
}
