// apps/web/src/components/screens/dashboard/drawers/versions.tsx
//
// Phase 2 / B2 — Versions / rollback drawer body. Replaces canon
// `window.VersionsBody` from `claude-design-reference/canon/ux-glue.jsx:279-304`.
//
// Backend status: `GET/POST /api/v1/deployments/:id/versions` is missing
// (catalog § dashboard, "Versions list / rollback"). Until it lands the
// drawer renders the canon seed versions verbatim and rollback shows a
// toast — flag-gated via `ui_dashboard_versions_perm` (OFF by default).

'use client';

import type { ReactElement } from 'react';

import { Badge, Btn } from '@/components/ui';
import { toast } from '@/lib/toast';

export interface VersionsBodyProps {
  readonly serverName: string;
}

interface VersionRow {
  readonly v: string;
  readonly date: string;
  readonly note: string;
  readonly active: boolean;
}

const SEED_VERSIONS: ReadonlyArray<VersionRow> = [
  { v: 'v1.2.0', date: 'now', note: 'current · 3 new tools', active: true },
  {
    v: 'v1.1.0',
    date: '12 days',
    note: 'order_lifecycle composite',
    active: false,
  },
  {
    v: 'v1.0.0',
    date: '2 months',
    note: 'initial release',
    active: false,
  },
];

export function VersionsBody(_: VersionsBodyProps): ReactElement {
  return (
    <div>
      <div
        className="muted mc-mono"
        style={{ fontSize: 12, marginBottom: 14 }}
      >
        every regen creates an immutable version. you can pin or roll back at
        any time.
      </div>
      {SEED_VERSIONS.map((v) => (
        <div
          key={v.v}
          className="row"
          style={{
            padding: '12px 14px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            marginBottom: 8,
            gap: 12,
          }}
        >
          <span
            className="mc-mono"
            style={{ fontSize: 13, fontWeight: 600, minWidth: 56 }}
          >
            {v.v}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13 }}>{v.note}</div>
            <div className="muted mc-mono" style={{ fontSize: 11 }}>
              {v.date} ago
            </div>
          </div>
          {v.active ? (
            <Badge kind="success" mono={false}>
              live
            </Badge>
          ) : (
            <Btn
              kind="ghost"
              size="sm"
              icon="undo"
              onClick={(): void =>
                toast(`rolled back to ${v.v} · zero downtime`)
              }
            >
              roll back
            </Btn>
          )}
        </div>
      ))}
    </div>
  );
}
