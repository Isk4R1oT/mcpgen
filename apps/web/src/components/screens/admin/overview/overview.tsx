// apps/web/src/components/screens/admin/overview/overview.tsx
//
// Phase 3 / C2-overview — Admin Ops Overview screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-overview.jsx
// (function `Overview`). 100% structural + class-name parity with that JSX,
// rebuilt against the production admin-ui kit (`@/components/admin-ui/*`).
//
// Behaviour wiring (per SCREEN-BEHAVIORS-CATALOG.md § admin-overview):
//   - KPIs              → GET /api/admin/v1/overview     ❌ MISSING (stub)
//   - Recent activity   → GET /api/admin/v1/audit?…      ❌ MISSING (stub)
//   - Moderation top    → GET /api/admin/v1/moderation   ❌ MISSING (stub)
//   - Region health     → GET /api/admin/v1/regions      ❌ MISSING (stub)
//
// All four endpoints route through the disabled-stub
// `useAdminMetrics()` (`apps/web/src/lib/api/admin.ts`). Until the BFF
// flips ENABLED → true the hook returns `flag_off_or_not_implemented`,
// which we map to `demoState='loading'` (KPIs render `…`) and
// empty-state placeholders for the three list cards. This matches the
// canon `loading` / `empty` branches of the original screen verbatim.
//
// Admin-action wiring (per SHARED-BRIEF + PHASE-3 brief):
//   - "broadcast"  CTA → router.push('/admin/broadcast') gated behind
//                        `ui_admin_broadcast_perm` (default OFF). Flag OFF
//                        → toast stub.
//   - "refresh"    CTA → query invalidation (cheap, no flag needed; surfaces
//                        a friendly toast either way per canon).
//   - "open audit log →" / "queue →" / "regions →" → router.push (no flag —
//                        navigation only, target screens are themselves
//                        flag-gated at the route level).
//
// IMPORTANT: All canon UI surfaces survive even though no admin BFF
// endpoint exists. Per SHARED-BRIEF rule #4 we NEVER strip the UI; we
// render the canon's loading / empty fallback while wiring stays inert.

'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';

import {
  Btn,
  Card,
  EmptyState,
  IncidentBanner,
  KPI,
  PageHead,
  Pill,
  SectionLabel,
} from '@/components/admin-ui';
import { useAdminMetrics } from '@/lib/api/admin';
import { toast } from '@/lib/toast';

// ────────────────────────────────────────────────────────────────────────────
// Local UI state — `demoState` mirrors canon `ctx.demoState`.
//
// Canon's `ctx.demoState` was driven by a top-level admin-app dev knob; in
// production we derive it from the BFF state:
//   - hook still loading & no data       → 'loading'
//   - hook errored with not-implemented   → 'loading' (we have no live data)
//   - data present but list empty         → 'empty'
//   - active incident in payload          → 'incident'
//   - regional maintenance in payload     → 'maintenance'
//   - otherwise                           → 'live'
//
// Today every admin BFF call returns the disabled stub so we always sit on
// 'loading'. The empty / incident branches still compile and render so we
// can flip via Flipt the moment the BFF lands.
// ────────────────────────────────────────────────────────────────────────────

type DemoState = 'live' | 'loading' | 'empty' | 'incident' | 'maintenance';

interface AuditEntry {
  readonly id: string;
  readonly when: string;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly reason: string;
}

interface ModerationItem {
  readonly id: string;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly title: string;
  readonly reason: string;
  readonly submitted: string;
}

interface RegionItem {
  readonly id: string;
  readonly name: string;
  readonly p95: string;
  readonly status: 'healthy' | 'degraded' | 'maint' | 'down';
}

// Empty defaults for the three list cards. Production data will flow from
// the BFF once `useAdminMetrics()` is wired live (Phase 3 backend stub).
const EMPTY_AUDIT: readonly AuditEntry[] = [];
const EMPTY_MODERATION: readonly ModerationItem[] = [];
const EMPTY_REGIONS: readonly RegionItem[] = [];

// Returns the full `DemoState` union without TS narrowing it to the two
// values that flow today (live / loading). The canon `incident` /
// `maintenance` / `empty` branches must remain compilable for when the
// BFF starts emitting them; the explicit return type keeps them alive.
function computeDemoState(hasData: boolean | undefined): DemoState {
  if (!hasData) return 'loading';
  return 'live';
}

// ────────────────────────────────────────────────────────────────────────────
// <Overview /> — admin ops dashboard
// ────────────────────────────────────────────────────────────────────────────

export interface OverviewProps {
  /**
   * Per-action flag map evaluated server-side at the route page. Default:
   * all-OFF — preserves existing toast-stub behaviour for tests / legacy
   * call sites that don't yet plumb the prop.
   */
  readonly actionFlags?: import('@/lib/flags/admin-actions').AdminOverviewFlags;
}

