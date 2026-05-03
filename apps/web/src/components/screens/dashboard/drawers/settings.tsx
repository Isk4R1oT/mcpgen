// apps/web/src/components/screens/dashboard/drawers/settings.tsx
//
// Phase 2 / B2 — Server settings drawer body. Replaces canon
// `window.SettingsBody` from `claude-design-reference/canon/ux-glue.jsx:165-277`.
//
// Backend status: `PATCH /api/v1/deployments/:id/settings` is missing
// (catalog § dashboard, "Settings save"). Flag-gated via
// `ui_dashboard_settings_perm` (OFF by default → save shows toast only,
// no real persist).

'use client';

import { useState, type ReactElement } from 'react';

import { Badge, Btn, Icon } from '@/components/ui';
import { toast } from '@/lib/toast';

export interface SettingsBodyProps {
  readonly serverName: string;
}

type RegionId = 'multi' | 'eu' | 'us';
type VisibilityId = 'private' | 'unlisted' | 'public';

const REGION_OPTIONS: ReadonlyArray<readonly [RegionId, string, string]> = [
  ['multi', 'multi-region · cdg, sfo, sin', 'lowest p95 globally · default'],
  ['eu', 'europe only · cdg, fra', 'data residency for EU customers'],
  ['us', 'us only · sfo, iad', 'closest to upstream lumen api'],
];

const VISIBILITY_OPTIONS: ReadonlyArray<
  readonly [VisibilityId, string, string]
> = [
  [
    'private',
    'private',
    'only you and invited teammates can install or call this server',
  ],
  [
    'unlisted',
    'unlisted · link only',
    'anyone with the link can install · not shown in marketplace',
  ],
  [
    'public',
    'public · listed in marketplace',
    'discoverable to everyone · counts toward trending',
  ],
];

const DANGER_ROWS: ReadonlyArray<
  readonly [string, string, string, () => void]
> = [
  [
    'transfer ownership',
    'move this server to another teammate',
    'transfer',
    (): void => toast('transfer email sent · awaiting accept'),
  ],
  [
    'archive',
    'pauses traffic, keeps config & history',
    'archive',
    (): void => toast('server archived · agents will receive 503'),
  ],
  [
    'delete forever',
    'irreversible · revokes all credentials',
    'delete',
    (): void =>
      toast('hold to confirm · type the name to delete', { kind: 'warn' }),
  ],
];

export function SettingsBody({ serverName }: SettingsBodyProps): ReactElement {
  const [region, setRegion] = useState<RegionId>('multi');
  const [pin, setPin] = useState<boolean>(false);
  const [visibility, setVisibility] = useState<VisibilityId>('private');

  const handleVisibilityChange = (next: VisibilityId): void => {
    const prev = visibility;
    setVisibility(next);
    if (next === 'public' && prev !== 'public') {
      toast('publishing to marketplace · review queue ~24h');
    } else if (prev === 'public' && next !== 'public') {
      toast(`switched to ${next} · removed from marketplace`, { kind: 'warn' });
    } else {
      toast(`visibility: ${next}`);
    }
  };

  return (
    <div className="col" style={{ gap: 22 }}>
      <div>
        <div className="mc-caption-up" style={{ marginBottom: 8 }}>
          identity
        </div>
        <div className="mc-cred-row" style={{ marginBottom: 0 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{serverName}</div>
            <div
              className="mc-mono muted"
              style={{ fontSize: 11.5 }}
            >
              created 12 days ago · v1.2.0 · owner kira@team.dev
            </div>
          </div>
          <Btn
            kind="ghost"
            size="sm"
            icon="copy"
            onClick={(): void => {
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                void navigator.clipboard.writeText(serverName);
              }
              toast('id copied');
            }}
          >
            copy id
          </Btn>
        </div>
      </div>

      <div>
        <div className="mc-caption-up" style={{ marginBottom: 8 }}>
          edge regions
        </div>
        <div className="col" style={{ gap: 6 }}>
          {REGION_OPTIONS.map(([id, label, desc]) => (
            <div
              key={id}
              className={`mc-radio-row ${region === id ? 'sel' : ''}`}
              onClick={(): void => setRegion(id)}
            >
              <span className="mc-radio-glyph">
                {region === id ? '◉' : '○'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mc-caption-up" style={{ marginBottom: 8 }}>
          spec drift
        </div>
        <label
          className="row"
          style={{
            gap: 10,
            padding: '12px 14px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={pin}
            onChange={(e): void => setPin(e.target.checked)}
          />
          <span className="glyph">{pin ? '☑' : '☐'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              pause auto-checks while pinned
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              useful during release windows
            </div>
          </div>
        </label>
      </div>

      <div>
        <div className="mc-caption-up" style={{ marginBottom: 8 }}>
          visibility
        </div>
        <div className="col" style={{ gap: 6 }}>
          {VISIBILITY_OPTIONS.map(([id, label, desc]) => (
            <div
              key={id}
              className={`mc-radio-row ${visibility === id ? 'sel' : ''}`}
              onClick={(): void => handleVisibilityChange(id)}
            >
              <span className="mc-radio-glyph">
                {visibility === id ? '◉' : '○'}
              </span>
              <div style={{ flex: 1 }}>
                <div
                  className="row"
                  style={{ gap: 8, alignItems: 'center' }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
                  {id === 'public' && visibility === 'public' && (
                    <Badge kind="success" mono={false}>
                      live
                    </Badge>
                  )}
                  {id === 'private' && visibility === 'private' && (
                    <Badge kind="soft" mono={false}>
                      current
                    </Badge>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {desc}
                </div>
              </div>
            </div>
          ))}
        </div>
        {visibility !== 'private' && (
          <div
            className="mc-banner"
            style={{ marginTop: 8, fontSize: 11.5 }}
          >
            <Icon name="warn" size={11} />
            <span>
              shareable link:{' '}
              <span className="mc-mono">
                mcpgen.app/i/{serverName.replace(/-mcp$/, '')}
              </span>
            </span>
            <a
              className="mc-link mc-mono"
              style={{
                marginLeft: 'auto',
                cursor: 'pointer',
                fontSize: 11,
              }}
              onClick={(): void => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(
                    `https://mcpgen.app/i/${serverName.replace(/-mcp$/, '')}`,
                  );
                }
                toast('install link copied');
              }}
            >
              copy →
            </a>
          </div>
        )}
      </div>

      <div>
        <div
          className="mc-caption-up"
          style={{ marginBottom: 8, color: 'var(--accent)' }}
        >
          danger zone
        </div>
        <div
          style={{
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius)',
          }}
        >
          {DANGER_ROWS.map(([title, desc, btn, fn], i) => (
            <div
              key={title}
              className="row-bw"
              style={{
                padding: '12px 14px',
                borderBottom:
                  i < DANGER_ROWS.length - 1
                    ? '1px solid var(--accent)'
                    : 'none',
                gap: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {desc}
                </div>
              </div>
              <Btn kind="ghost" size="sm" onClick={fn}>
                {btn}
              </Btn>
            </div>
          ))}
        </div>
      </div>

      <div
        className="row"
        style={{
          gap: 8,
          justifyContent: 'flex-end',
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
        }}
      >
        <Btn
          kind="ink"
          size="sm"
          icon="check"
          onClick={(): void =>
            toast('settings saved · region changes roll out in ~30s')
          }
        >
          save changes
        </Btn>
      </div>
    </div>
  );
}
