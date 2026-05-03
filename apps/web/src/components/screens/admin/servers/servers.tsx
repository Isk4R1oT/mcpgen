// apps/web/src/components/screens/admin/servers/servers.tsx
//
// Phase 3 / C2-servers — admin servers screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-servers.jsx
// (`ServersScreen({ ctx })`). Pixel-faithful rebuild against the admin-ui
// kit (`@/components/admin-ui/*`). Renders inside `<AdminShell>` (mounted
// by `app/admin/layout.tsx` via `<AdminShellGate>`), so this component
// owns only the split content area, never the chrome.
//
// Behaviour parity with canon:
//   - Split layout: left rail = filter chips + server list, right rail =
//     selected-server detail (KPIs · 7 tabs · per-tab body).
//   - 7 tabs: overview · tools · deploys · traffic · drift · listing ·
//     danger. Drift tab gets the "!" alert badge when `sel.drift`.
//   - Overview tab: raw entity JSON card + linked entities card; an
//     "ongoing incident" banner with runbook drawer when status==='incident'.
//   - Drift tab: del/add diff lines (canon copy is verbatim) + 3 actions
//     (force regenerate · pin to old spec · notify owner). Each action is
//     gated by `ui_admin_<action>_perm` (default OFF) → toast stub.
//   - Other tabs (tools/deploys/traffic/listing/danger): canon `EmptyState`
//     "preview only" placeholder.
//   - Header actions: view in marketplace (toast) · force re-publish ·
//     rollback (opens version-pick modal) · takedown (toast). The
//     mutating actions (rollback / takedown / force re-publish) are
//     flag-gated; OFF branch fires a friendly canon-parity toast.
//
// BFF wiring (per SCREEN-BEHAVIORS-CATALOG § admin-servers):
//   - Server list/detail come from `useAdminServers()` typed disabled-stub
//     (returns `flag_off_or_not_implemented` until BFF lands). When the
//     stub returns no data we render the canon loading state — empty
//     left rail with `<EmptyState>`, hint inside the detail rail.
//   - All mutating endpoints (`/redeploy`, `/rollback`, `/takedown`,
//     `/drift/regenerate`, `/pin`) are missing; clicks fire `toast()`
//     stubs gated by per-action `_perm` flags wired post-MVP. Until
//     those flags exist we surface the canon copy verbatim.

'use client';

import { useState, type CSSProperties, type ReactElement } from 'react';

import {
  Btn,
  Card,
  EmptyState,
  Pill,
  SectionLabel,
  StatusPill,
  type ServerStatus,
} from '@/components/admin-ui';
import { openDrawer } from '@/lib/drawer';
import type { AdminServersFlags } from '@/lib/flags/admin-actions';
import { toast } from '@/lib/toast';
import {
  useAdminServers,
  type AdminServerSummary,
} from '@/lib/api/admin';

const ALL_OFF_SERVERS_FLAGS: AdminServersFlags = {
  ui_admin_server_republish_perm: false,
  ui_admin_server_rollback_perm: false,
  ui_admin_server_takedown_perm: false,
  ui_admin_server_drift_regenerate_perm: false,
  ui_admin_server_drift_pin_perm: false,
  ui_admin_server_notify_owner_perm: false,
};

// ─── Types ─────────────────────────────────────────────────────────────────

type ServersTab =
  | 'overview'
  | 'tools'
  | 'deploys'
  | 'traffic'
  | 'drift'
  | 'listing'
  | 'danger';

const TABS: ReadonlyArray<ServersTab> = [
  'overview',
  'tools',
  'deploys',
  'traffic',
  'drift',
  'listing',
  'danger',
];

const FILTER_CHIPS = [
  'all',
  'live',
  'flagged',
  'incident',
  'suspended',
  'drift',
] as const;

const CHIP_STYLE: CSSProperties = {
  height: 24,
  fontSize: 11,
  padding: '0 8px',
};

const TROW_STYLE: CSSProperties = {
  gridTemplateColumns: '1fr auto',
  padding: '10px 14px',
};

// ─── Drift diff (verbatim from canon) ──────────────────────────────────────

