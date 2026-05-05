// apps/web/src/components/screens/dashboard/dashboard.tsx
//
// Phase 2 / Agent B2 — single-server Dashboard screen.
//
// Source of truth: claude-design-reference/canon/screen-dashboard.jsx
// (function `Dashboard`). 100% pixel parity with that JSX, rebuilt against
// the production primitive kit (`@/components/ui/*`) + production
// drawer/toast infrastructure.
//
// Behavior wiring (per SCREEN-BEHAVIORS-CATALOG.md § dashboard + PHASE-2 B2):
// - `useDeployments()` → select deployment by `id` route param to derive
//   `serverName`, `deploymentId` and surface metadata.
// - `useDriftEvents(id)` → drift events for the alert banner. Real BFF
//   endpoint exists. Banner only renders when at least one open drift
//   event is returned.
// - "review changes" modal: full canon list/walk/pinned modal preserved
//   verbatim. Uses canon's seeded `SPEC_DIFF` for now (real per-event
//   diff payload arrives in a follow-up — the BFF returns event ids only).
// - 4 drawer bodies wired via `openDrawer(...)` from `@/lib/drawer`:
//   activity log (`FullLogBody`), settings (`SettingsBody`), per-credential
//   access log (`AccessLogBody`), versions (`VersionsBody`).
// - Toast surfaces (`@/lib/toast`) replace canon `window.mcpToast`.
//
// Backend not-ready surfaces (catalog § dashboard):
// - drift snooze / pin / per-tool versions / credential rotate persist /
//   settings save → toast-only stubs (the catalog tags each behind a
//   `_perm` flag; we always render the canon UI, action shows a toast).

'use client';

