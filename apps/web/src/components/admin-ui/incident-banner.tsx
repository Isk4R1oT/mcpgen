// apps/web/src/components/admin-ui/incident-banner.tsx
//
// Phase 3 / C1 — admin `<IncidentBanner>` primitive.
//
// Source of truth: claude-design-reference/canon/admin/admin-ui.jsx
// (`IncidentBanner`) + admin.css (`.adm-incident`).
//
// Top-of-screen alert strip. Used by overview/deploys/observability when
// `demoState='incident'` or a real region is degraded. The dismiss button
// is rendered only when `onDismiss` is provided (canon `Btn kind="ghost"`).
//
// We accept an arbitrary `dismissLabel` slot so admin screens can localize
// or substitute the text without rewriting the canon `Btn` import.

import type { JSX, MouseEventHandler, ReactNode } from 'react';

import { Btn } from './btn';

export interface IncidentBannerProps {
  children?: ReactNode;
  onDismiss?: MouseEventHandler<HTMLButtonElement>;
  dismissLabel?: ReactNode;
  className?: string;
}

export function IncidentBanner({
  children,
  onDismiss,
  dismissLabel = 'dismiss',
  className = '',
}: IncidentBannerProps): JSX.Element {
  const cls = ['adm-incident', className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <span className="strong">⚠ incident</span>
      <span style={{ flex: 1 }}>{children}</span>
      {onDismiss ? (
        <Btn kind="ghost" size="sm" onClick={onDismiss}>
          {dismissLabel}
        </Btn>
      ) : null}
    </div>
  );
}