const DRIFT_DIFF: ReadonlyArray<readonly ['del' | 'add', string, string]> = [
  ['del', '412', '- "POST /v3/orders/{id}/cancel"'],
  ['add', '412', '+ "POST /v4/orders/{id}/cancel"'],
  ['del', '088', '- "param: order_id (string)"'],
  ['add', '088', '+ "param: order_id (string, uuid format)"'],
];

// ─── Runbook drawer body ───────────────────────────────────────────────────

function RunbookBody({ name }: { name: string }): ReactElement {
  return (
    <div className="col" style={{ gap: 10, fontSize: 13, lineHeight: 1.6 }}>
      <div>
        <strong>1. confirm</strong> — check status.acme.com and our edge
        probes for {name}.
      </div>
      <div>
        <strong>2. mitigate</strong> — if upstream confirmed down, flip kill
        switch <span className="mc-mono">tool-calls/{name}</span> to fallback.
      </div>
      <div>
        <strong>3. rollback</strong> — if mitigation insufficient, rollback
        to v1.4.1 (last good).
      </div>
      <div>
        <strong>4. communicate</strong> — page on-call · update status page ·
        broadcast to affected orgs.
      </div>
      <div>
        <strong>5. post-incident</strong> — file incident doc within 24h ·
        schedule rca review.
      </div>
    </div>
  );
}

// ─── Servers screen ────────────────────────────────────────────────────────

export interface ServersScreenProps {
  /**
   * Initial selected server id (optional). The canon picks `D.servers[7]`
   * by default; without a real list we leave `sel === null` and render the
   * canon loading state in the detail rail.
   */
  initialSelectedId?: string;
  /**
   * Per-action flag map evaluated server-side at the route page. Default:
   * all-OFF — preserves canon toast-stub behaviour for tests / legacy call
   * sites.
   */
  actionFlags?: AdminServersFlags;
}