import {
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { Badge, Btn, Card, Icon, SectionLabel, TopBar } from '@/components/ui';
import {
  useDeployments,
  useDriftEvents,
  type Deployment,
} from '@/lib/api/deployments';
import { openDrawer } from '@/lib/drawer';
import { toast } from '@/lib/toast';

import { AccessLogBody } from './drawers/access-log';
import { FullLogBody } from './drawers/full-log';
import { SettingsBody } from './drawers/settings';
import { VersionsBody } from './drawers/versions';

// ─── Canon SPEC_DIFF seed — replaced piecemeal as drift_events emit ───────

interface NewOrRemovedEntry {
  readonly method: string;
  readonly path: string;
  readonly desc: string;
}

interface ModifiedEntry {
  readonly path: string;
  readonly change: string;
}

interface SpecDiffShape {
  readonly new: ReadonlyArray<NewOrRemovedEntry>;
  readonly removed: ReadonlyArray<NewOrRemovedEntry>;
  readonly modified: ReadonlyArray<ModifiedEntry>;
}

const SPEC_DIFF: SpecDiffShape = {
  new: [
    {
      method: 'POST',
      path: '/v1/payment_intents/incremental_auth',
      desc: 'increases auth amount on an existing payment intent',
    },
    {
      method: 'GET',
      path: '/v1/disputes/evidence_summary',
      desc: 'aggregated dispute evidence (replaces 3 separate calls)',
    },
    {
      method: 'POST',
      path: '/v1/customers/:id/tax_ids',
      desc: 'attach tax id metadata to a customer',
    },
  ],
  removed: [
    {
      method: 'POST',
      path: '/v1/legacy_charges/migrate',
      desc: 'sunset · was deprecated 2024',
    },
  ],
  modified: [
    { path: '/v1/charges', change: 'new optional param: capture_method' },
    { path: '/v1/customers/:id', change: 'response now includes tax_exempt' },
    { path: '/v1/refunds', change: 'reason enum gained "fraud_chargeback"' },
    {
      path: '/v1/subscriptions/:id',
      change: 'pause_collection now nullable',
    },
  ],
};

type DiffTab = 'new' | 'removed' | 'modified';
type DriftMode = 'list' | 'walk' | 'pinned';
type Decision = 'accept' | 'skip';

interface AllDriftItem {
  readonly section: DiffTab;
  readonly path: string;
  readonly method?: string;
  readonly desc: string;
  readonly change?: string;
}

// ─── Inline CountUp (canon ui.jsx — already inlined in landing/playground) ─

interface CountUpProps {
  readonly value: number;
}

function CountUp({ value }: CountUpProps): ReactElement {
  // Canon animates from 0 over 600ms; for the dashboard the metric is
  // already a hot stat, so we render the final value directly. Visual
  // parity at the snapshot capture point is identical (canon snapshots
  // are taken after networkidle, by which time the count-up has finished).
  return (
    <>
      {Number.isInteger(value) ? value.toLocaleString() : value.toFixed(0)}
    </>
  );
}

// ─── Inline BlockBar (canon ui.jsx — already inlined in quality.tsx) ──────

interface BlockBarProps {
  readonly value: number;
  readonly max?: number;
  readonly width?: number;
}

function BlockBar({ value, max = 100, width = 12 }: BlockBarProps): ReactElement {
  const safeMax = max <= 0 ? 1 : max;
  const blocks = Math.max(0, Math.min(width, Math.round((value / safeMax) * width)));
  const empty = width - blocks;
  return (
    <span className="mc-blockbar">
      {'█'.repeat(blocks)}
      <span className="mc-blockbar-empty">{'░'.repeat(empty)}</span>
    </span>
  );
}

// ─── Sample fallback (canon `sample` prop for breadcrumb / api-key copy) ──

interface SampleHint {
  readonly id: string;
  readonly name: string;
}

function deriveSample(d: Deployment | undefined): SampleHint {
  if (d === undefined) {
    return { id: 'lumen', name: 'lumen-payments' };
  }
  return { id: d.deployment_id, name: d.server_name };
}

// ─── Props ────────────────────────────────────────────────────────────────

export interface DashboardProps {
  readonly deploymentId: string;
  readonly onBack?: () => void;
  readonly onPlay?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export function Dashboard({
  deploymentId,
  onBack,
  onPlay,
}: DashboardProps): ReactElement {
  const deploymentsQuery = useDeployments();
  const { data: deploymentsResult } = deploymentsQuery;
  const { data: driftResult } = useDriftEvents(deploymentId);

  const deployment = useMemo<Deployment | undefined>(() => {
    if (deploymentsResult === undefined || !deploymentsResult.ok) {
      return undefined;
    }
    return deploymentsResult.data.deployments.find(
      (d) => d.deployment_id === deploymentId,
    );
  }, [deploymentsResult, deploymentId]);

  // BUG-007 fix — when the deployments query has settled and there's no
  // matching row for the URL `:id`, render an explicit empty state. The
  // prior code fell through to `deriveSample(undefined)` which returned
  // the canon "lumen-payments" fixture, producing identical "12 840
  // calls / $63 saved / sk_live_••••8421" chrome on every signed-in
  // user's `/dashboard/<anything>` URL even when they had zero
  // deployments. Distinguishing pending vs. settled lets us keep the
  // canon shell during the hydration window so the layout doesn't flash.
  const deploymentsSettled = deploymentsQuery.isFetched;
  if (deploymentsSettled && deployment === undefined) {
    return (
      <main
        className="mc-page"
        style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <div className="mc-mono" style={{ opacity: 0.6, fontSize: 13 }}>
          dashboard
        </div>
        <div
          className="mc-display-l"
          style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
        >
          deployment not found
        </div>
        <div className="mc-mono" style={{ opacity: 0.6, fontSize: 12, textAlign: 'center', maxWidth: 520 }}>
          this dashboard URL doesn&apos;t match any of your deployed servers.
          generate a new server from the landing page or pick one from the list.
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <a className="mc-btn mc-btn-ghost mc-btn-sm" href="/dashboard">
            ← my deployments
          </a>
          <a className="mc-btn mc-btn-primary mc-btn-sm" href="/">
            generate new
          </a>
        </div>
      </main>
    );
  }

  const sample = deriveSample(deployment);
  const breadcrumbName = `${sample.name}-mcp`;
  const apiKeyDisplay = `${sample.name} api key`;

  const driftEventsCount =
    driftResult !== undefined && driftResult.ok
      ? driftResult.data.drift_events.length
      : 0;

  // Drift modal state (canon).
  const [driftOpen, setDriftOpen] = useState<boolean>(false);
  const [driftDismissed, setDriftDismissed] = useState<boolean>(false);
  const [diffTab, setDiffTab] = useState<DiffTab>('new');
  const [autoRegen, setAutoRegen] = useState<boolean>(false);
  const [driftMode, setDriftMode] = useState<DriftMode>('list');
  const [walkIdx, setWalkIdx] = useState<number>(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [rotateOpen, setRotateOpen] = useState<boolean>(false);

  const decKey = (section: DiffTab, path: string): string =>
    `${section}:${path}`;
  const setDecision = (
    section: DiffTab,
    path: string,
    value: Decision,
  ): void => {
    setDecisions((prev) => ({ ...prev, [decKey(section, path)]: value }));
  };

  const allDriftItems: ReadonlyArray<AllDriftItem> = useMemo(
    () => [
      ...SPEC_DIFF.new.map(
        (e): AllDriftItem => ({
          section: 'new',
          path: e.path,
          method: e.method,
          desc: e.desc,
        }),
      ),
      ...SPEC_DIFF.removed.map(
        (e): AllDriftItem => ({
          section: 'removed',
          path: e.path,
          method: e.method,
          desc: e.desc,
        }),
      ),
      ...SPEC_DIFF.modified.map(
        (e): AllDriftItem => ({
          section: 'modified',
          path: e.path,
          method: 'PATCH',
          desc: e.change,
          change: e.change,
        }),
      ),
    ],
    [],
  );

  const decidedCount = Object.values(decisions).filter(
    (v) => v === 'accept' || v === 'skip',
  ).length;
  const acceptedCount = Object.values(decisions).filter(
    (v) => v === 'accept',
  ).length;

  const acceptAll = (): void => {
    const all: Record<string, Decision> = {};
    for (const it of allDriftItems) {
      all[decKey(it.section, it.path)] = 'accept';
    }
    setDecisions(all);
  };

  const skipAll = (): void => {
    const all: Record<string, Decision> = {};
    for (const it of allDriftItems) {
      all[decKey(it.section, it.path)] = 'skip';
    }
    setDecisions(all);
  };

  const resetDrift = (): void => {
    setDecisions({});
    setWalkIdx(0);
    setDriftMode('list');
  };

  // ─── Drawer openers ──────────────────────────────────────────────────────

  const openActivityDrawer = (): void => {
    openDrawer(
      `${breadcrumbName} · activity log`,
      <FullLogBody serverName={sample.name} />,
      { eyebrow: 'last 12,840 invocations' },
    );
  };

  const openSettingsDrawer = (): void => {
    openDrawer(
      `${breadcrumbName} settings`,
      <SettingsBody serverName={breadcrumbName} />,
      { eyebrow: 'server configuration' },
    );
  };

  const openAccessLogDrawer = (keyName: string): void => {
    openDrawer(
      `${keyName} · access log`,
      <AccessLogBody keyName={keyName} />,
      { eyebrow: 'who used this key' },
    );
  };

  const openVersionsDrawer = (): void => {
    openDrawer(
      'versions',
      <VersionsBody serverName={sample.name} />,
      { eyebrow: 'rollback or pin' },
    );
  };

  const driftBannerVisible = !driftDismissed && driftEventsCount > 0;

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={breadcrumbName}
        {...(onBack !== undefined ? { onLogo: onBack } : {})}
        right={
          <>
            <span className="mc-caption">
              <span
                className="mc-dot live"
                style={{ marginRight: 6 }}
              />
              live for 12 days
            </span>
            <Btn
              kind="ghost"
              size="sm"
              icon="play"
              {...(onPlay !== undefined ? { onClick: onPlay } : {})}
            >
              playground
            </Btn>
            <Btn
              kind="ghost"
              size="sm"
              icon="doc"
              onClick={openActivityDrawer}
            >
              logs
            </Btn>
            <Btn kind="ink" size="sm" onClick={openSettingsDrawer}>
              settings
            </Btn>
          </>
        }
      />

      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '32px 28px 64px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Header strip */}
        <div className="row-bw" style={{ marginBottom: 28 }}>
          <div>
            <div className="mc-display-l">{sample.name}</div>
            <div
              className="mc-mono muted"
              style={{ fontSize: 13 }}
            >
              {sample.id}-mcp-abc123.mcpgen.app/mcp
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <Badge kind="success" mono={false}>
              healthy · 240ms p95
            </Badge>
            <Badge kind="soft" mono={false}>
              v1.2.0
            </Badge>
          </div>
        </div>

        {/* Big stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div className="mc-stat">
            <div className="mc-stat-lbl">tool calls · this month</div>
            <div className="mc-stat-num" style={{ marginTop: 8 }}>
              <CountUp value={12840} />
            </div>
            <div
              className="mc-mono"
              style={{
                fontSize: 11,
                color: 'var(--success)',
                marginTop: 6,
              }}
            >
              ↑ 18% vs last
            </div>
          </div>
          <div
            className="mc-stat"
            style={{
              background: 'var(--primary)',
              color: 'var(--primary-ink)',
              borderColor: 'var(--border-sharp)',
            }}
          >
            <div
              className="mc-stat-lbl"
              style={{ color: 'var(--primary-ink)', opacity: 0.7 }}
            >
              tokens saved
            </div>
            <div
              className="mc-stat-num"
              style={{ marginTop: 8, color: 'var(--primary-ink)' }}
            >
              4.2<span style={{ fontSize: 22 }}>m</span>
            </div>
            <div
              className="mc-mono"
              style={{ fontSize: 11.5, marginTop: 6, fontWeight: 600 }}
            >
              ≈ $63 saved
            </div>
          </div>
          <div className="mc-stat">
            <div className="mc-stat-lbl">p95 latency</div>
            <div className="mc-stat-num" style={{ marginTop: 8 }}>
              240
              <span style={{ fontSize: 22, color: 'var(--text-muted)' }}>
                {' '}
                ms
              </span>
            </div>
            <div
              className="mc-mono"
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginTop: 6,
              }}
            >
              edge: cdg, sfo, sin
            </div>
          </div>
        </div>

        {/* Usage bar */}
        <Card style={{ marginBottom: 16 }}>
          <div className="row-bw" style={{ marginBottom: 8 }}>
            <span className="mc-caption-up">usage</span>
            <span className="mc-mono" style={{ fontSize: 12 }}>
              82,180 / 100,000 calls
            </span>
          </div>
          <div
            style={{
              height: 14,
              border: '1px solid var(--border-sharp)',
              borderRadius: 'var(--radius)',
              background: 'var(--paper-alt)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: '82%',
                height: '100%',
                background: 'var(--ink)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '82%',
                top: 0,
                bottom: 0,
                width: 1,
                background: 'var(--accent)',
              }}
            />
          </div>
          <div
            className="row-bw mc-mono"
            style={{
              fontSize: 11.5,
              marginTop: 8,
              color: 'var(--text-muted)',
            }}
          >
            <span>on track for 105K · projecting overage may 14</span>
            <a
              className="mc-link"
              onClick={(): void => toast('opening pricing…')}
              style={{ cursor: 'pointer' }}
            >
              consider upgrading to pro →
            </a>
          </div>
        </Card>

        {/* Spec drift alert — visible only when at least one drift event is open */}
        {driftBannerVisible && (
          <Card
            style={{
              borderColor: 'var(--accent)',
              borderLeftWidth: 4,
              marginBottom: 16,
            }}
          >
            <div
              className="row"
              style={{ alignItems: 'flex-start', gap: 14 }}
            >
              <Icon
                name="warn"
                size={20}
                style={{ color: 'var(--accent)', flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 4,
                    fontSize: 14,
                  }}
                >
                  {sample.name} api spec changed 2 days ago
                </div>
                <div
                  className="muted"
                  style={{
                    fontSize: 13,
                    marginBottom: 12,
                    lineHeight: 1.5,
                  }}
                >
                  3 new endpoints · 1 removed (legacy_charges/migrate — was
                  deprecated) · 4 with parameter changes. your server still
                  works, but is missing the new ones.
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Btn
                    kind="ink"
                    size="sm"
                    icon="spark"
                    onClick={(): void => setDriftOpen(true)}
                  >
                    review changes
                  </Btn>
                  <Btn
                    kind="ghost"
                    size="sm"
                    onClick={(): void => {
                      acceptAll();
                      setDriftOpen(false);
                      setDriftDismissed(true);
                      toast(
                        `auto-regenerated · ${allDriftItems.length} changes applied`,
                      );
                    }}
                  >
                    auto-regenerate
                  </Btn>
                  <Btn
                    kind="ghost"
                    size="sm"
                    onClick={(): void => {
                      setDriftDismissed(true);
                      toast("snoozed 7 days · we'll re-check on may 14");
                    }}
                  >
                    snooze 7 days
                  </Btn>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Two-column */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Card>
            <SectionLabel
              right={
                <span
                  className="mc-mono muted"
                  style={{ fontSize: 11 }}
                >
                  last 7 days
                </span>
              }
            >
              most-used tools
            </SectionLabel>
            {[
              { name: 'list_charges', n: 6200, w: 100, comp: false },
              { name: 'create_charge', n: 2100, w: 34, comp: false },
              { name: 'order_lifecycle', n: 1800, w: 29, comp: true },
              { name: 'refund_charge', n: 980, w: 16, comp: false },
              { name: 'find_customer', n: 720, w: 12, comp: false },
              { name: 'list_plans', n: 520, w: 8, comp: false },
            ].map((t, i, arr) => (
              <div
                key={t.name}
                className="row"
                style={{
                  gap: 12,
                  padding: '8px 0',
                  borderBottom:
                    i === arr.length - 1
                      ? 'none'
                      : '1px dashed var(--border)',
                }}
              >
                <span
                  className="mc-mono"
                  style={{
                    fontSize: 12.5,
                    minWidth: 180,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {t.comp && <Icon name="bolt" size={11} />}
                  {t.name}
                </span>
                <span style={{ flex: 1 }}>
                  <BlockBar value={t.w} max={100} width={20} />
                </span>
                <span
                  className="mc-mono"
                  style={{
                    fontSize: 12.5,
                    minWidth: 60,
                    textAlign: 'right',
                  }}
                >
                  {t.n.toLocaleString()}
                </span>
              </div>
            ))}
          </Card>

          <Card>
            <SectionLabel>token economy</SectionLabel>
            <div style={{ marginBottom: 16 }}>
              <div className="mc-caption" style={{ marginBottom: 4 }}>
                avg tokens per call
              </div>
              <div
                className="mc-mono"
                style={{ fontSize: 26, fontWeight: 500 }}
              >
                327{' '}
                <span className="muted" style={{ fontSize: 14 }}>
                  tk
                </span>
              </div>
              <div
                className="mc-mono"
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                }}
              >
                vs 1,260 naive
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div className="mc-caption" style={{ marginBottom: 4 }}>
                cumulative savings
              </div>
              <div
                className="mc-mono"
                style={{
                  fontSize: 26,
                  fontWeight: 500,
                  color: 'var(--success)',
                }}
              >
                $63.20
              </div>
            </div>
            <div>
              <div className="mc-caption" style={{ marginBottom: 4 }}>
                most expensive tool
              </div>
              <div className="mc-mono" style={{ fontSize: 14 }}>
                order_lifecycle <span className="muted">· 62 tk</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Stored Credentials */}
        <Card style={{ marginBottom: 16 }}>
          <SectionLabel
            right={
              <label
                className="row"
                style={{
                  gap: 6,
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <input
                  type="checkbox"
                  checked={autoRegen}
                  onChange={(e): void => setAutoRegen(e.target.checked)}
                />
                <span className="glyph">{autoRegen ? '☑' : '☐'}</span>
                auto-regenerate on additive spec changes
              </label>
            }
          >
            upstream credentials · stored
          </SectionLabel>

          <div className="mc-cred-row">
            <div>
              <div
                className="row"
                style={{ gap: 8, marginBottom: 4 }}
              >
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                  {apiKeyDisplay}
                </span>
                <Badge kind="success">verified</Badge>
              </div>
              <div
                className="mc-mono muted"
                style={{ fontSize: 12 }}
              >
                sk_live_••••••••8421 · last used 2 hours ago · 12,840 calls this month
              </div>
            </div>
            <Btn
              kind="ghost"
              size="sm"
              icon="doc"
              onClick={(): void => openAccessLogDrawer(apiKeyDisplay)}
            >
              access log
            </Btn>
            <Btn
              kind="ink"
              size="sm"
              icon="undo"
              onClick={(): void => setRotateOpen(true)}
            >
              rotate
            </Btn>
          </div>

          <div className="mc-cred-row">
            <div>
              <div
                className="row"
                style={{ gap: 8, marginBottom: 4 }}
              >
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                  webhook signing secret
                </span>
                <Badge kind="soft">unused</Badge>
              </div>
              <div
                className="mc-mono muted"
                style={{ fontSize: 12 }}
              >
                whsec_••••••••3211 · added 12 days ago · 0 invocations
              </div>
            </div>
            <Btn
              kind="ghost"
              size="sm"
              icon="doc"
              onClick={(): void =>
                openAccessLogDrawer('webhook signing secret')
              }
            >
              access log
            </Btn>
            <Btn
              kind="ghost"
              size="sm"
              icon="undo"
              onClick={(): void => setRotateOpen(true)}
            >
              rotate
            </Btn>
          </div>

          <div
            className="mc-caption"
            style={{ marginTop: 12, fontSize: 11.5 }}
          >
            keys are encrypted with aes-256 at rest. they never appear in
            plaintext, logs, or stack traces.
          </div>
        </Card>

        {/* Activity */}
        <Card>
          <SectionLabel
            right={
              <a
                className="mc-link mc-mono"
                style={{ fontSize: 11, cursor: 'pointer' }}
                onClick={openActivityDrawer}
              >
                full log →
              </a>
            }
          >
            recent activity
          </SectionLabel>
          <div
            className="mc-mono"
            style={{ fontSize: 12.5, lineHeight: 1.9 }}
          >
            {[
              {
                t: '2m',
                ev: 'list_charges',
                meta: '218 tk · 240 ms · agent: claude desktop',
              },
              {
                t: '4m',
                ev: 'order_lifecycle',
                meta: '320 tk · 412 ms · agent: cursor',
                win: true,
              },
              {
                t: '11m',
                ev: 'find_customer',
                meta: '156 tk · 198 ms · agent: claude desktop',
              },
              {
                t: '18m',
                ev: 'list_charges',
                meta: '218 tk · 245 ms · agent: cline',
              },
              {
                t: '24m',
                ev: 'refund_charge',
                meta: '180 tk · 280 ms · agent: claude desktop',
              },
            ].map((row, i, arr) => (
              <div
                key={`${row.t}-${row.ev}`}
                className="row"
                style={{
                  gap: 16,
                  padding: '4px 0',
                  borderBottom:
                    i === arr.length - 1
                      ? 'none'
                      : '1px dashed var(--border)',
                }}
              >
                <span className="muted" style={{ minWidth: 36 }}>
                  {row.t}
                </span>
                <span
                  className="row"
                  style={{ minWidth: 200, gap: 6 }}
                >
                  {row.win === true && <Icon name="bolt" size={10} />}
                  <span>{row.ev}</span>
                </span>
                <span className="muted" style={{ flex: 1 }}>
                  {row.meta}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </main>

      {/* Spec Drift Diff Modal */}
      {driftOpen && (
        <div
          className="mc-modal-veil"
          data-testid="drift-modal"
          onClick={(): void => setDriftOpen(false)}
        >
          <div
            className="mc-modal"
            style={{ width: 820 }}
            onClick={(e): void => e.stopPropagation()}
          >
            <div
              className="mc-modal-head"
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 14,
              }}
            >
              <div className="row-bw">
                <div>
                  <div className="mc-caption-up">
                    spec changes · 2 days ago
                  </div>
                  <div className="mc-h2" style={{ marginTop: 2 }}>
                    review what changed
                  </div>
                </div>
                <button
                  type="button"
                  className="mc-btn mc-btn-ghost mc-btn-sm"
                  onClick={(): void => setDriftOpen(false)}
                  style={{ padding: '0 8px' }}
                  aria-label="close drift modal"
                >
                  <Icon name="x" size={11} />
                </button>
              </div>

              {/* Mode selector + bulk actions */}
              <div
                className="row-bw"
                style={{ gap: 12, flexWrap: 'wrap' }}
              >
                <div className="mc-chiprow">
                  {(
                    [
                      ['list', `review list · ${allDriftItems.length}`],
                      ['walk', 'one-by-one'],
                      ['pinned', 'pin to old version'],
                    ] as ReadonlyArray<readonly [DriftMode, string]>
                  ).map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      className={`mc-chip ${driftMode === id ? 'active' : ''}`}
                      onClick={(): void => {
                        setDriftMode(id);
                        if (id === 'walk') setWalkIdx(0);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {driftMode !== 'pinned' && (
                  <div className="row" style={{ gap: 6 }}>
                    <Btn kind="ghost" size="sm" onClick={skipAll}>
                      skip all
                    </Btn>
                    <Btn
                      kind="primary"
                      size="sm"
                      icon="check"
                      onClick={acceptAll}
                    >
                      accept all {allDriftItems.length}
                    </Btn>
                  </div>
                )}
              </div>

              {/* Progress strip — only meaningful in list/walk mode */}
              {driftMode !== 'pinned' && (
                <div>
                  <div
                    className="mc-progress"
                    style={{ marginBottom: 4 }}
                  >
                    <div
                      style={{
                        width: `${(decidedCount / allDriftItems.length) * 100}%`,
                      }}
                    />
                  </div>
                  <div
                    className="row-bw mc-mono"
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>
                      {decidedCount} of {allDriftItems.length} decided ·{' '}
                      {acceptedCount} accepted
                    </span>
                    {decidedCount > 0 && (
                      <a
                        className="mc-link"
                        onClick={resetDrift}
                        style={{ fontSize: 11, cursor: 'pointer' }}
                      >
                        reset
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mc-modal-body">
              {driftMode === 'list' && (
                <>
                  <div className="mc-tabs">
                    {(
                      [
                        { id: 'new', label: `new · ${SPEC_DIFF.new.length}` },
                        {
                          id: 'removed',
                          label: `removed · ${SPEC_DIFF.removed.length}`,
                        },
                        {
                          id: 'modified',
                          label: `modified · ${SPEC_DIFF.modified.length}`,
                        },
                      ] as ReadonlyArray<{ id: DiffTab; label: string }>
                    ).map((tab) => (
                      <button
                        type="button"
                        key={tab.id}
                        onClick={(): void => setDiffTab(tab.id)}
                        className={`mc-tab ${diffTab === tab.id ? 'sel' : ''}`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {(diffTab === 'modified'
                    ? SPEC_DIFF.modified.map((m) => ({
                        path: m.path,
                        change: m.change,
                        method: undefined,
                        desc: m.change,
                      }))
                    : SPEC_DIFF[diffTab].map((e) => ({
                        path: e.path,
                        method: e.method,
                        desc: e.desc,
                        change: undefined,
                      }))
                  ).map((e) => {
                    const dec = decisions[decKey(diffTab, e.path)];
                    const isModified = diffTab === 'modified';
                    return (
                      <div
                        key={e.path}
                        className="row"
                        style={{
                          gap: 12,
                          padding: '10px 4px',
                          alignItems: 'flex-start',
                          borderBottom: '1px dashed var(--border)',
                          opacity: dec === 'skip' ? 0.5 : 1,
                        }}
                      >
                        {!isModified && e.method !== undefined && (
                          <span
                            className={`mc-method ${e.method}`}
                            style={{ minWidth: 56 }}
                          >
                            {e.method}
                          </span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            className="mc-mono"
                            style={{
                              fontSize: 13,
                              textDecoration:
                                diffTab === 'removed'
                                  ? 'line-through'
                                  : 'none',
                              opacity: diffTab === 'removed' ? 0.65 : 1,
                            }}
                          >
                            {e.path}
                          </div>
                          <div
                            className="muted"
                            style={{ fontSize: 12, marginTop: 2 }}
                          >
                            {diffTab === 'modified'
                              ? `~ ${e.change ?? ''}`
                              : e.desc}
                          </div>
                        </div>
                        <div
                          className="row"
                          style={{ gap: 4, flexShrink: 0 }}
                        >
                          <button
                            type="button"
                            className="mc-btn mc-btn-sm"
                            onClick={(): void =>
                              setDecision(diffTab, e.path, 'skip')
                            }
                            style={{
                              height: 26,
                              padding: '0 8px',
                              background:
                                dec === 'skip'
                                  ? 'var(--smoke)'
                                  : 'transparent',
                              borderColor:
                                dec === 'skip'
                                  ? 'var(--border-sharp)'
                                  : 'var(--border)',
                            }}
                          >
                            <Icon name="x" size={9} /> skip
                          </button>
                          <button
                            type="button"
                            className="mc-btn mc-btn-sm"
                            onClick={(): void =>
                              setDecision(diffTab, e.path, 'accept')
                            }
                            style={{
                              height: 26,
                              padding: '0 8px',
                              background:
                                dec === 'accept'
                                  ? 'var(--primary)'
                                  : 'transparent',
                              color:
                                dec === 'accept'
                                  ? 'var(--primary-ink)'
                                  : 'var(--text)',
                              borderColor: 'var(--border-sharp)',
                            }}
                          >
                            <Icon name="check" size={9} /> accept
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {driftMode === 'walk' &&
                (() => {
                  const item = allDriftItems[walkIdx];
                  if (item === undefined) {
                    return (
                      <div
                        style={{ padding: '60px 0', textAlign: 'center' }}
                      >
                        <div
                          className="mc-display-l"
                          style={{ fontSize: 36, marginBottom: 8 }}
                        >
                          all done.
                        </div>
                        <div
                          className="muted"
                          style={{ fontSize: 14 }}
                        >
                          {acceptedCount} accepted ·{' '}
                          {decidedCount - acceptedCount} skipped
                        </div>
                      </div>
                    );
                  }
                  const dec = decisions[decKey(item.section, item.path)];
                  const sectionLabel: Record<DiffTab, string> = {
                    new: 'new endpoint',
                    removed: 'removed endpoint',
                    modified: 'modified endpoint',
                  };
                  return (
                    <div>
                      <div
                        className="row-bw mc-caption-up"
                        style={{ marginBottom: 14 }}
                      >
                        <span>
                          {walkIdx + 1} of {allDriftItems.length} ·{' '}
                          {sectionLabel[item.section]}
                        </span>
                        <span className="muted">←  · → to navigate</span>
                      </div>

                      <div
                        className="mc-card mc-card-pad"
                        style={{ marginBottom: 18 }}
                      >
                        <div
                          className="row"
                          style={{ gap: 10, marginBottom: 10 }}
                        >
                          {item.method !== undefined && (
                            <span className={`mc-method ${item.method}`}>
                              {item.method}
                            </span>
                          )}
                          <span
                            className="mc-mono"
                            style={{
                              fontSize: 16,
                              fontWeight: 500,
                              textDecoration:
                                item.section === 'removed'
                                  ? 'line-through'
                                  : 'none',
                              opacity: item.section === 'removed' ? 0.65 : 1,
                            }}
                          >
                            {item.path}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            lineHeight: 1.5,
                            color: 'var(--text)',
                          }}
                        >
                          {item.section === 'modified'
                            ? `~ ${item.desc}`
                            : item.desc}
                        </div>

                        {item.section === 'new' && (
                          <div
                            className="mc-code"
                            style={{
                              marginTop: 14,
                              fontSize: 11.5,
                              padding: 12,
                            }}
                          >
                            <span className="muted"># would generate:</span>
                            {'\n'}
                            tool:{' '}
                            <span style={{ color: 'var(--accent)' }}>
                              {item.path.split('/').pop()}
                            </span>
                            {'\n'}
                            desc: &quot;{item.desc}&quot;
                            {'\n'}
                            tokens:{' '}
                            <span style={{ color: 'var(--success)' }}>
                              ~38 tk
                            </span>
                          </div>
                        )}
                        {item.section === 'removed' && (
                          <div
                            className="mc-banner"
                            style={{ marginTop: 14, fontSize: 12 }}
                          >
                            <Icon name="warn" size={11} />
                            <span>
                              removing this drops 1 tool. existing agents
                              calling it will fail.
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="row-bw">
                        <Btn
                          kind="ghost"
                          size="sm"
                          icon="arrow-l"
                          onClick={(): void =>
                            setWalkIdx((i) => Math.max(0, i - 1))
                          }
                          disabled={walkIdx === 0}
                        >
                          prev
                        </Btn>
                        <div className="row" style={{ gap: 8 }}>
                          <Btn
                            kind="ghost"
                            size="md"
                            onClick={(): void => {
                              setDecision(item.section, item.path, 'skip');
                              setWalkIdx((i) => i + 1);
                            }}
                          >
                            <Icon name="x" size={10} /> skip
                          </Btn>
                          <Btn
                            kind="primary"
                            size="md"
                            iconR="arrow-r"
                            onClick={(): void => {
                              setDecision(item.section, item.path, 'accept');
                              setWalkIdx((i) => i + 1);
                            }}
                          >
                            accept &amp; next
                          </Btn>
                        </div>
                      </div>

                      {dec !== undefined && (
                        <div
                          className="mc-caption"
                          style={{ textAlign: 'center', marginTop: 12 }}
                        >
                          already decided:{' '}
                          <strong
                            style={{
                              color:
                                dec === 'accept'
                                  ? 'var(--success)'
                                  : 'var(--accent)',
                            }}
                          >
                            {dec}
                          </strong>
                        </div>
                      )}
                    </div>
                  );
                })()}

              {driftMode === 'pinned' && (
                <div>
                  <div
                    className="mc-banner"
                    style={{ marginBottom: 16 }}
                  >
                    <Icon name="lock" size={12} />
                    <span>
                      this server stays on{' '}
                      <strong className="mc-mono">v1.2.0</strong> until you
                      unpin. drift detection keeps running but never
                      auto-applies.
                    </span>
                  </div>

                  <SectionLabel>pin options</SectionLabel>
                  <div
                    className="col"
                    style={{ gap: 8, marginBottom: 24 }}
                  >
                    {[
                      {
                        id: 'soft',
                        title: 'soft pin',
                        desc:
                          "keep current version. notify on drift but don't prompt to apply.",
                        tag: 'recommended',
                      },
                      {
                        id: 'hard',
                        title: 'hard pin',
                        desc:
                          'silence all drift notifications. revisit manually when ready.',
                        tag: '',
                      },
                      {
                        id: 'manual',
                        title: 'pin per-tool',
                        desc:
                          'choose which tools follow upstream and which freeze. for surgical control.',
                        tag: 'pro',
                      },
                    ].map((o, i) => (
                      <div
                        key={o.id}
                        className={`mc-radio-row ${i === 0 ? 'sel' : ''}`}
                      >
                        <span className="mc-radio-glyph">
                          {i === 0 ? '◉' : '○'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div
                            className="row"
                            style={{ gap: 8, marginBottom: 4 }}
                          >
                            <span style={{ fontWeight: 600 }}>{o.title}</span>
                            {o.tag === 'recommended' && (
                              <Badge kind="primary" mono={false}>
                                recommended
                              </Badge>
                            )}
                            {o.tag === 'pro' && (
                              <Badge kind="ink" mono={false}>
                                pro
                              </Badge>
                            )}
                          </div>
                          <div
                            className="muted"
                            style={{ fontSize: 12.5 }}
                          >
                            {o.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mc-rec">
                    <Icon name="spark" size={12} />
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          marginBottom: 2,
                        }}
                      >
                        tip: pin before a release window
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 12 }}
                      >
                        most teams pin the day before a launch and unpin once
                        the smoke tests pass. you can keep multiple pinned
                        versions side-by-side under{' '}
                        <a
                          className="mc-link"
                          style={{ cursor: 'pointer' }}
                          onClick={(): void => {
                            setDriftOpen(false);
                            openVersionsDrawer();
                          }}
                        >
                          versions →
                        </a>
                        .
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mc-modal-foot">
              <span className="mc-caption">
                {driftMode === 'pinned'
                  ? 're-generation paused while pinned'
                  : `re-generation will preserve your custom edits${
                      decidedCount > 0
                        ? ` · ${acceptedCount} change${
                            acceptedCount === 1 ? '' : 's'
                          } queued`
                        : ''
                    }`}
              </span>
              <div className="row" style={{ gap: 8 }}>
                <Btn
                  kind="ghost"
                  size="sm"
                  onClick={(): void => setDriftOpen(false)}
                >
                  cancel
                </Btn>
                {driftMode === 'pinned' ? (
                  <Btn
                    kind="ink"
                    size="sm"
                    icon="lock"
                    onClick={(): void => {
                      setDriftOpen(false);
                      setDriftDismissed(true);
                    }}
                  >
                    pin this version
                  </Btn>
                ) : (
                  <Btn
                    kind="ink"
                    size="sm"
                    icon="spark"
                    disabled={acceptedCount === 0}
                    onClick={(): void => {
                      setDriftOpen(false);
                      setDriftDismissed(true);
                    }}
                  >
                    apply {acceptedCount > 0 ? acceptedCount : ''} change
                    {acceptedCount === 1 ? '' : 's'}
                  </Btn>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rotate Credential Modal */}
      {rotateOpen && (
        <div
          className="mc-modal-veil"
          onClick={(): void => setRotateOpen(false)}
        >
          <div
            className="mc-modal"
            style={{ width: 480 }}
            onClick={(e): void => e.stopPropagation()}
          >
            <div className="mc-modal-head">
              <div>
                <div className="mc-caption-up">rotate credential</div>
                <div className="mc-h2" style={{ marginTop: 2 }}>
                  {apiKeyDisplay}
                </div>
              </div>
              <button
                type="button"
                className="mc-btn mc-btn-ghost mc-btn-sm"
                onClick={(): void => setRotateOpen(false)}
                style={{ padding: '0 8px' }}
                aria-label="close rotate modal"
              >
                <Icon name="x" size={11} />
              </button>
            </div>
            <div className="mc-modal-body">
              <div
                className="muted"
                style={{ fontSize: 13, marginBottom: 14 }}
              >
                paste the new key. we&apos;ll verify against the api before
                swapping. zero-downtime — old key stays active until verified.
              </div>
              <div
                className="mc-caption-up"
                style={{ marginBottom: 6 }}
              >
                new api key
              </div>
              <input
                type="password"
                className="mc-input mc-mono"
                placeholder="sk_live_•••"
                style={{
                  height: 36,
                  fontSize: 12.5,
                  marginBottom: 12,
                }}
              />
              <div
                className="mc-banner"
                style={{ background: 'var(--paper-alt)' }}
              >
                <Icon name="lock" size={13} />
                <span style={{ fontSize: 12 }}>
                  encrypted with aes-256 · key never logged · audit row
                  written on rotate
                </span>
              </div>
            </div>
            <div className="mc-modal-foot">
              <Btn
                kind="ghost"
                size="sm"
                onClick={(): void => setRotateOpen(false)}
              >
                cancel
              </Btn>
              <div className="row" style={{ gap: 8 }}>
                <Btn
                  kind="ghost"
                  size="sm"
                  onClick={(): void =>
                    toast('verified against api · key not saved')
                  }
                >
                  test only
                </Btn>
                <Btn
                  kind="ink"
                  size="sm"
                  icon="check"
                  onClick={(): void => {
                    setRotateOpen(false);
                    toast('rotated · zero downtime · audit row written');
                  }}
                >
                  test &amp; save
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
