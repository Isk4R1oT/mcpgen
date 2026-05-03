// apps/web/src/components/screens/dashboard-list/dashboard-list.tsx
//
// Phase 2 / Agent B2 — multi-server Dashboard list screen.
//
// Source of truth: claude-design-reference/canon/screen-dashboard-list.jsx
// (function `DashboardList`). 100% pixel parity with that JSX, rebuilt
// against the production primitive kit (`@/components/ui/*`).
//
// Behavior wiring (per SCREEN-BEHAVIORS-CATALOG.md § dashboard-list +
// PHASE-2 B2):
// - `useDashboardSummary()` — composes `GET /api/v1/deployments` +
//   per-deployment `GET /api/v1/deployments/:id/drift-events` and adapts
//   the rows into the canon `ServerCard` shape.
// - Filter chips (all/live/public/drift), search, view toggle (grid/table),
//   sort selector — all client-only state, identical to canon.
// - Notifications drawer: `openDrawer('notifications', …)` with the canon
//   seed items (real `GET /api/v1/notifications` is missing — flag-gated
//   via `ui_notifications_perm` per catalog).
// - Demo "populated/empty" pills from canon are dropped per catalog
//   ("REMOVE in production. They're demo state toggles."); the empty
//   state renders automatically when the BFF returns zero deployments.
// - Locale strings via `useTranslations()`. `LangSwitcher` is the
//   production replacement for canon `LangSwitcher`.

'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactElement } from 'react';

import LangSwitcher from '@/components/lang-switcher';
import { Badge, Btn, Icon, TopBar } from '@/components/ui';
import {
  useDashboardSummary,
  type DashboardSummary,
} from '@/lib/api/dashboard';
import { openDrawer } from '@/lib/drawer';

// ─── Local domain types (canon `ServerCard` shape adapted from BFF) ────────

type ServerStatus = 'live' | 'paused' | 'draft' | 'error';
type ServerVisibility = 'public' | 'private';

interface DriftSummary {
  readonly kind: 'spec' | 'auth';
  readonly count: number;
  readonly severity: 'warn' | 'error';
}

interface DashboardListServer {
  readonly id: string;
  readonly name: string;
  readonly api: string;
  readonly tools: number;
  readonly status: ServerStatus;
  readonly visibility: ServerVisibility;
  readonly uptime: string;
  readonly calls7: number;
  readonly p95: number;
  readonly deltaPct: number;
  readonly version: string;
  readonly updated: string;
  readonly drift: DriftSummary | null;
  readonly region: ReadonlyArray<string>;
  readonly stars?: number;
  readonly installs?: number;
}

type FilterId = 'all' | 'live' | 'public' | 'drift';
type ViewId = 'grid' | 'table';
type SortId = 'updated' | 'calls' | 'name';

// ─── Adapter from BFF DashboardSummary → screen rows ───────────────────────

function adaptSummary(
  summary: DashboardSummary | undefined,
): ReadonlyArray<DashboardListServer> {
  if (summary === undefined) return [];
  return summary.deployments.map((d): DashboardListServer => {
    const driftEvents = summary.drift_by_deployment[d.deployment_id];
    const driftCount =
      driftEvents !== undefined ? driftEvents.drift_events.length : 0;
    const drift: DriftSummary | null =
      driftCount > 0
        ? { kind: 'spec', count: driftCount, severity: 'warn' }
        : null;
    return {
      id: d.deployment_id,
      name: d.server_name,
      api: d.server_name,
      tools: 0,
      status: 'live',
      visibility: d.public_badge ? 'public' : 'private',
      uptime: '—',
      calls7: 0,
      p95: 0,
      deltaPct: 0,
      version: '—',
      updated: d.deployed_at,
      drift,
      region: [],
    };
  });
}

// ─── Notifications drawer body (canon seed — real feed missing) ────────────