export function ServersScreen({
  initialSelectedId,
  actionFlags = ALL_OFF_SERVERS_FLAGS,
}: ServersScreenProps = {}): ReactElement {
  const result = useAdminServers().data;
  const servers: ReadonlyArray<AdminServerSummary> =
    result !== undefined && result.ok ? result.data.servers : [];

  const initialSel: AdminServerSummary | null =
    initialSelectedId !== undefined
      ? servers.find((s) => s.id === initialSelectedId) ?? null
      : (servers[7] ?? servers[0] ?? null);

  const [sel, setSel] = useState<AdminServerSummary | null>(initialSel);
  const [tab, setTab] = useState<ServersTab>('overview');
  const [showRollback, setShowRollback] = useState(false);

  // ── Mutating action stubs ────────────────────────────────────────────────
  // Every action below maps to a missing BFF endpoint. Until the
  // corresponding `ui_admin_<action>_perm` flag is wired (see
  // FLAGS-NEEDED.md), the click fires a canon-parity toast.
  function handleViewMarketplace(name: string): void {
    toast(`opening ${name} listing in marketplace…`);
  }
  function handleForceRepublish(name: string): void {
    if (actionFlags.ui_admin_server_republish_perm) {
      // TODO: POST /api/admin/v1/servers/:id/redeploy
      toast(`re-deploy queued · ${name}`);
      return;
    }
    toast(`re-deploy queued · ${name}`);
  }
  function handleRollbackOpen(): void {
    setShowRollback(true);
  }
  function handleRollbackConfirm(name: string): void {
    setShowRollback(false);
    if (actionFlags.ui_admin_server_rollback_perm) {
      // TODO: POST /api/admin/v1/servers/:id/rollback (4-eyes recommended)
      toast(`rolling back ${name} to v1.4.1`);
      return;
    }
    toast(`rolling back ${name} to v1.4.1`);
  }
  function handleTakedown(name: string): void {
    if (actionFlags.ui_admin_server_takedown_perm) {
      // TODO: POST /api/admin/v1/servers/:id/takedown (mandatory 4-eyes)
      toast(`takedown queued · ${name}`);
      return;
    }
    toast(`takedown queued · ${name}`);
  }
  function handleDriftRegenerate(name: string): void {
    if (actionFlags.ui_admin_server_drift_regenerate_perm) {
      // TODO: POST /api/admin/v1/servers/:id/drift/regenerate
      toast(`force-regenerating ${name} from new spec…`);
      return;
    }
    toast(`force-regenerating ${name} from new spec…`);
  }
  function handleDriftPin(name: string): void {
    if (actionFlags.ui_admin_server_drift_pin_perm) {
      // TODO: POST /api/admin/v1/servers/:id/pin
      toast(`pinned ${name} to old spec · drift suppressed`);
      return;
    }
    toast(`pinned ${name} to old spec · drift suppressed`);
  }
  function handleNotifyOwner(ownerId: string): void {
    if (actionFlags.ui_admin_server_notify_owner_perm) {
      // TODO: Resend transactional /api/admin/v1/servers/:id/notify-owner
      toast(`owner ${ownerId} notified by email`);
      return;
    }
    toast(`owner ${ownerId} notified by email`);
  }
  function handleOpenRunbook(s: AdminServerSummary): void {
    openDrawer(
      'runbook · upstream timeout',
      <RunbookBody name={s.name} />,
      { eyebrow: 'INC-0742 · ongoing' },
    );
  }

  return (
    <div className="adm-split">
      {/* ── Left rail: search + chips + server list ──────────────────── */}
      <div className="left">
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <input
            className="mc-input mc-mono"
            placeholder="slug, id, org…"
            style={{ height: 30, fontSize: 12 }}
          />
        </div>
        <div
          style={{
            padding: '6px 14px',
            display: 'flex',
            gap: 6,
            borderBottom: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}
        >
          {FILTER_CHIPS.map((s) => (
            <span key={s} className="mc-chip" style={CHIP_STYLE}>
              {s}
            </span>
          ))}
        </div>

        {servers.length === 0 ? (
          <div style={{ padding: 14 }}>
            <EmptyState
              title="no servers"
              sub="admin servers BFF not yet wired"
            />
          </div>
        ) : (
          servers.map((s) => (
            <div
              key={s.id}
              className={`adm-trow ${sel?.id === s.id ? 'sel' : ''}`.trim()}
              style={TROW_STYLE}
              onClick={(): void => setSel(s)}
              role="button"
              tabIndex={0}
              onKeyDown={(e): void => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSel(s);
                }
              }}
            >
              <div className="adm-cell-stack">
                <div className="row" style={{ gap: 6 }}>
                  <span className="pri">{s.name}</span>
                  {s.drift ? (
                    <Pill kind="warn" dot={false}>
                      drift
                    </Pill>
                  ) : null}
                  {s.featured ? (
                    <Pill kind="ink" dot={false}>
                      featured
                    </Pill>
                  ) : null}
                </div>
                <span className="sec">
                  {s.org} · v{s.version} · {s.tools} tools ·{' '}
                  {s.invocations24}/24h
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <StatusPill status={s.status as ServerStatus} />
                <div
                  className="sec"
                  style={{ fontSize: 10.5, marginTop: 2 }}
                >
                  {s.region} · p95 {s.p95}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Right rail: detail or loading ────────────────────────────── */}
      <div className="right">
        {sel === null ? (
          <div style={{ padding: 28 }}>
            <EmptyState
              title="select a server"
              sub="left rail will populate when admin servers BFF lands"
            />
          </div>
        ) : (
          <>
            <div className="adm-detail-head">
              <div
                className="row-bw"
                style={{ alignItems: 'flex-start' }}
              >
                <div>
                  <div
                    className="row"
                    style={{ gap: 10, marginBottom: 6 }}
                  >
                    <h1
                      className="adm-page-title"
                      style={{ fontSize: 26 }}
                    >
                      {sel.name}
                    </h1>
                    <StatusPill status={sel.status as ServerStatus} />
                    {sel.status === 'incident' ? (
                      <Pill kind="alert">8.2% errors · investigating</Pill>
                    ) : null}
                  </div>
                  <div
                    className="mc-mono muted"
                    style={{ fontSize: 12 }}
                  >
                    {sel.id} · {sel.org} · v{sel.version} · {sel.tools}{' '}
                    tools · {sel.region}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Btn
                    kind="ghost"
                    size="sm"
                    onClick={(): void => handleViewMarketplace(sel.name)}
                  >
                    view in marketplace
                  </Btn>
                  {/*
                   * Canon includes `icon="refresh"` but the production
                   * `IconName` enum does not ship a refresh glyph yet.
                   * Surface a complaint via FLAGS-NEEDED.md and drop the
                   * icon rather than fake it — Phase 0 Icon kit owners
                   * decide whether to add it.
                   */}
                  <Btn
                    kind="ghost"
                    size="sm"
                    onClick={(): void => handleForceRepublish(sel.name)}
                  >
                    force re-publish
                  </Btn>
                  <Btn kind="ink" size="sm" onClick={handleRollbackOpen}>
                    rollback
                  </Btn>
                  <Btn
                    kind="primary"
                    size="sm"
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                      borderColor: 'var(--accent)',
                    }}
                    onClick={(): void => handleTakedown(sel.name)}
                  >
                    takedown
                  </Btn>
                </div>
              </div>
            </div>

            {/* ── KPIs ─────────────────────────────────────────────── */}
            <div
              className="adm-detail-grid"
              style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
            >
              <div>
                <div className="adm-kpi-label">invocations · 24h</div>
                <div className="adm-kpi-num" style={{ fontSize: 20 }}>
                  {sel.invocations24}
                </div>
              </div>
              <div>
                <div className="adm-kpi-label">p95</div>
                <div className="adm-kpi-num" style={{ fontSize: 20 }}>
                  {sel.p95}
                </div>
              </div>
              <div>
                <div className="adm-kpi-label">error rate</div>
                <div
                  className="adm-kpi-num"
                  style={{
                    fontSize: 20,
                    color:
                      parseFloat(sel.errorRate) > 1
                        ? 'var(--accent)'
                        : 'inherit',
                  }}
                >
                  {sel.errorRate}
                </div>
              </div>
              <div>
                <div className="adm-kpi-label">deploys</div>
                <div className="adm-kpi-num" style={{ fontSize: 20 }}>
                  {sel.deploys}
                </div>
              </div>
              <div>
                <div className="adm-kpi-label">flags</div>
                <div
                  className="adm-kpi-num"
                  style={{
                    fontSize: 20,
                    color: sel.flags > 0 ? 'var(--accent)' : 'inherit',
                  }}
                >
                  {sel.flags}
                </div>
              </div>
            </div>

            {/* ── Tabs ─────────────────────────────────────────────── */}
            <div className="adm-tabs">
              {TABS.map((t) => (
                <div
                  key={t}
                  className={`adm-tab ${tab === t ? 'sel' : ''}`.trim()}
                  onClick={(): void => setTab(t)}
                  role="tab"
                  tabIndex={0}
                  aria-selected={tab === t}
                  onKeyDown={(e): void => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setTab(t);
                    }
                  }}
                >
                  {t}
                  {t === 'drift' && sel.drift ? (
                    <span
                      className="count"
                      style={{
                        background: 'var(--accent)',
                        color: '#fff',
                        borderColor: 'var(--accent)',
                      }}
                    >
                      !
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            {/* ── Tab body ─────────────────────────────────────────── */}
            <div className="adm-page" style={{ paddingTop: 18 }}>
              {tab === 'overview' ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 14,
                  }}
                >
                  <Card>
                    <SectionLabel>
                      <span>raw entity</span>
                    </SectionLabel>
                    <div className="mc-code" style={{ fontSize: 11.5 }}>
                      {`{
  "id": "${sel.id}",
  "slug": "${sel.name}",
  "org": "${sel.org}",
  "owner_id": "${sel.ownerId}",
  "version": "${sel.version}",
  "status": "${sel.status}",
  "region": "${sel.region}",
  "tools_count": ${sel.tools},
  "listed": ${sel.listed},
  "featured": ${sel.featured},
  "spec_drift": ${sel.drift}
}`}
                    </div>
                  </Card>
                  <Card>
                    <SectionLabel>
                      <span>linked entities</span>
                    </SectionLabel>
                    <div
                      className="mc-mono"
                      style={{ fontSize: 12, lineHeight: 2 }}
                    >
                      → owner ·{' '}
                      <a
                        className="adm-link"
                        href={`/admin/users?u=${sel.ownerId}`}
                      >
                        {sel.ownerId}
                      </a>
                      <br />→ {sel.deploys} deploys · last 2 min ago
                      <br />→ {sel.tools} tools · 3 composite
                      <br />→ marketplace listing ·{' '}
                      {sel.listed ? 'published' : 'unlisted'}
                      <br />→ 12 evals · last pass-rate 87%
                    </div>
                  </Card>
                  {sel.status === 'incident' ? (
                    <div
                      className="adm-incident"
                      style={{ gridColumn: '1 / -1' }}
                    >
                      <span className="strong">⚠ ongoing incident</span>
                      <span style={{ flex: 1 }}>
                        upstream timeouts since 14 min ago. auto-rolled
                        back to v1.4.1 in sfo. customer paged.
                      </span>
                      <Btn
                        kind="ghost"
                        size="sm"
                        onClick={(): void => handleOpenRunbook(sel)}
                      >
                        view runbook
                      </Btn>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tab === 'drift' && sel.drift ? (
                <Card style={{ maxWidth: 800 }}>
                  <SectionLabel>
                    <span>spec drift detected · 4 endpoints</span>
                  </SectionLabel>
                  <div className="adm-diff">
                    {DRIFT_DIFF.map((line, i) => (
                      <div
                        key={i}
                        className={`adm-diff-line ${line[0]}`}
                      >
                        <span className="ln">{line[1]}</span>
                        <span>{line[2]}</span>
                      </div>
                    ))}
                  </div>
                  <div
                    className="row"
                    style={{ gap: 8, marginTop: 12 }}
                  >
                    <Btn
                      kind="ink"
                      size="sm"
                      onClick={(): void =>
                        handleDriftRegenerate(sel.name)
                      }
                    >
                      force regenerate
                    </Btn>
                    <Btn
                      kind="ghost"
                      size="sm"
                      onClick={(): void => handleDriftPin(sel.name)}
                    >
                      pin to old spec
                    </Btn>
                    <Btn
                      kind="ghost"
                      size="sm"
                      onClick={(): void => handleNotifyOwner(sel.ownerId)}
                    >
                      notify owner
                    </Btn>
                  </div>
                </Card>
              ) : null}

              {tab !== 'overview' && !(tab === 'drift' && sel.drift) ? (
                <EmptyState
                  title={`${tab} — preview only`}
                  sub="full table view in production"
                />
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* ── Rollback modal ──────────────────────────────────────────── */}
      {showRollback && sel !== null ? (
        <div
          className="mc-modal-veil"
          onClick={(): void => setShowRollback(false)}
          role="presentation"
        >
          <div
            className="adm-modal"
            onClick={(e): void => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`rollback ${sel.name}`}
          >
            <div className="mc-modal-head">
              <span className="mc-h3">rollback {sel.name}</span>
            </div>
            <div className="mc-modal-body">
              <SectionLabel>
                <span>pick a version</span>
              </SectionLabel>
              {[
                `${sel.version} · current`,
                '1.4.1 · 14 hr ago',
                '1.4.0 · 3 days ago',
                '1.3.7 · 8 days ago',
              ].map((v, i) => (
                <div
                  key={i}
                  className={`mc-radio-row ${i === 1 ? 'sel' : ''}`.trim()}
                  style={{ marginBottom: 6 }}
                >
                  <span className="mc-radio-glyph">
                    {i === 1 ? '◉' : '○'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      v{v}
                    </div>
                    <div
                      className="muted mc-mono"
                      style={{ fontSize: 11 }}
                    >
                      {i === 0
                        ? 'live'
                        : i === 1
                          ? 'last good · 0 errors at deploy'
                          : ''}
                    </div>
                  </div>
                </div>
              ))}
              <div
                className="adm-approval"
                style={{ marginTop: 12 }}
              >
                active traffic ({sel.invocations24}/24h) will see ~30s of
                mixed responses during the swap. customer will be notified.
              </div>
            </div>
            <div className="mc-modal-foot">
              <Btn
                kind="ghost"
                onClick={(): void => setShowRollback(false)}
              >
                cancel
              </Btn>
              <Btn
                kind="ink"
                onClick={(): void => handleRollbackConfirm(sel.name)}
              >
                rollback
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
