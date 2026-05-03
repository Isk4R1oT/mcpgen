// apps/web/src/components/screens/dashboard/drawers/access-log.tsx
//
// Phase 2 / B2 — Per-credential access log drawer body. Replaces canon
// `window.AccessLogBody` from
// `claude-design-reference/canon/ux-glue.jsx:92-122`.
//
// Backend status: `GET /api/v1/credentials/:id/access-log` is missing
// (catalog § dashboard). Until it lands the drawer renders the canon seed
// rows verbatim — flag-gated via `ui_dashboard_credentials_perm` (OFF by
// default → seeded data shown).

'use client';

import type { ReactElement } from 'react';

import { Btn } from '@/components/ui';
import { toast } from '@/lib/toast';

export interface AccessLogBodyProps {
  readonly keyName: string;
}

interface AccessRow {
  readonly t: string;
  readonly who: string;
  readonly act: string;
  readonly via: string;
  readonly ip: string;
}

const SEED_ROWS: ReadonlyArray<AccessRow> = [
  {
    t: '12:42 utc · 3 min',
    who: 'agent · claude desktop · v0.7.2',
    act: 'list_charges',
    via: 'jana@team.dev',
    ip: '10.0.4.21',
  },
  {
    t: '12:38 utc · 7 min',
    who: 'agent · cursor · v0.42',
    act: 'order_lifecycle',
    via: 'jana@team.dev',
    ip: '10.0.4.21',
  },
  {
    t: '12:21 utc · 24 min',
    who: 'agent · claude desktop',
    act: 'find_customer',
    via: 'jana@team.dev',
    ip: '10.0.4.21',
  },
  {
    t: '11:54 utc · 51 min',
    who: 'system · drift check',
    act: 'verify',
    via: 'mcpgen worker',
    ip: 'edge-cdg',
  },
  {
    t: '08:02 utc · 4 hr',
    who: 'agent · cline · v1.4',
    act: 'refund_charge',
    via: 'kira@team.dev',
    ip: '74.125.x.x',
  },
];

export function AccessLogBody({ keyName }: AccessLogBodyProps): ReactElement {
  return (
    <div>
      <div
        className="mc-mono muted"
        style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}
      >
        last 50 uses of{' '}
        <strong style={{ color: 'var(--text)' }}>{keyName}</strong>. for older
        entries, export full audit log.
      </div>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        {SEED_ROWS.map((r, i) => (
          <div
            key={`${r.t}-${i}`}
            style={{
              padding: '10px 14px',
              borderBottom:
                i < SEED_ROWS.length - 1 ? '1px solid var(--border)' : 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
            }}
          >
            <div className="row-bw">
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                {r.act}
              </span>
              <span className="muted">{r.t}</span>
            </div>
            <div className="muted" style={{ marginTop: 3, fontSize: 11 }}>
              {r.who} · ip {r.ip}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              delegated by {r.via}
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Btn
          kind="ghost"
          size="sm"
          icon="doc"
          onClick={(): void => toast('csv export queued · email when ready')}
        >
          export csv
        </Btn>
        <Btn
          kind="ghost"
          size="sm"
          onClick={(): void =>
            toast('alert rule saved · pages on-call on suspicious ip')
          }
        >
          alert on anomalies
        </Btn>
      </div>
    </div>
  );
}