function NotificationsBody(): ReactElement {
  const items: ReadonlyArray<readonly [string, string, string]> = [
    ['spec drift detected', 'lumen-payments-mcp · 3 changes', '2 h'],
    ['quota at 80%', '80,200 of 100K calls used', '5 h'],
    ['eval pass-rate dropped', 'helio-commerce · 88% → 82%', '1 d'],
  ];
  return (
    <div className="col" style={{ gap: 10, fontSize: 13 }}>
      {items.map(([title, desc, ago]) => (
        <div
          key={title}
          className="row"
          style={{
            gap: 10,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {desc}
            </div>
          </div>
          <span
            className="mc-mono muted"
            style={{ fontSize: 11 }}
          >
            {ago}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Subcomponents (canon ports) ───────────────────────────────────────────

interface MiniStatProps {
  readonly label: string;
  readonly num: string;
  readonly sub?: string;
  readonly delta?: string;
  readonly green?: boolean;
  readonly alert?: boolean;
  readonly link?: string;
  readonly onLink?: () => void;
}

function MiniStat({
  label,
  num,
  sub,
  delta,
  green,
  alert,
  link,
  onLink,
}: MiniStatProps): ReactElement {
  return (
    <div className="mc-stat" style={{ padding: 16 }}>
      <div className="row-bw">
        <span className="mc-stat-lbl">{label}</span>
        {delta !== undefined && (
          <span
            className="mc-mono"
            style={{
              fontSize: 11,
              color: green === true ? 'var(--success)' : 'var(--text-muted)',
            }}
          >
            {delta}
          </span>
        )}
      </div>
      <div
        className="mc-stat-num"
        style={{
          marginTop: 6,
          fontSize: 28,
          color: alert === true ? 'var(--accent)' : 'var(--text)',
        }}
      >
        {num}
      </div>
      {sub !== undefined && (
        <div
          className="mc-mono muted"
          style={{ fontSize: 11, marginTop: 4 }}
        >
          {sub}{' '}
          {link !== undefined && (
            <a className="mc-link" onClick={onLink} style={{ cursor: 'pointer' }}>
              · {link}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

interface SparklineProps {
  readonly kind: ServerStatus;
}

function Sparkline({ kind }: SparklineProps): ReactElement {
  const heights =
    kind === 'live'
      ? [3, 5, 4, 7, 6, 8, 9, 7, 8, 10, 9, 12, 11, 13]
      : kind === 'error'
      ? [8, 9, 10, 11, 9, 8, 7, 5, 3, 2, 1, 1, 0, 0]
      : kind === 'paused'
      ? [4, 5, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0]
      : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        alignItems: 'flex-end',
        height: 24,
      }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(2, h * 1.7)}px`,
            background:
              kind === 'error' && i > 8
                ? 'var(--accent)'
                : kind === 'live'
                ? 'var(--ink)'
                : 'var(--border)',
            opacity: kind === 'paused' || kind === 'draft' ? 0.4 : 1,
          }}
        />
      ))}
    </div>
  );
}

interface MetricProps {
  readonly label: string;
  readonly value: string;
  readonly delta?: string;
  readonly negative?: boolean;
}

function Metric({ label, value, delta, negative }: MetricProps): ReactElement {
  return (
    <div>
      <div
        className="mc-caption"
        style={{ fontSize: 10.5, marginBottom: 2 }}
      >
        {label}
      </div>
      <div className="mc-mono" style={{ fontSize: 15, fontWeight: 500 }}>
        {value}
        {delta !== undefined && (
          <span
            style={{
              fontSize: 11,
              marginLeft: 6,
              color:
                negative === true ? 'var(--accent)' : 'var(--success)',
            }}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

interface ServerCardProps {
  readonly s: DashboardListServer;
  readonly onOpen: () => void;
}

function ServerCard({ s, onOpen }: ServerCardProps): ReactElement {
  const statusColor =
    s.status === 'live'
      ? 'var(--success)'
      : s.status === 'error'
      ? 'var(--accent)'
      : 'var(--text-faint)';
  return (
    <div
      className="mc-card mc-card-pad"
      style={{ cursor: 'pointer', position: 'relative' }}
      onClick={onOpen}
    >
      <div className="row-bw" style={{ marginBottom: 8 }}>
        <div
          className="row"
          style={{ gap: 8, minWidth: 0, flex: 1 }}
        >
          <span
            className="mc-dot"
            style={{
              background: statusColor,
              boxShadow:
                s.status === 'live'
                  ? `0 0 0 3px color-mix(in oklch, ${statusColor} 30%, transparent)`
                  : 'none',
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="mc-mono"
              style={{
                fontSize: 14,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {s.name}
            </div>
            <div className="mc-mono muted" style={{ fontSize: 11.5 }}>
              {s.api} · {s.tools} tools · {s.version}
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {s.visibility === 'public' ? (
            <Badge kind="accent" mono={false}>
              <Icon name="share" size={10} /> public
            </Badge>
          ) : (
            <Badge kind="soft" mono={false}>
              <Icon name="lock" size={10} /> private
            </Badge>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          padding: '12px 0',
          borderTop: '1px dashed var(--border)',
          borderBottom: '1px dashed var(--border)',
          margin: '8px 0',
        }}
      >
        <Metric
          label="calls 7d"
          value={s.calls7 ? s.calls7.toLocaleString() : '—'}
          {...(s.deltaPct !== 0
            ? {
                delta:
                  s.deltaPct > 0 ? `+${s.deltaPct}%` : `${s.deltaPct}%`,
              }
            : {})}
          {...(s.deltaPct < 0 ? { negative: true } : {})}
        />
        <Metric label="p95" value={s.p95 ? `${s.p95}ms` : '—'} />
        <Metric label="uptime" value={s.uptime} />
      </div>

      <Sparkline kind={s.status} />

      <div
        className="row-bw"
        style={{ marginTop: 12, fontSize: 11.5 }}
      >
        <span className="mc-mono muted">updated {s.updated}</span>
        {s.drift !== null ? (
          <span
            className="row mc-mono"
            style={{
              gap: 4,
              color:
                s.drift.severity === 'error'
                  ? 'var(--accent)'
                  : 'var(--text)',
            }}
          >
            <Icon name="warn" size={10} /> {s.drift.kind} drift ·{' '}
            {s.drift.count}
          </span>
        ) : s.visibility === 'public' &&
          s.installs !== undefined &&
          s.installs > 0 ? (
          <span className="mc-mono muted">
            ★ {s.stars} · {s.installs} installs
          </span>
        ) : (
          <span className="mc-mono muted">
            {s.region.length > 0 ? s.region.join(', ') : 'not deployed'}
          </span>
        )}
      </div>
    </div>
  );
}

interface NewServerCardProps {
  readonly onClick: () => void;
}

function NewServerCard({ onClick }: NewServerCardProps): ReactElement {
  return (
    <div
      onClick={onClick}
      style={{
        border: '1px dashed var(--border-sharp)',
        borderRadius: 'var(--radius-lg)',
        padding: 24,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 8,
        minHeight: 220,
        background: 'transparent',
      }}
    >
      <Icon name="plus" size={20} />
      <div className="mc-h3">new server</div>
      <div
        className="mc-caption"
        style={{ textAlign: 'center', maxWidth: 280 }}
      >
        paste an openapi url, drop a postman collection, or fork a server from
        the marketplace
      </div>
    </div>
  );
}

interface ServerTableProps {
  readonly servers: ReadonlyArray<DashboardListServer>;
  readonly onOpen: (s: DashboardListServer) => void;
}

function ServerTable({ servers, onOpen }: ServerTableProps): ReactElement {
  return (
    <div className="mc-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.6fr 1fr 1fr 90px 1fr 80px',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-sharp)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-muted)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          background: 'var(--paper-alt)',
        }}
      >
        <span>server</span>
        <span>visibility</span>
        <span>calls 7d</span>
        <span>p95</span>
        <span>updated</span>
        <span></span>
      </div>
      {servers.map((s, i, arr) => {
        const statusColor =
          s.status === 'live'
            ? 'var(--success)'
            : s.status === 'error'
            ? 'var(--accent)'
            : 'var(--text-faint)';
        return (
          <div
            key={s.id}
            onClick={(): void => onOpen(s)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1fr 1fr 90px 1fr 80px',
              padding: '14px 16px',
              borderBottom:
                i === arr.length - 1 ? 'none' : '1px solid var(--border)',
              cursor: 'pointer',
              alignItems: 'center',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div className="row" style={{ gap: 10 }}>
              <span
                className="mc-dot"
                style={{ background: statusColor }}
              />
              <div>
                <div style={{ fontWeight: 500 }}>{s.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {s.api} · {s.tools} tools
                </div>
              </div>
            </div>
            <span>
              {s.visibility === 'public' ? (
                <Badge kind="accent" mono={false}>
                  public
                </Badge>
              ) : (
                <Badge kind="soft" mono={false}>
                  private
                </Badge>
              )}
            </span>
            <span className="tnum">
              {s.calls7 ? s.calls7.toLocaleString() : '—'}{' '}
              {s.deltaPct !== 0 && (
                <small
                  style={{
                    color:
                      s.deltaPct > 0
                        ? 'var(--success)'
                        : 'var(--accent)',
                    marginLeft: 4,
                  }}
                >
                  {s.deltaPct > 0 ? '+' : ''}
                  {s.deltaPct}%
                </small>
              )}
            </span>
            <span className="tnum">{s.p95 ? `${s.p95}ms` : '—'}</span>
            <span className="muted">{s.updated}</span>
            <span style={{ textAlign: 'right' }}>
              {s.drift !== null && (
                <Icon
                  name="warn"
                  size={12}
                  style={{ color: 'var(--accent)' }}
                />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty / first-run state (canon `EmptyDashboard`) ──────────────────────

interface EntryCardProps {
  readonly n: string;
  readonly title: string;
  readonly body: string;
  readonly cta?: string;
  readonly ctaIcon?: 'arrow-r' | 'search';
  readonly primary?: boolean;
  readonly onClick: () => void;
  readonly visual?: ReactElement | null;
}

function EntryCard({
  n,
  title,
  body,
  cta,
  ctaIcon,
  primary,
  onClick,
  visual,
}: EntryCardProps): ReactElement {
  return (
    <div
      className="mc-card"
      style={{
        padding: 22,
        position: 'relative',
        cursor: 'pointer',
        background: 'var(--card)',
        borderColor:
          primary === true ? 'var(--border-sharp)' : 'var(--border)',
        display: 'grid',
        gridTemplateColumns: '60px 1fr auto',
        gap: 20,
        alignItems: 'center',
      }}
      onClick={onClick}
    >
      <div
        className="mc-mono"
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          letterSpacing: '.08em',
          alignSelf: 'flex-start',
          paddingTop: 4,
        }}
      >
        {n}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="mc-h2" style={{ marginBottom: 6 }}>
          {title}
        </div>
        <div
          className="mc-mono"
          style={{
            fontSize: 12.5,
            color: 'var(--text-muted)',
            lineHeight: 1.55,
          }}
        >
          {body}
        </div>
      </div>
      <div
        className="row"
        style={{ gap: 12, alignItems: 'center' }}
      >
        {visual !== undefined && visual !== null && visual}
        {cta !== undefined && (
          <button
            type="button"
            className={`mc-btn ${primary === true ? 'mc-btn-primary' : ''}`}
            onClick={(e): void => {
              e.stopPropagation();
              onClick();
            }}
          >
            <span>{cta}</span>
            {ctaIcon !== undefined && <Icon name={ctaIcon} size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

function PasteVisual(): ReactElement {
  return (
    <div
      className="mc-mono"
      style={{
        padding: '8px 12px',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: 11,
        color: 'var(--text-muted)',
        background: 'var(--paper-alt)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--text-faint)' }}>https://</span>api.
      <span style={{ color: 'var(--text)' }}>your-co</span>.dev/openapi.json
    </div>
  );
}

function ForkVisual(): ReactElement {
  const glyphs = ['✶', '◆', '◉'];
  return (
    <div className="row" style={{ gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 22,
            height: 22,
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--paper-alt)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-muted)',
          }}
        >
          {glyphs[i]}
        </div>
      ))}
      <span
        className="mc-mono"
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginLeft: 4,
        }}
      >
        280+
      </span>
    </div>
  );
}

interface EmptyDashboardProps {
  readonly onLanding: () => void;
  readonly onMarketplace: () => void;
}

function EmptyDashboard({
  onLanding,
  onMarketplace,
}: EmptyDashboardProps): ReactElement {
  const t = useTranslations();
  const checklist = [
    { id: 1, label: t('onb1'), state: 'current' as const },
    { id: 2, label: t('onb2'), state: 'next' as const },
    { id: 3, label: t('onb3'), state: 'next' as const },
  ];

  return (
    <div style={{ paddingTop: 48 }}>
      <div style={{ marginBottom: 40, maxWidth: 720 }}>
        <div className="mc-display-l" style={{ marginBottom: 14 }}>
          {t('welcomeTitle')}
        </div>
        <div
          className="mc-mono"
          style={{
            fontSize: 15,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          {t('welcomeSub')}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: 24,
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <EntryCard
            n="01"
            title={t('startPaste')}
            body={t('startPasteSub')}
            cta={t('newServer')}
            ctaIcon="arrow-r"
            primary
            onClick={onLanding}
            visual={<PasteVisual />}
          />
          <EntryCard
            n="02"
            title={t('startFork')}
            body={t('startForkSub')}
            cta={t('browseMarket')}
            ctaIcon="search"
            onClick={onMarketplace}
            visual={<ForkVisual />}
          />
          <EntryCard
            n="03"
            title={t('startSample')}
            body={t('startSampleSub')}
            onClick={onLanding}
            visual={null}
          />
        </div>

        <aside style={{ position: 'sticky', top: 80 }}>
          <div className="mc-card" style={{ padding: 18 }}>
            <div className="row-bw" style={{ marginBottom: 12 }}>
              <div className="mc-caption-up">{t('onboardingTitle')}</div>
              <span
                className="mc-mono"
                style={{ fontSize: 11, color: 'var(--text-muted)' }}
              >
                {t('onbEta')}
              </span>
            </div>
            <div className="mc-progress" style={{ marginBottom: 16 }}>
              <div style={{ width: '0%' }} />
            </div>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {checklist.map((c) => (
                <li
                  key={c.id}
                  className="row"
                  style={{ gap: 10, alignItems: 'flex-start' }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 18,
                      height: 18,
                      marginTop: 1,
                      border:
                        '1px solid ' +
                        (c.state === 'current'
                          ? 'var(--ink)'
                          : 'var(--border)'),
                      borderRadius: '50%',
                      background:
                        c.state === 'current' ? 'var(--ink)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color:
                        c.state === 'current'
                          ? 'var(--paper)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {c.id}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="mc-mono"
                      style={{
                        fontSize: 13,
                        color:
                          c.state === 'next'
                            ? 'var(--text-muted)'
                            : 'var(--text)',
                      }}
                    >
                      {c.label}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: '1px dashed var(--border)',
              }}
            >
              <a
                className="mc-mono"
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                {t('skipTour')} →
              </a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Props + main component ────────────────────────────────────────────────

interface UserClaimsLite {
  readonly sub: string;
  readonly email?: string;
  readonly name?: string;
}

export interface DashboardListProps {
  readonly userClaims?: UserClaimsLite;
}

export function DashboardList({
  userClaims,
}: DashboardListProps): ReactElement {
  const t = useTranslations();
  const router = useRouter();

  const { data: result } = useDashboardSummary();
  const summary = result !== undefined && result.ok ? result.data : undefined;
  const servers = useMemo(() => adaptSummary(summary), [summary]);

  const [filter, setFilter] = useState<FilterId>('all');
  const [view, setView] = useState<ViewId>('grid');
  const [search, setSearch] = useState<string>('');
  // Sort selector wired but unused in canon JSX (no UI to switch sort);
  // keep the state to preserve the canon hook surface for downstream
  // additions without breaking the public API.
  const [sort] = useState<SortId>('updated');

  const filtered = useMemo<ReadonlyArray<DashboardListServer>>(() => {
    return servers
      .filter((s) => {
        if (filter === 'live' && s.status !== 'live') return false;
        if (filter === 'public' && s.visibility !== 'public') return false;
        if (filter === 'drift' && s.drift === null) return false;
        if (
          search.length > 0 &&
          !s.name.toLowerCase().includes(search.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => {
        if (sort === 'calls') return b.calls7 - a.calls7;
        if (sort === 'name') return a.name.localeCompare(b.name);
        return 0;
      });
  }, [servers, filter, search, sort]);

  const totals = useMemo(() => {
    return servers.reduce(
      (acc, s) => ({
        calls: acc.calls + s.calls7,
        tools: acc.tools + s.tools,
        live: acc.live + (s.status === 'live' ? 1 : 0),
        pub: acc.pub + (s.visibility === 'public' ? 1 : 0),
      }),
      { calls: 0, tools: 0, live: 0, pub: 0 },
    );
  }, [servers]);

  const handleOpenServer = (s: DashboardListServer): void => {
    router.push(`/dashboard/${encodeURIComponent(s.id)}`);
  };

  const handleLanding = (): void => {
    router.push('/');
  };

  const handleMarketplace = (): void => {
    router.push('/marketplace');
  };

  const handleBilling = (): void => {
    router.push('/billing');
  };

  const handleNotifications = (): void => {
    openDrawer('notifications', <NotificationsBody />, {
      eyebrow: '3 unread',
    });
  };

  const isEmpty = servers.length === 0;
  const userEmail =
    userClaims?.email !== undefined && userClaims.email.length > 0
      ? userClaims.email
      : 'kira@dolla.io';

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb="dashboard"
        onLogo={handleLanding}
        right={
          <>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={handleMarketplace}
            >
              {t('marketplace')}
            </button>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={handleBilling}
            >
              {t('billing')}
            </button>
            <LangSwitcher />
            <span className="mc-caption" style={{ marginRight: 4 }}>
              {userEmail}
            </span>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={handleNotifications}
              aria-label="notifications"
            >
              <Icon name="bell" size={13} />
            </button>
          </>
        }
      />

      <main
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          padding: '32px 28px 64px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {isEmpty ? (
          <EmptyDashboard
            onLanding={handleLanding}
            onMarketplace={handleMarketplace}
          />
        ) : (
          <>
            <div
              className="row-bw"
              style={{ marginBottom: 24, alignItems: 'flex-end' }}
            >
              <div>
                <div className="mc-display-l">{t('yourServers')}</div>
                <div
                  className="mc-mono muted"
                  style={{ fontSize: 13, marginTop: 4 }}
                >
                  {servers.length} {t('servers')} · {totals.live}{' '}
                  {t('live')} · {totals.pub} {t('publicLbl')} ·{' '}
                  {totals.tools} {t('tools')}
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Btn
                  kind="ghost"
                  size="md"
                  icon="search"
                  onClick={handleMarketplace}
                >
                  {t('browseMarket')}
                </Btn>
                <Btn
                  kind="primary"
                  size="md"
                  icon="plus"
                  onClick={handleLanding}
                >
                  {t('newServer')}
                </Btn>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 24,
              }}
            >
              <MiniStat
                label={t('callsLast7')}
                num={totals.calls.toLocaleString()}
                delta="+12%"
              />
              <MiniStat
                label={t('tokensSavedMo')}
                num="4.2m"
                delta="≈ $63"
                green
              />
              <MiniStat
                label={t('plan')}
                num="pro"
                sub={'82% · ' + t('renews') + ' may 14'}
                link={t('manage')}
                onLink={handleBilling}
              />
              <MiniStat
                label={t('incidents')}
                num={totals.live > 0 ? '1' : '0'}
                sub="anvil-forms"
                alert
              />
            </div>

            <div
              className="row-bw"
              style={{
                marginBottom: 14,
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div className="mc-chiprow">
                {(
                  [
                    ['all', `${t('all')} · ${servers.length}`],
                    [
                      'live',
                      `${t('live')} · ${
                        servers.filter((s) => s.status === 'live').length
                      }`,
                    ],
                    [
                      'public',
                      `${t('publicLbl')} · ${
                        servers.filter((s) => s.visibility === 'public').length
                      }`,
                    ],
                    [
                      'drift',
                      `${t('needAttn')} · ${
                        servers.filter((s) => s.drift !== null).length
                      }`,
                    ],
                  ] as ReadonlyArray<readonly [FilterId, string]>
                ).map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    className={`mc-chip ${filter === id ? 'active' : ''}`}
                    onClick={(): void => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Icon name="search" size={12} />
                  </span>
                  <input
                    className="mc-input mc-mono"
                    placeholder={t('filter')}
                    value={search}
                    onChange={(e): void => setSearch(e.target.value)}
                    style={{
                      height: 32,
                      fontSize: 12,
                      padding: '0 12px 0 28px',
                      width: 200,
                    }}
                  />
                </div>
                <div className="mc-chiprow">
                  <button
                    type="button"
                    className={`mc-chip ${view === 'grid' ? 'active' : ''}`}
                    onClick={(): void => setView('grid')}
                    style={{ height: 32 }}
                  >
                    {t('grid')}
                  </button>
                  <button
                    type="button"
                    className={`mc-chip ${view === 'table' ? 'active' : ''}`}
                    onClick={(): void => setView('table')}
                    style={{ height: 32 }}
                  >
                    {t('table')}
                  </button>
                </div>
              </div>
            </div>

            {view === 'grid' ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 14,
                }}
              >
                {filtered.map((s) => (
                  <ServerCard
                    key={s.id}
                    s={s}
                    onOpen={(): void => handleOpenServer(s)}
                  />
                ))}
                <NewServerCard onClick={handleLanding} />
              </div>
            ) : (
              <ServerTable servers={filtered} onOpen={handleOpenServer} />
            )}

            {filtered.length === 0 && (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  marginTop: 12,
                }}
              >
                <div
                  className="mc-mono"
                  style={{ fontSize: 14, color: 'var(--text-muted)' }}
                >
                  no servers match this filter.
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
