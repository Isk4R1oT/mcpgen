// apps/web/src/components/admin-ui/status-pill.tsx
//
// Phase 3 / C1 — admin `<StatusPill>` helper.
//
// Source of truth: claude-design-reference/canon/admin/admin-ui.jsx
// (`StatusDotForServer`). Maps a server/region status string onto the
// correct `<Pill kind="…">…</Pill>` so admin screens don't duplicate
// the switch.
//
// Known values (canon): 'live', 'flagged', 'incident', 'suspended',
// 'pending', 'healthy', 'degraded', 'maint', and unknown (default).

import type { JSX } from 'react';

import { Pill, type PillKind } from './pill';

export type ServerStatus =
  | 'live'
  | 'flagged'
  | 'incident'
  | 'suspended'
  | 'pending'
  | 'healthy'
  | 'degraded'
  | 'maint'
  | (string & {});

const STATUS_TO_KIND: Record<string, PillKind> = {
  live: 'ok',
  healthy: 'ok',
  flagged: 'warn',
  degraded: 'warn',
  incident: 'alert',
  suspended: 'alert',
  pending: 'info',
  maint: 'info',
};

export interface StatusPillProps {
  status: ServerStatus;
  className?: string;
}

export function StatusPill({ status, className }: StatusPillProps): JSX.Element {
  const kind: PillKind = STATUS_TO_KIND[status] ?? '';
  if (className !== undefined) {
    return (
      <Pill kind={kind} className={className}>
        {status}
      </Pill>
    );
  }
  return <Pill kind={kind}>{status}</Pill>;
}