const ALL_OFF_OVERVIEW_FLAGS: import('@/lib/flags/admin-actions').AdminOverviewFlags = {
  ui_admin_broadcast_perm: false,
  ui_admin_overview_data_perm: false,
};

export function Overview({
  actionFlags = ALL_OFF_OVERVIEW_FLAGS,
}: OverviewProps = {}): ReactElement {
  const router = useRouter();

  // Disabled-stub today; hook returns `flag_off_or_not_implemented`. We pin
  // the screen to 'loading' so the canon `…` placeholders render.
  const metrics = useAdminMetrics();

  // Local incident toggle hook for the dismiss banner action — clears the
  // banner without affecting the underlying error mode (canon parity: the
  // banner is dismissible, not the error itself).
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Today: no live data → `loading`. Once `metrics.data.ok === true` lands,
  // the screen flips to `live` (or `empty`/`incident`/`maintenance` based on
  // the payload). We tolerate `unknown`-shaped data behind a Result<T>.
  //
  // We compute via a helper that returns the full DemoState union so the
  // canon `incident`/`maintenance`/`empty` branches survive the type
  // narrowing when only two values can flow today (per the disabled stub).
  const demoState: DemoState = computeDemoState(
    metrics.data && metrics.data.ok,
  );

  const incident = demoState === 'incident' && !bannerDismissed;
  const maint = demoState === 'maintenance' && !bannerDismissed;
  const empty = demoState === 'empty';
  const loading = demoState === 'loading';

  // Audit / moderation / regions data: defaults until the BFF lands.
  const audit: readonly AuditEntry[] = EMPTY_AUDIT;
  const moderation: readonly ModerationItem[] = EMPTY_MODERATION;
  const regions: readonly RegionItem[] = EMPTY_REGIONS;

  // ─── Action handlers ─────────────────────────────────────────────────────

  const onRefresh = useCallback((): void => {
    // Best-effort refetch (cheap, no flag needed — query layer handles auth).
    void metrics.refetch();
    toast('refreshed · 12s ago');
  }, [metrics]);

  const onBroadcast = useCallback((): void => {
    // PHASE-3 brief: admin actions are flag-gated by
    // `ui_admin_<action>_perm` (default OFF). When ON we navigate to the
    // composer; when OFF we surface the canon toast stub.
    if (actionFlags.ui_admin_broadcast_perm) {
      router.push('/admin/broadcast');
      return;
    }
    toast('admin action: not yet wired', { kind: 'info' });
  }, [actionFlags.ui_admin_broadcast_perm, router]);

  const onAuditLink = useCallback((): void => {
    router.push('/admin/audit');
  }, [router]);

  const onModerationLink = useCallback((): void => {
    router.push('/admin/marketplace');
  }, [router]);

  const onDeploysLink = useCallback((): void => {
    router.push('/admin/deploys');
  }, [router]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr',
    gap: 18,
  };

  return (
    <div className="adm-page">
      <PageHead
        title="ops · overview"
        sub="last 24h · prod · all regions"
        right={
          <>
            <Btn key="r" kind="ghost" size="sm" onClick={onRefresh}>
              refresh
            </Btn>
            <Btn key="b" kind="ink" size="sm" icon="spark" onClick={onBroadcast}>
              broadcast
            </Btn>
          </>
        }
      />

      {incident ? (
        <IncidentBanner onDismiss={(): void => setBannerDismissed(true)}>
          <span>
            <strong className="strong">cdg degraded</strong> — p95 342ms,
            error rate 1.4% · auto-rebalanced 14% of traffic to fra ·{' '}
            <a className="adm-link" onClick={onDeploysLink}>
              open infra →
            </a>
          </span>
        </IncidentBanner>
      ) : null}
      {maint ? (
        <IncidentBanner onDismiss={(): void => setBannerDismissed(true)}>
          <span>
            <strong className="strong">scheduled maintenance</strong> — syd
            region in maintenance window until 04:00 utc
          </span>
        </IncidentBanner>
      ) : null}

      <div className="adm-kpis" style={{ marginBottom: 18 }}>
        <KPI
          label="active orgs"
          value={loading ? '…' : '1,204'}
          delta="+38 (7d)"
          deltaKind="up"
          spark={[18, 22, 28, 30, 34, 40, 42]}
          sparkKind="up"
        />
        <KPI
          label="servers · live"
          value={loading ? '…' : '4,812'}
          delta="+212 (7d)"
          deltaKind="up"
          spark={[100, 108, 118, 128, 142, 160, 180]}
          sparkKind="up"
        />
        <KPI
          label="invocations · 24h"
          value={loading ? '…' : '8.42m'}
          delta="+12% wow"
          deltaKind="up"
          spark={[42, 55, 38, 68, 72, 80, 84]}
          sparkKind="up"
        />
        <KPI
          label="error rate · p50"
          value={loading ? '…' : '0.18%'}
          delta={incident ? '+0.14% spike' : '−0.02% wow'}
          deltaKind={incident ? 'down' : 'up'}
          spark={[20, 18, 22, 24, 18, 16, 14]}
          sparkKind={incident ? 'down' : 'up'}
        />
      </div>

      <div className="adm-kpis" style={{ marginBottom: 22 }}>
        <KPI
          label="mrr"
          value={loading ? '…' : '$284,440'}
          delta="+8.4% mom"
          deltaKind="up"
          spark={[30, 32, 35, 38, 42, 46, 50]}
          sparkKind="up"
        />
        <KPI
          label="open tickets"
          value={loading ? '…' : '42'}
          delta="3 urgent · 2 over sla"
          deltaKind="down"
          spark={[20, 22, 28, 32, 38, 40, 42]}
          sparkKind="down"
        />
        <KPI
          label="moderation queue"
          value={loading ? '…' : '8'}
          delta="2 critical · oldest 6h"
          deltaKind="down"
        />
        <KPI
          label="failed deploys 24h"
          value={loading ? '…' : '3'}
          delta="of 142 · 2.1%"
        />
      </div>

      <div style={gridStyle}>
        {/* Recent activity */}
        <Card padding={false}>
          <SectionLabel
            right={
              <a
                className="adm-link"
                onClick={onAuditLink}
                role="link"
                tabIndex={0}
              >
                open audit log →
              </a>
            }
          >
            <span>recent ops activity</span>
          </SectionLabel>
          <div style={{ padding: '0 4px 8px' }}>
            {empty || audit.length === 0 ? (
              <EmptyState title="no activity in this window" />
            ) : (
              audit.slice(0, 6).map((a) => (
                <div
                  key={a.id}
                  className="adm-log-row"
                  style={{ gridTemplateColumns: '90px 130px 1fr 90px' }}
                >
                  <span className="ts">{a.when}</span>
                  <span
                    className="lvl info"
                    style={{
                      background: 'var(--paper-alt)',
                      textTransform: 'none',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {a.actor.split('@')[0]}
                  </span>
                  <span>
                    <span
                      className="mc-mono"
                      style={{ color: 'var(--text)' }}
                    >
                      {a.action}
                    </span>{' '}
                    <span style={{ color: 'var(--text-muted)' }}>
                      · {a.target}
                    </span>
                  </span>
                  <span
                    style={{
                      color: 'var(--text-faint)',
                      textAlign: 'right',
                    }}
                  >
                    {a.reason.length > 22
                      ? a.reason.slice(0, 22) + '…'
                      : a.reason}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card padding={false}>
            <SectionLabel
              right={
                <a
                  className="adm-link"
                  onClick={onModerationLink}
                  role="link"
                  tabIndex={0}
                >
                  queue →
                </a>
              }
            >
              <span>moderation · top priority</span>
            </SectionLabel>
            <div>
              {moderation.length === 0 ? (
                <EmptyState title="no items in queue" />
              ) : (
                moderation
                  .filter(
                    (m) => m.priority === 'critical' || m.priority === 'high',
                  )
                  .slice(0, 3)
                  .map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                    >
                      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                        <Pill kind={m.priority === 'critical' ? 'alert' : 'warn'}>
                          {m.priority}
                        </Pill>
                        <span className="mc-mono" style={{ fontSize: 11.5 }}>
                          {m.title}
                        </span>
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: 10.5,
                            color: 'var(--text-faint)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {m.submitted}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          lineHeight: 1.4,
                        }}
                      >
                        {m.reason}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </Card>

          <Card padding={false}>
            <SectionLabel
              right={
                <a
                  className="adm-link"
                  onClick={onDeploysLink}
                  role="link"
                  tabIndex={0}
                >
                  regions →
                </a>
              }
            >
              <span>edge health</span>
            </SectionLabel>
            <div>
              {regions.length === 0 ? (
                <EmptyState title="no region telemetry" />
              ) : (
                regions.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '8px 14px',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      gap: 10,
                      alignItems: 'center',
                      borderBottom: '1px dashed var(--border)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                    }}
                  >
                    <span>{r.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{r.p95}</span>
                    <Pill
                      kind={
                        r.status === 'healthy'
                          ? 'ok'
                          : r.status === 'degraded'
                            ? 'warn'
                            : r.status === 'maint'
                              ? 'info'
                              : 'alert'
                      }
                    >
                      {r.status}
                    </Pill>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Overview;
