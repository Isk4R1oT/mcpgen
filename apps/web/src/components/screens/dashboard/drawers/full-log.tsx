// apps/web/src/components/screens/dashboard/drawers/full-log.tsx
//
// Phase 2 / B2 — Activity log drawer body. Replaces canon
// `window.FullLogBody` from `claude-design-reference/canon/ux-glue.jsx:125-163`.
//
// Backend status: `GET /api/v1/deployments/:id/activity` is missing
// (catalog § dashboard, "Activity log"). Until it lands the drawer renders
// the canon seed rows verbatim — flag-gated via `ui_dashboard_activity_perm`
// (OFF by default → seeded data shown). The chip filters are visual only.

'use client';

import type { ReactElement } from 'react';

import { Btn } from '@/components/ui';
import { toast } from '@/lib/toast';

export interface FullLogBodyProps {
  readonly serverName: string;
}

const SEED_ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  ['12:42:31', 'list_charges', '218 tk · 240 ms', 'claude desktop'],
  ['12:42:28', 'list_charges', '218 tk · 232 ms', 'claude desktop'],
  ['12:38:11', 'order_lifecycle', '320 tk · 412 ms', 'cursor'],
  ['12:21:04', 'find_customer', '156 tk · 198 ms', 'claude desktop'],
  ['12:18:02', 'list_charges', '218 tk · 245 ms', 'cline'],
  ['12:14:50', 'refund_charge', '180 tk · 280 ms', 'claude desktop'],
  ['12:11:33', 'list_plans', '142 tk · 188 ms', 'claude desktop'],
  ['12:08:21', 'create_charge', '298 tk · 352 ms', 'cursor'],
  ['12:04:09', 'list_charges', '218 tk · 240 ms', 'claude desktop'],
  ['11:58:44', 'order_lifecycle', '320 tk · 408 ms', 'cursor'],
];

export function FullLogBody(_: FullLogBodyProps): ReactElement {
  return (
    <div>
      <div
        className="row"
        style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}
      >
        <button
          type="button"
          className="mc-chip active"
          style={{ height: 26, fontSize: 11 }}
        >
          all · 12,840
        </button>
        <button
          type="button"
          className="mc-chip"
          style={{ height: 26, fontSize: 11 }}
        >
          errors · 24
        </button>
        <button
          type="button"
          className="mc-chip"
          style={{ height: 26, fontSize: 11 }}
        >
          slow (&gt;500ms) · 138
        </button>
      </div>
      <input
        className="mc-input mc-mono"
        placeholder="filter · tool, agent, status…"
        style={{ marginBottom: 12, fontSize: 12, height: 32 }}
      />
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        {SEED_ROWS.map((r, i) => (
          <div
            key={`${r[0]}-${i}`}
            className="row"
            style={{
              gap: 12,
              padding: '8px 12px',
              borderBottom:
                i < SEED_ROWS.length - 1 ? '1px solid var(--border)' : 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
            }}
          >
            <span className="muted" style={{ minWidth: 64 }}>
              {r[0]}
            </span>
            <span style={{ minWidth: 130 }}>{r[1]}</span>
            <span className="muted" style={{ flex: 1 }}>
              {r[2]}
            </span>
            <span className="muted">{r[3]}</span>
          </div>
        ))}
      </div>
      <div
        className="muted mc-mono"
        style={{ fontSize: 11, marginTop: 10, textAlign: 'center' }}
      >
        showing 10 of 12,840 · scroll loads more
      </div>
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Btn
          kind="ghost"
          size="sm"
          icon="doc"
          onClick={(): void => toast('jsonl export started · 12,840 rows')}
        >
          export jsonl
        </Btn>
        <Btn
          kind="ghost"
          size="sm"
          onClick={(): void => toast('opening grafana dashboard…')}
        >
          open in grafana
        </Btn>
      </div>
    </div>
  );
}
